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
      await new Promise(resolve => setTimeout(resolve, 1000));
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
      await new Promise(resolve => setTimeout(resolve, 1000));
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

    const gList = watchList
      .filter(s => s.side === 'CALL')
      .map(s => `<b>${s.symbol}</b>: <code>${s.watchLevel.toFixed(2)}</code>`)
      .join('\n');
    const lList = watchList
      .filter(s => s.side === 'PUT')
      .map(s => `<b>${s.symbol}</b>: <code>${s.watchLevel.toFixed(2)}</code>`)
      .join('\n');

    const summary = `🚀 <b>Morning Scanner Complete</b>\n\n📈 <b>CALL Watchlist (Resistance):</b>\n${gList}\n\n📉 <b>PUT Watchlist (Support):</b>\n${lList}`;

    logger.info(
      `Morning Scanner Complete. Watchlist:\n${watchList.map(s => `${s.symbol} (@${s.watchLevel})`).join(', ')}`,
    );
    await sendNotification(summary);
    logger.info('Morning scanner complete');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Morning scanner failed: ${message}`);
  }
}
