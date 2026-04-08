import type { ErrorCode } from './types';

export class RealtimeVoiceError extends Error {
  readonly code: ErrorCode;

  constructor(message: string, code: ErrorCode) {
    super(message);
    this.name = 'RealtimeVoiceError';
    this.code = code;
  }
}

export class SessionError extends RealtimeVoiceError {
  constructor(message: string, code: ErrorCode = 'invalid_state') {
    super(message, code);
    this.name = 'SessionError';
  }
}

export class ConnectionError extends RealtimeVoiceError {
  constructor(message: string, code: ErrorCode = 'transport_failed') {
    super(message, code);
    this.name = 'ConnectionError';
  }
}

export class AuthError extends RealtimeVoiceError {
  public status?: number;
  public endpoint?: string;

  constructor(message: string, endpoint?: string, status?: number) {
    super(message, 'auth_failed');
    this.name = 'AuthError';
    this.endpoint = endpoint;
    this.status = status;
  }
}

export class ToolExecutionError extends RealtimeVoiceError {
  constructor(message: string) {
    super(message, 'tool_failed');
    this.name = 'ToolExecutionError';
  }
}
