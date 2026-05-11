import axios from 'axios';
import { config } from './config/env.js';
import { logger } from './helpers/logger.js';

export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export async function sendNotification(
  message: string,
  parseMode: 'HTML' | 'MarkdownV2' = 'HTML',
): Promise<void> {
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  try {
    const prefix =
      parseMode === 'HTML'
        ? '<b>[ORB Algo]</b>\n\n'
        : '*[ORB Algo]*\n\n';

    await axios.post(url, {
      chat_id: config.telegramChatId,
      text: `${prefix}${message}`,
      parse_mode: parseMode,
    });
  } catch (error) {
    const messageStr = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to send Telegram notification: ${messageStr}`);
  }
}
