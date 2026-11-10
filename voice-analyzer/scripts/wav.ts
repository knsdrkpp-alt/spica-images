/** Minimal RIFF/WAVE reader: 16-bit PCM mono only. Returns samples in [-1, 1). */
export function parseWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let sampleRate = 0;
  let ok = false;
  let o = 12;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ') {
      const format = v.getUint16(body, true);
      const channels = v.getUint16(body + 2, true);
      const bits = v.getUint16(body + 14, true);
      if (format !== 1 || channels !== 1 || bits !== 16) throw new Error('only 16-bit PCM mono WAV is supported');
      sampleRate = v.getUint32(body + 4, true);
      ok = true;
    } else if (id === 'data') {
      if (!ok) throw new Error('data chunk before fmt chunk');
      const n = Math.floor(Math.min(size, bytes.length - body) / 2);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = v.getInt16(body + i * 2, true) / 32768;
      return { samples, sampleRate };
    }
    o = body + size + (size % 2);
  }
  throw new Error('no data chunk');
}

/** Int16 code for a sample in [-1, 1): round to nearest, clip to [-32768, 32767]. */
function toInt16(s: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(s * 32768)));
}

/** The values parseWav returns after writeWav: 16-bit quantized copy of `samples`. */
export function quantize16(samples: Float32Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = toInt16(samples[i]) / 32768;
  return out;
}

/** Minimal RIFF/WAVE writer: 16-bit PCM mono. */
export function writeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const tag = (o: number, s: string) => {
    for (let i = 0; i < 4; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  tag(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, toInt16(samples[i]), true);
  return bytes;
}
