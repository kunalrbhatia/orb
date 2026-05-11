import { Candle } from './marketData.js';

/**
 * Analyzes candle data to identify resistance and support levels based on the high and low of the period.
 * This is primarily used for identifying the Opening Range in the ORB strategy.
 * 
 * @param candles Array of candles for the period to analyze
 * @returns An object containing the resistance (high) and support (low) levels
 */
export function findLevelsFromCandles(candles: Candle[]): {
  resistance: number;
  support: number;
} {
  if (candles.length === 0) {
    throw new Error('Cannot analyze empty candle list');
  }

  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  return {
    resistance: Math.max(...highs),
    support: Math.min(...lows),
  };
}

/**
 * Calculates Pivot Points (Standard) based on a single candle (usually the previous day's daily candle).
 * 
 * @param candle The daily candle to use for calculations
 * @returns An object containing the Pivot Point and various resistance/support levels
 */
export function calculatePivotPoints(candle: Candle): {
  p: number;
  r1: number;
  s1: number;
  r2: number;
  s2: number;
  r3: number;
  s3: number;
} {
  const { high: h, low: l, close: c } = candle;
  
  const p = (h + l + c) / 3;
  const r1 = 2 * p - l;
  const s1 = 2 * p - h;
  const r2 = p + (h - l);
  const s2 = p - (h - l);
  const r3 = h + 2 * (p - l);
  const s3 = l - 2 * (h - p);

  return { p, r1, s1, r2, s2, r3, s3 };
}
