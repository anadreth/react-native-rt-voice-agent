# react-native-rt-voice-agent

A production-ready React Native SDK for building real-time voice agents with WebRTC. Ships with an OpenAI Realtime provider out of the box, with a clean provider abstraction for future backends.

## Features

- **WebRTC-based** -- real-time bidirectional audio via `RTCPeerConnection`
- **Streaming UX** -- ephemeral messages, partial transcripts, assistant deltas
- **Tool/function calling** -- full round-trip with dynamic function registry
- **State machine** -- explicit session states (`idle` -> `connected` -> `stopped`)
- **Event-driven** -- typed events instead of raw state arrays
- **Provider abstraction** -- start with OpenAI, extend to any backend
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
  const { state, messages, start, stop } = useRealtimeVoice({
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
| `start()` | `() => Promise<void>` | Start the voice session |
| `stop()` | `() => void` | Stop the voice session |
| `sendText(text)` | `(text: string) => void` | Send a text message |
| `cancelResponse()` | `() => void` | Cancel current assistant response |
| `toggleSession()` | `() => void` | Toggle start/stop |

### `RealtimeSessionConfig`

| Option | Type | Required | Description |
|---|---|---|---|
| `provider` | `RealtimeProvider` | Yes | Provider instance (e.g., `openAIProvider(...)`) |
| `voice` | `string` | No | Voice ID (default: `'alloy'`) |
| `tools` | `ToolDefinition[]` | No | Tool definitions with handlers |
| `onEvent` | `(event: RealtimeEvent) => void` | No | Event callback |
| `initialMessage` | `string` | No | Text sent when session starts |
| `sessionConfig` | `object` | No | Modalities, transcription model, max tokens |
| `audio` | `object` | No | Audio constraints |
| `logger` | `LoggerInterface` | No | Custom logger |

### Session States

```
idle -> requesting_mic -> authenticating -> connecting -> connected -> stopped
                                                       \-> error -/
```

### Events

| Event | Description |
|---|---|
| `state.changed` | Session state transition |
| `user.speech.started` | User started speaking |
| `user.speech.stopped` | User stopped speaking |
| `user.transcript.partial` | Partial speech-to-text |
| `user.transcript.final` | Final transcript |
| `assistant.delta` | Streaming assistant text |
| `assistant.done` | Complete assistant response |
| `tool.called` | Tool invocation started |
| `tool.result` | Tool execution result |
| `conversation.updated` | Messages array changed |
| `error` | Error occurred |
| `raw` | Raw provider message |

### `openAIProvider(config)`

| Option | Type | Required | Description |
|---|---|---|---|
| `tokenUrl` | `string` | Yes | Your backend URL for token exchange |
| `iceConfigUrl` | `string` | No | ICE server config URL |
| `model` | `string` | No | Model ID (default: `'gpt-4o-realtime-preview'`) |
| `tokenExtractor` | `(json) => string` | No | Custom token extraction from response |
| `tokenBody` | `object` | No | Extra fields for token request body |

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

## License

MIT
