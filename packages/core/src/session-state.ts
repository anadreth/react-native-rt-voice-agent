import type { SessionState } from './types';
import { SessionError } from './errors';

const TRANSITIONS: Record<SessionState, SessionState[]> = {
  idle: ['connecting'],
  connecting: ['connected', 'error', 'stopped'],
  connected: ['reconnecting', 'error', 'stopped'],
  reconnecting: ['connected', 'error', 'stopped'],
  error: ['connecting', 'stopped'],
  stopped: ['connecting'],
};

export function transition(current: SessionState, next: SessionState): SessionState {
  const allowed = TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw new SessionError(`Invalid state transition: ${current} -> ${next}`);
  }

  return next;
}
