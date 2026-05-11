import {
  getLtp,
  getTopMovers,
  getBatchLtp,
  getOptionChain,
  getMonthlyExpiry,
  getHistoricalData,
  getMorningCandles,
} from '../../src/helpers/marketData.js';
import { api } from '../../src/helpers/api.js';
import { ANGEL_ONE_URLS } from '../../src/helpers/constants.js';
import { scripMasterStore } from '../../src/store/scripMasterStore.js';
import { logger } from '../../src/helpers/logger.js';

jest.mock('../../src/helpers/api.js');
jest.mock('../../src/store/scripMasterStore.js');
jest.mock('../../src/helpers/logger.js');

jest.setTimeout(30000);

describe('marketData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getLtp', () => {
    it('should fetch LTP successfully', async () => {
      (api.post as jest.Mock).mockResolvedValue({ data: { ltp: 2500.5 } });
      const ltp = await getLtp('RELIANCE', '2885');
      expect(ltp).toBe(2500.5);
    });

    it('should return 0 if response data is missing', async () => {
      (api.post as jest.Mock).mockResolvedValue({});
      const ltp = await getLtp('RELIANCE', '2885');
      expect(ltp).toBe(0);
    });
  });

  describe('getTopMovers', () => {
    it('should fetch and sort top movers correctly', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        {
          symbol: 'RELIANCE-EQ',
          token: '2885',
          exch_seg: 'NSE',
          name: 'RELIANCE',
        },
        { symbol: 'TCS-EQ', token: '11536', exch_seg: 'NSE', name: 'TCS' },
        { symbol: 'INFY-EQ', token: '1594', exch_seg: 'NSE', name: 'INFY' },
      ]);
      (api.post as jest.Mock).mockImplementation(
        (url: string, payload: { exchangeTokens?: { NSE?: string[] } }) => {
          if (url === ANGEL_ONE_URLS.MARKET_DATA) {
            const nseTokens = payload.exchangeTokens?.NSE || [];
            const data = [];
            if (nseTokens.includes('2885')) {
              data.push({ symbolToken: '2885', ltp: '2500', close: '2400' });
            }
            if (nseTokens.includes('11536')) {
              data.push({ symbolToken: '11536', ltp: '3400', close: '3500' });
            }
            if (nseTokens.includes('1594')) {
              data.push({ symbolToken: '1594', ltp: '1400', close: '1500' });
            }
            return Promise.resolve({ data });
          }
          return Promise.resolve({ data: [] });
        },
      );

      const promise = getTopMovers();
      for (let i = 0; i < 5; i++) {
        await jest.runAllTimersAsync();
      }
      const { gainers, losers } = await promise;

      expect(gainers).toHaveLength(1);
      expect(losers).toHaveLength(2);
      expect(losers[0].changePercent).toBeLessThan(losers[1].changePercent);
    });

    it('should handle API errors with retry', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { symbol: 'S1-EQ', token: '1333', exch_seg: 'NSE', name: 'S1' },
      ]);
      (api.post as jest.Mock)
        .mockRejectedValueOnce(new Error('Network Fail'))
        .mockResolvedValueOnce({
          data: [{ symbolToken: '1333', ltp: '110', close: '100' }],
        })
        .mockResolvedValue({ data: [] });

      const promise = getTopMovers();
      for (let i = 0; i < 10; i++) {
        await jest.runAllTimersAsync();
      }
      const { gainers } = await promise;
      expect(gainers).toHaveLength(1);
      expect(logger.error).toHaveBeenCalled();
    }, 20000);

    it('should return empty if all retries fail', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { token: '1333' },
      ]);
      (api.post as jest.Mock).mockRejectedValue(new Error('Persistent Fail'));

      const promise = getTopMovers();
      for (let i = 0; i < 15; i++) {
        await jest.runAllTimersAsync();
      }
      const { gainers } = await promise;
      expect(gainers).toHaveLength(0);
    }, 20000);

    it('should return empty if scrips master is empty', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([]);
      const { gainers } = await getTopMovers();
      expect(gainers).toHaveLength(0);
    });
  });

  describe('getBatchLtp', () => {
    it('should fetch batch LTP and handle batching delays', async () => {
      const tokens = Array.from({ length: 51 }, (_, i) => `T${i}`);
      (api.post as jest.Mock).mockResolvedValue({
        data: [{ symbolToken: 'T0', ltp: '2500.50' }],
      });

      const promise = getBatchLtp(tokens);
      await jest.runAllTimersAsync();
      const result = await promise;
      expect(result['T0']).toBe(2500.5);
    });
  });

  describe('getOptionChain', () => {
    it('should handle empty scrips with warning', async () => {
      (scripMasterStore.getScripsByUnderlying as jest.Mock).mockReturnValue([]);
      const result = await getOptionChain('UNKNOWN', '28MAY2026');
      expect(result).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should fetch chain with batching', async () => {
      const manyScrips = Array.from({ length: 30 }, (_, i) => ({
        token: `T${i}`,
        symbol: i % 2 === 0 ? 'S1CE' : 'S1PE',
        strike: '10000',
      }));
      (scripMasterStore.getScripsByUnderlying as jest.Mock).mockReturnValue(
        manyScrips,
      );
      (api.post as jest.Mock).mockResolvedValue({
        data: [{ symbolToken: 'T0', ltp: '5', oi: '100' }],
      });

      const promise = getOptionChain('S1', '28MAY2026');
      await jest.runAllTimersAsync();
      await jest.runAllTimersAsync();
      const result = await promise;
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getMonthlyExpiry', () => {
    it('should use fallback calculation if no scrips found', () => {
      jest.setSystemTime(new Date('2026-05-09T10:00:00Z'));
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([]);
      const expiry = getMonthlyExpiry();
      expect(expiry).toBe('28MAY2026');
    });

    it('should return next month if current month is past', () => {
      jest.setSystemTime(new Date('2026-05-29T10:00:00Z'));
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([]);
      const expiry = getMonthlyExpiry();
      expect(expiry).toBe('25JUN2026');
    });

    it('should return next month expiry from scrip master if available', () => {
      jest.setSystemTime(new Date('2026-05-30T10:00:00Z'));
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { exch_seg: 'NFO', expiry: '28MAY2026' },
        { exch_seg: 'NFO', expiry: '25JUN2026' },
      ]);
      const expiry = getMonthlyExpiry();
      expect(expiry).toBe('25JUN2026');
    });

    it('should return current month latest if today is NOT past it', () => {
      jest.setSystemTime(new Date('2026-05-11T10:00:00Z'));
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { exch_seg: 'NFO', expiry: '28MAY2026' },
      ]);
      const expiry = getMonthlyExpiry();
      expect(expiry).toBe('28MAY2026');
    });

    it('should fallback to last Thursday if scrips return no matches for current month', () => {
      jest.setSystemTime(new Date('2026-05-11T10:00:00Z'));
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { exch_seg: 'NFO', expiry: '01JAN1970' }, // No match
      ]);
      const expiry = getMonthlyExpiry();
      expect(expiry).toBe('28MAY2026');
    });

    it('should sort multiple expiries correctly', () => {
      jest.setSystemTime(new Date('2026-05-11T10:00:00Z'));
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { exch_seg: 'NFO', expiry: '28MAY2026' },
        { exch_seg: 'NFO', expiry: '21MAY2026' },
      ]);
      const expiry = getMonthlyExpiry();
      expect(expiry).toBe('28MAY2026'); // Latest
    });

    it('should handle next month with multiple expiries', () => {
      jest.setSystemTime(new Date('2026-05-29T10:00:00Z')); // Past 28MAY
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { exch_seg: 'NFO', expiry: '28MAY2026' },
        { exch_seg: 'NFO', expiry: '25JUN2026' },
        { exch_seg: 'NFO', expiry: '18JUN2026' },
      ]);
      const expiry = getMonthlyExpiry();
      expect(expiry).toBe('25JUN2026'); // Latest of June
    });

    it('should handle empty string if no next month expiries found in scrip master', () => {
      jest.setSystemTime(new Date('2026-05-30T10:00:00Z'));
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { exch_seg: 'NFO', expiry: '28MAY2026' },
      ]);
      const expiry = getMonthlyExpiry();
      expect(expiry).toBe('');
    });
  });

  describe('Candle retrieval', () => {
    it('should return empty if before market open', async () => {
      jest.setSystemTime(new Date('2026-05-11T02:00:00Z')); // 7:30 IST
      const candles = await getMorningCandles('T1');
      expect(candles).toHaveLength(0);
    });

    it('should handle errors in candle retrieval', async () => {
      jest.setSystemTime(new Date('2026-05-11T05:00:00Z'));
      (api.post as jest.Mock).mockRejectedValue(new Error('Candle Fail'));
      const candles = await getMorningCandles('T1');
      expect(candles).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle errors in historical data', async () => {
      (api.post as jest.Mock).mockRejectedValue(new Error('History Fail'));
      const candles = await getHistoricalData('T1', 'NSE');
      expect(candles).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should fetch historical data successfully', async () => {
      const mockData = [['2026-05-10 10:00', 100, 110, 90, 105, 5000]];
      (api.post as jest.Mock).mockResolvedValue({ data: mockData });
      const candles = await getHistoricalData('T1', 'NSE');
      expect(candles).toHaveLength(1);
      expect(candles[0].high).toBe(110);
    });

    it('should handle morning candles after market open', async () => {
      jest.setSystemTime(new Date('2026-05-11T05:00:00.000Z')); // 10:30 IST
      (api.post as jest.Mock).mockResolvedValue({
        data: [['time', 1, 2, 3, 4, 5]],
      });
      const candles = await getMorningCandles('T1');
      expect(candles).toHaveLength(1);
      expect(candles[0].high).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('should fail after maximum retries on HTML rejection', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { token: 'T1' },
      ]);
      (api.post as jest.Mock).mockResolvedValue('<html>Fail</html>');
      const promise = getBatchLtp(['T1']);
      await jest.runAllTimersAsync();
      await jest.runAllTimersAsync();
      const result = await promise;
      expect(result).toEqual({});
      expect(logger.error).toHaveBeenCalled();
    });

    it('should return 0 if ltp is missing in getLtp', async () => {
      (api.post as jest.Mock).mockResolvedValue({ data: null });
      const ltp = await getLtp('S1', 'T1');
      expect(ltp).toBe(0);
    });

    it('should identify PE options', async () => {
      (scripMasterStore.getScripsByUnderlying as jest.Mock).mockReturnValue([
        { token: 'T1', symbol: 'S1-PE', strike: '10000', name: 'S1' },
      ]);
      (api.post as jest.Mock).mockResolvedValue({
        data: [{ symbolToken: 'T1', ltp: '10' }],
      });
      const chain = await getOptionChain('S1', '28MAY2026');
      expect(chain[0].optionType).toBe('PE');
    });

    it('should log string error on catch', async () => {
      (api.post as jest.Mock).mockRejectedValueOnce('String API Fail');
      (api.post as jest.Mock).mockRejectedValueOnce('String API Fail');
      const promise = getTopMovers();
      for (let i = 0; i < 15; i++) await jest.runAllTimersAsync();
      await promise;
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('String API Fail'),
      );
    });

    it('should return empty array if data is missing in response', async () => {
      (api.post as jest.Mock).mockResolvedValueOnce({ status: true });
      const promise = getTopMovers();
      for (let i = 0; i < 15; i++) await jest.runAllTimersAsync();
      const data = await promise;
      expect(data.gainers).toHaveLength(0);
    });

    it('should skip items without token', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        {
          symbol: 'RELIANCE-EQ',
          token: '2885',
          exch_seg: 'NSE',
          name: 'RELIANCE',
        },
      ]);
      (api.post as jest.Mock).mockResolvedValue({
        data: [{ ltp: '100', close: '90' }],
      });
      const promise = getTopMovers();
      for (let i = 0; i < 15; i++) await jest.runAllTimersAsync();
      const data = await promise;
      expect(data.gainers).toHaveLength(0);
    });

    it('should handle zero close price', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        {
          symbol: 'RELIANCE-EQ',
          token: '2885',
          exch_seg: 'NSE',
          name: 'RELIANCE',
        },
      ]);
      (api.post as jest.Mock).mockResolvedValue({
        data: [{ symbolToken: '2885', ltp: '100', close: '0' }],
      });
      const promise = getTopMovers();
      for (let i = 0; i < 15; i++) await jest.runAllTimersAsync();
      const data = await promise;
      expect(data.gainers).toHaveLength(0);
    });

    it('should skip items without token in getBatchLtp', async () => {
      (api.post as jest.Mock).mockResolvedValue({
        data: [{ ltp: '100' }],
      });
      const result = await getBatchLtp(['T1'], 'NSE');
      expect(result).toEqual({});
    });
  });
});
