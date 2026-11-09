import workletUrl from './recorder-worklet.ts?worker&url';

export type MicError = 'denied' | 'no-device' | 'insecure-context' | 'unsupported';

const PRE_ROLL_SECONDS = 0.5;

type LevelCallback = (rms: number, wave: Float32Array) => void;

function concat(chunks: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export class Recorder {
  readonly sampleRate: number;
  readonly processingOn: boolean;
  onInterrupted: (() => void) | null = null;

  private readonly preRollTarget: number;
  private recording = false;
  private interrupted = false;
  private released = false;
  private onLevel: LevelCallback | null = null;
  private preChunks: Float32Array[] = [];
  private preLen = 0;
  private sampChunks: Float32Array[] = [];
  private sampLen = 0;
  private preRollWaiter: (() => void) | null = null;

  private constructor(
    private readonly ctx: AudioContext,
    private readonly stream: MediaStream,
    private readonly nodes: AudioNode[],
    processingOn: boolean,
  ) {
    this.sampleRate = ctx.sampleRate;
    this.processingOn = processingOn;
    this.preRollTarget = Math.round(PRE_ROLL_SECONDS * ctx.sampleRate);
    ctx.addEventListener('statechange', this.onStateChange);
    for (const t of stream.getTracks()) {
      t.addEventListener('ended', this.onTrackLost);
      t.addEventListener('mute', this.onTrackLost);
    }
  }

  static async open(): Promise<Recorder | { error: MicError }> {
    if (!window.isSecureContext) return { error: 'insecure-context' };
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !Ctor) return { error: 'unsupported' };

    let stream: MediaStream;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: { ideal: false },
            noiseSuppression: { ideal: false },
            autoGainControl: { ideal: false },
          },
        });
      } catch (e) {
        if ((e as Error)?.name !== 'OverconstrainedError') throw e;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (e) {
      switch ((e as Error)?.name) {
        case 'NotAllowedError':
        case 'SecurityError':
        case 'PermissionDeniedError':
          return { error: 'denied' };
        case 'NotFoundError':
        case 'DevicesNotFoundError':
          return { error: 'no-device' };
        default:
          return { error: 'unsupported' };
      }
    }

    const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      stopTracks();
      return { error: 'unsupported' };
    }
    void ctx.resume?.()?.catch(() => {});

    const track = stream.getAudioTracks?.()[0] ?? stream.getTracks()[0];
    const s = track?.getSettings?.() ?? {};
    const processingOn =
      s.echoCancellation === true || s.noiseSuppression === true || s.autoGainControl === true;

    const source = ctx.createMediaStreamSource(stream);
    const sink = ctx.createGain();
    sink.gain.value = 0; // keep the graph pulled without audible output
    sink.connect(ctx.destination);
    const nodes: AudioNode[] = [source, sink];

    let recorder: Recorder | null = null;
    const feed = (b: Float32Array) => recorder?.handleBlock(b);
    try {
      if (ctx.audioWorklet) {
        await ctx.audioWorklet.addModule(workletUrl);
        const node = new AudioWorkletNode(ctx, 'recorder-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          channelCountMode: 'explicit',
        });
        node.port.onmessage = (e: MessageEvent<Float32Array>) => feed(e.data);
        source.connect(node);
        node.connect(sink);
        nodes.push(node);
      } else {
        // Fallback only: ScriptProcessorNode is deprecated.
        const node = ctx.createScriptProcessor(2048, 1, 1);
        node.onaudioprocess = (e) => feed(e.inputBuffer.getChannelData(0).slice());
        source.connect(node);
        node.connect(sink);
        nodes.push(node);
      }
    } catch {
      nodes.forEach((n) => n.disconnect());
      stopTracks();
      void ctx.close().catch(() => {});
      return { error: 'unsupported' };
    }

    recorder = new Recorder(ctx, stream, nodes, processingOn);
    return recorder;
  }

  async start(onLevel: LevelCallback): Promise<void> {
    if (this.released) return;
    this.resetBuffers();
    this.interrupted = false;
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* state check below */
      }
    }
    this.onLevel = onLevel;
    this.recording = true;
    if (this.preRollTarget <= 0) return;
    await new Promise<void>((resolve) => {
      this.preRollWaiter = resolve;
    });
  }

  async stop(): Promise<{ samples: Float32Array; preRoll: Float32Array }> {
    this.recording = false;
    this.onLevel = null;
    this.flushWaiter();
    const out = this.interrupted
      ? { samples: new Float32Array(0), preRoll: new Float32Array(0) }
      : { samples: concat(this.sampChunks, this.sampLen), preRoll: concat(this.preChunks, this.preLen) };
    this.resetBuffers();
    this.interrupted = false;
    return out;
  }

  /** Clears collected audio and cancels any recording; the mic stays open. */
  discard(): void {
    this.recording = false;
    this.onLevel = null;
    this.interrupted = false;
    this.resetBuffers();
    this.flushWaiter();
  }

  /** Stops the mic and closes the audio context. Idempotent. */
  release(): void {
    if (this.released) return;
    this.released = true;
    this.discard();
    this.ctx.removeEventListener('statechange', this.onStateChange);
    for (const t of this.stream.getTracks()) {
      t.removeEventListener('ended', this.onTrackLost);
      t.removeEventListener('mute', this.onTrackLost);
      t.stop();
    }
    this.nodes.forEach((n) => n.disconnect());
    void this.ctx.close().catch(() => {});
  }

  private handleBlock(block: Float32Array): void {
    if (!this.recording) return;
    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const rms = block.length ? Math.sqrt(sum / block.length) : 0;

    const need = this.preRollTarget - this.preLen;
    if (need > 0) {
      const head = block.subarray(0, Math.min(need, block.length));
      this.preChunks.push(head.slice());
      this.preLen += head.length;
      if (head.length < block.length) {
        const tail = block.slice(head.length);
        this.sampChunks.push(tail);
        this.sampLen += tail.length;
      }
    } else {
      this.sampChunks.push(block.slice());
      this.sampLen += block.length;
    }
    this.onLevel?.(rms, block.slice());
    if (this.preLen >= this.preRollTarget) this.flushWaiter();
  }

  private readonly onStateChange = (): void => {
    if (this.ctx.state === 'interrupted' || this.ctx.state === 'suspended') this.interrupt();
  };

  private readonly onTrackLost = (): void => this.interrupt();

  private interrupt(): void {
    if (!this.recording) return;
    this.recording = false;
    this.onLevel = null;
    this.interrupted = true;
    this.resetBuffers();
    this.flushWaiter();
    this.onInterrupted?.();
  }

  private resetBuffers(): void {
    this.preChunks = [];
    this.preLen = 0;
    this.sampChunks = [];
    this.sampLen = 0;
  }

  private flushWaiter(): void {
    const w = this.preRollWaiter;
    this.preRollWaiter = null;
    w?.();
  }
}
