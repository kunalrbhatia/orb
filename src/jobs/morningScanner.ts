import {
  getTopMovers,
  getOptionChain,
  getMonthlyExpiry,
  getMorningCandles,
  getHistoricalData,
} from '../helpers/marketData.js';
import { findResistance, findSupport } from '../helpers/oiAnalyzer.js';
import {
  findLevelsFromCandles,
  findHistoricalLevels,
} from '../helpers/candleAnalyzer.js';
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
      await new Promise(resolve => setTimeout(resolve, 500));
      const chain = await getOptionChain(stock.name, expiry);
      const oiResistance = findResistance(chain, stock.ltp);

      const morningCandles = await getMorningCandles(stock.symbolToken);
      const morningLevels =
        morningCandles.length > 0
          ? findLevelsFromCandles(morningCandles)
          : null;
      const candleResistance = morningLevels
        ? morningLevels.resistance
        : stock.ltp;

      // Historical Analysis (90 Days)
      const histCandles = await getHistoricalData(
        stock.symbolToken,
        'NSE',
        'ONE_DAY',
        90,
      );
      const histLevels = findHistoricalLevels(histCandles);
      const nearestHistResistance =
        histLevels.resistance
          .filter(r => r.price > stock.ltp)
          .sort((a, b) => a.price - b.price)[0]?.price || stock.ltp;

      // Use the higher of OI, morning candle high, and historical resistance
      const watchLevel = Math.max(
        oiResistance,
        candleResistance,
        nearestHistResistance,
      );

      watchList.push({
        symbol: stock.symbol,
        symbolToken: stock.symbolToken,
        ltp: stock.ltp,
        side: 'CALL',
        watchLevel,
        breachStartTime: null,
      });

      logger.info(
        `[${stock.symbol}] OI Res: ${oiResistance}, Candle High: ${candleResistance}, Hist Res: ${nearestHistResistance}, Final: ${watchLevel}`,
      );
    }

    for (const stock of losers) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const chain = await getOptionChain(stock.name, expiry);
      const oiSupport = findSupport(chain, stock.ltp);

      const morningCandles = await getMorningCandles(stock.symbolToken);
      const morningLevels =
        morningCandles.length > 0
          ? findLevelsFromCandles(morningCandles)
          : null;
      const candleSupport = morningLevels ? morningLevels.support : stock.ltp;

      // Historical Analysis (90 Days)
      const histCandles = await getHistoricalData(
        stock.symbolToken,
        'NSE',
        'ONE_DAY',
        90,
      );
      const histLevels = findHistoricalLevels(histCandles);
      const nearestHistSupport =
        histLevels.support
          .filter(s => s.price < stock.ltp)
          .sort((a, b) => b.price - a.price)[0]?.price || stock.ltp;

      // Use the lower of OI, morning candle low, and historical support
      const watchLevel = Math.min(oiSupport, candleSupport, nearestHistSupport);

      watchList.push({
        symbol: stock.symbol,
        symbolToken: stock.symbolToken,
        ltp: stock.ltp,
        side: 'PUT',
        watchLevel,
        breachStartTime: null,
      });

      logger.info(
        `[${stock.symbol}] OI Sup: ${oiSupport}, Candle Low: ${candleSupport}, Hist Sup: ${nearestHistSupport}, Final: ${watchLevel}`,
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
