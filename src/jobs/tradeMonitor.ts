import { tradeStore } from '../store/tradeStore.js';
import { getBatchLtp } from '../helpers/marketData.js';
import { checkTrailingSl } from '../helpers/trailingSlManager.js';
import { modifyStoploss, exitTrade } from '../helpers/orders.js';
import { logger } from '../helpers/logger.js';
import moment from 'moment-timezone';

export async function runTradeMonitor(): Promise<void> {
  const trade = tradeStore.getActiveTrade();
  if (!trade) return;

  // EOD Check
  const now = moment().tz('Asia/Kolkata');
  if (now.format('HH:mm') >= '15:20') {
    await exitTrade('EOD square-off');
    return;
  }

  try {
    const tokens = [trade.buyToken, trade.sellToken];
    const ltpMap = await getBatchLtp(tokens);

    const buyLtp = ltpMap[trade.buyToken] || 0;
    const sellLtp = ltpMap[trade.sellToken] || 0;

    const currentMtm =
      buyLtp - trade.entryBuyPremium - (sellLtp - trade.entrySellPremium);

    const { shouldModifySl, newSlValue } = checkTrailingSl(
      currentMtm,
      trade.netDebit,
      trade.currentSlValue,
      trade.trailingStage,
    );

    if (shouldModifySl) {
      logger.info(`Trailing SL to ${newSlValue}`);
      await modifyStoploss(newSlValue);
    }

    // Check if SL hit via LTP comparison (as backup to exchange SL)
    if (buyLtp <= trade.currentSlValue) {
      await exitTrade('SL hit (detected via LTP)');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Trade monitor failed: ${message}`);
  }
}
