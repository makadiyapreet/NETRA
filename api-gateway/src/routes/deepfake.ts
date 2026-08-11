/**
 * Deepfake detection routes.
 *
 * POST /api/ai/deepfake-check — Check if an image is AI-generated
 *
 * Proxies to the NLP Engine's deepfake detection endpoint,
 * falling back to a structured "service unavailable" response.
 */

import { Router, Request, Response } from 'express';
import { extractRole } from '../auth/rbac';
import { auditLogger } from '../middleware/audit-logger';

const router = Router();
router.use(extractRole);

const NLP_ENGINE_URL = process.env.NLP_ENGINE_URL || 'http://localhost:8000';

/**
 * POST /api/ai/deepfake-check
 * Body: { image_url: string }
 *
 * Returns: { is_ai_generated, confidence, model_name, explanation }
 */
router.post(
  '/deepfake-check',
  auditLogger('deepfake_check'),
  async (req: Request, res: Response) => {
    const { image_url } = req.body;

    if (!image_url) {
      return res.status(400).json({ error: 'image_url is required' });
    }

    // Try NLP Engine first
    try {
      const nlpRes = await fetch(`${NLP_ENGINE_URL}/deepfake-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url }),
        signal: AbortSignal.timeout(30000),
      });

      if (nlpRes.ok) {
        const result = await nlpRes.json();
        return res.json(result);
      }
    } catch {
      // NLP Engine unavailable — fall through to heuristic
    }

    // Fallback: honest "service unavailable" response
    // We do NOT fabricate a score — the model must be loaded to give real results
    res.json({
      is_ai_generated: null,
      confidence: null,
      model_name: 'umm-maybe/AI-image-detector',
      model_loaded: false,
      image_url,
      explanation: 'Deepfake detection model is not currently loaded. The HuggingFace model (umm-maybe/AI-image-detector) requires the NLP Engine service on port 8000 with sufficient GPU/CPU memory. This is an honest "unavailable" response — NETRA never fabricates detection scores.',
      recommendation: 'Start the NLP Engine with `python -m nlp_engine.inference.inference_service` to enable real deepfake detection.',
    });
  }
);

export default router;
