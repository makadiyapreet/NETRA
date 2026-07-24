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

dotenv.config({ path: '../.env.example' });

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;
const MODE = process.env.MODE || 'fixture';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize data store (loads fixture data)
const dataStore = DataStore.getInstance();

// Make dataStore available to routes
app.locals.dataStore = dataStore;

// Routes
app.use('/api/posts', postsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/network', networkRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/trends', trendsRouter);

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
      console.error('⚠️ Kafka/ES initialization error (continuing with fixture fallback):', err);
    }
  } else {
    // ── Fixture mode: emit demo alerts on interval ───────────────
    const alerts = dataStore.getAlerts();
    let idx = 0;
    setInterval(() => {
      if (idx < alerts.length) {
        io.emit('new-alert', alerts[idx]);
        console.log(`📢 Emitted alert: ${alerts[idx].title}`);
        idx++;
      } else {
        idx = 0; // loop
      }
    }, 12000);
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
