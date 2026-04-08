# RTVA Workspace

Backend-agnostic realtime voice SDK workspace for React Native and future adapters.

## Packages

- `@rtva/core`: pure session engine, state, tools, retries, and backend contracts
- `@rtva/react-native`: React Native hook and AppState lifecycle adapter
- `@rtva/openai`: OpenAI backend built on top of `@rtva/core`
- `@rtva/local-pipeline-experimental`: experimental Pipecat/local WebSocket backend

## Architecture

The core package owns only generic session behavior:

- session lifecycle
- reconnect policy
- conversation state
- tool execution
- event model
- lifecycle contracts
- backend contracts

Backends translate wire protocols into generic `BackendSignal` values and generic `SessionCommand` values back into provider-specific messages.

## Usage

```ts
import { RealtimeSession } from '@rtva/core';
import { createAppStateLifecycleAdapter, useRealtimeSession } from '@rtva/react-native';
import { createOpenAIBackend } from '@rtva/openai';

const backend = createOpenAIBackend({
  tokenUrl: 'https://your-api.example.com/openai/session',
  voice: 'alloy',
});

const session = new RealtimeSession({
  backend,
  lifecycle: createAppStateLifecycleAdapter(),
  tools: [
    {
      name: 'saveNote',
      description: 'Persist a note',
      handler: async ({ text }) => ({ ok: true, text }),
    },
  ],
});

function VoiceScreen() {
  const voice = useRealtimeSession(session);
  return null;
}
```

## Workspace Scripts

```bash
npm run build
npm run typecheck
npm run test
```

## Examples

- [OpenAI React Native example](./examples/react-native-openai/README.md)
- [Local pipeline experimental example](./examples/react-native-local-pipeline/README.md)

## Status

- Stable beta path: `@rtva/core` + `@rtva/react-native` + `@rtva/openai`
- Experimental path: `@rtva/local-pipeline-experimental`
