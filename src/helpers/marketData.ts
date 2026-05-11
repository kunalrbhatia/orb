import { api } from './api.js';
import { ANGEL_ONE_URLS, NIFTY_50_TOKENS } from './constants.js';
import moment from 'moment-timezone';
import { logger } from './logger.js';
import { scripMasterStore } from '../store/scripMasterStore.js';

export interface Stock {
  symbol: string;
  symbolToken: string;
  ltp: number;
  changePercent: number;
}

export interface OptionStrike {
  strikePrice: number;
  optionType: 'CE' | 'PE';
  openInterest: number;
  ltp: number;
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

export async function getTopMovers(): Promise<{
  gainers: Stock[];
  losers: Stock[];
}> {
  const scrips = scripMasterStore.getScrips();
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
        const changePercent = ((ltp - close) / close) * 100;
        stocks.push({
          symbol: scrip.symbol.replace('-EQ', ''),
          symbolToken: scrip.token,
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

  return {
    gainers: sorted.slice(0, 5),
    losers: sorted.slice(-5).reverse(),
  };
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
}

export function getMonthlyExpiry(): string {
  // Logic to find last Thursday of current month
  const now = moment().tz('Asia/Kolkata');
  const lastDayOfMonth = now.clone().endOf('month');
  const lastThursday = lastDayOfMonth.clone();

  while (lastThursday.day() !== 4) {
    lastThursday.subtract(1, 'day');
  }

  // Simplified: for demo/production you'd check holidayCheck.ts here too
  return lastThursday.format('DDMMMYYYY').toUpperCase();
}
