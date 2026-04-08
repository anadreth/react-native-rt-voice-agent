import type { LifecycleAdapter, LifecycleCallbacks } from '@rtva/core';
import { AppState } from 'react-native';

type AppStateStatus = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

export function createAppStateLifecycleAdapter(): LifecycleAdapter {
  let lastState = (AppState.currentState ?? 'active') as AppStateStatus;
  let subscription: { remove(): void } | null = null;

  return {
    start(callbacks: LifecycleCallbacks): void {
      if (subscription) return;

      subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
        const previous = lastState;
        lastState = nextState;

        if (previous === 'active' && (nextState === 'background' || nextState === 'inactive')) {
          callbacks.onBackground();
          return;
        }

        if ((previous === 'background' || previous === 'inactive') && nextState === 'active') {
          callbacks.onForeground();
        }
      }) as { remove(): void };
    },

    stop(): void {
      subscription?.remove();
      subscription = null;
      lastState = (AppState.currentState ?? 'active') as AppStateStatus;
    },
  };
}
