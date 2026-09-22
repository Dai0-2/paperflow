const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function bytesToBase64(value: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < value.length; index += 0x8000) {
    binary += String.fromCharCode(...value.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToBase64Url(value: Uint8Array): string {
  return bytesToBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function encodeBase32(value: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let output = '';
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(value: string): Uint8Array {
  const normalized = value.toUpperCase().replace(/[\s-]/g, '');
  if (!normalized || /[^A-Z2-7]/.test(normalized)) throw new Error('Recovery key contains invalid characters.');
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  const decoded = Uint8Array.from(bytes);
  if (encodeBase32(decoded) !== normalized) throw new Error('Recovery key is not canonical.');
  return decoded;
}

export function groupRecoveryKey(value: string): string {
  return value.match(/.{1,4}/g)?.join('-') || value;
}
