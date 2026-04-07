# Local Voice Pipeline Server

A fully local, free voice AI backend using Pipecat + Ollama + Whisper + Piper.
Connects to your React Native app via `localPipelineProvider`.

## Stack

| Component | Model | Role |
|-----------|-------|------|
| **STT** | Whisper large-v3-turbo | Speech → Text (99+ languages) |
| **LLM** | Qwen 3.5 4B via Ollama | Reasoning / conversation |
| **TTS** | Piper sk_SK-lili-medium | Text → Speech (Slovak) |
| **VAD** | Silero VAD | Voice activity detection |
| **Framework** | Pipecat | Orchestrates the pipeline |

## Prerequisites

- Python 3.10+
- [Ollama](https://ollama.com) installed and running

## Setup

### 1. Install Ollama & pull a model

```bash
# macOS
brew install ollama
ollama serve &
ollama pull qwen3.5:4b
```

### 2. Create virtualenv & install Python deps

```bash
cd examples/local-pipeline
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Download Piper voice model (Slovak)

```bash
mkdir -p ~/models/piper && cd ~/models/piper
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/sk/sk_SK/lili/medium/sk_SK-lili-medium.onnx
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/sk/sk_SK/lili/medium/sk_SK-lili-medium.onnx.json
```

For other languages, browse voices at:
https://huggingface.co/rhasspy/piper-voices/tree/main

### 4. Run the server

```bash
source venv/bin/activate
python server.py
```

Server listens on `ws://0.0.0.0:8765`.

## Connect from React Native

```tsx
import { useRealtimeVoice, localPipelineProvider } from 'react-native-rt-voice-agent';

const provider = localPipelineProvider({
  serverUrl: 'ws://YOUR_MAC_IP:8765/ws',
});

function VoiceChat() {
  const { state, messages, toggleSession } = useRealtimeVoice({ provider });

  return (
    <View>
      <Text>{state}</Text>
      <Button title="Talk" onPress={toggleSession} />
      {messages.map(m => <Text key={m.id}>{m.role}: {m.text}</Text>)}
    </View>
  );
}
```

Find your Mac's IP: `ifconfig | grep "inet " | grep -v 127`

## Customization

### Change the LLM

```bash
ollama pull llama3.2:3b          # Smaller, faster
ollama pull mixtral:8x7b         # Larger, smarter
```

Then update `model="..."` in `server.py`.

### Change the language

1. Update Whisper `language` param in `server.py` (e.g., `"en"`, `"de"`)
2. Download the matching Piper voice from https://huggingface.co/rhasspy/piper-voices
3. Update `voice_id` and `download_dir` in `server.py`

### Use GPU (NVIDIA)

Change `device="cpu"` to `device="cuda"` and `compute_type="float16"` in the Whisper config for ~3x faster transcription.

## Expected Performance (Apple Silicon)

| Component | Latency |
|-----------|---------|
| STT (Whisper turbo, CPU) | ~200-400ms |
| LLM (Qwen 3.5 4B, Ollama) | ~200ms first token |
| TTS (Piper, CPU) | ~200ms |
| **Total round-trip** | **~600ms - 1s** |
