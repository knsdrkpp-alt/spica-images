// Runs in AudioWorkletGlobalScope. Posts a copy of each mono 128-frame block.
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage(ch.slice());
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
