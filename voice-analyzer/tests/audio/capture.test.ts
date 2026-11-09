import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Recorder } from '../../src/audio/capture';

type Listener = () => void;

class MockTrack {
  stopped = 0;
  settings: Record<string, boolean> = {};
  listeners: Record<string, Listener[]> = {};
  getSettings() {
    return this.settings;
  }
  stop() {
    this.stopped++;
  }
  addEventListener(type: string, fn: Listener) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  emit(type: string) {
    (this.listeners[type] ?? []).slice().forEach((f) => f());
  }
}

class MockNode {
  connected: unknown[] = [];
  disconnected = 0;
  gain = { value: 1 };
  connect(n: unknown) {
    this.connected.push(n);
    return n;
  }
  disconnect() {
    this.disconnected++;
  }
}

let ctxs: MockCtx[] = [];
let workletNodes: MockWorkletNode[] = [];
let sampleRateToUse = 48000;
let withWorklet = true;

class MockWorkletNode extends MockNode {
  port: { onmessage: ((e: { data: Float32Array }) => void) | null } = { onmessage: null };
  constructor(
    public ctx: unknown,
    public name: string,
  ) {
    super();
    workletNodes.push(this);
  }
  feed(block: Float32Array) {
    this.port.onmessage?.({ data: block });
  }
}

class MockCtx {
  sampleRate = sampleRateToUse;
  state = 'running';
  closed = 0;
  destination = {};
  listeners: Listener[] = [];
  audioWorklet = withWorklet ? { addModule: vi.fn(async () => {}) } : undefined;
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  constructor() {
    ctxs.push(this);
  }
  async close() {
    this.closed++;
    this.state = 'closed';
  }
  addEventListener(type: string, fn: Listener) {
    if (type === 'statechange') this.listeners.push(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    if (type === 'statechange') this.listeners = this.listeners.filter((f) => f !== fn);
  }
  setState(s: string) {
    this.state = s;
    this.listeners.slice().forEach((f) => f());
  }
  createMediaStreamSource() {
    return new MockNode();
  }
  createGain() {
    return new MockNode();
  }
  createScriptProcessor = vi.fn((..._a: number[]) => {
    const n = new MockNode() as MockNode & { onaudioprocess: ((e: unknown) => void) | null };
    n.onaudioprocess = null;
    this.sp = n;
    return n;
  });
  sp: (MockNode & { onaudioprocess: ((e: unknown) => void) | null }) | null = null;
}

let track: MockTrack;
let getUserMedia: ReturnType<typeof vi.fn>;

function err(name: string) {
  const e = new Error(name);
  e.name = name;
  return e;
}

function setSecure(v: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value: v, configurable: true });
}

function setMediaDevices(v: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', { value: v, configurable: true });
}

beforeEach(() => {
  ctxs = [];
  workletNodes = [];
  sampleRateToUse = 48000;
  withWorklet = true;
  track = new MockTrack();
  getUserMedia = vi.fn(async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }));
  setSecure(true);
  setMediaDevices({ getUserMedia });
  vi.stubGlobal('AudioContext', MockCtx);
  vi.stubGlobal('AudioWorkletNode', MockWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openOk(opts?: { watchdogMs?: number }): Promise<Recorder> {
  const r = await Recorder.open(opts);
  if ('error' in r) throw new Error('open failed: ' + r.error);
  return r;
}

function block(n: number, start: number): Float32Array {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = ((start + i) % 1000) / 2000;
  return b;
}

/** Feed `total` samples as 128-frame blocks; returns the concatenation fed. */
function feed(total: number, offset = 0): Float32Array {
  const node = workletNodes[workletNodes.length - 1];
  const all = new Float32Array(total);
  for (let i = 0; i < total; i += 128) {
    const n = Math.min(128, total - i);
    const b = block(n, offset + i);
    all.set(b, i);
    node.feed(b);
  }
  return all;
}

describe('Recorder.open errors', () => {
  it('maps NotAllowedError to denied', async () => {
    getUserMedia.mockRejectedValue(err('NotAllowedError'));
    expect(await Recorder.open()).toEqual({ error: 'denied' });
  });
  it('maps NotFoundError to no-device', async () => {
    getUserMedia.mockRejectedValue(err('NotFoundError'));
    expect(await Recorder.open()).toEqual({ error: 'no-device' });
  });
  it('maps unknown errors to unsupported', async () => {
    getUserMedia.mockRejectedValue(err('AbortError'));
    expect(await Recorder.open()).toEqual({ error: 'unsupported' });
  });
  it('reports insecure-context without calling getUserMedia', async () => {
    setSecure(false);
    expect(await Recorder.open()).toEqual({ error: 'insecure-context' });
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it('reports unsupported when mediaDevices is missing', async () => {
    setMediaDevices(undefined);
    expect(await Recorder.open()).toEqual({ error: 'unsupported' });
  });
  it('reports unsupported when AudioContext is missing', async () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(await Recorder.open()).toEqual({ error: 'unsupported' });
  });
});

describe('Recorder.open constraints', () => {
  it('requests processing off with ideal:false', async () => {
    await openOk();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: { ideal: false },
        noiseSuppression: { ideal: false },
        autoGainControl: { ideal: false },
      },
    });
  });
  it('retries once with {audio:true} on OverconstrainedError', async () => {
    getUserMedia.mockRejectedValueOnce(err('OverconstrainedError'));
    const r = await Recorder.open();
    expect('error' in r).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0]).toEqual({ audio: true });
  });
  it('does not retry more than once', async () => {
    getUserMedia.mockRejectedValue(err('OverconstrainedError'));
    expect(await Recorder.open()).toEqual({ error: 'unsupported' });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
});

