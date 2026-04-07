// crypto.randomUUID() is available in Hermes (RN >= 0.72) and Node >= 19
declare const crypto: {
  randomUUID?: () => string;
} | undefined;

// Base64 encoding/decoding — available in Hermes and all modern JS engines
declare function atob(encoded: string): string;
declare function btoa(data: string): string;

// WebSocket event types for React Native
interface MessageEvent {
  data: string | ArrayBuffer;
}

interface CloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}
