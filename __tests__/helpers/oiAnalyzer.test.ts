import { findResistance, findSupport } from '../../src/helpers/oiAnalyzer';
import { OptionStrike } from '../../src/helpers/marketData';

describe('oiAnalyzer', () => {
  const strikes: OptionStrike[] = [
    { strikePrice: 19000, optionType: 'PE', openInterest: 1000, ltp: 10 },
    { strikePrice: 19100, optionType: 'PE', openInterest: 5000, ltp: 15 },
    { strikePrice: 19200, optionType: 'PE', openInterest: 3000, ltp: 20 },
    { strikePrice: 19500, optionType: 'CE', openInterest: 2000, ltp: 25 },
    { strikePrice: 19600, optionType: 'CE', openInterest: 8000, ltp: 30 },
    { strikePrice: 19700, optionType: 'CE', openInterest: 4000, ltp: 35 },
  ];

  describe('findResistance', () => {
    it('should return strike with max Call OI above spot', () => {
      const spot = 19300;
      const res = findResistance(strikes, spot);
      expect(res).toBe(19600);
    });

    it('should return fallback if no CE strikes above spot', () => {
      const spot = 20000;
      const res = findResistance(strikes, spot);
      expect(res).toBe(spot * 1.01);
    });
  });

  describe('findSupport', () => {
    it('should return strike with max Put OI below spot', () => {
      const spot = 19300;
      const res = findSupport(strikes, spot);
      expect(res).toBe(19100);
    });

    it('should return fallback if no PE strikes below spot', () => {
      const spot = 18000;
      const res = findSupport(strikes, spot);
      expect(res).toBe(spot * 0.99);
    });
  });
});
