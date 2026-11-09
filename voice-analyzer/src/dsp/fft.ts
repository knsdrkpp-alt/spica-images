/** In-place radix-2 FFT. Length of both arrays must be a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n !== im.length) throw new Error('fft: re and im lengths differ');
  if (n < 1 || (n & (n - 1)) !== 0) throw new Error('fft: length must be a power of two');

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const half = len >> 1;
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(ang * k);
      const wi = Math.sin(ang * k);
      for (let i = k; i < n; i += len) {
        const j = i + half;
        const xr = re[j] * wr - im[j] * wi;
        const xi = re[j] * wi + im[j] * wr;
        re[j] = re[i] - xr;
        im[j] = im[i] - xi;
        re[i] += xr;
        im[i] += xi;
      }
    }
  }
}
