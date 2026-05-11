import {
  getTopMovers,
  getOptionChain,
  getMonthlyExpiry,
  getMorningCandles,
} from '../helpers/marketData.js';
import { findResistance, findSupport } from '../helpers/oiAnalyzer.js';
import { findLevelsFromCandles } from '../helpers/candleAnalyzer.js';
import { tradeStore } from '../store/tradeStore.js';
import { WatchStock } from '../store/tradeStore.js';
import { logger } from '../helpers/logger.js';
import { sendNotification, escapeMarkdownV2 } from '../notifier.js';

export async function runMorningScanner(): Promise<void> {
  logger.info('Running morning scanner...');
  try {
    const { gainers, losers } = await getTopMovers();
    logger.info(
      `Scanner found ${gainers.length} gainers and ${losers.length} losers`,
    );
    const expiry = getMonthlyExpiry();
    const watchList: WatchStock[] = [];

    for (const stock of gainers) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const chain = await getOptionChain(stock.name, expiry);
      const oiResistance = findResistance(chain, stock.ltp);

      const candles = await getMorningCandles(stock.symbolToken);
      const candleLevels =
        candles.length > 0 ? findLevelsFromCandles(candles) : null;
      const candleResistance = candleLevels
        ? candleLevels.resistance
        : stock.ltp;

      // Use the higher of OI resistance and candle high for a more conservative breakout level
      const watchLevel = Math.max(oiResistance, candleResistance);

      watchList.push({
        symbol: stock.symbol,
        symbolToken: stock.symbolToken,
        ltp: stock.ltp,
        side: 'CALL',
        watchLevel,
        breachStartTime: null,
      });

      logger.info(
        `[${stock.symbol}] OI Resistance: ${oiResistance}, Candle High: ${candleResistance}, Final WatchLevel: ${watchLevel}`,
      );
    }

    for (const stock of losers) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const chain = await getOptionChain(stock.name, expiry);
      const oiSupport = findSupport(chain, stock.ltp);

      const candles = await getMorningCandles(stock.symbolToken);
      const candleLevels =
        candles.length > 0 ? findLevelsFromCandles(candles) : null;
      const candleSupport = candleLevels ? candleLevels.support : stock.ltp;

      // Use the lower of OI support and candle low for a more conservative breakdown level
      const watchLevel = Math.min(oiSupport, candleSupport);

      watchList.push({
        symbol: stock.symbol,
        symbolToken: stock.symbolToken,
        ltp: stock.ltp,
        side: 'PUT',
        watchLevel,
        breachStartTime: null,
      });

      logger.info(
        `[${stock.symbol}] OI Support: ${oiSupport}, Candle Low: ${candleSupport}, Final WatchLevel: ${watchLevel}`,
      );
    }

    tradeStore.setWatchList(watchList);

    const gList = watchList
      .filter(s => s.side === 'CALL')
      .map(
        s =>
          `  • *${escapeMarkdownV2(s.symbol)}*: \`${escapeMarkdownV2(s.watchLevel.toFixed(2))}\``,
      )
      .join('\n');
    const lList = watchList
      .filter(s => s.side === 'PUT')
      .map(
        s =>
          `  • *${escapeMarkdownV2(s.symbol)}*: \`${escapeMarkdownV2(s.watchLevel.toFixed(2))}\``,
      )
      .join('\n');

    const summary = `🚀 *Morning Scanner Complete*\n\n📈 *CALL Watchlist \\(Resistance\\):*\n${gList}\n\n📉 *PUT Watchlist \\(Support\\):*\n${lList}`;

    logger.info(
      `Morning Scanner Complete. Watchlist:\n${watchList.map(s => `${s.symbol} (@${s.watchLevel})`).join(', ')}`,
    );
    await sendNotification(summary, 'MarkdownV2');
    logger.info('Morning scanner complete');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Morning scanner failed: ${message}`);
  }
}
