import { api } from './api.js';
import { ANGEL_ONE_URLS, NIFTY_50_TOKENS } from './constants.js';
import moment from 'moment-timezone';

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

export async function getLtp(
  symbol: string,
  symbolToken: string,
  exchange: string = 'NSE',
): Promise<number> {
  const payload = {
    exchange,
    symboltoken: symbolToken,
  };
  const response = await api.post<{ data: { ltp: number } }>(
    ANGEL_ONE_URLS.LTP_DATA,
    payload,
  );
  return response.data.ltp;
}

export async function getTopMovers(): Promise<{
  gainers: Stock[];
  losers: Stock[];
}> {
  const payload = {
    exchange: 'NSE',
    tokens: NIFTY_50_TOKENS,
  };
  interface MarketDataResponse {
    data: {
      ltp: string;
      close: string;
      tradingsymbol: string;
      symboltoken: string;
    }[];
  }
  const response = await api.post<MarketDataResponse>(
    ANGEL_ONE_URLS.MARKET_DATA,
    payload,
  );
  const data = response.data || [];

  const stocks: Stock[] = data.map(item => {
    const ltp = parseFloat(item.ltp);
    const close = parseFloat(item.close);
    const changePercent = ((ltp - close) / close) * 100;
    return {
      symbol: item.tradingsymbol,
      symbolToken: item.symboltoken,
      ltp,
      changePercent,
    };
  });

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
  const payload = {
    exchange,
    tokens,
  };
  interface BatchLtpResponse {
    data: {
      symboltoken: string;
      ltp: string;
    }[];
  }
  const response = await api.post<BatchLtpResponse>(
    ANGEL_ONE_URLS.MARKET_DATA,
    payload,
  );
  const data = response.data || [];
  const result: Record<string, number> = {};
  data.forEach(item => {
    result[item.symboltoken] = parseFloat(item.ltp);
  });
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
  return lastThursday.format('DDMMYYYY');
}