describe('processingOn and sampleRate', () => {
  it('is true when echoCancellation is reported on', async () => {
    track.settings = { echoCancellation: true, noiseSuppression: false, autoGainControl: false };
    expect((await openOk()).processingOn).toBe(true);
  });
  it('is false when all are off', async () => {
    track.settings = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    expect((await openOk()).processingOn).toBe(false);
  });
  it('exposes the measured context sampleRate and resumes the context', async () => {
    sampleRateToUse = 44100;
    const r = await openOk();
    expect(r.sampleRate).toBe(44100);
    expect(ctxs[0].resume).toHaveBeenCalled();
  });
});

describe('recording', () => {
  it('splits 0.5 s preRoll from samples and keeps order (48 kHz)', async () => {
    const r = await openOk();
    const levels: number[] = [];
    const p = r.start((rms) => levels.push(rms));
    const fed1 = feed(24000);
    await p; // resolves once preRoll is collected
    const fed2 = feed(48000, 24000);
    const out = await r.stop();
    expect(out.preRoll.length).toBe(24000);
    expect(out.samples.length).toBe(48000);
    expect(Array.from(out.preRoll)).toEqual(Array.from(fed1));
    expect(Array.from(out.samples)).toEqual(Array.from(fed2));
    expect(levels.length).toBe(Math.ceil(24000 / 128) + Math.ceil(48000 / 128));
    expect(levels[0]).toBeGreaterThanOrEqual(0);
    expect(levels[0]).toBeLessThanOrEqual(1);
  });

  it('splits a block that straddles the preRoll boundary', async () => {
    sampleRateToUse = 44100; // preRoll 22050, not a multiple of 128
    const r = await openOk();
    const p = r.start(() => {});
    const all = feed(22050 + 1000);
    await p;
    const out = await r.stop();
    expect(out.preRoll.length).toBe(22050);
    expect(out.samples.length).toBe(1000);
    expect(Array.from(out.preRoll)).toEqual(Array.from(all.subarray(0, 22050)));
    expect(Array.from(out.samples)).toEqual(Array.from(all.subarray(22050)));
  });

  it('passes a copy of each block to onLevel', async () => {
    const r = await openOk();
    const waves: Float32Array[] = [];
    r.start((_, w) => waves.push(w));
    const b = block(128, 0);
    workletNodes[0].feed(b);
    expect(waves[0]).not.toBe(b);
    expect(Array.from(waves[0])).toEqual(Array.from(b));
    await r.stop();
  });

  it('computes rms of a block', async () => {
    const r = await openOk();
    let got = -1;
    r.start((rms) => (got = rms));
    workletNodes[0].feed(new Float32Array(128).fill(0.5));
    expect(got).toBeCloseTo(0.5, 6);
    await r.stop();
  });

  it('stop before preRoll completes returns partial preRoll and empty samples', async () => {
    const r = await openOk();
    r.start(() => {});
    const fed = feed(1280);
    const out = await r.stop();
    expect(out.preRoll.length).toBe(1280);
    expect(out.samples.length).toBe(0);
    expect(Array.from(out.preRoll)).toEqual(Array.from(fed));
  });

  it('supports two consecutive cycles on one recorder without closing the mic', async () => {
    const r = await openOk();
    for (let cycle = 0; cycle < 2; cycle++) {
      const p = r.start(() => {});
      feed(24000);
      await p;
      const fed = feed(48000, 24000);
      const out = await r.stop();
      expect(out.preRoll.length).toBe(24000);
      expect(out.samples.length).toBe(48000);
      expect(Array.from(out.samples)).toEqual(Array.from(fed));
    }
    expect(ctxs[0].closed).toBe(0);
    expect(track.stopped).toBe(0);
  });

  it('ignores blocks outside a recording', async () => {
    const r = await openOk();
    feed(1280);
    r.start(() => {});
    const out = await r.stop();
    expect(out.preRoll.length).toBe(0);
  });

  it('falls back to ScriptProcessor (2048) and feeds the same pipeline', async () => {
    withWorklet = false;
    const r = await openOk();
    expect(workletNodes.length).toBe(0);
    expect(ctxs[0].createScriptProcessor).toHaveBeenCalledWith(2048, 1, 1);
    const p = r.start(() => {});
    const b1 = block(2048, 0);
    const ev = { inputBuffer: { getChannelData: () => b1 } };
    for (let i = 0; i < 12; i++) ctxs[0].sp!.onaudioprocess!(ev); // 24576 >= 24000
    await p;
    const out = await r.stop();
    expect(out.preRoll.length).toBe(24000);
    expect(out.samples.length).toBe(24576 - 24000);
    expect(out.preRoll[5]).toBe(b1[5]);
  });
});

