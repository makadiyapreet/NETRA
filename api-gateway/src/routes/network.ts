import { Router, Request, Response } from 'express';
import fetch from 'node-fetch';

const router = Router();

const NETWORK_SERVICE_URL = process.env.NETWORK_SERVICE_URL || 'http://localhost:4100';

/**
 * GET /api/network/bot-score/:account_id
 * Proxies to mock-network-service.
 */
router.get('/bot-score/:account_id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/bot-score/${req.params.account_id}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Network service unavailable' });
  }
});

/**
 * GET /api/network/cluster/:cluster_id
 * Proxies to mock-network-service.
 */
router.get('/cluster/:cluster_id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/cluster/${req.params.cluster_id}`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Network service unavailable' });
  }
});

/**
 * GET /api/network/clusters
 * Returns all clusters.
 */
router.get('/clusters', async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/clusters`);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Network service unavailable' });
  }
});

export default router;
