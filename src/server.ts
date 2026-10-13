import { loadConfig } from './config.js';
import { MongoStore } from './database.js';
import { createApp } from './app.js';
try {
  const config = loadConfig(); const store = new MongoStore(config); const app = createApp(config, store);
  app.listen(config.port, config.cloud ? '0.0.0.0' : '127.0.0.1', () => console.log('Task workspace listening; readiness reports database connectivity.'));
  const shutdown = () => { app.close(() => { void store.close().finally(() => process.exit(0)); }); setTimeout(() => process.exit(1), 10000).unref(); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
} catch { console.error('Startup configuration invalid. Review .env.example and the deployment guide.'); process.exitCode = 1; }
