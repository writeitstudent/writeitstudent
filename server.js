'use strict';

require('dotenv').config();

const express   = require('express');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── ANTHROPIC CLIENT ──────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── EMAIL TRANSPORTER ─────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

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
  'https://writeit.co.uk',
  'https://www.writeit.co.uk',
];

app.use(function(req, res, next) {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ── BODY PARSING ──────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false }));

// ── RATE LIMITING ─────────────────────────────────────────────
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP. Please wait an hour or subscribe for priority access.',
  },
});

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
});

app.use(globalLimiter);

// ── STATIC FILES ──────────────────────────────────────────────
app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: true,
    maxAge: '1d',
    setHeaders: function(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

// ── INPUT SANITISER ───────────────────────────────────────────
function sanitise(str, maxLen) {
  maxLen = maxLen || 4000;
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').slice(0, maxLen).trim();
}

// ── /api/generate ─────────────────────────────────────────────
app.post('/api/generate', generateLimiter, async function(req, res) {
  try {
    const system      = req.body.system;
    const userPrompt  = req.body.userPrompt;
    const learneremail = req.body.learneremail || '';
    const question    = req.body.question || '';
    const level       = req.body.level || '';
    const wordcount   = req.body.wordcount || '';

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
      messages: [
        { role: 'user', content: cleanPrompt },
      ],
    });

    const fullText = message.content
      .filter(function(b) { return b.type === 'text'; })
      .map(function(b) { return b.text; })
      .join('\n');

    // ── Email admin ───────────────────────────────────────────
    const adminEmail = process.env.ADMIN_EMAIL || 'writeit.student@gmail.com';
    const timestamp  = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' });

    const adminMail = {
      from:    '"WriteIt System" <' + adminEmail + '>',
      to:      adminEmail,
      subject: '[WriteIt] New Assignment — ' + (level || 'Unknown Level') + ' — ' + timestamp,
      text: [
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
      ].join('\n'),
    };

    transporter.sendMail(adminMail).catch(function(err) {
      console.error('[Email] Admin notification failed:', err.message);
    });

    // ── Email learner preview (if email provided) ─────────────
    if (learneremail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(learneremail)) {
      const words      = fullText.split(/\s+/);
      const previewEnd = Math.floor(words.length * 0.40);
      const preview    = words.slice(0, previewEnd).join(' ') + '\n\n[…continued — contact admin for full assignment]';

      const learnerMail = {
        from:    '"WriteIt Assignment Assistant" <' + adminEmail + '>',
        to:      learneremail,
        subject: 'Your WriteIt Assignment Preview',
        text: [
          'Hello,',
          '',
          'Thank you for using WriteIt Assignment Assistant.',
          '',
          'Your assignment preview is below. To receive the full assignment and',
          'complete reference list, please contact admin:',
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
        ].join('\n'),
      };

      transporter.sendMail(learnerMail).catch(function(err) {
        console.error('[Email] Learner preview failed:', err.message);
      });
    }

    // ── Return full text to frontend ──────────────────────────
    return res.json({ content: fullText });

  } catch (err) {
    console.error('[/api/generate] Error:', err.message || err);

    if (err.status === 429) {
      return res.status(429).json({ error: 'AI service is busy. Please try again in a moment.' });
    }
    if (err.status === 401) {
      return res.status(500).json({ error: 'API key error. Please contact admin.' });
    }

    return res.status(500).json({
      error: err.message || 'Something went wrong. Please try again or contact writeit.student@gmail.com',
    });
  }
});

// ── /api/extract-brief ───────────────────────────────────────
app.post('/api/extract-brief', async function(req, res) {
  try {
    var base64 = req.body.base64;
    var ext    = req.body.ext;
    var name   = req.body.name || 'brief';

    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'No file data received.' });
    }

    // Use Claude to extract text from the document
    var message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              data: base64
            }
          },
          {
            type: 'text',
            text: 'Extract and return all the text content from this assignment brief document. Return only the raw text, no commentary, no formatting marks. Include all learning outcomes, assessment criteria, and instructions.'
          }
        ]
      }]
    });

    var text = message.content
      .filter(function(b) { return b.type === 'text'; })
      .map(function(b) { return b.text; })
      .join('\n');

    return res.json({ text: text });

  } catch (err) {
    console.error('[/api/extract-brief] Error:', err.message || err);
    return res.status(500).json({ error: 'Could not extract text from file. Please try saving as .txt and uploading again.' });
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

// ── START SERVER ──────────────────────────────────────────────
app.listen(PORT, function() {
  console.log('');
  console.log('  WriteIt Assignment Assistant');
  console.log('  Running at: http://localhost:' + PORT);
  console.log('  Admin email: ' + (process.env.ADMIN_EMAIL || 'NOT SET — check .env'));
  console.log('  Anthropic key: ' + (process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING — check .env'));
  console.log('');
});
