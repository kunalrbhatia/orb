/* eslint-disable @typescript-eslint/unbound-method */
import { runMorningScanner } from '../../src/jobs/morningScanner.js';
import * as marketData from '../../src/helpers/marketData.js';
import * as oiAnalyzer from '../../src/helpers/oiAnalyzer.js';
import { tradeStore } from '../../src/store/tradeStore.js';
import { sendNotification } from '../../src/notifier.js';
import { logger } from '../../src/helpers/logger.js';

jest.mock('../../src/helpers/marketData.js');
jest.mock('../../src/helpers/oiAnalyzer.js');
jest.mock('../../src/store/tradeStore.js');
jest.mock('../../src/notifier.js');
jest.mock('../../src/helpers/logger.js');

describe('morningScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock setTimeout to resolve immediately
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
      cb();
      return {} as any;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should run scanner and populate watchlist successfully', async () => {
    const mockGainers = [
      { symbol: 'RELIANCE', symbolToken: '2885', ltp: 2500, changePercent: 2 },
    ];
    const mockLosers = [
      { symbol: 'TCS', symbolToken: '11536', ltp: 3500, changePercent: -2 },
    ];
    const mockExpiry = '28MAY2026';

    (marketData.getTopMovers as jest.Mock).mockResolvedValue({
      gainers: mockGainers,
      losers: mockLosers,
    });
    (marketData.getMonthlyExpiry as jest.Mock).mockReturnValue(mockExpiry);
    (marketData.getOptionChain as jest.Mock).mockResolvedValue([]);
    (marketData.getMorningCandles as jest.Mock).mockImplementation((token: string) => {
      if (token === '2885') {
        return Promise.resolve([{ high: 2550, low: 2450 }]);
      }
      return Promise.resolve([{ high: 3600, low: 3450 }]);
    });
    (oiAnalyzer.findResistance as jest.Mock).mockReturnValue(2600);
    (oiAnalyzer.findSupport as jest.Mock).mockReturnValue(3400);

    const promise = runMorningScanner();
    jest.runAllTimers();
    await promise;

    expect(logger.info).toHaveBeenCalledWith('Running morning scanner...');
    expect(marketData.getTopMovers).toHaveBeenCalled();
    expect(marketData.getOptionChain).toHaveBeenCalledTimes(2);
    expect(tradeStore.setWatchList).toHaveBeenCalledWith([
      {
        symbol: 'RELIANCE',
        symbolToken: '2885',
        ltp: 2500,
        side: 'CALL',
        watchLevel: 2600, // Max(2600 OI, 2550 Candle High)
        breachStartTime: null,
      },
      {
        symbol: 'TCS',
        symbolToken: '11536',
        ltp: 3500,
        side: 'PUT',
        watchLevel: 3400, // Min(3400 OI, 3450 Candle Low)
        breachStartTime: null,
      },
    ]);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.stringContaining('Morning Scanner Complete'),
      'MarkdownV2',
    );
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('API Timeout');
    (marketData.getTopMovers as jest.Mock).mockRejectedValue(error);

    await runMorningScanner();

    expect(logger.error).toHaveBeenCalledWith(
      `Morning scanner failed: ${error.message}`,
    );
  });

  it('should handle non-Error objects in catch block', async () => {
    (marketData.getTopMovers as jest.Mock).mockRejectedValue('String Error');

    await runMorningScanner();

    expect(logger.error).toHaveBeenCalledWith(
      'Morning scanner failed: String Error',
    );
  });
});
