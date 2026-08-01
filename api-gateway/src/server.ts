import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import { initWebSocket } from './websocket-server';
import { DataStore } from './data-store';
import { initKafkaConsumer } from './kafka-consumer';
import { createElasticsearchClient } from './elasticsearch-client';
import postsRouter from './routes/posts';
import alertsRouter from './routes/alerts';
import networkRouter from './routes/network';
import reportsRouter from './routes/reports';
import trendsRouter from './routes/trends';
import searchRouter from './routes/search';
import watchlistRouter from './routes/watchlist';
import authRouter, { extractJwtRole } from './auth/jwt-auth';
import briefingRouter from './routes/briefing';
import notificationsRouter from './routes/notifications';
import geoRouter from './routes/geo';
import healthMetricsRouter from './routes/health-metrics';
import liveFetchRouter from './routes/live-fetch';

dotenv.config({ path: '../.env' });

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;
const MODE = process.env.MODE || 'offline';

// Middleware
app.use(cors());
app.use(express.json());

// JWT-aware role extraction (replaces header-based role in production)
app.use(extractJwtRole);

// Initialize data store (loads fixture data)
const dataStore = DataStore.getInstance();

// Make dataStore available to routes
app.locals.dataStore = dataStore;

// Routes
app.use('/api/auth', authRouter);
app.use('/api/posts', postsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/network', networkRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/search', searchRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/briefing', briefingRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/geo', geoRouter);
app.use('/api/health-metrics', healthMetricsRouter);
app.use('/api/live', liveFetchRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    mode: MODE,
    kafka: MODE === 'kafka' ? 'connected' : 'disabled',
    elasticsearch: app.locals.esClient?.isConnected() ? 'connected' : 'disabled',
  });
});

// Initialize WebSocket
const io = initWebSocket(server);
app.locals.io = io;

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 API Gateway running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`📦 Mode: ${MODE}`);

  if (MODE === 'kafka') {
    // ── Kafka mode: consume from live topics ──────────────────────
    try {
      // Initialize Elasticsearch (optional — degrades gracefully)
      const esClient = await createElasticsearchClient();
      app.locals.esClient = esClient;

      // Start Kafka consumer
      const kafkaConsumer = await initKafkaConsumer(io, esClient);
      app.locals.kafkaConsumer = kafkaConsumer;

      console.log('✅ Kafka integration initialized');
    } catch (err) {
      console.error('⚠️ Kafka/ES initialization error (continuing with local data):', err);
    }
  } else {
    console.log(`📦 MODE=${MODE} — Skipping Kafka/Elasticsearch (no Docker infrastructure needed)`);
  }

  // ── Only emit alerts for NEWLY created alerts from real classified posts ───
  // (Don't replay old alerts in a loop — that's misleading)
  let lastAlertCount = 0;
  setInterval(() => {
    const currentAlerts = dataStore.getAlerts();
    if (currentAlerts.length > lastAlertCount) {
      // Emit only the NEW alerts since last check
      const newAlerts = currentAlerts.slice(0, currentAlerts.length - lastAlertCount);
      for (const alert of newAlerts) {
        io.emit('new-alert', alert);
      }
      lastAlertCount = currentAlerts.length;
    }
  }, 5000);

  // ── Data mode endpoint: reports whether synthetic data is present ────
  app.get('/api/health/data-mode', (_req, res) => {
    const allPosts = dataStore.getPosts({ size: 10000 });
    const syntheticCount = allPosts.data.filter((p: any) => p.is_synthetic === true || p.source === 'fixture').length;
    const realCount = allPosts.total - syntheticCount;
    res.json({
      mode: MODE,
      total_posts: allPosts.total,
      real_posts: realCount,
      synthetic_posts: syntheticCount,
      has_synthetic: syntheticCount > 0,
      data_label: syntheticCount > 0
        ? (realCount > 0 ? 'MIXED (Real + Simulated)' : 'SIMULATED DATA ONLY')
        : (realCount > 0 ? 'LIVE DATA' : 'NO DATA YET'),
    });
  });

  // ── Background Live Data Poller ─────────────────────────────
  // Fetch real data on startup and periodically so the dashboard has live data
  // Focus on Gujarat region per PS scope to conserve API quota.
  const GUJARAT_LOCATIONS = [
    'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 
    'Jamnagar', 'Gandhinagar', 'Junagadh', 'Gujarat',
  ];

  const youtubeConfigured = !!process.env.YOUTUBE_API_KEY;
  const metaTokenSet = !!process.env.META_ACCESS_TOKEN;

  if (youtubeConfigured) {
    setTimeout(() => {
      console.log('[LIVE] Starting background YouTube data poller (Twitter excluded — Free tier lacks search access)');
      const topics = ['news', 'breaking', 'police', 'alert', 'protest'];
      
      let locIndex = 0;
      const fetchLive = () => {
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const location = GUJARAT_LOCATIONS[locIndex];
        const q = `${topic} ${location}`;
        
        // Determine which platforms to poll
        const platforms = ['youtube'];
        if (!metaTokenSet) {
          platforms.push('facebook'); // Use scraper fallback
        }
        
        console.log(`[LIVE] Background polling for: ${q} on [${platforms.join(', ')}]`);
        fetch(`http://localhost:${PORT}/api/live/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, platforms })
        }).catch(err => console.error('[LIVE] Background fetch failed:', err.message));

        locIndex = (locIndex + 1) % GUJARAT_LOCATIONS.length;
      };
      
      // Fetch immediately, then every 60s to conserve YouTube API quota
      fetchLive();
      setInterval(fetchLive, 60000); 
    }, 5000);
  } else {
    console.log('[LIVE] No API keys configured — background poller disabled');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  const kafkaConsumer = app.locals.kafkaConsumer;
  if (kafkaConsumer) {
    await kafkaConsumer.stop();
  }
  server.close();
  process.exit(0);
});

export { app, server };
