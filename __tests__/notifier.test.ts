/* eslint-disable @typescript-eslint/unbound-method */
import { sendNotification, escapeMarkdownV2 } from '../src/notifier.js';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('notifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send telegram notification with HTML default', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} });
    await sendNotification('test message');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        text: '<b>[ORB Algo]</b>\n\ntest message',
        parse_mode: 'HTML',
      }),
    );
  });

  it('should send telegram notification with MarkdownV2', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} });
    await sendNotification('test message', 'MarkdownV2');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('sendMessage'),
      expect.objectContaining({
        text: '*[ORB Algo]*\n\ntest message',
        parse_mode: 'MarkdownV2',
      }),
    );
  });

  it('should handle error gracefully', async () => {
    mockedAxios.post.mockRejectedValue(new Error('API Error'));
    await expect(sendNotification('test message')).resolves.not.toThrow();
  });

  it('should handle non-Error objects in catch block', async () => {
    mockedAxios.post.mockRejectedValue('String Error');
    await expect(sendNotification('test message')).resolves.not.toThrow();
  });

  describe('escapeMarkdownV2', () => {
    it('should escape special characters', () => {
      const text = '_*[]()~`>#+-=|{}.!';
      const escaped = escapeMarkdownV2(text);
      expect(escaped).toBe('\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!');
    });

    it('should not escape alphanumeric characters', () => {
      const text = 'Hello123';
      const escaped = escapeMarkdownV2(text);
      expect(escaped).toBe('Hello123');
    });
  });
});
