import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { logger } from './logger.js';
import { sendNotification } from '../notifier.js';

const OFFSET_FILE = path.join(process.cwd(), '.tg_offset');
const PAPER_TRADE_FILE = path.join(process.cwd(), '.paper-trade');
const KILL_SWITCH_FILE = path.join(process.cwd(), '.killswitch');

let offset = 0;
let offsetInitialized = false;

interface TelegramUpdate {
  update_id: number;
  message?: {
    text?: string;
    chat: {
      id: number;
    };
  };
}

export function resetListenerState(): void {
  offset = 0;
  offsetInitialized = false;
}

export function isPaperMode(): boolean {
  return fs.existsSync(PAPER_TRADE_FILE);
}

export function isKilled(): boolean {
  return fs.existsSync(KILL_SWITCH_FILE);
}

async function handleCommand(command: string): Promise<void> {
  if (command === '/killorb') {
    if (isKilled()) {
      await sendNotification('ORB Algo is already in KILLED state.');
    } else {
      fs.writeFileSync(KILL_SWITCH_FILE, 'true');
      logger.info('Kill switch triggered via Telegram');
      await sendNotification(
        'Kill switch activated. All core tasks are now suspended. Use /resumeorb to reactivate.',
      );
    }
  }

  if (command === '/resumeorb') {
    if (isKilled()) {
      fs.unlinkSync(KILL_SWITCH_FILE);
      logger.info('Algo resumed via Telegram');
      await sendNotification(
        'Kill switch removed. ORB Algo core tasks are now active.',
      );
    } else {
      await sendNotification('ORB Algo is already active.');
    }
  }

  if (command === '/paper-orb') {
    if (isPaperMode()) {
      fs.unlinkSync(PAPER_TRADE_FILE);
      logger.info('Paper mode disabled');
      await sendNotification(
        'Paper mode DISABLED. Actual trades will be placed.',
      );
    } else {
      fs.writeFileSync(PAPER_TRADE_FILE, 'enabled');
      logger.info('Paper mode enabled');
      await sendNotification(
        'Paper mode ENABLED. No actual trades will be placed.',
      );
    }
  }
}

export async function startTelegramListener(runOnce = false): Promise<void> {
  if (!offsetInitialized && fs.existsSync(OFFSET_FILE)) {
    try {
      offset = parseInt(fs.readFileSync(OFFSET_FILE, 'utf-8')) || 0;
    } catch (error) {
      logger.error(
        `Failed to read offset file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    offsetInitialized = true;
  }

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/getUpdates`;

  while (true) {
    try {
      const response = await axios.get<{ result: TelegramUpdate[] }>(url, {
        params: {
          offset: offset + 1,
          timeout: 30,
        },
      });

      const updates = response.data.result;

      for (const update of updates) {
        offset = update.update_id;
        fs.writeFileSync(OFFSET_FILE, offset.toString());

        const message = update.message;
        if (message && message.text) {
          if (message.chat.id.toString() === config.telegramChatId) {
            await handleCommand(message.text);
          } else {
            logger.warn(
              `Ignoring message from unauthorized chat: ${message.chat.id}`,
            );
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Stop loop') break;
      logger.error(`Telegram listener error: ${message}`);
      // Wait a bit before retrying on error
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (runOnce) break;
  }
}
