import { api } from './api.js';
import { ANGEL_ONE_URLS, NIFTY_50_TOKENS } from './constants.js';
import moment from 'moment-timezone';
import { logger } from './logger.js';
import { scripMasterStore, Scrip } from '../store/scripMasterStore.js';

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
): Promise<number> {
  const payload = {
    exchange,
    tradingsymbol: symbol,
    symboltoken: symbolToken,
  };
  const response = await api.post<{ data: LtpData }>(
    ANGEL_ONE_URLS.LTP_DATA,
    payload,
  );
  return response.data?.ltp || 0;
}

interface AngelMarketDataItem {
  symbolToken?: string;
  symboltoken?: string; // Fallback for inconsistent API casing
  ltp: string;
  close: string;
  oi?: string;
}

interface AngelMarketDataResponse {
  status: boolean;
  message: string;
  errorcode: string;
  data: AngelMarketDataItem[];
}

/**
 * Generic helper to fetch market data with a single retry on WAF/HTML rejection
 */
async function fetchMarketDataWithRetry(
  payload: unknown,
  batchLabel: string,
): Promise<AngelMarketDataItem[]> {
  let response: AngelMarketDataResponse | string | undefined;
  let attempts = 0;

  while (attempts < 2) {
    try {
      response = await api.post<AngelMarketDataResponse>(
        ANGEL_ONE_URLS.MARKET_DATA,
        payload,
      );

      if (
        typeof response === 'string' &&
        (response as string).includes('<html>')
      ) {
        logger.warn(
          `${batchLabel} rejected (Attempt ${attempts + 1}). Retrying in 2s...`,
        );
        attempts++;
        if (attempts < 2) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        continue;
      }
      break;
    } catch (error) {
      logger.error(
        `API error for ${batchLabel} (Attempt ${attempts + 1}): ${error instanceof Error ? error.message : String(error)}`,
      );
      attempts++;
      if (attempts < 2) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  if (
    !response ||
    (typeof response === 'string' && response.includes('<html>'))
  ) {
    logger.error(
      `${batchLabel} rejected again or failed after retries. Response snippet: ${typeof response === 'string' ? response.substring(0, 200) : 'Empty'}`,
    );
    return [];
  }

  return (response as AngelMarketDataResponse).data || [];
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

  for (let i = 0; i < tokens.length; i += 10) {
    const batch = tokens.slice(i, i + 10);
    const payload = {
      mode: 'FULL',
      exchangeTokens: {
        NSE: batch,
      },
    };

    const data = await fetchMarketDataWithRetry(
      payload,
      `Top movers batch ${i / 10 + 1}`,
    );
    processBatchData(data, scrips, stocks);

    if (i + 10 < tokens.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
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

function processBatchData(
  data: AngelMarketDataItem[],
  scrips: Scrip[],
  stocks: Stock[],
): void {
  data.forEach(item => {
    const token = item.symbolToken || item.symboltoken;
    if (!token) return;
    const scrip = scrips.find(s => s.token === token && s.exch_seg === 'NSE');
    if (scrip) {
      const ltp = parseFloat(item.ltp || '0');
      const close = parseFloat(item.close || '0');
      const changePercent = close !== 0 ? ((ltp - close) / close) * 100 : 0;
      stocks.push({
        symbol: scrip.symbol.replace('-EQ', ''),
        symbolToken: scrip.token,
        name: scrip.name,
        ltp,
        changePercent,
      });
    }
  });
}

export async function getBatchLtp(
  tokens: string[],
  exchange: string = 'NFO',
): Promise<Record<string, number>> {
  if (tokens.length === 0) return {};

  const result: Record<string, number> = {};

  for (let i = 0; i < tokens.length; i += 50) {
    const batch = tokens.slice(i, i + 50);
    const payload = {
      mode: 'LTP',
      exchangeTokens: {
        [exchange]: batch,
      },
    };

    const data = await fetchMarketDataWithRetry(
      payload,
      `Batch LTP ${exchange}`,
    );
    data.forEach(item => {
      const token = item.symbolToken || item.symboltoken;
      if (token) {
        result[token] = parseFloat(item.ltp || '0');
      }
    });

    if (i + 50 < tokens.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return result;
}

export async function getOptionChain(
  symbol: string,
  expiryDate: string,
): Promise<OptionStrike[]> {
  const scrips = scripMasterStore.getScripsByUnderlying(symbol, expiryDate);
  if (scrips.length === 0) {
    logger.warn(`No scrips found for ${symbol} with expiry ${expiryDate}`);
    return [];
  }

  const tokens = scrips.map(s => s.token);
  const strikes: OptionStrike[] = [];

  for (let i = 0; i < tokens.length; i += 25) {
    const batch = tokens.slice(i, i + 25);
    const payload = {
      mode: 'FULL',
      exchangeTokens: {
        NFO: batch,
      },
    };

    const data = await fetchMarketDataWithRetry(
      payload,
      `Option chain ${symbol}`,
    );
    data.forEach(item => {
      const token = item.symbolToken || item.symboltoken;
      const scrip = scrips.find(s => s.token === token);
      if (scrip) {
        strikes.push({
          strikePrice: parseFloat(scrip.strike) / 100,
          optionType: scrip.symbol.endsWith('CE') ? 'CE' : 'PE',
          openInterest: parseFloat(item.oi || '0'),
          ltp: parseFloat(item.ltp || '0'),
        });
      }
    });

    if (i + 25 < tokens.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return strikes;
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
