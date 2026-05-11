import { api } from './api.js';
import { ANGEL_ONE_URLS, NIFTY_50_TOKENS } from './constants.js';
import moment from 'moment-timezone';
import { logger } from './logger.js';
import { scripMasterStore } from '../store/scripMasterStore.js';

export interface Stock {
  symbol: string;
  symbolToken: string;
  name: string;
  ltp: number;
  changePercent: number;
}

export interface OptionStrike {
  strikePrice: number;
  optionType: 'CE' | 'PE';
  openInterest: number;
  ltp: number;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LtpData {
  exchange: string;
  tradingsymbol: string;
  symboltoken: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ltp: number;
}

export async function getLtp(
  symbol: string,
  symbolToken: string,
  exchange: string = 'NSE',
): Promise<{ ltp: number; close: number }> {
  const payload = {
    exchange,
    tradingsymbol: symbol,
    symboltoken: symbolToken,
  };
  const response = await api.post<{ data: LtpData }>(
    ANGEL_ONE_URLS.LTP_DATA,
    payload,
  );
  return {
    ltp: response.data?.ltp || 0,
    close: response.data?.close || 0,
  };
}

export async function getTopMovers(): Promise<{
  gainers: Stock[];
  losers: Stock[];
}> {
  const scrips = scripMasterStore.getScrips();
  if (scrips.length === 0) {
    return { gainers: [], losers: [] };
  }
  const tokens = NIFTY_50_TOKENS;
  const stocks: Stock[] = [];

  for (const token of tokens) {
    try {
      const scrip = scrips.find(s => s.token === token && s.exch_seg === 'NSE');
      if (!scrip) continue;
      const payload = {
        exchange: 'NSE',
        tradingsymbol: scrip.symbol,
        symboltoken: scrip.token,
      };
      const response = await api.post<{ data: LtpData }>(
        ANGEL_ONE_URLS.LTP_DATA,
        payload,
      );
      const item = response.data;
      if (item) {
        const ltp = item.ltp;
        const close = item.close;
        const changePercent = close !== 0 ? ((ltp - close) / close) * 100 : 0;
        stocks.push({
          symbol: scrip.symbol.replace('-EQ', ''),
          symbolToken: scrip.token,
          name: scrip.name,
          ltp,
          changePercent,
        });
      }
      // Rate limit: 3 requests per second
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      logger.error(
        `Failed to fetch LTP for token ${token}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.filter(s => s.changePercent > 0).slice(0, 5);
  const losers = sorted
    .filter(s => s.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 5);

  return { gainers, losers };
}

export async function getBatchLtp(
  tokens: string[],
  exchange: string = 'NFO',
): Promise<Record<string, number>> {
  if (tokens.length === 0) return {};
  const scrips = scripMasterStore.getScrips();
  const result: Record<string, number> = {};

  for (const token of tokens) {
    try {
      const scrip = scrips.find(
        s => s.token === token && s.exch_seg === exchange,
      );
      if (!scrip) continue;
      const payload = {
        exchange,
        tradingsymbol: scrip.symbol,
        symboltoken: scrip.token,
      };
      const response = await api.post<{ data: LtpData }>(
        ANGEL_ONE_URLS.LTP_DATA,
        payload,
      );
      if (response.data) {
        result[token] = response.data.ltp;
      }
      // Rate limit: 3 requests per second
      await new Promise(resolve => setTimeout(resolve, 350));
    } catch (error) {
      logger.error(
        `Failed to fetch LTP for token ${token}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return result;
}

export async function getOptionChain(
  symbol: string,
  expiryDate: string,
): Promise<OptionStrike[]> {
  const payload = {
    name: symbol,
    expirydate: expiryDate,
  };
  interface OptionChainResponse {
    data: {
      strikePrice: string;
      optionType: 'CE' | 'PE';
      openInterest: string;
      ltp: string;
    }[];
  }
  try {
    const response = await api.post<OptionChainResponse>(
      ANGEL_ONE_URLS.OPTION_GREEK,
      payload,
    );
    return (response.data || []).map(item => ({
      strikePrice: parseFloat(item.strikePrice),
      optionType: item.optionType,
      openInterest: parseFloat(item.openInterest),
      ltp: parseFloat(item.ltp),
    }));
  } catch (error) {
    logger.error(
      `Failed to fetch option chain for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

export function getMonthlyExpiry(): string {
  const now = moment().tz('Asia/Kolkata');
  const monthName = now.format('MMM').toUpperCase();
  const year = now.format('YYYY');

  const scrips = scripMasterStore.getScrips();

  // Find all expiries for the current month
  const monthExpiries = [
    ...new Set(
      scrips
        .filter(
          s =>
            s.exch_seg === 'NFO' &&
            s.expiry &&
            s.expiry.includes(monthName) &&
            s.expiry.includes(year),
        )
        .map(s => s.expiry),
    ),
  ].sort((a, b) => moment(a, 'DDMMMYYYY').diff(moment(b, 'DDMMMYYYY')));

  if (monthExpiries.length > 0) {
    const latest = monthExpiries[monthExpiries.length - 1];
    // If today is past the latest expiry, look for next month
    if (now.isAfter(moment(latest, 'DDMMMYYYY').endOf('day'))) {
      const nextMonth = now.clone().add(1, 'month');
      const nextMonthName = nextMonth.format('MMM').toUpperCase();
      const nextYear = nextMonth.format('YYYY');
      const nextExpiries = [
        ...new Set(
          scrips
            .filter(
              s =>
                s.exch_seg === 'NFO' &&
                s.expiry &&
                s.expiry.includes(nextMonthName) &&
                s.expiry.includes(nextYear),
            )
            .map(s => s.expiry),
        ),
      ].sort((a, b) => moment(a, 'DDMMMYYYY').diff(moment(b, 'DDMMMYYYY')));
      return nextExpiries.length > 0
        ? nextExpiries[nextExpiries.length - 1]
        : '';
    }
    return latest;
  }

  // Fallback: Last Thursday calculation
  let lastThursday = now.clone().endOf('month');
  while (lastThursday.day() !== 4) {
    lastThursday.subtract(1, 'day');
  }
  if (now.isAfter(lastThursday.endOf('day'))) {
    lastThursday = now.clone().add(1, 'month').endOf('month');
    while (lastThursday.day() !== 4) {
      lastThursday.subtract(1, 'day');
    }
  }
  return lastThursday.format('DDMMMYYYY').toUpperCase();
}

export async function getHistoricalData(
  symbolToken: string,
  exchange: 'NSE' | 'NFO',
  interval: 'ONE_DAY' | 'ONE_MINUTE' = 'ONE_DAY',
  days = 30,
): Promise<Candle[]> {
  const toDate = moment().tz('Asia/Kolkata');
  const fromDate = toDate.clone().subtract(days, 'days');

  const payload = {
    exchange,
    symboltoken: symbolToken,
    interval,
    fromdate: fromDate.format('YYYY-MM-DD HH:mm'),
    todate: toDate.format('YYYY-MM-DD HH:mm'),
  };

  try {
    const response = await api.post<{
      data: [string, number, number, number, number, number][];
    }>(ANGEL_ONE_URLS.HISTORICAL_DATA, payload);

    const candles = (response.data || []).map(c => ({
      time: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));

    return candles;
  } catch (error) {
    logger.error(
      `Failed to fetch historical data for ${symbolToken}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

export async function getMorningCandles(
  symbolToken: string,
  exchange: 'NSE' | 'NFO' = 'NSE',
): Promise<Candle[]> {
  const now = moment().tz('Asia/Kolkata');
  const fromDate = now
    .clone()
    .set({ hour: 9, minute: 15, second: 0, millisecond: 0 });

  // If we are before 9:15, return empty
  if (now.isBefore(fromDate)) {
    return [];
  }

  const payload = {
    exchange,
    symboltoken: symbolToken,
    interval: 'FIVE_MINUTE',
    fromdate: fromDate.format('YYYY-MM-DD HH:mm'),
    todate: now.format('YYYY-MM-DD HH:mm'),
  };

  try {
    const response = await api.post<{
      data: [string, number, number, number, number, number][];
    }>(ANGEL_ONE_URLS.HISTORICAL_DATA, payload);

    const candles = (response.data || []).map(c => ({
      time: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));

    return candles;
  } catch (error) {
    logger.error(
      `Failed to fetch morning candles for ${symbolToken}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}
