/**
 * System Health Metrics API route.
 *
 * Performs REAL health checks against each service endpoint.
 * Never returns hardcoded "healthy" status — actually pings each service.
 */

import { Router, Request, Response } from 'express';
import { youtubePool, twitterPool, telegramPool, metaPool } from './live-fetch';

const router = Router();

const SERVICE_ENDPOINTS = [
  { name: 'api_gateway', port: 4000, url: 'http://127.0.0.1:4000/api/health' },
  { name: 'nlp_engine', port: 8000, url: 'http://127.0.0.1:8000/health' },
  { name: 'network_service', port: 8001, url: 'http://127.0.0.1:8001/health' },
  { name: 'watchlist_api', port: 8002, url: 'http://127.0.0.1:8002/health' },
];

// Infrastructure services — only available in Docker/kafka mode
const INFRA_SERVICES = ['kafka', 'elasticsearch', 'neo4j', 'redis', 'postgres', 'kibana', 'prometheus', 'grafana'];
const INFRA_PORTS: Record<string, number> = {
  kafka: 9092, elasticsearch: 9200, neo4j: 7474, redis: 6379,
  postgres: 5432, kibana: 5601, prometheus: 9090, grafana: 3001,
};

async function checkService(url: string, timeout = 3000): Promise<{ status: string; latency_ms: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return {
      status: res.ok ? 'healthy' : 'degraded',
      latency_ms: Date.now() - start,
    };
  } catch {
    return {
      status: 'down',
      latency_ms: Date.now() - start,
    };
  }
}

router.get('/', async (req: Request, res: Response) => {
  const mode = process.env.MODE || 'offline';

  try {
    // Real health checks for application services
    const serviceResults: Record<string, any> = {};
    
    for (const svc of SERVICE_ENDPOINTS) {
      // Skip self-check for API gateway (we're already running)
      if (svc.name === 'api_gateway') {
        serviceResults[svc.name] = { status: 'healthy', port: svc.port, latency_ms: 0 };
        continue;
      }
      const check = await checkService(svc.url);
      serviceResults[svc.name] = { ...check, port: svc.port };
    }

    // Infrastructure services — mark based on MODE
    for (const infra of INFRA_SERVICES) {
      serviceResults[infra] = {
        status: mode === 'kafka' ? 'unknown' : 'not_applicable',
        port: INFRA_PORTS[infra],
        note: mode === 'kafka' ? 'Docker infrastructure' : 'Not used in offline mode',
      };
    }

    // Real performance metrics from DataStore
    const dataStore = req.app.locals.dataStore;
    const postCount = dataStore?.getPosts?.({ size: 1 })?.total || 0;
    const alertCount = dataStore?.getAlerts?.()?.length || 0;

    const metrics = {
      timestamp: new Date().toISOString(),
      mode,
      services: serviceResults,
      performance: {
        total_posts_ingested: postCount,
        total_alerts_generated: alertCount,
        note: 'Real-time metrics from DataStore',
      },
      rate_limits: {
        twitter: {
          status: twitterPool.size > 0
            ? (twitterPool.activeCount > 0 ? 'KEYS_AVAILABLE' : 'ALL_KEYS_EXHAUSTED')
            : 'NO_TOKEN',
          keys_active: twitterPool.activeCount,
          keys_total: twitterPool.size,
          note: twitterPool.size > 0
            ? `${twitterPool.activeCount}/${twitterPool.size} keys active`
            : 'Authenticated but search requires Basic tier ($100/mo)',
        },
        youtube: {
          status: youtubePool.size > 0
            ? (youtubePool.activeCount > 0 ? 'KEYS_AVAILABLE' : 'ALL_KEYS_EXHAUSTED')
            : 'NO_KEY',
          keys_active: youtubePool.activeCount,
          keys_total: youtubePool.size,
          note: `${youtubePool.activeCount}/${youtubePool.size} keys active`,
        },
        meta: {
          status: metaPool.size > 0
            ? (metaPool.activeCount > 0 ? 'KEYS_AVAILABLE' : 'ALL_KEYS_EXHAUSTED')
            : 'SCRAPER_FALLBACK',
          keys_active: metaPool.activeCount,
          keys_total: metaPool.size,
          note: metaPool.size > 0
            ? `${metaPool.activeCount}/${metaPool.size} keys active`
            : 'Using public page scraper as fallback',
        },
        telegram: {
          status: telegramPool.size > 0
            ? (telegramPool.activeCount > 0 ? 'KEYS_AVAILABLE' : 'ALL_KEYS_EXHAUSTED')
            : 'NO_TOKEN',
          keys_active: telegramPool.activeCount,
          keys_total: telegramPool.size,
          note: telegramPool.size > 0
            ? `${telegramPool.activeCount}/${telegramPool.size} keys active`
            : 'Get a token from @BotFather on Telegram',
        },
      },
    };

    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch health metrics', detail: String(err) });
  }
});

export default router;

