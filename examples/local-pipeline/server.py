import asyncio
import os

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.services.ollama.llm import OLLamaLLMService
from pipecat.services.whisper.stt import WhisperSTTService
from pipecat.services.piper.tts import PiperTTSService
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.transports.websocket.server import WebsocketServerTransport, WebsocketServerParams
from pipecat.processors.frameworks.rtvi import RTVIConfig, RTVIProcessor

PIPER_DOWNLOAD_DIR = os.path.expanduser("~/models/piper")


async def main():
    transport = WebsocketServerTransport(
        host="0.0.0.0",
        port=8765,
        params=WebsocketServerParams(
            audio_out_enabled=True,
            audio_in_enabled=True,
            add_wav_header=True,
            vad_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
            vad_audio_passthrough=True,
        ),
    )

    stt = WhisperSTTService(
        model="large-v3-turbo",
        device="cpu",
        compute_type="int8",
        language="sk",
    )

    llm = OLLamaLLMService(
        model="qwen3.5:4b",
        base_url="http://localhost:11434/v1",
    )

    tts = PiperTTSService(
        voice_id="sk_SK-lili-medium",
        download_dir=PIPER_DOWNLOAD_DIR,
    )

    rtvi = RTVIProcessor(config=RTVIConfig(config=[]))

    pipeline = Pipeline([
        transport.input(),
        stt,
        rtvi,
        llm,
        tts,
        transport.output(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(allow_interruptions=True),
    )

    @transport.event_handler("on_client_connected")
    async def on_client(transport, client):
        await task.queue_frames([])

    runner = PipelineRunner()
    await runner.run(task)


if __name__ == "__main__":
    asyncio.run(main())
