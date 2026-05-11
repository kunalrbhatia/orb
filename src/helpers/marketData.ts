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
  symboltoken: string;
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

export async function getTopMovers(): Promise<{
  gainers: Stock[];
  losers: Stock[];
}> {
  const scrips = scripMasterStore.getScrips();
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

    try {
      const response = await api.post<AngelMarketDataResponse>(
        ANGEL_ONE_URLS.MARKET_DATA,
        payload,
      );

      if (
        typeof response === 'string' &&
        (response as string).includes('<html>')
      ) {
        logger.warn(
          `Top movers batch ${i / 10 + 1} rejected. Retrying in 2s...`,
        );
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retryResponse = await api.post<AngelMarketDataResponse>(
          ANGEL_ONE_URLS.MARKET_DATA,
          payload,
        );
        if (
          typeof retryResponse === 'string' &&
          (retryResponse as string).includes('<html>')
        ) {
          logger.error(
            `Top movers batch ${i / 10 + 1} rejected again. Skipping.`,
          );
          continue;
        }
        const data = retryResponse.data || [];
        processBatchData(data, scrips, stocks);
      } else {
        const data = response.data || [];
        processBatchData(data, scrips, stocks);
      }
    } catch (error) {
      logger.error(
        `Failed to fetch top movers batch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);

  return {
    gainers: sorted.slice(0, 5),
    losers: sorted.slice(-5).reverse(),
  };
}

function processBatchData(
  data: AngelMarketDataItem[],
  scrips: Scrip[],
  stocks: Stock[],
): void {
  data.forEach(item => {
    const token = item.symboltoken;
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

    let response: AngelMarketDataResponse | string | undefined;
    let attempts = 0;
    while (attempts < 2) {
      try {
        response = await api.post<AngelMarketDataResponse>(
          ANGEL_ONE_URLS.MARKET_DATA,
          payload,
        );

        // Check if we got an HTML rejection page
        if (
          typeof response === 'string' &&
          (response as string).includes('<html>')
        ) {
          logger.warn(
            `Received HTML rejection for batch (Attempt ${attempts + 1}). Retrying in 2s...`,
          );
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        break; // Success
      } catch (error) {
        logger.error(
          `API error for batch (Attempt ${attempts + 1}): ${error instanceof Error ? error.message : String(error)}`,
        );
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (
      !response ||
      (typeof response === 'string' && response.includes('<html>'))
    ) {
      logger.error(
        `Failed to get valid data for batch after retries: ${batch.join(',')}`,
      );
      continue;
    }

    const data = (response as AngelMarketDataResponse).data || [];
    data.forEach(item => {
      const scrip = scrips.find(s => s.token === item.symboltoken);
      if (scrip) {
        strikes.push({
          strikePrice: parseFloat(scrip.strike) / 100,
          optionType: scrip.symbol.endsWith('CE') ? 'CE' : 'PE',
          openInterest: parseFloat(item.oi || '0'),
          ltp: parseFloat(item.ltp || '0'),
        });
      }
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return strikes;
}

export function getMonthlyExpiry(): string {
  // Stock options usually expire on the last Thursday, but some months differ.
  // The scrip master shows 28MAY2026 as the last Thursday, but the actual expiry is 26MAY2026.
  // We'll search for the last Tuesday (2) if Thursday (4) fails, or simply find the latest expiry in May.
  const now = moment().tz('Asia/Kolkata');
  const year = now.year();

  const scrips = scripMasterStore.getScrips();
  const monthName = now.format('MMM').toUpperCase();

  // Find all expiries for the current month
  const expiries = [
    ...new Set(
      scrips
        .filter(
          s =>
            s.exch_seg === 'NFO' &&
            s.expiry &&
            s.expiry.includes(monthName) &&
            s.expiry.endsWith(year.toString()),
        )
        .map(s => s.expiry),
    ),
  ].sort((a, b) => moment(a, 'DDMMMYYYY').diff(moment(b, 'DDMMMYYYY')));

  // The monthly expiry is the last one in the month
  if (expiries.length > 0) {
    return expiries[expiries.length - 1];
  }

  // Fallback to last Thursday calculation if scrip master is empty
  const lastDayOfMonth = now.clone().endOf('month');
  const lastThursday = lastDayOfMonth.clone();
  while (lastThursday.day() !== 4) {
    lastThursday.subtract(1, 'day');
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
