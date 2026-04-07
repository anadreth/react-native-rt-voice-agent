# Changelog

## 0.1.0 (2026-04-07)

Initial release.

### Features

- WebRTC-based realtime voice session with explicit state machine
- Provider abstraction with OpenAI Realtime implementation
- Event-driven API: state changes, transcription, assistant streaming, tool calls, errors
- React hook (`useRealtimeVoice`) with volume monitoring
- Local tool execution with round-trip function calling
- Auto-reconnection with exponential backoff
- App lifecycle handling (background/foreground)
- Configurable timeouts, message pruning, and logging
- Text-only mode support (`response.text.delta` / `response.text.done`)
- Interrupt handling (cancels in-progress assistant response)
