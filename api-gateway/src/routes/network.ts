import { Router, Request, Response } from 'express';

const router = Router();

const NETWORK_SERVICE_URL = process.env.NETWORK_SERVICE_URL || 'http://localhost:8001';

// ── NOTE: All fixture data has been intentionally removed. ────────
// When the upstream network service (port 8001/Neo4j) is NOT available,
// the API computes real clusters and bot scores from DataStore posts
// using heuristic analysis. This is REAL data, not fabricated fixtures.

/**
 * Compute coordination clusters from DataStore posts.
 * Groups authors who share similar text, hashtags, or post within tight time windows.
 */
function computeClustersFromPosts(dataStore: any): any[] {
  const allPosts = dataStore.getPosts({ size: 10000 });
  if (!allPosts.data || allPosts.data.length < 2) return [];

  // Group posts by author
  const authorPosts = new Map<string, any[]>();
  for (const p of allPosts.data) {
    const handle = p.author_handle || p.author_id || 'unknown';
    if (!authorPosts.has(handle)) authorPosts.set(handle, []);
    authorPosts.get(handle)!.push(p);
  }

  // Find text-similarity edges (authors posting near-identical content)
  const edges: { source: string; target: string; weight: number; reason: string }[] = [];
  const authors = Array.from(authorPosts.keys());

  for (let i = 0; i < authors.length; i++) {
    for (let j = i + 1; j < authors.length; j++) {
      const postsA = authorPosts.get(authors[i])!;
      const postsB = authorPosts.get(authors[j])!;

      // Check for text similarity
      let sharedTextCount = 0;
      let sharedHashtagCount = 0;
      for (const a of postsA) {
        for (const b of postsB) {
          // Near-identical text (first 80 chars)
          const textA = (a.text || '').slice(0, 80).toLowerCase();
          const textB = (b.text || '').slice(0, 80).toLowerCase();
          if (textA.length > 20 && textA === textB) sharedTextCount++;
          
          // Shared hashtags
          const hashA = new Set((a.hashtags || []).map((h: string) => h.toLowerCase()));
          const hashB = (b.hashtags || []).map((h: string) => h.toLowerCase());
          for (const h of hashB) { if (hashA.has(h)) sharedHashtagCount++; }
        }
      }

      if (sharedTextCount > 0 || sharedHashtagCount >= 2) {
        edges.push({
          source: authors[i],
          target: authors[j],
          weight: sharedTextCount * 0.7 + sharedHashtagCount * 0.3,
          reason: sharedTextCount > 0 ? 'copy_paste_text' : 'shared_hashtags',
        });
      }
    }
  }

  if (edges.length === 0) return [];

  // Build clusters from connected components via simple BFS
  const visited = new Set<string>();
  const clusters: any[] = [];

  for (const author of authors) {
    if (visited.has(author)) continue;
    const cluster: string[] = [];
    const queue = [author];
    while (queue.length > 0) {
      const curr = queue.pop()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      cluster.push(curr);
      for (const e of edges) {
        if (e.source === curr && !visited.has(e.target)) queue.push(e.target);
        if (e.target === curr && !visited.has(e.source)) queue.push(e.source);
      }
    }
    if (cluster.length >= 2) {
      const clusterEdges = edges.filter(e => cluster.includes(e.source) && cluster.includes(e.target));
      const avgWeight = clusterEdges.reduce((s, e) => s + e.weight, 0) / Math.max(clusterEdges.length, 1);
      clusters.push({
        cluster_id: `CL-DS-${clusters.length + 1}`,
        label: `Coordination Cluster ${clusters.length + 1} (${cluster.length} accounts)`,
        accounts: cluster,
        coordination_score: +Math.min(avgWeight / 2, 0.95).toFixed(2),
        graph_edges: clusterEdges,
        source: 'datastore_heuristic',
      });
    }
  }

  return clusters.sort((a, b) => b.coordination_score - a.coordination_score);
}


/**
 * GET /api/network/bot-score/:account_id
 */
