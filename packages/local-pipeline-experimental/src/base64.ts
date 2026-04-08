function getAtob() {
  return (globalThis as { atob?: (value: string) => string }).atob;
}

function getBtoa() {
  return (globalThis as { btoa?: (value: string) => string }).btoa;
}

export function decodeBase64(base64Data: string): Uint8Array {
  const atob = getAtob();
  if (!atob) {
    throw new Error('atob is not available in this runtime');
  }

  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  const btoa = getBtoa();
  if (!btoa) {
    throw new Error('btoa is not available in this runtime');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
