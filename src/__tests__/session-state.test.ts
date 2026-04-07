import { describe, it, expect } from 'vitest';
import { transition, canTransition } from '../core/session-state';

describe('Session state machine', () => {
  describe('valid transitions are allowed', () => {
    const allowed = [
      ['idle', 'requesting_mic'],
      ['requesting_mic', 'authenticating'],
      ['authenticating', 'connecting'],
      ['connecting', 'connected'],
      ['connected', 'reconnecting'],
      ['reconnecting', 'idle'],
      ['reconnecting', 'connecting'],
      ['error', 'idle'],
      ['stopped', 'idle'],
    ] as const;

    for (const [from, to] of allowed) {
      it(`${from} → ${to}`, () => {
        expect(transition(from, to)).toBe(to);
      });
    }
  });

  describe('invalid transitions are rejected', () => {
    const forbidden = [
      ['idle', 'connected'],
      ['connected', 'idle'],
      ['error', 'connected'],
      ['stopped', 'connected'],
      ['idle', 'authenticating'],
    ] as const;

    for (const [from, to] of forbidden) {
      it(`${from} → ${to} throws`, () => {
        expect(() => transition(from, to)).toThrow('Invalid state transition');
      });
    }
  });

  describe('any active state can reach error or stopped', () => {
    const activeStates = ['requesting_mic', 'authenticating', 'connecting', 'connected', 'reconnecting'] as const;

    for (const state of activeStates) {
      it(`${state} → error`, () => {
        expect(transition(state, 'error')).toBe('error');
      });

      it(`${state} → stopped`, () => {
        expect(transition(state, 'stopped')).toBe('stopped');
      });
    }
  });

  describe('canTransition reports validity without throwing', () => {
    it('returns true for valid transitions', () => {
      expect(canTransition('idle', 'requesting_mic')).toBe(true);
      expect(canTransition('connected', 'stopped')).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(canTransition('idle', 'connected')).toBe(false);
      expect(canTransition('stopped', 'connected')).toBe(false);
    });
  });
});
