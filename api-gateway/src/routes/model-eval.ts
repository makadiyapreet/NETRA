import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

/**
 * GET /api/model/eval-results
 * Returns real evaluation metrics from the last run of evaluate_zeroshot.py.
 * Returns { status: "not_run" } if no evaluation has been performed yet.
 * NEVER returns fabricated metrics.
 */
router.get('/eval-results', (_req: Request, res: Response) => {
  const evalPath = path.resolve(__dirname, '../../../nlp_engine/eval_results.json');
  
  if (!fs.existsSync(evalPath)) {
    return res.json({
      status: 'not_run',
      message: 'No evaluation has been run yet. Execute: python -m nlp_engine.models.evaluate_zeroshot',
    });
  }

  try {
    const data = JSON.parse(fs.readFileSync(evalPath, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to parse eval_results.json',
      detail: String(err),
    });
  }
});

export default router;
