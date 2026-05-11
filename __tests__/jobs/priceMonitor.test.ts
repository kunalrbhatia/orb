/* eslint-disable @typescript-eslint/unbound-method */
import { runPriceMonitor } from '../../src/jobs/priceMonitor.js';
import { tradeStore, WatchStock } from '../../src/store/tradeStore.js';
import * as marketData from '../../src/helpers/marketData.js';
import * as orders from '../../src/helpers/orders.js';
import { logger } from '../../src/helpers/logger.js';

jest.mock('../../src/store/tradeStore.js');
jest.mock('../../src/helpers/marketData.js');
jest.mock('../../src/helpers/orders.js');
jest.mock('../../src/helpers/logger.js');

describe('priceMonitor', () => {
  const mockExpiry = '28MAY2026';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-09T10:35:00Z'));
    (marketData.getMonthlyExpiry as jest.Mock).mockReturnValue(mockExpiry);

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

  it('should return early if there is an active trade', async () => {
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue({
      symbol: 'NIFTY',
    });
    await runPriceMonitor();
    expect(marketData.getLtp).not.toHaveBeenCalled();
  });

  it('should detect breach and set breachStartTime for CALL', async () => {
    const mockStock: WatchStock = {
      symbol: 'RELIANCE',
      symbolToken: '2885',
      ltp: 2500,
      side: 'CALL',
      watchLevel: 2550,
      breachStartTime: null,
    };
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(null);
    (tradeStore.getWatchList as jest.Mock).mockReturnValue([mockStock]);
    (marketData.getLtp as jest.Mock).mockResolvedValue(2560);

    const promise = runPriceMonitor();
    jest.runAllTimers();
    await promise;

    expect(tradeStore.updateWatchStock as jest.Mock).toHaveBeenCalledWith(
      'RELIANCE',
      {
        breachStartTime: expect.any(Date) as Date,
      },
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Breach detected'),
    );
  });

  it('should detect breach and set breachStartTime for PUT', async () => {
    const mockStock: WatchStock = {
      symbol: 'TCS',
      symbolToken: '11536',
      ltp: 3500,
      side: 'PUT',
      watchLevel: 3450,
      breachStartTime: null,
    };
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(null);
    (tradeStore.getWatchList as jest.Mock).mockReturnValue([mockStock]);
    (marketData.getLtp as jest.Mock).mockResolvedValue(3440);

    const promise = runPriceMonitor();
    jest.runAllTimers();
    await promise;

    expect(tradeStore.updateWatchStock as jest.Mock).toHaveBeenCalledWith(
      'TCS',
      {
        breachStartTime: expect.any(Date) as Date,
      },
    );
  });

  it('should confirm breakout after 5 minutes', async () => {
    const breachTime = new Date('2026-05-09T10:30:00Z');
    const mockStock: WatchStock = {
      symbol: 'RELIANCE',
      symbolToken: '2885',
      ltp: 2500,
      side: 'CALL',
      watchLevel: 2550,
      breachStartTime: breachTime,
    };
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(null);
    (tradeStore.getWatchList as jest.Mock).mockReturnValue([mockStock]);
    (marketData.getLtp as jest.Mock).mockResolvedValue(2560);

    const promise = runPriceMonitor();
    jest.runAllTimers();
    await promise;

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Confirmed breakout'),
    );
    expect(orders.enterTrade).toHaveBeenCalledWith(mockStock, mockExpiry);
  });

  it('should not enter trade if duration < 5 minutes', async () => {
    const breachTime = new Date('2026-05-09T10:31:00Z');
    const mockStock: WatchStock = {
      symbol: 'RELIANCE',
      symbolToken: '2885',
      ltp: 2500,
      side: 'CALL',
      watchLevel: 2550,
      breachStartTime: breachTime,
    };
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(null);
    (tradeStore.getWatchList as jest.Mock).mockReturnValue([mockStock]);
    (marketData.getLtp as jest.Mock).mockResolvedValue(2560);

    const promise = runPriceMonitor();
    jest.runAllTimers();
    await promise;

    expect(orders.enterTrade).not.toHaveBeenCalled();
  });

  it('should reset breach if price falls below watchLevel', async () => {
    const breachTime = new Date('2026-05-09T10:30:00Z');
    const mockStock: WatchStock = {
      symbol: 'RELIANCE',
      symbolToken: '2885',
      ltp: 2500,
      side: 'CALL',
      watchLevel: 2550,
      breachStartTime: breachTime,
    };
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(null);
    (tradeStore.getWatchList as jest.Mock).mockReturnValue([mockStock]);
    (marketData.getLtp as jest.Mock).mockResolvedValue(2540); // Below watch level

    const promise = runPriceMonitor();
    jest.runAllTimers();
    await promise;

    expect(tradeStore.updateWatchStock).toHaveBeenCalledWith('RELIANCE', {
      breachStartTime: null,
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Breach reset'),
    );
  });

  it('should handle errors for individual stocks', async () => {
    const mockStock: WatchStock = {
      symbol: 'RELIANCE',
      symbolToken: '2885',
      ltp: 2500,
      side: 'CALL',
      watchLevel: 2550,
      breachStartTime: null,
    };
    (tradeStore.getWatchList as jest.Mock).mockReturnValue([mockStock]);
    (marketData.getLtp as jest.Mock).mockRejectedValue(
      new Error('Network Error'),
    );

    const promise = runPriceMonitor();
    jest.runAllTimers();
    await promise;

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Price monitor failed for RELIANCE: Network Error',
      ),
    );
  });

  it('should handle non-Error objects in catch block', async () => {
    const mockStock: WatchStock = {
      symbol: 'RELIANCE',
      symbolToken: '2885',
      ltp: 2500,
      side: 'CALL',
      watchLevel: 2550,
      breachStartTime: null,
    };
    (tradeStore.getWatchList as jest.Mock).mockReturnValue([mockStock]);
    (marketData.getLtp as jest.Mock).mockRejectedValue('String Error');

    const promise = runPriceMonitor();
    jest.runAllTimers();
    await promise;

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Price monitor failed for RELIANCE: String Error',
      ),
    );
  });
});
