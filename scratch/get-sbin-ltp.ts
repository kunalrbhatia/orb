import { login } from '../src/helpers/login.js';
import { getLtp } from '../src/helpers/marketData.js';
import { logger } from '../src/helpers/logger.js';
import 'dotenv/config';

async function fetchSbinLtp() {
  try {
    logger.info('Logging in...');
    await login();
    
    logger.info('Fetching SBIN LTP...');
    const ltp = await getLtp('SBIN-EQ', '3045', 'NSE');
    
    console.log(`\n>>> SBIN LTP: ${ltp} <<<\n`);
    process.exit(0);
  } catch (error) {
    logger.error(`Failed to fetch SBIN LTP: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

fetchSbinLtp();
