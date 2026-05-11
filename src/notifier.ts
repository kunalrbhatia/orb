import axios from 'axios';
import { config } from './config/env.js';
import { logger } from './helpers/logger.js';

export async function sendNotification(message: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: config.telegramChatId,
      text: `<b>[ORB Algo]</b>\n\n${message}`,
      parse_mode: 'HTML',
    });
  } catch (error) {
    const messageStr = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to send Telegram notification: ${messageStr}`);
  }
}
