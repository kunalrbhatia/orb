import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { SCRIP_MASTER_URL, NIFTY_50_TOKENS } from './constants.js';
import { scripMasterStore, Scrip } from '../store/scripMasterStore.js';
import { logger } from './logger.js';
import moment from 'moment-timezone';

const CACHE_FILE = 'logs/scrip_master_cache.json';

interface CachedData {
  date: string;
  scrips: Scrip[];
}

export async function downloadScripMaster(
  retries = 3,
  delay = 2000,
): Promise<void> {
  const today = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');

  // Try to load from cache first
  try {
    const cacheExists = await fs
      .access(CACHE_FILE)
      .then(() => true)
      .catch(() => false);
    if (cacheExists) {
      const rawData = await fs.readFile(CACHE_FILE, 'utf-8');
      const cached = JSON.parse(rawData) as CachedData;
      if (cached.date === today) {
        logger.info('Loading scrip master from local cache...');
        scripMasterStore.setScrips(cached.scrips);
        return;
      }
      logger.info('Cache expired. Downloading fresh scrip master...');
    }
  } catch (err) {
    logger.warn(
      `Failed to read cache: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.info(
        `Downloading scrip master (Attempt ${attempt}/${retries})...`,
      );
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
      const allScrips = await axios.get<RawScrip[]>(SCRIP_MASTER_URL, {
        timeout: 60000, // 60s timeout for large file
      });

      // Filter to NFO exchange (OPTSTK) and NSE exchange (for Nifty 50 stocks)
      const filteredScrips = allScrips.data.filter(s => {
        const isNfoOption =
          s.exch_seg === 'NFO' && s.instrumenttype === 'OPTSTK';
        const isNseStock =
          s.exch_seg === 'NSE' &&
          s.symbol.endsWith('-EQ') &&
          NIFTY_50_TOKENS.includes(s.token);
        return isNfoOption || isNseStock;
      });

      scripMasterStore.setScrips(filteredScrips);

      // Save to cache
      try {
        const cacheDir = path.dirname(CACHE_FILE);
        await fs.mkdir(cacheDir, { recursive: true });
        await fs.writeFile(
          CACHE_FILE,
          JSON.stringify({ date: today, scrips: filteredScrips }),
        );
        logger.info('Scrip master cached locally.');
      } catch (cacheErr) {
        logger.warn(
          `Failed to save cache: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`,
        );
      }

      logger.info(
        `Scrip master loaded: ${filteredScrips.length} instruments found`,
      );
      return; // Success
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const message = error instanceof Error ? error.message : String(error);

      if (isLastAttempt) {
        logger.error(
          `Failed to download scrip master after ${retries} attempts: ${message}`,
        );
        throw error;
      }

      logger.warn(
        `Attempt ${attempt} failed: ${message}. Retrying in ${delay}ms...`,
      );
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
}
