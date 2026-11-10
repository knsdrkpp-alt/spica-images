// Runs in AudioWorkletGlobalScope. Posts a copy of each mono 128-frame block.
// Worklet globals are declared module-locally so they do not leak into app scope.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage(ch.slice());
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);

export {};
