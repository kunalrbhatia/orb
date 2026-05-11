import { tradeStore } from '../store/tradeStore.js';
import { getLtp, getMonthlyExpiry } from '../helpers/marketData.js';
import { enterTrade } from '../helpers/orders.js';
import { logger } from '../helpers/logger.js';

export async function runPriceMonitor(): Promise<void> {
  const activeTrade = tradeStore.getActiveTrade();
  if (activeTrade) return;

  const watchList = tradeStore.getWatchList();
  const expiry = getMonthlyExpiry();

  for (const stock of watchList) {
    try {
      const currentLtp = await getLtp(stock.symbol, stock.symbolToken);
      const isBreached =
        stock.side === 'CALL'
          ? currentLtp > stock.watchLevel
          : currentLtp < stock.watchLevel;

      if (isBreached) {
        if (!stock.breachStartTime) {
          tradeStore.updateWatchStock(stock.symbol, {
            breachStartTime: new Date(),
          });
          logger.info(`Breach detected for ${stock.symbol} at ${currentLtp}`);
        } else {
          const duration =
            (new Date().getTime() - stock.breachStartTime.getTime()) /
            1000 /
            60;
          if (duration >= 5) {
            logger.info(
              `Confirmed breakout for ${stock.symbol}. Entering trade.`,
            );
            await enterTrade(stock, expiry);
            break; // Only one trade per day
          }
        }
      } else {
        if (stock.breachStartTime) {
          tradeStore.updateWatchStock(stock.symbol, { breachStartTime: null });
          logger.info(`Breach reset for ${stock.symbol}`);
        }
      }
      // Rate limit safety
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Price monitor failed for ${stock.symbol}: ${message}`);
    }
  }
}