describe('interruption', () => {
  it.each(['interrupted', 'suspended'])('state %s calls onInterrupted once and empties stop()', async (s) => {
    const r = await openOk();
    const spy = vi.fn();
    r.onInterrupted = spy;
    r.start(() => {});
    feed(2560);
    ctxs[0].setState(s);
    ctxs[0].setState(s);
    expect(spy).toHaveBeenCalledTimes(1);
    feed(256); // ignored after interruption
    const out = await r.stop();
    expect(out.samples.length).toBe(0);
    expect(out.preRoll.length).toBe(0);
  });

  it('track ended while recording interrupts', async () => {
    const r = await openOk();
    const spy = vi.fn();
    r.onInterrupted = spy;
    r.start(() => {});
    feed(256);
    track.emit('ended');
    expect(spy).toHaveBeenCalledTimes(1);
    const out = await r.stop();
    expect(out.preRoll.length).toBe(0);
  });

  it('does not fire when not recording', async () => {
    const r = await openOk();
    const spy = vi.fn();
    r.onInterrupted = spy;
    ctxs[0].setState('suspended');
    expect(spy).not.toHaveBeenCalled();
  });

  it('a later start() resumes the context and records normally', async () => {
    const r = await openOk();
    r.start(() => {});
    ctxs[0].setState('interrupted');
    await r.stop();
    ctxs[0].resume.mockClear();
    const p = r.start(() => {});
    await vi.waitFor(() => expect(ctxs[0].resume).toHaveBeenCalled());
    feed(24000);
    await p;
    const out = await r.stop();
    expect(out.preRoll.length).toBe(24000);
  });
});

describe('release and discard', () => {
  it('release stops tracks, closes the context, and is idempotent', async () => {
    const r = await openOk();
    r.release();
    r.release();
    expect(track.stopped).toBe(1);
    expect(ctxs[0].closed).toBe(1);
    expect(workletNodes[0].disconnected).toBeGreaterThan(0);
  });

  it('discard clears collected audio but leaves the mic open', async () => {
    const r = await openOk();
    r.start(() => {});
    feed(2560);
    r.discard();
    expect(track.stopped).toBe(0);
    expect(ctxs[0].closed).toBe(0);
    const out = await r.stop();
    expect(out.preRoll.length).toBe(0);
    expect(out.samples.length).toBe(0);
    // still usable
    const p = r.start(() => {});
    feed(24000);
    await p;
    expect((await r.stop()).preRoll.length).toBe(24000);
  });
});

