import { tradeStore } from '../../src/store/tradeStore';

describe('tradeStore', () => {
  beforeEach(() => {
    tradeStore.setWatchList([]);
    tradeStore.setActiveTrade(null);
  });

  it('should manage watch list', () => {
    const mockStock = {
      symbol: 'SBIN',
      symbolToken: '3045',
      ltp: 600,
      side: 'CALL' as const,
      watchLevel: 610,
      breachStartTime: null,
    };
    tradeStore.setWatchList([mockStock]);
    expect(tradeStore.getWatchList()).toHaveLength(1);
    expect(tradeStore.getWatchList()[0].symbol).toBe('SBIN');
    tradeStore.clearWatchList();
    expect(tradeStore.getWatchList()).toHaveLength(0);
  });

  it('should update watch stock', () => {
    const mockStock = {
      symbol: 'SBIN',
      symbolToken: '3045',
      ltp: 600,
      side: 'CALL' as const,
      watchLevel: 610,
      breachStartTime: null,
    };
    tradeStore.setWatchList([mockStock]);
    const now = new Date();
    tradeStore.updateWatchStock('SBIN', { breachStartTime: now });
    expect(tradeStore.getWatchList()[0].breachStartTime).toBe(now);
  });

  it('should not update non-existent stock', () => {
    tradeStore.updateWatchStock('SBIN', { breachStartTime: new Date() });
    expect(tradeStore.getWatchList()).toHaveLength(0);
  });

  it('should manage active trade', () => {
    const mockTrade = {
      symbol: 'SBIN',
      buyOrderId: '1',
      buyToken: 'B1',
      sellOrderId: '2',
      sellToken: 'S1',
      slOrderId: '3',
      entryBuyPremium: 10,
      entrySellPremium: 2,
      netDebit: 8,
      currentSlValue: 5,
      trailingStage: 0,
    };
    tradeStore.setActiveTrade(mockTrade);
    expect(tradeStore.getActiveTrade()).toEqual(mockTrade);
    tradeStore.setActiveTrade(null);
    expect(tradeStore.getActiveTrade()).toBeNull();
  });
});
