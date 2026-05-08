import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import moment from 'moment-timezone';

const { combine, printf, colorize, json } = winston.format;

const istTimestamp = winston.format(info => {
  info.timestamp = moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
  return info;
});

const consoleFormat = printf(({ level, message, timestamp }) => {
  return `${String(timestamp)} [${level}]: ${String(message)}`;
});

export const logger = winston.createLogger({
  level: 'info',
  format: combine(istTimestamp(), json()),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), istTimestamp(), consoleFormat),
    }),
    new DailyRotateFile({
      filename: 'logs/orb-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
});
