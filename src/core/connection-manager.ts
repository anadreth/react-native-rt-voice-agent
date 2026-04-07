import {
  MediaStream,
  RTCPeerConnection,
  mediaDevices,
} from 'react-native-webrtc';
import type {
  RealtimeProvider,
  RealtimeSessionConfig,
  LoggerInterface,
} from './types';
import { ConnectionError, AuthError } from './errors';
import { createLogger } from './logger';

interface DataChannelLike {
  readyState: string;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
}

export interface ConnectionCallbacks {
  onStateTransition: (state: 'requesting_mic' | 'authenticating' | 'connecting' | 'connected' | 'error' | 'stopped') => void;
  onDataChannelMessage: (data: unknown) => void;
  onDataChannelOpen: () => void;
  onConnectionLost: () => void;
}

/**
 * Manages WebRTC peer connection, audio stream, and data channel.
 * Provider-injected — no hardcoded URLs or API assumptions.
 */
export class ConnectionManager {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: DataChannelLike | null = null;
  private audioStream: MediaStream | null = null;
  private provider: RealtimeProvider;
  private logger: LoggerInterface;
  private callbacks: ConnectionCallbacks;
  private config: RealtimeSessionConfig;

  constructor(
    config: RealtimeSessionConfig,
    callbacks: ConnectionCallbacks,
  ) {
    this.provider = config.provider;
    this.config = config;
    this.logger = createLogger(config.logger);
    this.callbacks = callbacks;
  }

  /**
   * Send a JSON message through the data channel.
   */
  sendMessage(message: unknown): void {
    if (!this.dataChannel) {
      this.logger.error('Cannot send message: Data channel not initialized');
      return;
    }
    if (this.dataChannel.readyState !== 'open') {
      this.logger.error(`Cannot send message: Channel not open (${this.dataChannel.readyState})`);
      return;
    }
    try {
      this.dataChannel.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error('Failed to send data channel message', error);
    }
  }

  /**
   * Full connection lifecycle: mic → token → peer connection → data channel → SDP exchange.
   */
  async start(): Promise<void> {
    // Step 1: Request microphone access
    this.callbacks.onStateTransition('requesting_mic');
    this.logger.info('Requesting microphone access');

    try {
      const constraints = this.config.audio?.constraints ?? true;
      const stream = await mediaDevices.getUserMedia({ audio: constraints });
      this.audioStream = stream;
      this.logger.info('Microphone access granted');
    } catch (micError) {
      throw new ConnectionError(
        `Microphone access denied: ${micError instanceof Error ? micError.message : 'Permission denied'}`
      );
    }

    // Step 2: Fetch authentication token
    this.callbacks.onStateTransition('authenticating');
    this.logger.info('Fetching session token');

    let token: string;
    try {
      token = await this.provider.getToken({
        voice: this.config.voice ?? 'alloy',
      });
      this.logger.info('Token retrieved');
    } catch (tokenError) {
      if (tokenError instanceof AuthError) throw tokenError;
      throw new AuthError('Failed to authenticate session');
    }

    // Step 3: Create peer connection
    this.callbacks.onStateTransition('connecting');
    this.logger.info('Creating RTCPeerConnection');

    const iceServers = await this.provider.getIceServers();
    const pc = new RTCPeerConnection({ iceServers } as any);
    this.peerConnection = pc;

    this.setupPeerConnectionHandlers(pc);
    this.addAudioTrack(pc);

    // Step 4: Set up data channel
    this.setupDataChannel(pc);

    // Step 5: SDP offer/answer exchange
    await this.performOfferAnswer(pc, token);

    this.logger.info('WebRTC session established');
  }

  /**
   * Stop session and clean up all resources.
   */
  stop(): void {
    this.logger.info('Stopping WebRTC session');

    try {
      if (this.dataChannel) {
        this.dataChannel.close();
        this.dataChannel = null;
      }
    } catch (e) {
      this.logger.error('Error closing data channel', e);
    }

    try {
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }
    } catch (e) {
      this.logger.error('Error closing peer connection', e);
    }

    try {
      if (this.audioStream) {
        this.audioStream.getTracks().forEach((track) => track.stop());
        this.audioStream = null;
      }
    } catch (e) {
      this.logger.error('Error stopping audio tracks', e);
    }

    this.logger.info('Session cleanup complete');
  }

  isDataChannelOpen(): boolean {
    return this.dataChannel?.readyState === 'open';
  }

  private setupPeerConnectionHandlers(pc: RTCPeerConnection): void {
    // react-native-webrtc uses addEventListener for these events
    pc.addEventListener('iceconnectionstatechange' as any, () => {
      this.logger.info(`ICE connection state: ${pc.iceConnectionState}`);
      if (
        pc.iceConnectionState === 'disconnected' ||
        pc.iceConnectionState === 'failed'
      ) {
        this.logger.error('WebRTC connection failed or disconnected');
        this.callbacks.onConnectionLost();
      }
    });

    pc.addEventListener('connectionstatechange' as any, () => {
      this.logger.info(`Connection state: ${(pc as any).connectionState}`);
    });
  }

  private addAudioTrack(pc: RTCPeerConnection): void {
    if (!this.audioStream) {
      throw new ConnectionError('Audio stream not available');
    }
    this.audioStream.getTracks().forEach((track) => {
      pc.addTrack(track, this.audioStream!);
    });
  }

  private setupDataChannel(pc: RTCPeerConnection): void {
    this.logger.info('Creating data channel');

    const dc = pc.createDataChannel('response') as unknown as DataChannelLike;
    this.dataChannel = dc;

    dc.onopen = () => {
      this.logger.info('Data channel opened, sending session config');
      try {
        // Send session.update from provider
        const sessionUpdate = this.provider.buildSessionUpdate(this.config);
        dc.send(JSON.stringify(sessionUpdate));

        // Send initial message if provided
        if (this.config.initialMessage) {
          dc.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: this.config.initialMessage }],
            },
          }));
        }

        this.callbacks.onDataChannelOpen();
        this.callbacks.onStateTransition('connected');
      } catch (err) {
        this.logger.error('Failed to send initial config', err);
      }
    };

    dc.onclose = () => {
      this.logger.info('Data channel closed');
    };

    dc.onerror = (error: unknown) => {
      this.logger.error('Data channel error', error);
    };

    dc.onmessage = (event: { data: string }) => {
      try {
        const parsed = JSON.parse(event.data);
        this.callbacks.onDataChannelMessage(parsed);
      } catch (err) {
        this.logger.error('Failed to parse data channel message', err);
      }
    };
  }

  private async performOfferAnswer(
    pc: RTCPeerConnection,
    token: string,
  ): Promise<void> {
    this.logger.info('Creating WebRTC offer');

    const offer = await pc.createOffer({ offerToReceiveAudio: true } as any);
    await pc.setLocalDescription(offer);

    const voice = this.config.voice ?? 'alloy';
    const endpoint = this.provider.getRealtimeEndpoint(voice);

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      this.logger.error(`SDP offer rejected: ${resp.status}`, errorText);
      throw new ConnectionError(
        `Server rejected WebRTC offer: ${resp.status} ${resp.statusText}`
      );
    }

    const answer = await resp.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answer } as any);
    this.logger.info('Remote description set');
  }
}
