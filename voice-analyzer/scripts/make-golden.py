#!/usr/bin/env python3
"""Compute Praat reference values (via Parselmouth) for every WAV in a directory.

    pip install praat-parselmouth
    npx tsx scripts/make-synthetic-wavs.ts            # SYNTHETIC voices -> tests/golden/wav
    python3 scripts/make-golden.py tests/golden/wav tests/golden/golden.json

Per WAV:
  f0MedianHz  median F0 of voiced frames, sound.to_pitch() (Praat default autocorrelation)
  hnrDb       To Harmonicity (cc) 0.01 s, 75 Hz, 0.1, 1.0 -> Get mean (voiced frames)
  cpps        To PowerCepstrogram 60 Hz, 0.002 s, 5000 Hz, 50 Hz ->
              Get CPPS: no trend subtraction before smoothing, 0.02 s, 0.0005 s,
              peak search 60-330 Hz, tolerance 0.05, Parabolic, trend 0.001-0.05 s,
              Straight, Robust
  cppsTrendToEnd  same, trend range 0.001-0 s (0 = up to the highest quefrency); informational

The current inputs are SYNTHETIC voices only ("synthetic": true). Real recordings are pending.
"""
import json
import statistics
import sys
from pathlib import Path

import parselmouth
from parselmouth.praat import call


def cpps(sound, trend_max):
    cep = call(sound, 'To PowerCepstrogram', 60, 0.002, 5000, 50)
    return call(cep, 'Get CPPS', False, 0.02, 0.0005, 60, 330, 0.05, 'Parabolic',
                0.001, trend_max, 'Straight', 'Robust')


def measure(path):
    sound = parselmouth.Sound(str(path))
    f0 = [v for v in sound.to_pitch().selected_array['frequency'] if v > 0]
    harm = call(sound, 'To Harmonicity (cc)', 0.01, 75, 0.1, 1.0)
    return {
        'f0MedianHz': float(statistics.median(f0)) if f0 else None,
        'hnrDb': float(call(harm, 'Get mean', 0, 0)),
        'cpps': float(cpps(sound, 0.05)),
        'cppsTrendToEnd': float(cpps(sound, 0)),
    }


def main():
    if len(sys.argv) != 3:
        sys.exit('usage: make-golden.py <wav-dir> <out.json>')
    wav_dir, out = Path(sys.argv[1]), Path(sys.argv[2])
    wavs = sorted(wav_dir.glob('*.wav')) if wav_dir.is_dir() else []
    if not wavs:
        print(f'no WAV files in {wav_dir}; nothing written. '
              'Run: npx tsx scripts/make-synthetic-wavs.ts')
        return
    cases = {}
    for w in wavs:
        cases[w.stem] = measure(w)
        c = cases[w.stem]
        print(f"{w.stem:24s} F0 {c['f0MedianHz']:8.2f}  HNR {c['hnrDb']:7.2f}  CPPS {c['cpps']:6.2f}")
    data = {
        'praat_version': parselmouth.PRAAT_VERSION,
        'parselmouth_version': parselmouth.__version__,
        'synthetic': True,
        'note': 'Synthetic harmonic voices only (tests/golden/cases.ts); no human recordings.',
        'cases': cases,
    }
    out.write_text(json.dumps(data, indent=2, sort_keys=True) + '\n')
    print(f'wrote {len(cases)} cases to {out}')


if __name__ == '__main__':
    main()
