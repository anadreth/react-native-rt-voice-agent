import type { LoggerInterface } from './types';

class DefaultLogger implements LoggerInterface {
  info(msg: string, ...args: unknown[]): void {
    console.log(`[RtVoice] [INFO] ${msg}`, ...args);
  }

  warn(msg: string, ...args: unknown[]): void {
    console.warn(`[RtVoice] [WARN] ${msg}`, ...args);
  }

  error(msg: string, ...args: unknown[]): void {
    console.error(`[RtVoice] [ERROR] ${msg}`, ...args);
  }
}

const defaultLogger = new DefaultLogger();

export function createLogger(custom?: LoggerInterface): LoggerInterface {
  return custom ?? defaultLogger;
}
