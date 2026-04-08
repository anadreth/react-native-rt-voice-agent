import type { ReconnectPolicy } from './types';

const DEFAULT_POLICY = {
  enabled: true,
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10_000,
};

export function resolveReconnectPolicy(policy?: ReconnectPolicy) {
  return {
    enabled: policy?.enabled ?? DEFAULT_POLICY.enabled,
    maxAttempts: policy?.maxAttempts ?? DEFAULT_POLICY.maxAttempts,
    baseDelayMs: policy?.baseDelayMs ?? DEFAULT_POLICY.baseDelayMs,
    maxDelayMs: policy?.maxDelayMs ?? DEFAULT_POLICY.maxDelayMs,
  };
}

export function getReconnectDelay(attempt: number, policy?: ReconnectPolicy): number {
  const resolved = resolveReconnectPolicy(policy);
  return Math.min(
    resolved.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)),
    resolved.maxDelayMs,
  );
}
