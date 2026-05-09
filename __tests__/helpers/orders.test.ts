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

jest.mock('../../src/helpers/api.js');
jest.mock('../../src/store/tradeStore.js');
jest.mock('../../src/store/scripMasterStore.js');
jest.mock('../../src/helpers/marketData.js');
jest.mock('../../src/helpers/logger.js');
jest.mock('../../src/notifier.js');

describe('orders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      expect(api.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tradingsymbol: 'RELIANCE-CE',
          quantity: 50,
        }),
      );
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

      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('placeOrder'),
        expect.objectContaining({
          transactiontype: 'BUY',
          symboltoken: 'T1',
        }),
      );
      expect(tradeStore.setActiveTrade).toHaveBeenCalled();
      expect(sendNotification).toHaveBeenCalled();
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

      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('placeOrder'),
        expect.objectContaining({
          transactiontype: 'BUY',
          symboltoken: 'T1',
        }),
      );
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

      expect(api.post).toHaveBeenCalledWith(expect.any(String), {
        orderid: 'SL123',
      });
      expect(tradeStore.setActiveTrade).toHaveBeenCalledWith(null);
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('Trade Exited'),
      );
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

      expect(api.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          orderid: 'SL123',
          triggerprice: 150,
        }),
      );
      expect(tradeStore.setActiveTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          currentSlValue: 150,
          trailingStage: 2,
        }),
      );
    });

    it('should return early if no active trade', async () => {
      (tradeStore.getActiveTrade as jest.Mock).mockReturnValue(null);
      await modifyStoploss(150);
      expect(api.post).not.toHaveBeenCalled();
    });
  });
});
