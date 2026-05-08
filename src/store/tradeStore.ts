export interface WatchStock {
  symbol: string;
  symbolToken: string;
  ltp: number;
  side: 'CALL' | 'PUT';
  watchLevel: number;
  breachStartTime: Date | null;
}

export interface ActiveTrade {
  symbol: string;
  buyOrderId: string;
  buyToken: string;
  sellOrderId: string;
  sellToken: string;
  slOrderId: string;
  entryBuyPremium: number;
  entrySellPremium: number;
  netDebit: number;
  currentSlValue: number;
  trailingStage: number;
}

class TradeStore {
  private watchList: WatchStock[] = [];
  private activeTrade: ActiveTrade | null = null;

  setWatchList(watchList: WatchStock[]): void {
    this.watchList = watchList;
  }

  getWatchList(): WatchStock[] {
    return this.watchList;
  }

  setActiveTrade(trade: ActiveTrade | null): void {
    this.activeTrade = trade;
  }

  getActiveTrade(): ActiveTrade | null {
    return this.activeTrade;
  }

  updateWatchStock(symbol: string, updates: Partial<WatchStock>): void {
    const stock = this.watchList.find(s => s.symbol === symbol);
    if (stock) {
      Object.assign(stock, updates);
    }
  }
}

export const tradeStore = new TradeStore();
