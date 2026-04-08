# React Native OpenAI Example

```ts
import { RealtimeSession } from '@rtva/core';
import { createAppStateLifecycleAdapter, useRealtimeSession } from '@rtva/react-native';
import { createOpenAIBackend } from '@rtva/openai';

const backend = createOpenAIBackend({
  tokenUrl: 'https://your-api.example.com/openai/session',
  voice: 'alloy',
  session: {
    modalities: ['text', 'audio'],
    transcriptionModel: 'gpt-4o-transcribe',
  },
});

const session = new RealtimeSession({
  backend,
  lifecycle: createAppStateLifecycleAdapter(),
  initialUserText: 'Say hello',
});

export function VoiceScreen() {
  const voice = useRealtimeSession(session);

  return null;
}
```
