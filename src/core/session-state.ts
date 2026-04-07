import type { SessionState } from './types';
import { SessionError } from './errors';

/**
 * Valid state transitions for the session state machine.
 * Key = current state, Value = set of allowed next states.
 */
const TRANSITIONS: Record<SessionState, SessionState[]> = {
  idle:           ['requesting_mic'],
  requesting_mic: ['authenticating', 'error', 'stopped'],
  authenticating: ['connecting', 'error', 'stopped'],
  connecting:     ['connected', 'error', 'stopped'],
  connected:      ['reconnecting', 'error', 'stopped'],
  reconnecting:   ['connecting', 'error', 'stopped'],
  error:          ['idle'],
  stopped:        ['idle'],
};

/**
 * Validate and perform a state transition.
 * Returns the new state, or throws if the transition is invalid.
 */
export function transition(current: SessionState, next: SessionState): SessionState {
  const allowed = TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new SessionError(
      `Invalid state transition: ${current} -> ${next}`
    );
  }
  return next;
}

/**
 * Check whether a transition is valid without throwing.
 */
export function canTransition(current: SessionState, next: SessionState): boolean {
  const allowed = TRANSITIONS[current];
  return !!allowed && allowed.includes(next);
}
