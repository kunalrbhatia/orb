interface Scrip {
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

  findScripBySymbol(symbol: string): Scrip | undefined {
    return this.scrips.find(s => s.symbol === symbol);
  }
}

export const scripMasterStore = new ScripMasterStore();
