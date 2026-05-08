import { api } from './api.js';
import { ANGEL_ONE_URLS } from './constants.js';
import { tradeStore, WatchStock } from '../store/tradeStore.js';
import { scripMasterStore } from '../store/scripMasterStore.js';
import { getOptionChain } from './marketData.js';
import { logger } from './logger.js';
import { sendNotification } from '../notifier.js';

export async function placeOrder(params: {
  symbol: string;
  token: string;
  transactionType: 'BUY' | 'SELL';
  quantity: number;
  orderType: 'MARKET' | 'LIMIT' | 'STOPLOSS_MARKET';
  price?: number;
  triggerPrice?: number;
}): Promise<string> {
  const payload = {
    exchange: 'NFO',
    tradingsymbol: params.symbol,
    symboltoken: params.token,
    transactiontype: params.transactionType,
    quantity: params.quantity,
    ordertype: params.orderType,
    producttype: 'CARRYFORWARD',
    duration: 'DAY',
    price: params.price || 0,
    triggerprice: params.triggerPrice || 0,
  };

  const response = await api.post<{ data: { orderid: string } }>(
    ANGEL_ONE_URLS.PLACE_ORDER,
    payload,
  );
  return response.data.orderid;
}

export async function enterTrade(
  stock: WatchStock,
  expiry: string,
): Promise<void> {
  logger.info(`Entering trade for ${stock.symbol}`);

  const allScrips = scripMasterStore.getScrips();
  const buyScrip = allScrips.find(
    s =>
      s.name === stock.symbol &&
      s.expiry === expiry &&
      parseFloat(s.strike) === stock.watchLevel &&
      s.symbol.endsWith(stock.side === 'CALL' ? 'CE' : 'PE'),
  );

  if (!buyScrip) throw new Error(`Buy scrip not found for ${stock.symbol}`);

  const buyOrderId = await placeOrder({
    symbol: buyScrip.symbol,
    token: buyScrip.token,
    transactionType: 'BUY',
    quantity: parseInt(buyScrip.lotsize),
    orderType: 'MARKET',
  });

  // Find hedge: premium approx 1/4th of buy leg
  const chain = await getOptionChain(stock.symbol, expiry);
  const buyOption = chain.find(c => c.strikePrice === stock.watchLevel);
  const targetPremium = (buyOption?.ltp || 0) / 4;

  const hedgeOption = chain
    .filter(c =>
      stock.side === 'CALL'
        ? c.strikePrice > stock.watchLevel
        : c.strikePrice < stock.watchLevel,
    )
    .reduce((prev, curr) =>
      Math.abs(curr.ltp - targetPremium) < Math.abs(prev.ltp - targetPremium)
        ? curr
        : prev,
    );

  const hedgeScrip = allScrips.find(
    s =>
      s.name === stock.symbol &&
      s.expiry === expiry &&
      parseFloat(s.strike) === hedgeOption.strikePrice &&
      s.symbol.endsWith(stock.side === 'CALL' ? 'CE' : 'PE'),
  );

  if (!hedgeScrip) throw new Error('Hedge scrip not found');

  const sellOrderId = await placeOrder({
    symbol: hedgeScrip.symbol,
    token: hedgeScrip.token,
    transactionType: 'SELL',
    quantity: parseInt(hedgeScrip.lotsize),
    orderType: 'MARKET',
  });

  const netDebit = (buyOption?.ltp || 0) - hedgeOption.ltp;
  const initialSl = netDebit - 3000 / parseInt(buyScrip.lotsize);

  // Note: Simplified SL placement, usually requires trigger price
  const slOrderId = await placeOrder({
    symbol: buyScrip.symbol,
    token: buyScrip.token,
    transactionType: 'SELL',
    quantity: parseInt(buyScrip.lotsize),
    orderType: 'STOPLOSS_MARKET',
    triggerPrice: initialSl,
  });

  tradeStore.setActiveTrade({
    symbol: stock.symbol,
    buyOrderId,
    buyToken: buyScrip.token,
    sellOrderId,
    sellToken: hedgeScrip.token,
    slOrderId,
    entryBuyPremium: buyOption?.ltp || 0,
    entrySellPremium: hedgeOption.ltp,
    netDebit,
    currentSlValue: initialSl,
    trailingStage: 0,
  });

  await sendNotification(
    `🚀 Trade Entered: ${stock.symbol}\nBUY ${buyScrip.symbol} @ ${buyOption?.ltp}\nSELL ${hedgeScrip.symbol} @ ${hedgeOption.ltp}\nSL: ${initialSl}`,
  );
}

export async function exitTrade(reason: string): Promise<void> {
  const trade = tradeStore.getActiveTrade();
  if (!trade) return;

  logger.info(`Exiting trade: ${reason}`);

  // 1. Cancel SL
  await api.post(ANGEL_ONE_URLS.CANCEL_ORDER, { orderid: trade.slOrderId });

  // 2. Square off legs
  // (In production, you'd fetch current symbols/tokens from tradeStore or order book)
  // This is a simplified placeholder

  await sendNotification(`🏁 Trade Exited: ${trade.symbol}\nReason: ${reason}`);
  tradeStore.setActiveTrade(null);
}

export async function modifyStoploss(newSl: number): Promise<void> {
  const trade = tradeStore.getActiveTrade();
  if (!trade) return;

  await api.post(ANGEL_ONE_URLS.MODIFY_ORDER, {
    orderid: trade.slOrderId,
    triggerprice: newSl,
    ordertype: 'STOPLOSS_MARKET',
  });

  tradeStore.setActiveTrade({
    ...trade,
    currentSlValue: newSl,
    trailingStage: trade.trailingStage + 1,
  });
}
