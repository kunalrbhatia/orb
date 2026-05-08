import { OptionStrike } from './marketData.js';

export function findResistance(
  strikes: OptionStrike[],
  spotPrice: number,
): number {
  const ceStrikes = strikes.filter(
    s => s.optionType === 'CE' && s.strikePrice > spotPrice,
  );
  if (ceStrikes.length === 0) return spotPrice * 1.01; // Fallback

  const maxOiStrike = ceStrikes.reduce((prev, current) =>
    prev.openInterest > current.openInterest ? prev : current,
  );

  return maxOiStrike.strikePrice;
}

export function findSupport(
  strikes: OptionStrike[],
  spotPrice: number,
): number {
  const peStrikes = strikes.filter(
    s => s.optionType === 'PE' && s.strikePrice < spotPrice,
  );
  if (peStrikes.length === 0) return spotPrice * 0.99; // Fallback

  const maxOiStrike = peStrikes.reduce((prev, current) =>
    prev.openInterest > current.openInterest ? prev : current,
  );

  return maxOiStrike.strikePrice;
}
