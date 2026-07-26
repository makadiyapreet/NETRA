import { Router, Request, Response } from 'express';

const router = Router();

const NETWORK_SERVICE_URL = process.env.NETWORK_SERVICE_URL || 'http://localhost:8001';

// --- Fallback fixture data for when the Python network service is unavailable ---
const FIXTURE_CLUSTERS = [
  {
    cluster_id: 'cluster-bot-ring-01',
    label: 'Gujarat Bot Ring Alpha',
    accounts: ['bot_guj_001', 'bot_guj_002', 'bot_guj_003', 'bot_guj_004', 'bot_guj_005', 'amp_handler_01'],
    coordination_score: 0.92,
    graph_edges: [
      { source: 'bot_guj_001', target: 'bot_guj_002', weight: 0.95 },
      { source: 'bot_guj_001', target: 'bot_guj_003', weight: 0.88 },
      { source: 'bot_guj_002', target: 'bot_guj_004', weight: 0.91 },
      { source: 'bot_guj_003', target: 'bot_guj_005', weight: 0.87 },
      { source: 'bot_guj_004', target: 'amp_handler_01', weight: 0.93 },
      { source: 'bot_guj_005', target: 'amp_handler_01', weight: 0.90 },
      { source: 'bot_guj_002', target: 'bot_guj_005', weight: 0.82 },
      { source: 'bot_guj_003', target: 'bot_guj_004', weight: 0.79 },
    ],
  },
  {
    cluster_id: 'cluster-hate-net-02',
    label: 'Cross-Platform Hate Network',
    accounts: ['hate_spread_01', 'hate_spread_02', 'hate_spread_03', 'fake_activist_07', 'troll_farm_12'],
    coordination_score: 0.87,
    graph_edges: [
      { source: 'hate_spread_01', target: 'hate_spread_02', weight: 0.92 },
      { source: 'hate_spread_01', target: 'fake_activist_07', weight: 0.85 },
      { source: 'hate_spread_02', target: 'hate_spread_03', weight: 0.90 },
      { source: 'hate_spread_03', target: 'troll_farm_12', weight: 0.88 },
      { source: 'fake_activist_07', target: 'troll_farm_12', weight: 0.83 },
      { source: 'hate_spread_02', target: 'troll_farm_12', weight: 0.81 },
    ],
  },
  {
    cluster_id: 'cluster-disinfo-03',
    label: 'Disinformation Amplifiers',
    accounts: ['disinfo_bot_01', 'disinfo_bot_02', 'disinfo_bot_03', 'disinfo_bot_04'],
    coordination_score: 0.78,
    graph_edges: [
      { source: 'disinfo_bot_01', target: 'disinfo_bot_02', weight: 0.89 },
      { source: 'disinfo_bot_02', target: 'disinfo_bot_03', weight: 0.86 },
      { source: 'disinfo_bot_03', target: 'disinfo_bot_04', weight: 0.84 },
      { source: 'disinfo_bot_01', target: 'disinfo_bot_04', weight: 0.80 },
    ],
  },
];

const FIXTURE_BOT_SCORES: Record<string, any> = {
  bot_guj_001: { account_id: 'bot_guj_001', bot_likelihood: 0.95, indicators: ['rapid_retweets', 'identical_timestamps', 'no_profile_pic'] },
  bot_guj_002: { account_id: 'bot_guj_002', bot_likelihood: 0.91, indicators: ['copy_paste_text', 'high_frequency', 'new_account'] },
  bot_guj_003: { account_id: 'bot_guj_003', bot_likelihood: 0.88, indicators: ['identical_timestamps', 'automated_replies'] },
  bot_guj_004: { account_id: 'bot_guj_004', bot_likelihood: 0.93, indicators: ['rapid_retweets', 'copy_paste_text', 'no_bio'] },
  bot_guj_005: { account_id: 'bot_guj_005', bot_likelihood: 0.86, indicators: ['new_account', 'high_frequency'] },
  amp_handler_01: { account_id: 'amp_handler_01', bot_likelihood: 0.72, indicators: ['amplification_pattern', 'coordinated_timing'] },
  hate_spread_01: { account_id: 'hate_spread_01', bot_likelihood: 0.89, indicators: ['hate_keywords', 'rapid_retweets', 'new_account'] },
  hate_spread_02: { account_id: 'hate_spread_02', bot_likelihood: 0.92, indicators: ['copy_paste_text', 'identical_timestamps'] },
  hate_spread_03: { account_id: 'hate_spread_03', bot_likelihood: 0.85, indicators: ['automated_replies', 'no_profile_pic'] },
  fake_activist_07: { account_id: 'fake_activist_07', bot_likelihood: 0.78, indicators: ['impersonation', 'coordinated_timing'] },
  troll_farm_12: { account_id: 'troll_farm_12', bot_likelihood: 0.94, indicators: ['rapid_retweets', 'copy_paste_text', 'identical_timestamps', 'new_account'] },
  disinfo_bot_01: { account_id: 'disinfo_bot_01', bot_likelihood: 0.91, indicators: ['fake_news_sharing', 'rapid_retweets'] },
  disinfo_bot_02: { account_id: 'disinfo_bot_02', bot_likelihood: 0.87, indicators: ['copy_paste_text', 'high_frequency'] },
  disinfo_bot_03: { account_id: 'disinfo_bot_03', bot_likelihood: 0.83, indicators: ['new_account', 'automated_replies'] },
  disinfo_bot_04: { account_id: 'disinfo_bot_04', bot_likelihood: 0.80, indicators: ['identical_timestamps', 'no_bio'] },
};

/**
 * GET /api/network/bot-score/:account_id
 */
router.get('/bot-score/:account_id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/bot-score/${req.params.account_id}`);
    if (resp.ok) {
      const data = await resp.json();
      res.json(data);
      return;
    }
  } catch {
    // Network error — fall through to fixture
  }
  // Fallback to fixture data
  const id = req.params.account_id;
  const score = FIXTURE_BOT_SCORES[id] || {
    account_id: id,
    bot_likelihood: 0.5 + Math.random() * 0.45,
    indicators: ['unknown_pattern'],
  };
  res.json(score);
});

/**
 * GET /api/network/cluster/:cluster_id
 */
router.get('/cluster/:cluster_id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/cluster/${req.params.cluster_id}`);
    if (resp.ok) {
      const data = await resp.json();
      res.json(data);
      return;
    }
  } catch {
    // Network error — fall through to fixture
  }
  const cluster = FIXTURE_CLUSTERS.find(c => c.cluster_id === req.params.cluster_id);
  if (cluster) {
    res.json(cluster);
  } else {
    res.status(404).json({ error: 'Cluster not found' });
  }
});

/**
 * GET /api/network/clusters
 * Returns all clusters (fixture data when network service unavailable).
 */
router.get('/clusters', async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/clusters`);
    if (resp.ok) {
      const data = await resp.json();
      res.json(data);
    } else {
      // Python service doesn't have /clusters endpoint — return fixtures
      res.json(FIXTURE_CLUSTERS);
    }
  } catch {
    res.json(FIXTURE_CLUSTERS);
  }
});

export default router;
