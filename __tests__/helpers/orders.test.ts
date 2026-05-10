/* eslint-disable @typescript-eslint/unbound-method */
import {
  placeOrder,
  enterTrade,
  exitTrade,
  modifyStoploss,
} from '../../src/helpers/orders.js';
import { api } from '../../src/helpers/api.js';
import { tradeStore } from '../../src/store/tradeStore.js';
import { scripMasterStore } from '../../src/store/scripMasterStore.js';
import * as marketData from '../../src/helpers/marketData.js';
import { sendNotification } from '../../src/notifier.js';
import { isPaperMode } from '../../src/helpers/telegramListener.js';

jest.mock('../../src/helpers/api.js');
jest.mock('../../src/store/tradeStore.js');
jest.mock('../../src/store/scripMasterStore.js');
jest.mock('../../src/helpers/marketData.js');
jest.mock('../../src/helpers/logger.js');
jest.mock('../../src/notifier.js');
jest.mock('../../src/helpers/telegramListener.js');

interface ActiveTrade {
  buyOrderId: string;
  currentSlValue: number;
  trailingStage: number;
}

describe('orders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isPaperMode as jest.Mock).mockReturnValue(false);
  });

  describe('placeOrder', () => {
    it('should place an order and return orderId', async () => {
      (api.post as jest.Mock).mockResolvedValue({
        data: { orderid: 'ORD123' },
      });
      const orderId = await placeOrder({
        symbol: 'RELIANCE-CE',
        token: '123',
        transactionType: 'BUY',
        quantity: 50,
        orderType: 'MARKET',
      });
      expect(orderId).toBe('ORD123');
      expect(api.post).toHaveBeenCalled();
    });

    it('should return paper order ID in paper mode without calling API', async () => {
      (isPaperMode as jest.Mock).mockReturnValue(true);
      const orderId = await placeOrder({
        symbol: 'RELIANCE-CE',
        token: '123',
        transactionType: 'BUY',
        quantity: 50,
        orderType: 'MARKET',
      });
      expect(orderId).toContain('PAPER-');
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('enterTrade', () => {
    const mockStock = {
      symbol: 'RELIANCE',
      symbolToken: '2885',
      ltp: 2500,
      side: 'CALL' as const,
      watchLevel: 2550,
      breachStartTime: new Date(),
    };
    const mockExpiry = '28052026';
    const mockScrips = [
      {
        name: 'RELIANCE',
        expiry: mockExpiry,
        strike: '2550',
        symbol: 'RELIANCE26MAY2550CE',
        token: 'T1',
        lotsize: '50',
      },
      {
        name: 'RELIANCE',
        expiry: mockExpiry,
        strike: '2600',
        symbol: 'RELIANCE26MAY2600CE',
        token: 'T2',
        lotsize: '50',
      },
    ];

    it('should enter trade successfully (CALL)', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue(mockScrips);
      (api.post as jest.Mock).mockResolvedValue({ data: { orderid: 'ORD' } });
      (marketData.getOptionChain as jest.Mock).mockResolvedValue([
        { strikePrice: 2550, ltp: 100 },
        { strikePrice: 2600, ltp: 25 }, // Hedge
      ]);

      await enterTrade(mockStock, mockExpiry);

      expect(api.post).toHaveBeenCalled();
      expect(tradeStore.setActiveTrade).toHaveBeenCalled();
      expect(sendNotification).toHaveBeenCalled();
    });

    it('should enter paper trade when paper mode is on', async () => {
      (isPaperMode as jest.Mock).mockReturnValue(true);
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue(mockScrips);
      (marketData.getOptionChain as jest.Mock).mockResolvedValue([
        { strikePrice: 2550, ltp: 100 },
        { strikePrice: 2600, ltp: 25 },
      ]);

      await enterTrade(mockStock, mockExpiry);

      expect(api.post).not.toHaveBeenCalled();
      const calls = (tradeStore.setActiveTrade as jest.Mock).mock.calls;
      const firstCallArgs = calls[0] as unknown[];
      const activeTrade = firstCallArgs[0] as ActiveTrade;
      expect(activeTrade.buyOrderId).toContain('PAPER-');
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('[PAPER]'),
      );
    });

    it('should enter trade successfully (PUT)', async () => {
      const putStock = { ...mockStock, side: 'PUT' as const, watchLevel: 2500 };
      const putScrips = [
        {
          name: 'RELIANCE',
          expiry: mockExpiry,
          strike: '2500',
          symbol: 'RELIANCE26MAY2500PE',
          token: 'T1',
          lotsize: '50',
        },
        {
          name: 'RELIANCE',
          expiry: mockExpiry,
          strike: '2450',
          symbol: 'RELIANCE26MAY2450PE',
          token: 'T2',
          lotsize: '50',
        },
      ];
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue(putScrips);
      (api.post as jest.Mock).mockResolvedValue({ data: { orderid: 'ORD' } });
      (marketData.getOptionChain as jest.Mock).mockResolvedValue([
        { strikePrice: 2500, ltp: 100 },
        { strikePrice: 2450, ltp: 25 },
      ]);

      await enterTrade(putStock, mockExpiry);

      expect(api.post).toHaveBeenCalled();
    });

    it('should throw error if buy scrip not found', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([]);
      await expect(enterTrade(mockStock, mockExpiry)).rejects.toThrow(
        'Buy scrip not found',
      );
    });

    it('should throw error if hedge scrip not found', async () => {
      (scripMasterStore.getScrips as jest.Mock).mockReturnValue([
        mockScrips[0],
      ]); // Only buy scrip
      (marketData.getOptionChain as jest.Mock).mockResolvedValue([
        { strikePrice: 2550, ltp: 100 },
        { strikePrice: 2600, ltp: 25 },
      ]);
      (api.post as jest.Mock).mockResolvedValue({ data: { orderid: 'ORD' } });

      await expect(enterTrade(mockStock, mockExpiry)).rejects.toThrow(
        'Hedge scrip not found',
      );
    });
  });

  describe('exitTrade', () => {
    it('should exit trade and clear active trade', async () => {
      const mockTrade = { symbol: 'RELIANCE', slOrderId: 'SL123' };
      (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(mockTrade);

      await exitTrade('Target hit');

      expect(api.post).toHaveBeenCalled();
      expect(tradeStore.setActiveTrade).toHaveBeenCalledWith(null);
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('Trade Exited'),
      );
    });

    it('should mock exit in paper mode', async () => {
      (isPaperMode as jest.Mock).mockReturnValue(true);
      const mockTrade = { symbol: 'RELIANCE', slOrderId: 'PAPER-SL123' };
      (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(mockTrade);

      await exitTrade('Target hit');

      expect(api.post).not.toHaveBeenCalled();
      expect(tradeStore.setActiveTrade).toHaveBeenCalledWith(null);
    });

    it('should return early if no active trade', async () => {
      (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(null);
      await exitTrade('Reason');
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('modifyStoploss', () => {
    it('should modify SL and update active trade', async () => {
      const mockTrade = {
        symbol: 'RELIANCE',
        slOrderId: 'SL123',
        trailingStage: 1,
      };
      (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(mockTrade);

      await modifyStoploss(150);

      expect(api.post).toHaveBeenCalled();
      const calls = (tradeStore.setActiveTrade as jest.Mock).mock.calls;
      const firstCallArgs = calls[0] as unknown[];
      const firstArg = firstCallArgs[0] as ActiveTrade;
      expect(firstArg.currentSlValue).toBe(150);
      expect(firstArg.trailingStage).toBe(2);
    });

    it('should mock modification in paper mode', async () => {
      (isPaperMode as jest.Mock).mockReturnValue(true);
      const mockTrade = {
        symbol: 'RELIANCE',
        slOrderId: 'PAPER-SL123',
        trailingStage: 1,
      };
      (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(mockTrade);

      await modifyStoploss(150);

      expect(api.post).not.toHaveBeenCalled();
      expect(tradeStore.setActiveTrade).toHaveBeenCalled();
    });

    it('should return early if no active trade', async () => {
      (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(null);
      await modifyStoploss(150);
      expect(api.post).not.toHaveBeenCalled();
    });
  });
});
