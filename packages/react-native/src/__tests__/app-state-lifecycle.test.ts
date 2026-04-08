import { describe, expect, it, vi } from 'vitest';
import { AppState } from 'react-native';
import { createAppStateLifecycleAdapter } from '../app-state-lifecycle';

describe('createAppStateLifecycleAdapter', () => {
  it('emits background and foreground callbacks', () => {
    const adapter = createAppStateLifecycleAdapter();
    const onBackground = vi.fn();
    const onForeground = vi.fn();
    let listener: ((state: 'active' | 'background' | 'inactive') => void) | null = null;

    vi.mocked(AppState.addEventListener).mockImplementation((_type, cb) => {
      listener = cb as (state: 'active' | 'background' | 'inactive') => void;
      return { remove: vi.fn() };
    });

    adapter.start({ onBackground, onForeground });

    listener?.('background');
    listener?.('active');

    expect(onBackground).toHaveBeenCalledTimes(1);
    expect(onForeground).toHaveBeenCalledTimes(1);
  });
});
