/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import axios from 'axios';
import fs from 'fs';
import {
  startTelegramListener,
  isPaperMode,
  resetListenerState,
  isKilled,
} from '../../src/helpers/telegramListener.js';
import { sendNotification } from '../../src/notifier.js';

jest.mock('axios');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  readFileSync: jest.fn(),
}));
jest.mock('../../src/notifier.js');
jest.mock('../../src/helpers/logger.js');
jest.mock('../../src/config/env.js', () => ({
  config: {
    telegramBotToken: 'mock-token',
    telegramChatId: '123456789',
  },
}));
jest.mock('winston-daily-rotate-file', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    log: jest.fn(),
  }));
});

describe('telegramListener', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetListenerState();
    jest.spyOn(process, 'exit').mockImplementation(() => {
      return undefined as never;
    });
  });

  describe('isPaperMode', () => {
    it('should return true if paper trade file exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      expect(isPaperMode()).toBe(true);
    });

    it('should return false if paper trade file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      expect(isPaperMode()).toBe(false);
    });
  });

  describe('isKilled', () => {
    it('should return true if killswitch file exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      expect(isKilled()).toBe(true);
    });

    it('should return false if killswitch file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      expect(isKilled()).toBe(false);
    });
  });

  describe('startTelegramListener', () => {
    it('should handle /killorb command (activate)', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false); // Not killed yet
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: {
          result: [
            {
              update_id: 100,
              message: {
                text: '/killorb',
                chat: { id: 123456789 },
              },
            },
          ],
        },
      });
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      await startTelegramListener(true);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.killswitch'),
        'true',
      );
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('Kill switch activated'),
      );
    });

    it('should handle /killorb command (already active)', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true); // Already killed
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: {
          result: [
            {
              update_id: 100,
              message: {
                text: '/killorb',
                chat: { id: 123456789 },
              },
            },
          ],
        },
      });
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      await startTelegramListener(true);

      expect(fs.writeFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining('.killswitch'),
        'true',
      );
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('already in KILLED state'),
      );
    });

    it('should handle /resumeorb command (success)', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true); // Is killed
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: {
          result: [
            {
              update_id: 100,
              message: {
                text: '/resumeorb',
                chat: { id: 123456789 },
              },
            },
          ],
        },
      });
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      await startTelegramListener(true);

      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('.killswitch'),
      );
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('Kill switch removed'),
      );
    });

    it('should handle /resumeorb command (already active)', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false); // Not killed
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: {
          result: [
            {
              update_id: 100,
              message: {
                text: '/resumeorb',
                chat: { id: 123456789 },
              },
            },
          ],
        },
      });
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      await startTelegramListener(true);

      expect(fs.unlinkSync).not.toHaveBeenCalledWith(
        expect.stringContaining('.killswitch'),
      );
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('already active'),
      );
    });

    it('should handle /paper-orb command (enable)', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: {
          result: [
            {
              update_id: 101,
              message: {
                text: '/paper-orb',
                chat: { id: 123456789 },
              },
            },
          ],
        },
      });
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      await startTelegramListener(true);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.paper-trade'),
        'enabled',
      );
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('Paper mode ENABLED'),
      );
    });

    it('should handle /paper-orb command (disable)', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: {
          result: [
            {
              update_id: 102,
              message: {
                text: '/paper-orb',
                chat: { id: 123456789 },
              },
            },
          ],
        },
      });
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      await startTelegramListener(true);

      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('.paper-trade'),
      );
      expect(sendNotification).toHaveBeenCalledWith(
        expect.stringContaining('Paper mode DISABLED'),
      );
    });

    it('should ignore messages from other chats', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({
        data: {
          result: [
            {
              update_id: 103,
              message: {
                text: '/killorb',
                chat: { id: 999999999 },
              },
            },
          ],
        },
      });
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      await startTelegramListener(true);

      expect(sendNotification).not.toHaveBeenCalled();
    });

    it('should handle general error in the loop', async () => {
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Some error'));
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      jest.useFakeTimers();
      const promise = startTelegramListener(true);
      await jest.advanceTimersByTimeAsync(5000);
      await promise;
      jest.useRealTimers();
    });

    it('should handle non-Error throw in the loop', async () => {
      (axios.get as jest.Mock).mockRejectedValueOnce('Unexpected string error');
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      jest.useFakeTimers();
      const promise = startTelegramListener(true);
      await jest.advanceTimersByTimeAsync(5000);
      await promise;
      jest.useRealTimers();
    });

    it('should read offset from file if it exists and not yet initialized', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('500');
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      await startTelegramListener(true);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.tg_offset'),
        'utf-8',
      );
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ offset: 501 }),
        }),
      );
    });

    it('should handle error when reading offset file', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Read error');
      });
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Stop loop'));

      await startTelegramListener(true);
    });
  });
});
