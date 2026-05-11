import { login } from '../src/helpers/login.js';
import { downloadScripMaster } from '../src/helpers/scripMaster.js';
import { runMorningScanner } from '../src/jobs/morningScanner.js';
import { logger } from '../src/helpers/logger.js';
import axios from 'axios';
import 'dotenv/config';

async function runManualScan() {
  try {
    const ipResponse = await axios.get('https://api.ipify.org?format=json');
    const publicIp = ipResponse.data.ip;
    logger.info(`Starting manual morning scan from IP: ${publicIp}...`);
    
    await login();
    await downloadScripMaster();
    await runMorningScanner();
    logger.info('Manual morning scan complete.');
    process.exit(0);
  } catch (error) {
    logger.error(`Manual scan failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

runManualScan();
