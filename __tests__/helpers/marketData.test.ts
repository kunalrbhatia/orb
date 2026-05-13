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
      (api.post as jest.Mock).mockResolvedValue({
        data: { ltp: 2500.5, close: 2400 },
      });
      const result = await getLtp('RELIANCE', '2885');
      expect(result.ltp).toBe(2500.5);
    });

    it('should return 0 if response data is missing', async () => {
      (api.post as jest.Mock).mockResolvedValue({});
      const result = await getLtp('RELIANCE', '2885');
      expect(result.ltp).toBe(0);
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
        (url: string, payload: { symboltoken?: string }) => {
          if (url === ANGEL_ONE_URLS.LTP_DATA) {
            const token = payload.symboltoken;
            if (token === '2885') {
              return Promise.resolve({ data: { ltp: 2500, close: 2400 } });
            }
            if (token === '11536') {
              return Promise.resolve({ data: { ltp: 3400, close: 3500 } });
            }
            if (token === '1594') {
              return Promise.resolve({ data: { ltp: 1400, close: 1500 } });
            }
          }
          return Promise.resolve({ data: null });
        },
      );

      const promise = getTopMovers();
      for (let i = 0; i < 50; i++) {
        await jest.runAllTimersAsync();
      }
      const { gainers, losers } = await promise;

      expect(gainers).toHaveLength(1);
      expect(losers).toHaveLength(2);
      expect(losers[0].changePercent).toBeLessThan(losers[1].changePercent);
    });

    it('should handle API errors', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { symbol: 'S1-EQ', token: '1333', exch_seg: 'NSE', name: 'S1' },
      ]);
      (api.post as jest.Mock).mockRejectedValue(new Error('Network Fail'));

      const promise = getTopMovers();
      await jest.runAllTimersAsync();
      const { gainers } = await promise;
      expect(gainers).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle token not found in scrip master', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([]);
      const promise = getTopMovers();
      await jest.runAllTimersAsync();
      const { gainers } = await promise;
      expect(gainers).toHaveLength(0);
    });

    it('should skip invalid LTP in getTopMovers', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { symbol: 'S1-EQ', token: '25', exch_seg: 'NSE', name: 'S1' },
      ]);
      (api.post as jest.Mock).mockResolvedValue({ data: { ltp: 0 } });
      const promise = getTopMovers();
      await jest.runAllTimersAsync();
      const { gainers } = await promise;
      expect(gainers).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Received invalid LTP for S1-EQ: 0'),
      );
    });

    it('should return empty if scrips master is empty', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([]);
      const { gainers } = await getTopMovers();
      expect(gainers).toHaveLength(0);
    });
  });

  describe('getBatchLtp', () => {
    it('should fetch batch LTP and handle delays', async () => {
      const tokens = ['T0', 'T1'];
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { symbol: 'S0', token: 'T0', exch_seg: 'NFO', name: 'S0' },
        { symbol: 'S1', token: 'T1', exch_seg: 'NFO', name: 'S1' },
      ]);
      (api.post as jest.Mock).mockImplementation(url => {
        if (url === ANGEL_ONE_URLS.LTP_DATA) {
          return Promise.resolve({ data: { ltp: 100 } });
        }
        return Promise.resolve({ data: null });
      });

      const promise = getBatchLtp(tokens);
      await jest.runAllTimersAsync();
      await jest.runAllTimersAsync();
      const result = await promise;
      expect(result['T0']).toBe(100);
      expect(result['T1']).toBe(100);
    });
  });

  describe('getOptionChain', () => {
    it('should fetch chain successfully', async () => {
      (api.post as jest.Mock).mockResolvedValue({
        data: [
          {
            strikePrice: '10000',
            optionType: 'CE',
            openInterest: '100',
            ltp: '10',
          },
        ],
      });

      const chain = await getOptionChain('RELIANCE', '28MAY2026');
      expect(chain).toHaveLength(1);
      expect(chain[0].strikePrice).toBe(10000);
    });

    it('should handle API errors', async () => {
      (api.post as jest.Mock).mockRejectedValue(new Error('Chain Fail'));
      const chain = await getOptionChain('RELIANCE', '28MAY2026');
      expect(chain).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
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
    it('should return 0 if ltp is missing in getLtp', async () => {
      (api.post as jest.Mock).mockResolvedValue({ data: null });
      const result = await getLtp('S1', 'T1');
      expect(result.ltp).toBe(0);
    });

    it('should identify PE options', async () => {
      (api.post as jest.Mock).mockResolvedValue({
        data: [
          {
            strikePrice: '10000',
            optionType: 'PE',
            openInterest: '100',
            ltp: '10',
          },
        ],
      });
      const chain = await getOptionChain('S1', '28MAY2026');
      expect(chain[0].optionType).toBe('PE');
    });

    it('should log string error on catch in getTopMovers', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { symbol: 'S1-EQ', token: '25', exch_seg: 'NSE', name: 'S1' },
      ]);
      (api.post as jest.Mock).mockRejectedValue('String API Fail');
      const promise = getTopMovers();
      await jest.runAllTimersAsync();
      await promise;
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('String API Fail'),
      );
    });
  });
});
