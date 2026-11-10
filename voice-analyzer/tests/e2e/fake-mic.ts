/**
 * Test-only deterministic fake microphone. `installFakeMic` is serialised with
 * `Function.prototype.toString` and injected via page.addInitScript, so it must be
 * self-contained (no imports, no closures over module scope).
 */
export function installFakeMic(): void {
  type Voice = { on(): void; off(): void; speechMode(v: boolean): void };
  type Mic = { opens: number; stops: number };
  const w = window as unknown as { __voice: Voice; __mic: Mic };
  w.__mic = { opens: 0, stops: 0 };
  let state: { ctx: AudioContext; gain: GainNode; dest: MediaStreamAudioDestinationNode } | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  function ensure() {
    if (state) return state;
    const ctx = new AudioContext();
    // 40 harmonics of 200 Hz reach 8 kHz, so every colour band of the result graphs gets some energy.
    const n = 40;
    const real = new Float32Array(n + 1);
    const imag = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) imag[k] = 1 / k;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    osc.frequency.value = 200;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    state = { ctx, gain, dest };
    return state;
  }
  const LEVEL = 0.5; // peak stays comfortably below clipping
  function setGain(v: number) {
    const s = ensure();
    const t = s.ctx.currentTime;
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setValueAtTime(s.gain.gain.value, t);
    // linear ramp reaches exactly 0 (an exponential approach would leave a non-silent tail)
    s.gain.gain.linearRampToValueAtTime(v, t + 0.005);
  }
  function stopTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
  w.__voice = {
    on() { stopTimer(); setGain(LEVEL); },
    off() { stopTimer(); setGain(0); },
    speechMode(v: boolean) {
      stopTimer();
      if (!v) { setGain(0); return; }
      let up = true;
      let last = performance.now();
      setGain(LEVEL);
      timer = setInterval(() => {
        const now = performance.now();
        if (up && now - last >= 300) { up = false; last = now; setGain(0); }
        else if (!up && now - last >= 80) { up = true; last = now; setGain(LEVEL); }
      }, 10);
    },
  };

  navigator.mediaDevices.getUserMedia = async () => {
    const s = ensure();
    await s.ctx.resume();
    // A clone per open: the app stops the track on release and reopens the mic for the next set.
    const stream = new MediaStream(s.dest.stream.getAudioTracks().map((t) => t.clone()));
    const track = stream.getAudioTracks()[0];
    w.__mic.opens++;
    const origStop = track.stop.bind(track);
    let stopped = false;
    track.stop = () => {
      if (!stopped) { stopped = true; w.__mic.stops++; }
      origStop();
    };
    const orig = track.getSettings.bind(track);
    track.getSettings = () => ({
      ...orig(), echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    });
    return stream;
  };
}

export const FAKE_MIC_SCRIPT = `(${installFakeMic.toString()})()`;

export const DENIED_MIC_SCRIPT = `navigator.mediaDevices.getUserMedia = () =>
  Promise.reject(new DOMException('x', 'NotAllowedError'));`;