describe('open edge cases', () => {
  it('Overconstrained retry followed by NotAllowedError is denied', async () => {
    getUserMedia.mockRejectedValueOnce(err('OverconstrainedError')).mockRejectedValueOnce(err('NotAllowedError'));
    expect(await Recorder.open()).toEqual({ error: 'denied' });
  });
  it('accepts webkitAudioContext', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', MockCtx);
    const r = await Recorder.open();
    expect('error' in r).toBe(false);
  });
  it('missing getSettings means processingOn false', async () => {
    (track as unknown as { getSettings?: unknown }).getSettings = undefined;
    expect((await openOk()).processingOn).toBe(false);
  });
  it('releases tracks and context if graph construction throws', async () => {
    const orig = MockCtx.prototype.createMediaStreamSource;
    MockCtx.prototype.createMediaStreamSource = () => {
      throw new Error('boom');
    };
    try {
      expect(await Recorder.open()).toEqual({ error: 'unsupported' });
    } finally {
      MockCtx.prototype.createMediaStreamSource = orig;
    }
    expect(track.stopped).toBe(1);
    expect(ctxs[0].closed).toBe(1);
  });
});

describe('after release', () => {
  it('removes statechange and track listeners', async () => {
    const r = await openOk();
    expect(ctxs[0].listeners.length).toBe(1);
    r.release();
    expect(ctxs[0].listeners.length).toBe(0);
    expect(track.listeners['ended']).toEqual([]);
    expect(track.listeners['mute']).toEqual([]);
  });
  it('start resolves immediately without arming; stop returns empty arrays', async () => {
    const r = await openOk();
    r.release();
    await r.start(() => {});
    feed(1280);
    const out = await r.stop();
    expect(out.preRoll.length).toBe(0);
    expect(out.samples.length).toBe(0);
  });
});

describe('start races and watchdog', () => {
  it('stop() during a pending resume is not overridden afterwards', async () => {
    const r = await openOk();
    ctxs[0].state = 'suspended';
    let finish!: () => void;
    ctxs[0].resume.mockImplementation(
      () =>
        new Promise<void>((res) => {
          finish = () => {
            ctxs[0].state = 'running';
            res();
          };
        }),
    );
    const p = r.start(() => {});
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const out = await r.stop();
    expect(out.preRoll.length).toBe(0);
    await p; // start() resolved by stop()
    finish();
    await new Promise((res) => setTimeout(res, 0));
    feed(1280); // must not be collected: recorder is not armed
    const out2 = await r.stop();
    expect(out2.preRoll.length).toBe(0);
  });

  it('a second start() while recording returns immediately and does not re-arm', async () => {
    const r = await openOk();
    const p1 = r.start(() => {});
    feed(1280);
    await r.start(() => {}); // resolves immediately
    feed(24000);
    await p1;
    const out = await r.stop();
    expect(out.preRoll.length).toBe(24000); // first recording's data was kept
    expect(out.samples.length).toBe(1280);
  });

  describe('watchdog (fake timers)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('resume never settling: onInterrupted once, start() resolves, stop() empty', async () => {
      const r = await openOk({ watchdogMs: 3000 });
      ctxs[0].state = 'suspended';
      ctxs[0].resume.mockImplementation(() => new Promise<void>(() => {}));
      const spy = vi.fn();
      r.onInterrupted = spy;
      let resolved = false;
      const p = r.start(() => {}).then(() => (resolved = true));
      await vi.advanceTimersByTimeAsync(2999);
      expect(resolved).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      await p;
      expect(spy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10000);
      expect(spy).toHaveBeenCalledTimes(1);
      const out = await r.stop();
      expect(out.preRoll.length + out.samples.length).toBe(0);
    });

    it('resume rejecting and no blocks: watchdog interrupts', async () => {
      const r = await openOk({ watchdogMs: 3000 });
      ctxs[0].state = 'suspended';
      ctxs[0].resume.mockImplementation(() => Promise.reject(new Error('x')));
      const spy = vi.fn();
      r.onInterrupted = spy;
      const p = r.start(() => {});
      await vi.advanceTimersByTimeAsync(3001);
      await p;
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('blocks mid-recording keep the watchdog quiet; silence for 3 s interrupts', async () => {
      const r = await openOk({ watchdogMs: 3000 });
      const spy = vi.fn();
      r.onInterrupted = spy;
      const p = r.start(() => {});
      feed(24000);
      await p;
      await vi.advanceTimersByTimeAsync(2000);
      feed(128);
      await vi.advanceTimersByTimeAsync(2000);
      expect(spy).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1100);
      expect(spy).toHaveBeenCalledTimes(1);
      const out = await r.stop();
      expect(out.samples.length).toBe(0);
    });

    it('stop() clears the watchdog', async () => {
      const r = await openOk({ watchdogMs: 3000 });
      const spy = vi.fn();
      r.onInterrupted = spy;
      r.start(() => {});
      feed(128);
      await r.stop();
      await vi.advanceTimersByTimeAsync(10000);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
