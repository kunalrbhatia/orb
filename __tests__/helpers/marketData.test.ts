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
import { scripMasterStore } from '../../src/store/scripMasterStore.js';
import { logger } from '../../src/helpers/logger.js';

jest.mock('../../src/helpers/api.js');
jest.mock('../../src/store/scripMasterStore.js');
jest.mock('../../src/helpers/logger.js');

describe('marketData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLtp', () => {
    it('should fetch LTP successfully', async () => {
      (api.post as jest.Mock).mockResolvedValue({ data: { ltp: 2500.5 } });
      const ltp = await getLtp('RELIANCE', '2885');
      expect(ltp).toBe(2500.5);
      expect(api.post).toHaveBeenCalledWith(expect.any(String), {
        exchange: 'NSE',
        tradingsymbol: 'RELIANCE',
        symboltoken: '2885',
      });
    });
  });

  describe('getTopMovers', () => {
    it('should fetch and sort top movers', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { symbol: 'S1-EQ', token: '25', exch_seg: 'NSE' },
        { symbol: 'S2-EQ', token: '15083', exch_seg: 'NSE' },
        { symbol: 'S3-EQ', token: '157', exch_seg: 'NSE' },
      ]);

      (api.post as jest.Mock).mockResolvedValue({
        data: [
          { symboltoken: '25', ltp: '110', close: '100' }, // S1 (10%)
          { symboltoken: '15083', ltp: '105', close: '100' }, // S2 (5%)
          { symboltoken: '157', ltp: '90', close: '100' }, // S3 (-10%)
        ],
      });

      const { gainers, losers } = await getTopMovers();

      expect(gainers[0].symbol).toBe('S1');
      expect(losers[0].symbol).toBe('S3');
    }, 10000);
  });

  describe('getBatchLtp', () => {
    it('should fetch batch LTP successfully', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        { symbol: 'OPT1', token: '1', exch_seg: 'NFO' },
        { symbol: 'OPT2', token: '2', exch_seg: 'NFO' },
      ]);
      (api.post as jest.Mock)
        .mockResolvedValueOnce({ data: { ltp: 100 } })
        .mockResolvedValueOnce({ data: { ltp: 200 } });

      const result = await getBatchLtp(['1', '2']);

      expect(result).toEqual({ '1': 100, '2': 200 });
    });
  });

  describe('getOptionChain', () => {
    it('should fetch full option chain using scrip master and MARKET_DATA', async () => {
      const mockScrips = [
        {
          symbol: 'COALINDIA28MAY26500CE',
          token: 'T1',
          name: 'COALINDIA',
          expiry: '28MAY2026',
          strike: '50000',
        },
        {
          symbol: 'COALINDIA28MAY26465CE',
          token: 'T2',
          name: 'COALINDIA',
          expiry: '28MAY2026',
          strike: '46500',
        },
      ];
      (scripMasterStore.getScripsByUnderlying as jest.Mock).mockReturnValue(
        mockScrips,
      );

      (api.post as jest.Mock).mockResolvedValue({
        data: [
          { symboltoken: 'T1', oi: '1000000', ltp: '5.5' },
          { symboltoken: 'T2', oi: '500000', ltp: '15.2' },
        ],
      });

      const result = await getOptionChain('COALINDIA', '28MAY2026');

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        strikePrice: 500,
        optionType: 'CE',
        openInterest: 1000000,
        ltp: 5.5,
      });
      expect(result).toContainEqual({
        strikePrice: 465,
        optionType: 'CE',
        openInterest: 500000,
        ltp: 15.2,
      });
    });

    it('should handle missing scrips', async () => {
      (scripMasterStore.getScripsByUnderlying as jest.Mock).mockReturnValue([]);
      const result = await getOptionChain('UNKNOWN', '28MAY2026');
      expect(result).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle batching for more than 50 tokens', async () => {
      const manyScrips = Array.from({ length: 60 }, (_, i) => ({
        symbol: `SYM${i}CE`,
        token: `T${i}`,
        name: 'SYM',
        expiry: '28MAY2026',
        strike: `${100 + i}00`,
      }));
      (scripMasterStore.getScripsByUnderlying as jest.Mock).mockReturnValue(
        manyScrips,
      );

      (api.post as jest.Mock)
        .mockResolvedValueOnce({
          data: Array.from({ length: 25 }, (_, i) => ({
            symboltoken: `T${i}`,
            oi: '100',
            ltp: '1',
          })),
        })
        .mockResolvedValueOnce({
          data: Array.from({ length: 25 }, (_, i) => ({
            symboltoken: `T${25 + i}`,
            oi: '100',
            ltp: '1',
          })),
        })
        .mockResolvedValueOnce({
          data: Array.from({ length: 10 }, (_, i) => ({
            symboltoken: `T${50 + i}`,
            oi: '100',
            ltp: '1',
          })),
        });

      const result = await getOptionChain('SYM', '28MAY2026');
      expect(result).toHaveLength(60);
      expect(api.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('getMonthlyExpiry', () => {
    it('should return last Thursday of the month in DDMMMYYYY format', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-09T10:00:00Z'));
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([]);
      const expiry = getMonthlyExpiry();
      expect(expiry).toBe('28MAY2026');
      jest.useRealTimers();
    });
  });

  describe('getHistoricalData', () => {
    it('should fetch historical data successfully', async () => {
      const mockData = [['2026-05-10 10:00', 100, 110, 90, 105, 5000]];
      (api.post as jest.Mock).mockResolvedValue({ data: mockData });

      const candles = await getHistoricalData('2885', 'NSE');

      expect(candles).toHaveLength(1);
      expect(candles[0].high).toBe(110);
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('getCandleData'),
        expect.any(Object),
      );
    });

    it('should handle errors in historical data fetch', async () => {
      (api.post as jest.Mock).mockRejectedValue(new Error('Network error'));
      const candles = await getHistoricalData('2885', 'NSE');
      expect(candles).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getMorningCandles', () => {
    it('should fetch morning candles successfully', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-11T10:30:00.000Z')); // UTC 10:30 is 16:00 IST, so we are after 9:15

      const mockData = [['2026-05-11 09:15', 100, 110, 90, 105, 5000]];
      (api.post as jest.Mock).mockResolvedValue({ data: mockData });

      const candles = await getMorningCandles('2885', 'NSE');

      expect(candles).toHaveLength(1);
      expect(candles[0].high).toBe(110);
      jest.useRealTimers();
    });

    it('should return empty if market not yet open', async () => {
      jest.useFakeTimers();
      // Set to 8:00 AM IST (2:30 AM UTC)
      jest.setSystemTime(new Date('2026-05-11T02:30:00.000Z'));

      const candles = await getMorningCandles('2885', 'NSE');
      expect(candles).toHaveLength(0);
      jest.useRealTimers();
    });

    it('should handle errors in morning candles fetch', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-11T10:30:00.000Z'));
      (api.post as jest.Mock).mockRejectedValue(new Error('Network error'));

      const candles = await getMorningCandles('2885', 'NSE');
      expect(candles).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});
