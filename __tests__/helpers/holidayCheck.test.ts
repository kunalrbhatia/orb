import { isTradingDay } from '../../src/helpers/holidayCheck.js';
import axios from 'axios';
import { logger } from '../../src/helpers/logger.js';

jest.mock('axios');
jest.mock('../../src/helpers/logger.js');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('holidayCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return false for weekends (Saturday)', async () => {
    jest.setSystemTime(new Date('2026-05-09T10:00:00Z')); // Saturday
    const result = await isTradingDay();
    expect(result.isTradingDay).toBe(false);
    expect(result.reason).toBe('Weekend');
  });

  it('should return false for weekends (Sunday)', async () => {
    jest.setSystemTime(new Date('2026-05-10T10:00:00Z')); // Sunday
    const result = await isTradingDay();
    expect(result.isTradingDay).toBe(false);
    expect(result.reason).toBe('Weekend');
  });

  it('should return true if not a holiday or weekend', async () => {
    jest.setSystemTime(new Date('2026-05-11T10:00:00Z')); // Monday
    mockedAxios.get.mockResolvedValue({ data: { FO: [] } });

    const result = await isTradingDay();
    expect(result.isTradingDay).toBe(true);
  });

  it('should handle missing FO property in API response', async () => {
    jest.setSystemTime(new Date('2026-05-11T10:00:00Z')); // Monday
    mockedAxios.get.mockResolvedValue({ data: {} });

    const result = await isTradingDay();
    expect(result.isTradingDay).toBe(true);
  });

  it('should return false if it is a listed holiday', async () => {
    jest.setSystemTime(new Date('2026-05-11T10:00:00Z')); // Monday
    mockedAxios.get.mockResolvedValue({
      data: {
        FO: [{ tradingDate: '11-May-2026', description: 'Test Holiday' }],
      },
    });

    const result = await isTradingDay();
    expect(result.isTradingDay).toBe(false);
    expect(result.reason).toBe('Holiday: Test Holiday');
  });

  it('should fallback to true and log error if API fails', async () => {
    jest.setSystemTime(new Date('2026-05-11T10:00:00Z')); // Monday
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    const result = await isTradingDay();
    expect(result.isTradingDay).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch holiday list'),
    );
  });

  it('should handle non-Error objects in catch block', async () => {
    jest.setSystemTime(new Date('2026-05-11T10:00:00Z')); // Monday
    mockedAxios.get.mockRejectedValue('String Error');

    await isTradingDay();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch holiday list: String Error'),
    );
  });
});
