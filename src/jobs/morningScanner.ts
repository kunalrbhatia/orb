import {
  getTopMovers,
  getOptionChain,
  getMonthlyExpiry,
} from '../helpers/marketData.js';
import { findResistance, findSupport } from '../helpers/oiAnalyzer.js';
import { tradeStore } from '../store/tradeStore.js';
import { WatchStock } from '../store/tradeStore.js';
import { logger } from '../helpers/logger.js';
import { sendNotification } from '../notifier.js';

export async function runMorningScanner(): Promise<void> {
  logger.info('Running morning scanner...');
  try {
    const { gainers, losers } = await getTopMovers();
    const expiry = getMonthlyExpiry();
    const watchList: WatchStock[] = [];

    for (const stock of gainers) {
      const chain = await getOptionChain(stock.symbol, expiry);
      const watchLevel = findResistance(chain, stock.ltp);
      watchList.push({
        symbol: stock.symbol,
        symbolToken: stock.symbolToken,
        ltp: stock.ltp,
        side: 'CALL',
        watchLevel,
        breachStartTime: null,
      });
    }

    for (const stock of losers) {
      const chain = await getOptionChain(stock.symbol, expiry);
      const watchLevel = findSupport(chain, stock.ltp);
      watchList.push({
        symbol: stock.symbol,
        symbolToken: stock.symbolToken,
        ltp: stock.ltp,
        side: 'PUT',
        watchLevel,
        breachStartTime: null,
      });
    }

    tradeStore.setWatchList(watchList);

    const summary = watchList
      .map(s => `${s.symbol} (${s.side}): Watch @ ${s.watchLevel}`)
      .join('\n');
    await sendNotification(`Morning Scanner Complete. Watchlist:\n${summary}`);
    logger.info('Morning scanner complete');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Morning scanner failed: ${message}`);
  }
}
