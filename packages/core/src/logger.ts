import type { LoggerInterface } from './types';

const consoleLogger: LoggerInterface = {
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

export function createLogger(logger?: LoggerInterface): LoggerInterface {
  return logger ?? consoleLogger;
}
