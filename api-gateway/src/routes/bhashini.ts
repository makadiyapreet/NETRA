/**
 * Bhashini (ULCA) Government Translation API routes.
 *
 * Integrates with India's National Language Translation Mission (Bhashini)
 * as a second, independent translation/transliteration path alongside
 * AI4Bharat Xlit and LLM-based approaches.
 *
 * Bhashini is a free, publicly accessible Government of India API
 * (https://bhashini.gov.in/) — no paid tier, no lengthy approval process.
 *
 * Routes:
 *   POST /api/bhashini/translate       — Translate text between languages
 *   POST /api/bhashini/transliterate   — Transliterate text between scripts
 *   GET  /api/bhashini/status          — Check Bhashini API availability
 */

import { Router, Request, Response } from 'express';
import { extractRole } from '../auth/rbac';
import { auditLogger } from '../middleware/audit-logger';

const router = Router();
router.use(extractRole);

const NLP_ENGINE_URL = `http://${process.env.NLP_SERVICE_HOST || '127.0.0.1'}:${process.env.NLP_SERVICE_PORT || '8000'}`;

// Supported language pairs for reference
const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'mr', name: 'Marathi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'kn', name: 'Kannada' },
  { code: 'or', name: 'Odia' },
  { code: 'ur', name: 'Urdu' },
];

/**
 * POST /api/bhashini/translate
 * Body: { text: string, source_language: string, target_language: string }
 */
router.post(
  '/translate',
  auditLogger('bhashini_translate'),
  async (req: Request, res: Response) => {
    const { text, source_language = 'en', target_language = 'hi' } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    try {
      const nlpRes = await fetch(`${NLP_ENGINE_URL}/bhashini/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source_language, target_language }),
        signal: AbortSignal.timeout(45000),
      });

      if (nlpRes.ok) {
        const result = await nlpRes.json();
        return res.json(result);
      }

      const err = await nlpRes.text();
      return res.status(nlpRes.status).json({ error: err });
    } catch {
      // NLP Engine unavailable
      res.json({
        original: text,
        translated: text,
        source_language,
        target_language,
        task_type: 'translation',
        success: false,
        error: 'Bhashini translation service unavailable — NLP Engine is offline. Start with ./run_offline.sh',
        provider: 'Bhashini (Government of India — MeitY)',
        registration_url: 'https://bhashini.gov.in/',
        supported_languages: SUPPORTED_LANGUAGES,
      });
    }
  }
);

/**
 * POST /api/bhashini/transliterate
 * Body: { text: string, source_language: string, target_language: string }
 */
router.post(
  '/transliterate',
  auditLogger('bhashini_transliterate'),
  async (req: Request, res: Response) => {
    const { text, source_language = 'en', target_language = 'hi' } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    try {
      const nlpRes = await fetch(`${NLP_ENGINE_URL}/bhashini/transliterate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source_language, target_language }),
        signal: AbortSignal.timeout(45000),
      });

      if (nlpRes.ok) {
        const result = await nlpRes.json();
        return res.json(result);
      }

      const err = await nlpRes.text();
      return res.status(nlpRes.status).json({ error: err });
    } catch {
      res.json({
        original: text,
        transliterated: text,
        source_language,
        target_language,
        task_type: 'transliteration',
        success: false,
        error: 'Bhashini transliteration service unavailable — NLP Engine is offline.',
        provider: 'Bhashini (Government of India — MeitY)',
      });
    }
  }
);

/**
 * GET /api/bhashini/status
 * Returns Bhashini API configuration and availability status.
 */
router.get(
  '/status',
  async (_req: Request, res: Response) => {
    try {
      const nlpRes = await fetch(`${NLP_ENGINE_URL}/bhashini/status`, {
        signal: AbortSignal.timeout(5000),
      });

      if (nlpRes.ok) {
        const result = await nlpRes.json();
        return res.json(result);
      }
    } catch {
      // NLP Engine offline
    }

    res.json({
      service: 'Bhashini (ULCA)',
      provider: 'Government of India — MeitY',
      available: false,
      error: 'NLP Engine is offline — cannot reach Bhashini status endpoint',
      supported_languages: SUPPORTED_LANGUAGES,
      registration_url: 'https://bhashini.gov.in/',
      cost: 'Free (Government API)',
    });
  }
);

export default router;
