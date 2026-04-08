export class RTCPeerConnection {
  iceConnectionState = 'new';
  connectionState = 'new';
  addEventListener = vi.fn();
  addTrack = vi.fn();
  createDataChannel = vi.fn(() => ({
    readyState: 'open',
    send: vi.fn(),
    close: vi.fn(),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  }));
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'mock-sdp' }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {});
  close = vi.fn();
  getStats = vi.fn(async () => new Map());
}

export class MediaStream {
  getTracks = vi.fn(() => [{ id: 'mock-track', stop: vi.fn() }]);
}

export const mediaDevices = {
  getUserMedia: vi.fn(async () => new MediaStream()),
};
