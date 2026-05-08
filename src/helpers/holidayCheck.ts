import axios from 'axios';
import moment from 'moment-timezone';
import { logger } from './logger.js';

interface Holiday {
  tradingDate: string;
  description: string;
}

export async function isTradingDay(): Promise<{
  isTradingDay: boolean;
  reason?: string;
}> {
  const now = moment().tz('Asia/Kolkata');
  const day = now.day();

  if (day === 0 || day === 6) {
    return { isTradingDay: false, reason: 'Weekend' };
  }

  try {
    const response = await axios.get(
      'https://www.nseindia.com/api/holiday-master?type=trading',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://www.nseindia.com/resources/holiday-calendars',
        },
      },
    );

    const holidays: Holiday[] = (response.data as { FO?: Holiday[] }).FO || []; // FO segment holidays
    const todayStr = now.format('DD-MMM-YYYY');

    const holiday = holidays.find(h => h.tradingDate === todayStr);

    if (holiday) {
      return { isTradingDay: false, reason: `Holiday: ${holiday.description}` };
    }

    return { isTradingDay: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to fetch holiday list: ${message}`);
    // Fallback: if API fails, assume it's a trading day if not weekend
    return { isTradingDay: true };
  }
}
