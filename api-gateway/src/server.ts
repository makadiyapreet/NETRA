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
const MODE = process.env.MODE || 'kafka';

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
  }

  // ── Always emit alerts from data store (real-time feed) ─────
  const alerts = dataStore.getAlerts();
  let idx = 0;
  setInterval(() => {
    if (alerts.length > 0) {
      io.emit('new-alert', alerts[idx]);
      idx = (idx + 1) % alerts.length;
    }
  }, 12000);

  // ── Background Live Data Poller ─────────────────────────────
  // Fetch real data on startup and periodically so the dashboard has live data
  const ALL_LOCATIONS = [
    // All States of India
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 
    'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    // All major cities of Gujarat
    'Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 
    'Anand', 'Navsari', 'Morbi', 'Bharuch', 'Vapi', 'Porbandar', 'Bhuj', 'Godhra', 'Patan', 'Palanpur',
    // Major cities in other states
    'Mumbai', 'Pune', 'Nagpur', 'New Delhi', 'Lucknow', 'Kanpur', 'Kolkata', 'Bengaluru', 'Chennai', 'Jaipur'
  ];

  setTimeout(() => {
    console.log('[LIVE] Initiating background data fetch cycle for regional real data...');
    const topics = ['news', 'breaking', 'police', 'alert', 'clash'];
    
    // We will process the locations sequentially to avoid hitting rate limits instantly
    let locIndex = 0;
    const fetchLive = () => {
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const location = ALL_LOCATIONS[locIndex];
      const q = `${topic} ${location}`; // e.g. "breaking Ahmedabad"
      
      console.log(`[LIVE] Background polling real data for: ${q}`);
      fetch(`http://localhost:${PORT}/api/live/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, platforms: ['twitter', 'youtube'] }) 
      }).catch(err => console.error('[LIVE] Background fetch failed:', err.message));

      locIndex = (locIndex + 1) % ALL_LOCATIONS.length;
    };
    
    // Fetch immediately, then every 15s to populate the map without destroying API quotas instantly
    fetchLive();
    setInterval(fetchLive, 15000); 
  }, 5000);
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
