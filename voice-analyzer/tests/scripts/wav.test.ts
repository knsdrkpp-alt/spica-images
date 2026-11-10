import { describe, it, expect } from 'vitest';
import { parseWav, quantize16, writeWav } from '../../scripts/wav';

function makeWav(samples: number[], sampleRate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, s, true));
  return new Uint8Array(buf);
}

describe('parseWav', () => {
  it('reads 16-bit mono PCM', () => {
    const { samples, sampleRate } = parseWav(makeWav([0, 16384, -16384, 32767], 16000));
    expect(sampleRate).toBe(16000);
    expect(samples.length).toBe(4);
    expect(samples[1]).toBeCloseTo(0.5, 4);
    expect(samples[2]).toBeCloseTo(-0.5, 4);
  });
  it('rejects non-PCM16-mono', () => {
    const b = makeWav([0, 0], 16000);
    new DataView(b.buffer).setUint16(22, 2, true);
    expect(() => parseWav(b)).toThrow();
  });
});

describe('writeWav', () => {
  it('round-trips through parseWav with 16-bit quantization', () => {
    const x = new Float32Array([0, 0.5, -0.5, 0.99999, -1, 1.5, -2, 0.25]);
    const bytes = writeWav(x, 48000);
    expect(bytes.length).toBe(44 + x.length * 2);
    const { samples, sampleRate } = parseWav(bytes);
    expect(sampleRate).toBe(48000);
    expect(Array.from(samples)).toEqual(Array.from(quantize16(x)));
    expect(samples[1]).toBe(0.5);
    expect(samples[5]).toBe(32767 / 32768); // clipped
    expect(samples[6]).toBe(-1);
  });
});
