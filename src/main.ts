import cron from 'node-cron';
import { login } from './helpers/login.js';
import { isTradingDay } from './helpers/holidayCheck.js';
import { downloadScripMaster } from './helpers/scripMaster.js';
import { runMorningScanner } from './jobs/morningScanner.js';
import { runPriceMonitor } from './jobs/priceMonitor.js';
import { runTradeMonitor } from './jobs/tradeMonitor.js';
import { startServer } from './server.js';
import { logger } from './helpers/logger.js';
import { sendNotification } from './notifier.js';

async function bootstrap(): Promise<void> {
  logger.info('Starting ORB Algo...');

  try {
    // Start health check server immediately to keep process alive
    startServer();

    // Register Cron Jobs (Even on holidays, to keep process alive)
    // Morning Scanner: 10:30 AM IST (Mon-Fri)
    cron.schedule(
      '30 10 * * 1-5',
      () => {
        void (async (): Promise<void> => {
          const { isTradingDay: trading } = await isTradingDay();
          if (trading) await runMorningScanner();
        })();
      },
      { timezone: 'Asia/Kolkata' },
    );

    // Price Monitor: Every 5 mins between 10:35 AM and 3:25 PM
    cron.schedule(
      '*/5 10-15 * * 1-5',
      () => {
        void (async (): Promise<void> => {
          const { isTradingDay: trading } = await isTradingDay();
          if (trading) await runPriceMonitor();
        })();
      },
      { timezone: 'Asia/Kolkata' },
    );

    // Trade Monitor: Every 5 mins between 10:35 AM and 3:25 PM
    cron.schedule(
      '*/5 10-15 * * 1-5',
      () => {
        void (async (): Promise<void> => {
          const { isTradingDay: trading } = await isTradingDay();
          if (trading) await runTradeMonitor();
        })();
      },
      { timezone: 'Asia/Kolkata' },
    );

    const { isTradingDay: trading, reason } = await isTradingDay();
    if (!trading) {
      logger.info(`Today is not a trading day: ${reason}`);
      await sendNotification(
        `Today is not a trading day: ${reason}. Algo is in standby mode.`,
      );
      return;
    }

    await login();
    await downloadScripMaster();

    logger.info('ORB Algo initialized successfully');
    void sendNotification(
      'ORB Algo initialized successfully and is now waiting for 10:30 AM scan.',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Bootstrap failed: ${message}`);
    void sendNotification(`CRITICAL: Algo failed to start: ${message}`);
    // Only exit on catastrophic bootstrap errors
    process.exit(1);
  }
}

void bootstrap();
