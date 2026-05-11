import { login } from './helpers/login.js';
import { downloadScripMaster } from './helpers/scripMaster.js';
import { runMorningScanner } from './jobs/morningScanner.js';
import { logger } from './helpers/logger.js';
import 'dotenv/config';

async function start(): Promise<void> {
  try {
    console.log('\n--- ORB ALGO: PRODUCTION SCAN START ---');

    // 1. Authenticate
    await login();
    logger.info('Login successful');

    // 2. Sync Scrip Master
    await downloadScripMaster();
    logger.info('Scrip master synced');

    // 3. Run Scanner
    console.log('Running scanner with Batch API and dual-factor S/R logic...');
    await runMorningScanner();

    console.log('--- PRODUCTION SCAN COMPLETE ---');
    process.exit(0);
  } catch (error) {
    logger.error(
      `Production scan failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

void start();
