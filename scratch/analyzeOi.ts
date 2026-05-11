import { login } from './helpers/login.js';
import { downloadScripMaster } from './helpers/scripMaster.js';
import { getOptionChain, getMonthlyExpiry, getLtp } from './helpers/marketData.js';
import { logger } from './helpers/logger.js';

async function analyzeCoalIndia() {
  try {
    await login();
    await downloadScripMaster();
    
    const expiry = getMonthlyExpiry();
    const symbol = 'COALINDIA';
    const coalToken = '20374';
    const spot = await getLtp(symbol, coalToken, 'NSE');
    
    logger.info(`Analyzing ${symbol} @ Spot: ${spot}, Expiry: ${expiry}`);
    
    const chain = await getOptionChain(symbol, expiry);
    
    const ceStrikes = chain.filter(s => s.optionType === 'CE');
    const peStrikes = chain.filter(s => s.optionType === 'PE');
    
    console.log(`\n--- ${symbol} Full Option Chain (Expiry: ${expiry}) ---`);
    console.log(`Current Spot: ${spot}`);
    
    console.log('\nCALL OPTIONS:');
    ceStrikes.sort((a, b) => a.strikePrice - b.strikePrice).forEach(s => {
      console.log(`  Strike ${s.strikePrice.toFixed(2).padStart(8)}: OI ${s.openInterest.toString().padStart(10)}`);
    });

    console.log('\nPUT OPTIONS:');
    peStrikes.sort((a, b) => a.strikePrice - b.strikePrice).forEach(s => {
      console.log(`  Strike ${s.strikePrice.toFixed(2).padStart(8)}: OI ${s.openInterest.toString().padStart(10)}`);
    });

    if (ceStrikes.length > 0 && peStrikes.length > 0) {
        const maxCe = ceStrikes.reduce((prev, curr) => (prev.openInterest > curr.openInterest ? prev : curr), ceStrikes[0]);
        const maxPe = peStrikes.reduce((prev, curr) => (prev.openInterest > curr.openInterest ? prev : curr), peStrikes[0]);
        
        console.log(`\nSummary:`);
        console.log(`Max CALL OI: ${maxCe.openInterest} @ Strike ${maxCe.strikePrice}`);
        console.log(`Max PUT OI:  ${maxPe.openInterest} @ Strike ${maxPe.strikePrice}`);
    } else {
        console.log('\nNo strikes found for analysis.');
    }

  } catch (error) {
    console.error('Analysis failed:', error);
  }
}

analyzeCoalIndia();
