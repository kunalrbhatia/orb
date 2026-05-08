import axios from 'axios';
import { SCRIP_MASTER_URL } from './constants.js';
import { scripMasterStore } from '../store/scripMasterStore.js';
import { logger } from './logger.js';

export async function downloadScripMaster(): Promise<void> {
  logger.info('Downloading scrip master...');
  try {
    interface RawScrip {
      exch_seg: string;
      instrumenttype: string;
      token: string;
      symbol: string;
      name: string;
      expiry: string;
      strike: string;
      lotsize: string;
      tick_size: string;
    }
    const allScrips = await axios.get<RawScrip[]>(SCRIP_MASTER_URL);

    // Filter to NFO exchange, OPTSTK instrument type
    const filteredScrips = allScrips.data.filter(
      s => s.exch_seg === 'NFO' && s.instrumenttype === 'OPTSTK',
    );

    scripMasterStore.setScrips(filteredScrips);
    logger.info(`Scrip master loaded: ${filteredScrips.length} options found`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to download scrip master: ${message}`);
    throw error;
  }
}
