import { describe, expect, it } from 'vitest';
import { transition } from '../session-state';

describe('session-state', () => {
  it('allows valid transitions', () => {
    expect(transition('idle', 'connecting')).toBe('connecting');
    expect(transition('connected', 'reconnecting')).toBe('reconnecting');
    expect(transition('reconnecting', 'connected')).toBe('connected');
  });

  it('rejects invalid transitions', () => {
    expect(() => transition('idle', 'connected')).toThrow('Invalid state transition');
  });
});
