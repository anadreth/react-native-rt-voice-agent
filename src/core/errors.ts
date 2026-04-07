export class RealtimeVoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RealtimeVoiceError';
  }
}

export class SessionError extends RealtimeVoiceError {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

export class ConnectionError extends RealtimeVoiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

export class AuthError extends RealtimeVoiceError {
  public status?: number;
  public endpoint?: string;

  constructor(message: string, endpoint?: string, status?: number) {
    super(message);
    this.name = 'AuthError';
    this.endpoint = endpoint;
    this.status = status;
  }
}

export class ProviderError extends RealtimeVoiceError {
  public details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ProviderError';
    this.details = details;
  }
}
