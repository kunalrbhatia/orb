import axios from 'axios';
import { SCRIP_MASTER_URL, NIFTY_50_TOKENS } from './constants.js';
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

    // Filter to NFO exchange (OPTSTK) and NSE exchange (for Nifty 50 stocks)
    const filteredScrips = allScrips.data.filter(s => {
      const isNfoOption = s.exch_seg === 'NFO' && s.instrumenttype === 'OPTSTK';
      const isNseStock =
        s.exch_seg === 'NSE' &&
        s.symbol.endsWith('-EQ') &&
        NIFTY_50_TOKENS.includes(s.token);
      return isNfoOption || isNseStock;
    });

    scripMasterStore.setScrips(filteredScrips);
    logger.info(
      `Scrip master loaded: ${filteredScrips.length} instruments found`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to download scrip master: ${message}`);
    throw error;
  }
}
