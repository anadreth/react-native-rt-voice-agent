import type { LoggerInterface } from './types';
import { createLogger } from './logger';

type AppStateStatus = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export interface AppLifecycleCallbacks {
  onBackground: () => void;
  onForeground: () => void;
}

/**
 * Lazily resolves react-native's AppState so the core layer doesn't
 * hard-depend on react-native at import time. Safe to use in tests/Node.
 */
function getAppState(): { currentState: string; addEventListener: Function } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    return rn.AppState ?? null;
  } catch {
    return null;
  }
}

/**
 * Monitors app lifecycle (background/foreground) and notifies the session.
 * On iOS, backgrounding kills audio sessions — this allows graceful pause/resume.
 * Gracefully no-ops if react-native is not available (e.g., tests, Node.js).
 */
export class AppLifecycleManager {
  private subscription: { remove: () => void } | null = null;
  private callbacks: AppLifecycleCallbacks;
  private logger: LoggerInterface;
  private lastState: AppStateStatus = 'active';

  constructor(callbacks: AppLifecycleCallbacks, logger?: LoggerInterface) {
    this.callbacks = callbacks;
    this.logger = createLogger(logger);
  }

  start(): void {
    const appState = getAppState();
    if (!appState) {
      this.logger.info('AppState not available — lifecycle monitoring skipped');
      return;
    }

    this.lastState = appState.currentState as AppStateStatus;
    this.subscription = appState.addEventListener('change', this.handleChange) as { remove: () => void };
    this.logger.info('App lifecycle monitoring started');
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.logger.info('App lifecycle monitoring stopped');
  }

  private handleChange = (nextState: AppStateStatus): void => {
    const prev = this.lastState;
    this.lastState = nextState;

    if (prev === 'active' && (nextState === 'background' || nextState === 'inactive')) {
      this.logger.info('App moved to background');
      this.callbacks.onBackground();
    } else if ((prev === 'background' || prev === 'inactive') && nextState === 'active') {
      this.logger.info('App returned to foreground');
      this.callbacks.onForeground();
    }
  };
}
