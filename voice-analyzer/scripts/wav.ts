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
