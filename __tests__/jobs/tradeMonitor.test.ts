import { runTradeMonitor } from '../../src/jobs/tradeMonitor.js';
import { tradeStore } from '../../src/store/tradeStore.js';
import * as marketData from '../../src/helpers/marketData.js';
import * as trailingSlManager from '../../src/helpers/trailingSlManager.js';
import * as orders from '../../src/helpers/orders.js';
import { logger } from '../../src/helpers/logger.js';

jest.mock('../../src/store/tradeStore.js');
jest.mock('../../src/helpers/marketData.js');
jest.mock('../../src/helpers/trailingSlManager.js');
jest.mock('../../src/helpers/orders.js');
jest.mock('../../src/helpers/logger.js');

describe('tradeMonitor', () => {
  const mockTrade = {
    symbol: 'RELIANCE',
    buyToken: '2885',
    sellToken: '1234',
    entryBuyPremium: 100,
    entrySellPremium: 20,
    netDebit: 80,
    currentSlValue: 60,
    trailingStage: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return early if no active trade', async () => {
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(null);
    await runTradeMonitor();
    expect(marketData.getBatchLtp).not.toHaveBeenCalled();
  });

  it('should exit trade if EOD square-off time reached', async () => {
    jest.setSystemTime(new Date('2026-05-09T15:25:00+05:30')); // 15:25 IST
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(mockTrade);

    await runTradeMonitor();

    expect(orders.exitTrade).toHaveBeenCalledWith('EOD square-off');
  });

  it('should monitor trade and modify SL if needed', async () => {
    jest.setSystemTime(new Date('2026-05-09T11:00:00+05:30'));
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(mockTrade);
    (marketData.getBatchLtp as jest.Mock).mockResolvedValue({
      '2885': 110,
      '1234': 25,
    });
    // currentMtm = 110 - 100 - (25 - 20) = 10 - 5 = 5
    (trailingSlManager.checkTrailingSl as jest.Mock).mockReturnValue({
      shouldModifySl: true,
      newSlValue: 70,
    });

    await runTradeMonitor();

    expect(logger.info).toHaveBeenCalledWith('Trailing SL to 70');
    expect(orders.modifyStoploss).toHaveBeenCalledWith(70);
  });

  it('should exit trade if SL hit via LTP comparison', async () => {
    jest.setSystemTime(new Date('2026-05-09T11:00:00+05:30'));
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(mockTrade);
    (marketData.getBatchLtp as jest.Mock).mockResolvedValue({
      '2885': 55, // Below currentSlValue (60)
      '1234': 20,
    });
    (trailingSlManager.checkTrailingSl as jest.Mock).mockReturnValue({
      shouldModifySl: false,
    });

    await runTradeMonitor();

    expect(orders.exitTrade).toHaveBeenCalledWith('SL hit (detected via LTP)');
  });

  it('should handle missing tokens in ltpMap', async () => {
    jest.setSystemTime(new Date('2026-05-09T11:00:00+05:30'));
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(mockTrade);
    (marketData.getBatchLtp as jest.Mock).mockResolvedValue({}); // Empty map
    (trailingSlManager.checkTrailingSl as jest.Mock).mockReturnValue({
      shouldModifySl: false,
    });

    await runTradeMonitor();

    // currentMtm = 0 - 100 - (0 - 20) = -100 + 20 = -80
    expect(trailingSlManager.checkTrailingSl).toHaveBeenCalledWith(
      -80,
      80,
      60,
      0,
    );
  });

  it('should handle errors gracefully', async () => {
    jest.setSystemTime(new Date('2026-05-09T11:00:00+05:30'));
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(mockTrade);
    (marketData.getBatchLtp as jest.Mock).mockRejectedValue(
      new Error('API Error'),
    );

    await runTradeMonitor();

    expect(logger.error).toHaveBeenCalledWith(
      'Trade monitor failed: API Error',
    );
  });

  it('should handle non-Error objects in catch block', async () => {
    jest.setSystemTime(new Date('2026-05-09T11:00:00+05:30'));
    (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(mockTrade);
    (marketData.getBatchLtp as jest.Mock).mockRejectedValue('String Error');

    await runTradeMonitor();

    expect(logger.error).toHaveBeenCalledWith(
      'Trade monitor failed: String Error',
    );
  });
});
