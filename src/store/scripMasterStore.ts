export interface Scrip {
  token: string;
  symbol: string;
  name: string;
  expiry: string;
  strike: string;
  lotsize: string;
  instrumenttype: string;
  exch_seg: string;
  tick_size: string;
}

class ScripMasterStore {
  private scrips: Scrip[] = [];

  setScrips(scrips: Scrip[]): void {
    this.scrips = scrips;
  }

  getScrips(): Scrip[] {
    return this.scrips;
  }

  getScripsByUnderlying(name: string, expiry: string): Scrip[] {
    const searchName = name.trim();
    const filtered = this.scrips.filter(
      s => s.name.trim() === searchName && s.expiry === expiry,
    );
    if (filtered.length === 0) {
        // Find what expiries ARE available for this name
        const available = [...new Set(this.scrips.filter(s => s.name.trim() === searchName).map(s => s.expiry))];
        console.log(`Debug: No match for ${searchName} with expiry ${expiry}. Available for ${searchName}: ${available.join(', ')}`);
    }
    return filtered;
  }

  findScripBySymbol(symbol: string): Scrip | undefined {
    return this.scrips.find(s => s.symbol === symbol);
  }
}

export const scripMasterStore = new ScripMasterStore();
