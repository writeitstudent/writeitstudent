'use strict';

require('dotenv').config();

const express   = require('express');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { Resend } = require('resend');

const app  = express();
const PORT = process.env.PORT || 3000;

// Trust Render's proxy (required for rate limiting to work correctly)
app.set('trust proxy', 1);

// ── ANTHROPIC CLIENT ──────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── RESEND EMAIL CLIENT ───────────────────────────────────────
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail(to, subject, text) {
  try {
    await resend.emails.send({
      from: 'WriteIt <onboarding@resend.dev>',
      to: to,
      subject: subject,
      text: text,
    });
    console.log('[Email] Sent to:', to);
  } catch (err) {
    console.error('[Email] Failed:', err.message);
  }
}

// ── SECURITY HEADERS ──────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:    ["'self'"],
        scriptSrc:     ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc:       ["'self'", "https://fonts.gstatic.com"],
        connectSrc:    ["'self'"],
        imgSrc:        ["'self'", "data:"],
        objectSrc:     ["'none'"],
        frameSrc:      ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ── CORS ──────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.SITE_URL || 'http://localhost:3000',
  'https://writeit-awba.onrender.com',
];

app.use(function(req, res, next) {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── BODY PARSING ──────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false }));

// ── RATE LIMITING ─────────────────────────────────────────────

// Global limiter — max 20 requests per minute per IP (covers all routes)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
app.use(globalLimiter);

// Generate limiter — FREE users get 1 generation per 24 hours per IP
const generateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  message: {
    error: 'free_limit_reached',
    message: 'You have used your free preview. To generate more assignments, please contact admin at writeit.student@gmail.com to discuss a plan.'
  },
});

// ── STATIC FILES ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: '1d',
  setHeaders: function(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// ── INPUT SANITISER ───────────────────────────────────────────
function sanitise(str, maxLen) {
  maxLen = maxLen || 4000;
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').slice(0, maxLen).trim();
}

// ── /api/generate ─────────────────────────────────────────────
app.post('/api/generate', generateLimiter, async function(req, res) {
  try {
    const system       = req.body.system;
    const userPrompt   = req.body.userPrompt;
    const learneremail = req.body.learneremail || '';
    const question     = req.body.question || '';
    const level        = req.body.level || '';
    const wordcount    = req.body.wordcount || '';

    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.length < 10) {
      return res.status(400).json({ error: 'Invalid prompt.' });
    }
    if (!system || typeof system !== 'string') {
      return res.status(400).json({ error: 'Missing system prompt.' });
    }

    const cleanSystem = sanitise(system, 8000);
    const cleanPrompt = sanitise(userPrompt, 5000);

    // ── Call Anthropic ────────────────────────────────────────
    const message = await anthropic.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 4096,
      system:     cleanSystem,
      messages: [{ role: 'user', content: cleanPrompt }],
    });

    const fullText = message.content
      .filter(function(b) { return b.type === 'text'; })
      .map(function(b) { return b.text; })
      .join('\n');

    // ── Email admin ───────────────────────────────────────────
    const adminEmail = process.env.ADMIN_EMAIL || 'writeit.student@gmail.com';
    const timestamp  = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' });

    const adminSubject = '[WriteIt] New Assignment — ' + (level || 'Unknown Level') + ' — ' + timestamp;
    const adminText = [
      '=== WRITEIT — NEW ASSIGNMENT GENERATED ===',
      '',
      'Timestamp:     ' + timestamp,
      'Level:         ' + (level || 'Not specified'),
      'Word Count:    ' + (wordcount || 'Not specified'),
      'Learner Email: ' + (learneremail || 'Not provided'),
      'Client IP:     ' + req.ip,
      '',
      '--- QUESTION ---',
      sanitise(question, 2000),
      '',
      '--- FULL ASSIGNMENT (send to learner upon payment) ---',
      '',
      fullText,
      '',
      '=== END ===',
    ].join('\n');

    sendEmail(adminEmail, adminSubject, adminText);

    // ── Email learner preview if email provided ───────────────
    if (learneremail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(learneremail)) {
      const words      = fullText.split(/\s+/);
      const previewEnd = Math.floor(words.length * 0.40);
      const preview    = words.slice(0, previewEnd).join(' ') + '\n\n[…continued — contact admin for full assignment]';

      const learnerSubject = 'Your WriteIt Assignment Preview';
      const learnerText = [
        'Hello,',
        '',
        'Thank you for using WriteIt Assignment Assistant.',
        '',
        'Your assignment preview is below. To receive the complete assignment',
        'and full reference list, please contact admin:',
        '',
        '  writeit.student@gmail.com',
        '',
        '--- YOUR ASSIGNMENT PREVIEW ---',
        '',
        preview,
        '',
        '--- END OF PREVIEW ---',
        '',
        'Best regards,',
        'WriteIt Assignment Assistant',
        'writeit.student@gmail.com',
      ].join('\n');

      sendEmail(learneremail, learnerSubject, learnerText);
    }

    return res.json({ content: fullText });

  } catch (err) {
    console.error('[/api/generate] Error:', err.message || err);
    if (err.status === 429) return res.status(429).json({ error: 'AI service busy. Please try again in a moment.' });
    if (err.status === 401) return res.status(500).json({ error: 'API key error. Please contact admin.' });
    return res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
  }
});

// ── /api/extract-brief ────────────────────────────────────────
app.post('/api/extract-brief', async function(req, res) {
  try {
    const base64 = req.body.base64;
    const ext    = (req.body.ext || '').toLowerCase();

    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'No file data received.' });
    }

    if (ext !== 'pdf') {
      return res.status(400).json({
        error: 'word_not_supported',
        message: 'Please save your Word doc as PDF first: File → Save As → PDF, then upload the PDF.',
      });
    }

    const message = await anthropic.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 }
          },
          {
            type: 'text',
            text: 'Extract and return all the text from this assignment brief. Include all learning outcomes, assessment criteria, unit titles, and instructions exactly as written. Return plain text only.'
          }
        ]
      }]
    });

    const text = message.content
      .filter(function(b) { return b.type === 'text'; })
      .map(function(b) { return b.text; })
      .join('\n');

    if (!text || text.trim().length < 20) {
      return res.status(400).json({ error: 'Could not read text from this PDF. Try saving as .txt and uploading that instead.' });
    }

    return res.json({ text: text });

  } catch (err) {
    console.error('[/api/extract-brief] Error:', err.message || err);
    return res.status(500).json({ error: 'Could not read file. Please save as PDF or .txt and try again.' });
  }
});

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── CATCH-ALL → index.html ────────────────────────────────────
app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, function() {
  console.log('');
  console.log('  WriteIt Assignment Assistant');
  console.log('  Running at: http://localhost:' + PORT);
  console.log('  Admin email: ' + (process.env.ADMIN_EMAIL || 'NOT SET'));
  console.log('  Anthropic key: ' + (process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING'));
  console.log('  Resend key: ' + (process.env.RESEND_API_KEY ? 'SET' : 'MISSING'));
  console.log('');
});
