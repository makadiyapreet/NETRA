import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/trends
 * Returns trend-spike fixture data for charting.
 */
router.get('/', (req: Request, res: Response) => {
  const dataStore = req.app.locals.dataStore;
  const spikes = dataStore.getTrendSpikes();
  res.json({ data: spikes, total: spikes.length });
});

export default router;
