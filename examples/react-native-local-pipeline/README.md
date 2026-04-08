# React Native Local Pipeline Example

This path is experimental and intentionally lives outside the stable package set.

```ts
import { RealtimeSession } from '@rtva/core';
import { createAppStateLifecycleAdapter, useRealtimeSession } from '@rtva/react-native';
import { createLocalPipelineBackend } from '@rtva/local-pipeline-experimental';

const backend = createLocalPipelineBackend({
  serverUrl: 'ws://YOUR_HOST:8765/ws',
});

const session = new RealtimeSession({
  backend,
  lifecycle: createAppStateLifecycleAdapter(),
});

export function VoiceScreen() {
  const voice = useRealtimeSession(session);
  return null;
}
```
