import express from 'express';
import { config } from './config/env.js';
import { logger } from './helpers/logger.js';
import { Server } from 'http';

const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

let server: Server;

export function startServer(): void {
  server = app.listen(config.port, () => {
    logger.info(`Express server running on port ${config.port}`);
  });

  // Graceful Shutdown
  const shutdown = (signal: string): void => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });

    // Force shutdown after 10s
    setTimeout(() => {
      logger.error(
        'Could not close connections in time, forcefully shutting down',
      );
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
