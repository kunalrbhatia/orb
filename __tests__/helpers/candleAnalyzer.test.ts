import { findLevelsFromCandles, calculatePivotPoints } from '../../src/helpers/candleAnalyzer.js';
import { Candle } from '../../src/helpers/marketData.js';

describe('candleAnalyzer', () => {
  describe('findLevelsFromCandles', () => {
    it('should correctly identify resistance and support from multiple candles', () => {
      const candles: Candle[] = [
        { time: '1', open: 100, high: 105, low: 95, close: 102, volume: 1000 },
        { time: '2', open: 102, high: 110, low: 101, close: 108, volume: 1100 },
        { time: '3', open: 108, high: 109, low: 90, close: 95, volume: 1200 },
      ];

      const levels = findLevelsFromCandles(candles);
      expect(levels.resistance).toBe(110);
      expect(levels.support).toBe(90);
    });

    it('should throw error for empty candle list', () => {
      expect(() => findLevelsFromCandles([])).toThrow('Cannot analyze empty candle list');
    });
  });

  describe('calculatePivotPoints', () => {
    it('should correctly calculate standard pivot points', () => {
      const candle: Candle = {
        time: '2026-05-10',
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 5000,
      };

      const pivots = calculatePivotPoints(candle);
      
      // P = (110 + 90 + 105) / 3 = 305 / 3 = 101.666...
      expect(pivots.p).toBeCloseTo(101.66666666666667);
      
      // R1 = 2 * P - L = 2 * 101.666 - 90 = 203.333 - 90 = 113.333...
      expect(pivots.r1).toBeCloseTo(113.33333333333334);
      
      // S1 = 2 * P - H = 2 * 101.666 - 110 = 203.333 - 110 = 93.333...
      expect(pivots.s1).toBeCloseTo(93.33333333333334);
      
      // R2 = P + (H - L) = 101.666 + 20 = 121.666...
      expect(pivots.r2).toBeCloseTo(121.66666666666667);
      
      // S2 = P - (H - L) = 101.666 - 20 = 81.666...
      expect(pivots.s2).toBeCloseTo(81.66666666666667);
      
      // R3 = H + 2 * (P - L) = 110 + 2 * (101.666 - 90) = 110 + 23.333 = 133.333...
      expect(pivots.r3).toBeCloseTo(133.33333333333334);
      
      // S3 = L - 2 * (H - P) = 90 - 2 * (110 - 101.666) = 90 - 2 * 8.333 = 90 - 16.666 = 73.333...
      expect(pivots.s3).toBeCloseTo(73.33333333333334);
    });
  });
});
