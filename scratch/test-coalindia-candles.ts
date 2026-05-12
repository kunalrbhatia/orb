import { login } from '../src/helpers/login.js';
import { getHistoricalData } from '../src/helpers/marketData.js';
import { logger } from '../src/helpers/logger.js';
import { config } from '../src/config/env.js';

async function testCoalIndiaCandles() {
  logger.info('Starting Coal India candle fetch test...');

  try {
    // 1. Login to get session
    await login();
    logger.info('Login successful');

    // 2. Fetch last 90 daily candles for COALINDIA (Token: 20374)
    const symbolToken = '20374';
    const exchange = 'NSE';
    const interval = 'ONE_DAY';
    const days = 90;

    logger.info(`Fetching ${days} daily candles for COALINDIA...`);
    const candles = await getHistoricalData(symbolToken, exchange, interval, days);

    if (candles.length === 0) {
      logger.warn('No candles fetched. Check if market is open or token is correct.');
      return;
    }

    logger.info(`Successfully fetched ${candles.length} candles.`);

    // 3. Analyze Support and Resistance
    const levels = calculateSRLevels(candles);
    
    console.log(`\n--- Price Action Analysis (Last ${days} Days) ---`);
    console.log(`Current Price (Close): ${candles[candles.length - 1].close}`);
    
    console.log('\n🚀 RESISTANCE LEVELS (Ceilings):');
    levels.resistance.forEach(r => {
      console.log(`  - Price: ${r.price.toFixed(2)} [Strength: ${r.strength}, Vol: ${(r.volume/1000000).toFixed(2)}M]`);
    });

    console.log('\n📉 SUPPORT LEVELS (Floors):');
    levels.support.forEach(s => {
      console.log(`  - Price: ${s.price.toFixed(2)} [Strength: ${s.strength}, Vol: ${(s.volume/1000000).toFixed(2)}M]`);
    });
    console.log('-------------------------------------------\n');

    // 4. Print raw candle data
    // ... rest of the code
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Test failed: ${message}`);
  }
}

interface SRLevel {
  price: number;
  strength: number; // How many times it acted as a pivot
  volume: number;   // Max volume at this pivot
}

function calculateSRLevels(candles: any[]) {
  const resistance: SRLevel[] = [];
  const support: SRLevel[] = [];
  const sensitivity = 0.015; // 1.5% range to group nearby levels

  // Loop from index 1 to length-2 (1-day window on each side)
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    // Detect Swing High (Resistance) - Fractal 3
    if (curr.high > prev.high && curr.high > next.high) {
      addOrUpdateLevel(resistance, curr.high, curr.volume, sensitivity);
    }

    // Detect Swing Low (Support) - Fractal 3
    if (curr.low < prev.low && curr.low < next.low) {
      addOrUpdateLevel(support, curr.low, curr.volume, sensitivity);
    }
  }

  // Sort by strength and price
  return {
    resistance: resistance.sort((a, b) => b.strength - a.strength || b.price - a.price).slice(0, 3),
    support: support.sort((a, b) => b.strength - a.strength || a.price - b.price).slice(0, 3)
  };
}

function addOrUpdateLevel(levels: SRLevel[], price: number, volume: number, sensitivity: number) {
  const existing = levels.find(l => Math.abs(l.price - price) / price < sensitivity);
  if (existing) {
    existing.strength++;
    existing.volume = Math.max(existing.volume, volume);
  } else {
    levels.push({ price, strength: 1, volume });
  }
}

testCoalIndiaCandles();
