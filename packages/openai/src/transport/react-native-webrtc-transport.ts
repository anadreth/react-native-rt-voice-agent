import { ConnectionError, type LoggerInterface } from '@rtva/core';
import { MediaStream, RTCPeerConnection, mediaDevices } from 'react-native-webrtc';
import type { RTCIceServer } from '../types';
import { VolumeMonitor } from './volume-monitor';

interface DataChannelLike {
  readyState: string;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
}

export interface ReactNativeWebRTCTransportConnectParams {
  endpoint: string;
  token: string;
  iceServers: RTCIceServer[];
  signal: AbortSignal;
  sessionMessages: unknown[];
  onMessage(raw: unknown): void;
  onConnectionLost(): void;
  onVolume(level: number): void;
}

export class ReactNativeWebRTCTransport {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: DataChannelLike | null = null;
  private audioStream: MediaStream | null = null;
  private volumeMonitor: VolumeMonitor | null = null;

  constructor(private readonly logger: LoggerInterface) {}

  async connect(params: ReactNativeWebRTCTransportConnectParams): Promise<void> {
    const abort = () => {
      void this.close();
    };
    params.signal.addEventListener('abort', abort);

    try {
      this.audioStream = await mediaDevices.getUserMedia({ audio: true });

      const pc = new RTCPeerConnection({ iceServers: params.iceServers } as any);
      this.peerConnection = pc;
      this.setupPeerConnection(pc, params);
      this.audioStream.getTracks().forEach((track) => pc.addTrack(track, this.audioStream!));

      const dataChannel = pc.createDataChannel('response') as unknown as DataChannelLike;
      this.dataChannel = dataChannel;

      await new Promise<void>(async (resolve, reject) => {
        dataChannel.onopen = () => {
          try {
            for (const message of params.sessionMessages) {
              dataChannel.send(JSON.stringify(message));
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        };

        dataChannel.onerror = (error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        dataChannel.onmessage = (event) => {
          params.onMessage(JSON.parse(event.data));
        };

        try {
          await this.performOfferAnswer(pc, params.endpoint, params.token, params.signal);
        } catch (error) {
          reject(error);
        }
      });

      this.volumeMonitor = new VolumeMonitor(params.onVolume, this.logger);
      this.volumeMonitor.start(pc as any);
    } catch (error) {
      await this.close();
      if (error instanceof Error) {
        throw new ConnectionError(error.message);
      }
      throw new ConnectionError('Failed to establish WebRTC session');
    } finally {
      params.signal.removeEventListener('abort', abort);
    }
  }

  isReady(): boolean {
    return this.dataChannel?.readyState === 'open';
  }

  sendRaw(message: unknown): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new ConnectionError('WebRTC data channel is not open');
    }

    this.dataChannel.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    this.volumeMonitor?.stop();
    this.volumeMonitor = null;

    this.dataChannel?.close();
    this.dataChannel = null;

    this.peerConnection?.close();
    this.peerConnection = null;

    this.audioStream?.getTracks().forEach((track) => track.stop());
    this.audioStream = null;
  }

  private setupPeerConnection(
    pc: RTCPeerConnection,
    params: ReactNativeWebRTCTransportConnectParams,
  ): void {
    pc.addEventListener('iceconnectionstatechange' as any, () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        params.onConnectionLost();
      }
    });
  }

  private async performOfferAnswer(
    pc: RTCPeerConnection,
    endpoint: string,
    token: string,
    signal: AbortSignal,
  ): Promise<void> {
    const offer = await pc.createOffer({ offerToReceiveAudio: true } as any);
    await pc.setLocalDescription(offer);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
      signal,
    });

    if (!response.ok) {
      throw new ConnectionError(`Server rejected WebRTC offer: ${response.status} ${response.statusText}`);
    }

    const answer = await response.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answer } as any);
  }
}
