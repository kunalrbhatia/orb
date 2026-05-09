import {
  getLtp,
  getTopMovers,
  getBatchLtp,
  getOptionChain,
  getMonthlyExpiry,
} from '../../src/helpers/marketData.js';
import { api } from '../../src/helpers/api.js';

jest.mock('../../src/helpers/api.js');

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
        symboltoken: '2885',
      });
    });
  });

  describe('getTopMovers', () => {
    it('should fetch and sort top movers', async () => {
      const mockData = [
        { tradingsymbol: 'S1', symboltoken: '1', ltp: '110', close: '100' }, // 10%
        { tradingsymbol: 'S2', symboltoken: '2', ltp: '105', close: '100' }, // 5%
        { tradingsymbol: 'S3', symboltoken: '3', ltp: '90', close: '100' }, // -10%
        { tradingsymbol: 'S4', symboltoken: '4', ltp: '95', close: '100' }, // -5%
      ];
      (api.post as jest.Mock).mockResolvedValue({ data: mockData });

      const { gainers, losers } = await getTopMovers();

      expect(gainers[0].symbol).toBe('S1');
      expect(losers[0].symbol).toBe('S3');
    });

    it('should handle empty response', async () => {
      (api.post as jest.Mock).mockResolvedValue({});
      const { gainers, losers } = await getTopMovers();
      expect(gainers).toHaveLength(0);
      expect(losers).toHaveLength(0);
    });
  });

  describe('getBatchLtp', () => {
    it('should fetch batch LTP successfully', async () => {
      const mockData = [
        { symboltoken: '1', ltp: '100' },
        { symboltoken: '2', ltp: '200' },
      ];
      (api.post as jest.Mock).mockResolvedValue({ data: mockData });

      const result = await getBatchLtp(['1', '2']);

      expect(result).toEqual({ '1': 100, '2': 200 });
    });

    it('should handle empty response', async () => {
      (api.post as jest.Mock).mockResolvedValue({});
      const result = await getBatchLtp(['1']);
      expect(result).toEqual({});
    });
  });

  describe('getOptionChain', () => {
    it('should fetch option chain successfully', async () => {
      const mockData = [
        {
          strikePrice: '20000',
          optionType: 'CE',
          openInterest: '1000',
          ltp: '50',
        },
      ];
      (api.post as jest.Mock).mockResolvedValue({ data: mockData });

      const result = await getOptionChain('NIFTY', '28052026');

      expect(result[0]).toEqual({
        strikePrice: 20000,
        optionType: 'CE',
        openInterest: 1000,
        ltp: 50,
      });
    });

    it('should handle empty response', async () => {
      (api.post as jest.Mock).mockResolvedValue({});
      const result = await getOptionChain('NIFTY', '28052026');
      expect(result).toHaveLength(0);
    });
  });

  describe('getMonthlyExpiry', () => {
    it('should return last Thursday of the month', () => {
      // Mock May 2026
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-09T10:00:00Z'));

      const expiry = getMonthlyExpiry();

      // Last Thursday of May 2026 is May 28
      expect(expiry).toBe('28052026');

      jest.useRealTimers();
    });
  });
});
