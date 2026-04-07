# react-native-rt-voice-agent

A production-ready React Native SDK for building real-time voice agents with WebRTC. Ships with an OpenAI Realtime provider out of the box, with a clean provider abstraction for future backends.

## Features

- **WebRTC-based** -- real-time bidirectional audio via `RTCPeerConnection`
- **Streaming UX** -- ephemeral messages, partial transcripts, assistant deltas
- **Tool/function calling** -- full round-trip with dynamic function registry
- **State machine** -- explicit session states (`idle` -> `connected` -> `stopped`)
- **Event-driven** -- typed events instead of raw state arrays
- **Provider abstraction** -- start with OpenAI, extend to any backend
- **Auto-reconnection** -- exponential backoff with configurable attempts
- **App lifecycle** -- auto-pause on background, auto-resume on foreground
- **Volume monitoring** -- real-time mic level for UI indicators
- **Framework-agnostic core** -- use the React hook or the core `RealtimeSession` class directly

## Installation

```bash
npm install react-native-rt-voice-agent react-native-webrtc
```

For Expo, follow the [react-native-webrtc Expo setup guide](https://github.com/nickolosproject/react-native-webrtc).

## Quick Start

### Minimal (React Hook)

```tsx
import { useRealtimeVoice, openAIProvider } from 'react-native-rt-voice-agent';

function VoiceScreen() {
  const { state, messages, currentVolume, start, stop } = useRealtimeVoice({
    voice: 'alloy',
    provider: openAIProvider({
      tokenUrl: 'https://your-backend.com/api/openai-session',
    }),
    onEvent: (event) => {
      if (event.type === 'error') console.error(event.error);
    },
  });

  return (
    <View>
      <Text>Status: {state}</Text>
      <Text>Volume: {Math.round(currentVolume * 100)}%</Text>
      {messages.map((msg) => (
        <Text key={msg.id}>{msg.role}: {msg.text}</Text>
      ))}
      <Button
        title={state === 'connected' ? 'Stop' : 'Start'}
        onPress={state === 'connected' ? stop : start}
      />
    </View>
  );
}
```

### With Tools

```tsx
const { state, messages, start, stop } = useRealtimeVoice({
  voice: 'ash',
  provider: openAIProvider({
    tokenUrl: 'https://your-backend.com/api/openai-session',
  }),
  tools: [
    {
      name: 'saveNote',
      description: 'Saves a note to the database',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The note text' },
        },
        required: ['text'],
      },
      handler: async (args) => {
        await db.notes.create({ text: args.text as string });
        return { ok: true };
      },
    },
  ],
  onEvent: (event) => {
    switch (event.type) {
      case 'user.transcript.final':
        console.log('User said:', event.text);
        break;
      case 'assistant.done':
        console.log('Assistant:', event.text);
        break;
      case 'tool.called':
        console.log(`Tool ${event.name} called with`, event.args);
        break;
    }
  },
});
```

### Core-Only (No React)

```ts
import { RealtimeSession, openAIProvider } from 'react-native-rt-voice-agent';

const session = new RealtimeSession({
  voice: 'alloy',
  provider: openAIProvider({ tokenUrl: 'https://your-backend.com/token' }),
  onEvent: (event) => {
    switch (event.type) {
      case 'state.changed':
        console.log(`${event.previousState} -> ${event.state}`);
        break;
      case 'assistant.done':
        console.log('Assistant:', event.text);
        break;
    }
  },
});

await session.start();
session.sendText('Hello, how are you?');
// later...
session.stop();
session.destroy();
```

## API Reference

### `useRealtimeVoice(config)`

React hook that returns:

| Property | Type | Description |
|---|---|---|
| `state` | `SessionState` | Current session state |
| `messages` | `ConversationMessage[]` | Live conversation messages |
| `currentVolume` | `number` | Mic volume level (0-1) for UI indicators |
| `start()` | `() => Promise<void>` | Start the voice session |
| `stop()` | `() => void` | Stop the voice session |
| `sendText(text)` | `(text: string) => void` | Send a text message |
| `cancelResponse()` | `() => void` | Cancel current assistant response |
| `toggleSession()` | `() => void` | Toggle start/stop |

### `RealtimeSessionConfig`

| Option | Type | Default | Description |
|---|---|---|---|
| `provider` | `RealtimeProvider` | **required** | Provider instance (e.g., `openAIProvider(...)`) |
| `voice` | `string` | `'alloy'` | Voice ID |
| `tools` | `ToolDefinition[]` | `[]` | Tool definitions with handlers |
| `onEvent` | `(event) => void` | -- | Event callback |
| `initialMessage` | `string` | -- | Text sent when session starts (triggers response) |
| `sessionConfig.modalities` | `('text'\|'audio')[]` | `['text','audio']` | Modalities |
| `sessionConfig.transcriptionModel` | `string` | `'gpt-4o-transcribe'` | Transcription model |
| `sessionConfig.maxResponseTokens` | `number` | -- | Max response tokens |
| `audio.constraints` | `object` | `true` | MediaStream audio constraints |
| `timeout` | `number` | `15000` | Network request timeout (ms) |
| `maxMessages` | `number` | `200` | Max messages in memory (oldest pruned) |
| `autoReconnect` | `boolean` | `true` | Auto-reconnect on connection loss |
| `maxReconnectAttempts` | `number` | `3` | Max reconnection attempts |
| `logger` | `LoggerInterface` | console | Custom logger |

### Session States

```
idle -> requesting_mic -> authenticating -> connecting -> connected
                                                       \-> reconnecting -> idle (retry)
                                                       \-> error
                                                       \-> stopped -> idle (restart)
```

### Events

| Event | Fields | Description |
|---|---|---|
| `state.changed` | `state`, `previousState` | Session state transition |
| `user.speech.started` | -- | User started speaking |
| `user.speech.stopped` | -- | User stopped speaking |
| `user.transcript.partial` | `text`, `messageId` | Partial speech-to-text |
| `user.transcript.final` | `text`, `messageId` | Final transcript |
| `assistant.delta` | `text`, `messageId` | Streaming assistant text |
| `assistant.done` | `text`, `messageId` | Complete assistant response |
| `tool.called` | `name`, `args`, `callId` | Tool invocation started |
| `tool.result` | `name`, `result`, `callId` | Tool execution result |
| `conversation.updated` | `messages` | Messages array changed |
| `volume.changed` | `level` | Mic volume level (0-1) |
| `error` | `error`, `fatal` | Error occurred |
| `raw` | `data` | Raw provider message |

### `openAIProvider(config)`

| Option | Type | Default | Description |
|---|---|---|---|
| `tokenUrl` | `string` | **required** | Your backend URL for token exchange |
| `iceConfigUrl` | `string` | -- | ICE server config URL (falls back to Google STUN) |
| `model` | `string` | `'gpt-4o-realtime-preview'` | OpenAI model ID |
| `tokenExtractor` | `(json) => string` | auto-detect | Custom token extraction |
| `tokenBody` | `object` | -- | Extra fields for token request body |
| `timeout` | `number` | `15000` | Network request timeout (ms) |

## Behavior

### Reconnection
When the WebRTC connection drops, the library automatically reconnects with exponential backoff (1s, 2s, 4s... up to 10s). After `maxReconnectAttempts` failures, it transitions to `error` and emits a fatal error event. Disable with `autoReconnect: false`.

### App Lifecycle
On iOS/Android, backgrounding the app kills the audio session. The library automatically:
- Stops the connection when the app goes to background
- Restarts the session when the app returns to foreground (if it was connected)

### Interrupts
When the user starts speaking while the assistant is responding, the library:
- Finalizes the current (partial) assistant message
- Sends `response.cancel` to stop the assistant
- Creates a new ephemeral user message

### Text-Only Mode
Set `sessionConfig.modalities: ['text']` to use text-only mode. The library handles both `response.audio_transcript.delta` and `response.text.delta` events.

## Backend Requirements

Your backend needs a token endpoint that:
1. Receives `POST { voice: string, ...extras }`
2. Creates an OpenAI ephemeral session
3. Returns `{ data: { client_secret: { value: "..." } } }` (or use `tokenExtractor` for custom formats)

## Architecture

```
+--------------------------------------------------+
|  Your App                                         |
|   useRealtimeVoice() or RealtimeSession           |
+--------------------------------------------------+
|  react-native-rt-voice-agent                      |
|   +----------------+ +---------------+ +--------+ |
|   | Connection     | | Message       | | Tool   | |
|   | Manager        | | Router        | | Regist.| |
|   | (WebRTC)       | | (events)      | |        | |
|   +-------+--------+ +-------+-------+ +--------+ |
|           |                   |                    |
|   +-------+-------------------+-------+            |
|   | Provider (e.g., openAIProvider)   |            |
|   | - getToken()                      |            |
|   | - getIceServers()                 |            |
|   | - mapMessage()                    |            |
|   +-----------------------------------+            |
+--------------------------------------------------+
```

## Custom Provider

Implement the `RealtimeProvider` interface to support other backends:

```ts
import type { RealtimeProvider } from 'react-native-rt-voice-agent';

const myProvider: RealtimeProvider = {
  async getToken(config) { /* ... */ },
  async getIceServers() { /* ... */ },
  getRealtimeEndpoint(voice) { /* ... */ },
  mapMessage(raw) { /* normalize to NormalizedMessage */ },
  buildSessionUpdate(config) { /* session config payload */ },
};
```

## Known Limitations

- **No Web Audio API** -- volume monitoring uses `RTCPeerConnection.getStats()` polling, which may not report `audioLevel` on all react-native-webrtc versions
- **Single session** -- the hook creates one session per mount; unmount and remount to change provider/voice
- **No offline support** -- requires active network connection

## License

MIT
