/* eslint-disable @typescript-eslint/unbound-method */
import { runMorningScanner } from '../../src/jobs/morningScanner.js';
import * as marketData from '../../src/helpers/marketData.js';
import * as oiAnalyzer from '../../src/helpers/oiAnalyzer.js';
import * as candleAnalyzer from '../../src/helpers/candleAnalyzer.js';
import { tradeStore } from '../../src/store/tradeStore.js';
import { sendNotification } from '../../src/notifier.js';
import { logger } from '../../src/helpers/logger.js';

jest.mock('../../src/helpers/marketData.js');
jest.mock('../../src/helpers/oiAnalyzer.js');
jest.mock('../../src/helpers/candleAnalyzer.js', () => ({
  ...jest.requireActual('../../src/helpers/candleAnalyzer.js'),
  findLevelsFromCandles: jest.fn(),
  findHistoricalLevels: jest.fn(),
}));
jest.mock('../../src/store/tradeStore.js');
jest.mock('../../src/notifier.js');
jest.mock('../../src/helpers/logger.js');

describe('morningScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock setTimeout to resolve immediately
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: unknown) => {
      (cb as () => void)();
      return {} as unknown as NodeJS.Timeout;
    });

    // Default mocks
    (candleAnalyzer.findHistoricalLevels as jest.Mock).mockReturnValue({
      resistance: [],
      support: [],
    });
    (candleAnalyzer.findLevelsFromCandles as jest.Mock).mockReturnValue({
      resistance: 100,
      support: 100,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should run scanner and populate watchlist successfully with historical logic', async () => {
    const mockGainers = [{ symbol: 'G1', symbolToken: 'T1', ltp: 2500, name: 'G1' }];
    const mockLosers = [{ symbol: 'L1', symbolToken: 'T2', ltp: 3500, name: 'L1' }];
    
    (marketData.getTopMovers as jest.Mock).mockResolvedValue({ gainers: mockGainers, losers: mockLosers });
    (marketData.getMonthlyExpiry as jest.Mock).mockReturnValue('28MAY2026');
    (marketData.getMorningCandles as jest.Mock).mockResolvedValue([{ high: 2550, low: 2450 }]);
    (oiAnalyzer.findResistance as jest.Mock).mockReturnValue(2600);
    (oiAnalyzer.findSupport as jest.Mock).mockReturnValue(3400);
    (candleAnalyzer.findLevelsFromCandles as jest.Mock).mockReturnValue({ resistance: 2550, support: 3450 });
    (candleAnalyzer.findHistoricalLevels as jest.Mock).mockReturnValue({
      resistance: [{ price: 2700, strength: 5, volume: 1000000 }],
      support: [{ price: 3300, strength: 5, volume: 1000000 }],
    });

    const promise = runMorningScanner();
    jest.runAllTimers();
    await promise;

    expect(tradeStore.setWatchList).toHaveBeenCalledWith([
      expect.objectContaining({ symbol: 'G1', watchLevel: 2700 }),
      expect.objectContaining({ symbol: 'L1', watchLevel: 3300 }),
    ]);
  });

  it('should handle errors gracefully', async () => {
    (marketData.getTopMovers as jest.Mock).mockRejectedValue(new Error('API Fail'));
    await runMorningScanner();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Morning scanner failed: API Fail'));
  });

  it('should handle empty gainers and losers', async () => {
    (marketData.getTopMovers as jest.Mock).mockResolvedValue({ gainers: [], losers: [] });
    await runMorningScanner();
    expect(tradeStore.setWatchList).toHaveBeenCalledWith([]);
  });

  it('should handle missing historical levels and morning candles', async () => {
    (marketData.getTopMovers as jest.Mock).mockResolvedValue({
      gainers: [{ symbol: 'G1', symbolToken: 'T1', ltp: 100, name: 'G1' }],
      losers: [{ symbol: 'L1', symbolToken: 'T2', ltp: 100, name: 'L1' }],
    });
    (marketData.getMorningCandles as jest.Mock).mockResolvedValue([]); // Trigger length === 0 branch
    (oiAnalyzer.findResistance as jest.Mock).mockReturnValue(110);
    (oiAnalyzer.findSupport as jest.Mock).mockReturnValue(90);
    (candleAnalyzer.findHistoricalLevels as jest.Mock).mockReturnValue({ resistance: [], support: [] });

    await runMorningScanner();
    expect(tradeStore.setWatchList).toHaveBeenCalledWith([
      expect.objectContaining({ symbol: 'G1', watchLevel: 110 }),
      expect.objectContaining({ symbol: 'L1', watchLevel: 90 }),
    ]);
  });

  it('should handle historical levels that are on the wrong side of LTP', async () => {
    (marketData.getTopMovers as jest.Mock).mockResolvedValue({
      gainers: [{ symbol: 'G1', symbolToken: 'T1', ltp: 100, name: 'G1' }],
      losers: [{ symbol: 'L1', symbolToken: 'T2', ltp: 100, name: 'L1' }],
    });
    (marketData.getMorningCandles as jest.Mock).mockResolvedValue([]);
    (oiAnalyzer.findResistance as jest.Mock).mockReturnValue(100);
    (oiAnalyzer.findSupport as jest.Mock).mockReturnValue(100);
    (candleAnalyzer.findHistoricalLevels as jest.Mock).mockReturnValue({
      resistance: [{ price: 50, strength: 5, volume: 1000 }], // Below for gainer
      support: [{ price: 150, strength: 5, volume: 1000 }],    // Above for loser
    });

    await runMorningScanner();
    expect(tradeStore.setWatchList).toHaveBeenCalledWith([
      expect.objectContaining({ symbol: 'G1', watchLevel: 100 }),
      expect.objectContaining({ symbol: 'L1', watchLevel: 100 }),
    ]);
  });

  it('should sort multiple historical levels and pick the nearest one', async () => {
    (marketData.getTopMovers as jest.Mock).mockResolvedValue({
      gainers: [{ symbol: 'G1', symbolToken: 'T1', ltp: 100, name: 'G1' }],
      losers: [{ symbol: 'L1', symbolToken: 'T2', ltp: 100, name: 'L1' }],
    });
    (marketData.getMorningCandles as jest.Mock).mockResolvedValue([]);
    (oiAnalyzer.findResistance as jest.Mock).mockReturnValue(100);
    (oiAnalyzer.findSupport as jest.Mock).mockReturnValue(100);
    (candleAnalyzer.findHistoricalLevels as jest.Mock).mockReturnValue({
      resistance: [{ price: 120 }, { price: 110 }], // 110 is nearer
      support: [{ price: 80 }, { price: 90 }],      // 90 is nearer
    });

    await runMorningScanner();
    expect(tradeStore.setWatchList).toHaveBeenCalledWith([
      expect.objectContaining({ symbol: 'G1', watchLevel: 110 }),
      expect.objectContaining({ symbol: 'L1', watchLevel: 90 }),
    ]);
  });

  it('should handle non-Error catch objects', async () => {
    (marketData.getTopMovers as jest.Mock).mockRejectedValue('String Error');
    await runMorningScanner();
    expect(logger.error).toHaveBeenCalledWith('Morning scanner failed: String Error');
  });
});
