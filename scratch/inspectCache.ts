import fs from 'fs/promises';

async function inspectCache() {
  const data = JSON.parse(await fs.readFile('logs/scrip_master_cache.json', 'utf-8'));
  console.log('Cache Date:', data.date);
  console.log('Total Scrips:', data.scrips.length);
  
  const coalIndia = data.scrips.filter(s => s.name === 'COALINDIA');
  console.log('COALINDIA Scrips Found:', coalIndia.length);
  if (coalIndia.length > 0) {
    console.log('Sample COALINDIA Scrip:', coalIndia[0]);
    const expiries = [...new Set(coalIndia.map(s => s.expiry))];
    console.log('COALINDIA Expiries:', expiries);
  }

  const nifty = data.scrips.filter(s => s.name === 'NIFTY');
  console.log('NIFTY Scrips Found:', nifty.length);
}

inspectCache();