router.get('/bot-score/:account_id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/bot-score/${req.params.account_id}`);
    if (!resp.ok) {
      throw new Error(`Upstream returned ${resp.status}`);
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    // Compute from DataStore
    const dataStore = req.app.locals.dataStore;
    const allPosts = dataStore.getPosts({ size: 10000 });
    const accountPosts = allPosts.data.filter((p: any) => 
      (p.author_handle || '').toLowerCase() === req.params.account_id.toLowerCase()
    );

    if (accountPosts.length === 0) {
      res.status(404).json({ error: 'account_not_found', account_id: req.params.account_id });
      return;
    }

    const postCount = accountPosts.length;
    const uniqueTexts = new Set(accountPosts.map((p: any) => (p.text || '').slice(0, 80))).size;
    const copyPasteRatio = postCount > 1 ? 1 - (uniqueTexts / postCount) : 0;
    const avgEngagement = accountPosts.reduce((s: number, p: any) => s + (p.engagement_counts?.likes || 0), 0) / postCount;

    let score = 0;
    const indicators: string[] = [];
    if (copyPasteRatio > 0.5) { score += 0.3; indicators.push('copy_paste_text'); }
    if (postCount > 10) { score += 0.2; indicators.push('high_frequency'); }
    if (avgEngagement < 5) { score += 0.15; indicators.push('low_engagement'); }
    score = Math.min(score, 0.95);

    res.json({
      account_id: req.params.account_id,
      bot_likelihood: +score.toFixed(2),
      post_count: postCount,
      indicators,
      source: 'datastore_heuristic',
    });
  }
});

/**
 * GET /api/network/cluster/:cluster_id
 */
router.get('/cluster/:cluster_id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/cluster/${req.params.cluster_id}`);
    if (!resp.ok) {
      throw new Error(`Upstream returned ${resp.status}`);
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    // Try DataStore clusters
    const dataStore = req.app.locals.dataStore;
    const clusters = computeClustersFromPosts(dataStore);
    const cluster = clusters.find(c => c.cluster_id === req.params.cluster_id);
    if (cluster) {
      res.json(cluster);
    } else {
      res.status(404).json({ error: 'cluster_not_found', cluster_id: req.params.cluster_id });
    }
  }
});

/**
 * GET /api/network/clusters
 * Returns clusters from upstream Neo4j service, or computes from DataStore posts.
 */
router.get('/clusters', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/clusters`);
    if (!resp.ok) {
      throw new Error(`Upstream returned ${resp.status}`);
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    // Compute real clusters from DataStore posts
    const dataStore = req.app.locals.dataStore;
    const clusters = computeClustersFromPosts(dataStore);
    
    if (clusters.length > 0) {
      res.json(clusters);
    } else {
      // No clusters found — return empty (honest, not fixture)
      res.json([]);
    }
  }
});

/**
 * GET /api/network/bot-scores
 * Returns bot scores computed from ingested posts.
 */
router.get('/bot-scores', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/bot-scores`);
    if (resp.ok) {
      const data = await resp.json();
      res.json(data);
      return;
    }
  } catch {
    // Network service unavailable — fall through to DataStore-based scoring
  }

  // Compute basic bot scores from DataStore post metadata (real data)
  const dataStore = req.app.locals.dataStore;
  const allPosts = dataStore.getPosts({ size: 10000 });
  
  // Group posts by author and compute basic bot signals
  const authorMap = new Map<string, any[]>();
  for (const post of allPosts.data) {
    const handle = post.author_handle || 'unknown';
    if (!authorMap.has(handle)) authorMap.set(handle, []);
    authorMap.get(handle)!.push(post);
  }

  const scores = Array.from(authorMap.entries())
    .filter(([_, posts]) => posts.length >= 2) // Only score accounts with multiple posts
    .map(([handle, posts]) => {
      const postCount = posts.length;
      const uniqueTexts = new Set(posts.map((p: any) => p.text?.slice(0, 100))).size;
      const copyPasteRatio = 1 - (uniqueTexts / postCount);
      const avgEngagement = posts.reduce((s: number, p: any) => 
        s + (p.engagement_counts?.likes || 0), 0) / postCount;
      
      let score = 0;
      if (copyPasteRatio > 0.5) score += 0.3;
      if (postCount > 10) score += 0.2;
      if (avgEngagement < 5) score += 0.15;
      score = Math.min(score, 0.95);

      return {
        account_id: handle,
        bot_likelihood: +score.toFixed(2),
        post_count: postCount,
        indicators: [
          ...(copyPasteRatio > 0.5 ? ['copy_paste_text'] : []),
          ...(postCount > 10 ? ['high_frequency'] : []),
          ...(avgEngagement < 5 ? ['low_engagement'] : []),
        ],
        source: 'datastore_heuristic',
      };
    })
    .sort((a, b) => b.bot_likelihood - a.bot_likelihood)
    .slice(0, 50);

  res.json({ data: scores, total: scores.length, source: 'datastore_heuristic' });
});

/**
 * GET /api/network/communities
 */
router.get('/communities', async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${NETWORK_SERVICE_URL}/communities`);
    if (resp.ok) {
      const data = await resp.json();
      res.json(data);
      return;
    }
  } catch {
    // Network service unavailable
  }
  
  res.json({
    data: [],
    total: 0,
    message: 'Community detection requires the network analysis service (port 8001). No communities detected yet.',
    source: 'none',
  });
});

export default router;
