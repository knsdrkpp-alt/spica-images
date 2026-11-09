# 声のタイプチェック Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブラウザ内だけで声を録音・解析し、「今日の声の傾向」(4タイプ+中間)を虹色グラフと練習提案つきで表示する静的Webアプリを作る。

**Architecture:** `dsp/`(信号処理、画面非依存)→ `diagnosis/`(品質ゲート、プロファイル、分類、文言)→ `ui/`(画面、SVGグラフ)の3層。録音は AudioWorklet で Float32 PCM を蓄積し、終了後にまとめて解析する。音声・特徴量・スコアはブラウザ外に出さない。

**Tech Stack:** TypeScript、Vite(フレームワークなし)、Vitest + jsdom、Playwright(Chromium 疑似マイク)、検証用に Python の Parselmouth(スクリプトのみ)。

**Spec:** `docs/superpowers/specs/2026-11-09-voice-analyzer-design.md`(根拠: `reports/声診断アプリ設計の根拠調査.md`)

## Global Constraints

- 置き場所は `voice-analyzer/`(リポジトリ `spica-images` 内、`jp/` には触れない)。
- 音声、特徴量、スコアを `fetch`、XHR、`sendBeacon`、WebSocket、外部スクリプトで送信しない。解析ツールやログに音声由来の値を載せない。
- 名称は「声のタイプチェック」(仮称)。結果画面の動的な文言に「診断」「検査」「スクリーニング」「異常」「正常」「リスク」「疑い」「悪化」「改善します」「高精度」を使わない。使ってよいのは、固定フッターと中止の案内に限る(Task 8 の許可文字列)。
- 12帯の境界(Hz): 100・144・208・299・431・621・895・1290・1859・2679・3860・5563・8000。低域の赤から高域の紫の順に虹色。帯の値は全帯域比の相対値のみ。
- 表示しない指標: ジッター、シマー、NHR、絶対SPL、CPP由来のF0、絶対バンド値。
- F0は声タイプの判定に使わない。母音と文は別々に集計する。F0の変動は半音で扱い、5〜95パーセンタイル範囲。
- 境界は性別別パーセンタイル、45〜55パーセンタイルを中間タイプ。性別は任意入力で、未入力なら全体分布。最大3セットの中央値で判定。
- サンプルレートは `AudioContext.sampleRate` の実測値を使う(最低16 kHz、48 kHz優先)。
- マイク設定は `echoCancellation`、`noiseSuppression`、`autoGainControl` を `ideal: false` で要求し、`track.getSettings()` で検証する。
- 品質ゲート値、段階目標、許容差、パーセンタイル表は出典のない暫定値。`config.ts` / `norms.json` に分離し、画面に「仮の基準」と明記する。
- 固定フッターの文言は設計書第5節のとおり(Task 8 で定数化)。
- 受診案内は測定値に連動させない。結果の良し悪しに赤や警告色を使わない。

## Review Focus

1. マイク許可の拒否、マイク無し、非HTTPS: 説明画面に理由と対処を出し、アプリが落ちない(Task 9、10)。
2. 母音か文のどちらかが無音・極小音量・F0検出不能: `NaN`を出さず、結果ではなく録り直しの案内にする(Task 5、6)。
3. 録音中に AudioContext が `interrupted` になる(iOS の画面オフ、電話): 録音を破棄して録り直しを案内する(Task 9)。
4. サンプルレートが 16000、44100、48000 のいずれでも、同じ信号から同等の特徴量が出る(Task 2、3)。
5. 3セットが食い違う、1セットのみ、性別未入力: 中央値と中間タイプが正しく出て、「参考(1回)」の表示が付く(Task 7、11)。

---

### Task 1: スキャフォールド、型、設定、テスト用の合成音

**Files:**
- Create: `voice-analyzer/package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`src/main.ts`
- Create: `voice-analyzer/src/types.ts`、`src/diagnosis/config.ts`
- Create: `voice-analyzer/tests/helpers/synth.ts`、`tests/config.test.ts`

**Interfaces:**
- Produces(`types.ts`):
  - `type Sex = 'female' | 'male' | 'unspecified'`
  - `interface PitchTrack { hopSeconds: number; f0: Array<number | null>; clarity: number[] }`(F0は Hz、無声は `null`)
  - `interface TaskFeatures { f0MedianHz: number | null; f0RangeSt: number | null; f0StabilitySt: number | null; cpps: number | null; hnrDb: number | null; h1h2Db: number | null; alphaRatioDb: number; centroidHz: number; bandShare: number[]; voicedSeconds: number }`(`bandShare` は長さ12で合計1)
  - `interface SentenceFeatures extends TaskFeatures { articulationRate: number; speakingRate: number }`(モーラ/秒)
  - `interface SetFeatures { vowel: TaskFeatures; sentence: SentenceFeatures; flags: { processingOn: boolean } }`
  - `type VoiceType = 'clear-bright' | 'soft-bright' | 'clear-calm' | 'soft-calm'`
  - `interface Profile { brightness: number; clarity: number }`(性別内パーセンタイル、0〜100)
- Produces(`config.ts`): `BAND_EDGES_HZ: number[]`(13個)、`BAND_COLORS: string[]`(12個、赤→紫)、`YIN_THRESHOLD = 0.12`、`F0_RANGE_HZ = [60, 500]`、`MID_BAND = [45, 55]`、`READING_TEXT: string`、`READING_MORAE = 61`、`countMorae(kana: string): number`
- Produces(`synth.ts`): `harmonicTone(o: { f0: number; seconds: number; sampleRate: number; harmonics?: number; tiltDbPerOctave?: number; noiseDb?: number; seed?: number }): Float32Array`、`silence(seconds: number, sampleRate: number): Float32Array`

- [ ] **Step 1: Write the failing test** `tests/config.test.ts`: `BAND_EDGES_HZ` が長さ13で先頭100・末尾8000・昇順、`BAND_COLORS` が長さ12。`countMorae('むかしむかしあるところにおじいさんとおばあさんがいました')` が 28、`READING_TEXT` の読み(`READING_KANA` を併せてエクスポート)で `countMorae(READING_KANA) === READING_MORAE`。`harmonicTone({f0:200, seconds:1, sampleRate:16000})` の長さが 16000 でピーク絶対値が 1 以下。
- [ ] **Step 2: Run** `cd voice-analyzer && npx vitest run tests/config.test.ts` — Expected: FAIL(モジュールが無い)。
- [ ] **Step 3: Implement** 上記ファイルを作る。`READING_TEXT` は「むかしむかし、あるところに、おじいさんとおばあさんがいました。おじいさんは山へしばかりに、おばあさんは川へせんたくに行きました。」(「桃太郎」の冒頭)、`READING_KANA` はその読み。`countMorae` は、小書きの「ゃゅょ」を数えず、「っ」「ー」「ん」を1モーラとして数える。`harmonicTone` は seed 固定の疑似乱数でノイズを混ぜる。`package.json` に scripts: `dev`、`build`、`test`(vitest)、`e2e`(playwright)。devDependencies は vite、typescript、vitest、jsdom、@playwright/test。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。`npx tsc --noEmit` がエラー0。
- [ ] **Step 5: Commit** `git add voice-analyzer && git commit -m "feat: scaffold voice-analyzer with types, config and synth helpers"`

### Task 2: スペクトル(FFT、12帯、alpha ratio、重心)

**Files:**
- Create: `voice-analyzer/src/dsp/spectrum.ts`
- Test: `voice-analyzer/tests/dsp/spectrum.test.ts`

**Interfaces:**
- Consumes: `BAND_EDGES_HZ`(Task 1)、`harmonicTone`(Task 1)
- Produces:
  - `longTermSpectrum(samples: Float32Array, sampleRate: number, voicedMask?: boolean[]): { freqs: Float32Array; power: Float32Array }`(Hann窓、フレーム長 2048 サンプル相当を `sampleRate` に応じて選ぶ、50%オーバーラップ、有声フレームのみ平均)
  - `bandShares(spec: { freqs: Float32Array; power: Float32Array }): number[]`(長さ12、合計1、ナイキスト未満の帯のみ有効。それ以上の帯は0にして再正規化)
  - `alphaRatioDb(spec): number`(1〜5 kHz のエネルギー / 50 Hz〜1 kHz のエネルギー、dB)
  - `spectralCentroidHz(spec): number`

- [ ] **Step 1: Write the failing test**: (a) 1 kHz の純音(1秒)で `bandShares` の最大が 621〜895 Hz ではなく 895〜1290 Hz の帯(index 6)。(b) 同じ信号をサンプルレート 16000・44100・48000 で作っても、`bandShares` の最大帯 index が同じ(Review Focus 4)。(c) 傾き -12 dB/oct の合成音の `alphaRatioDb` が、-3 dB/oct のものより小さい。(d) 重心が、200 Hz の純音で約 200 Hz(±10 Hz)。
- [ ] **Step 2: Run** `npx vitest run tests/dsp/spectrum.test.ts` — Expected: FAIL。
- [ ] **Step 3: Implement** 上記の4関数。FFT は自前の radix-2 実装(`src/dsp/fft.ts` に `fft(re: Float32Array, im: Float32Array): void`)。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。
- [ ] **Step 5: Commit** `git commit -m "feat(dsp): add FFT, 12-band shares, alpha ratio and centroid"`

### Task 3: F0 検出(YIN と後処理)

**Files:**
- Create: `voice-analyzer/src/dsp/pitch.ts`
- Test: `voice-analyzer/tests/dsp/pitch.test.ts`

**Interfaces:**
- Consumes: `PitchTrack`、`YIN_THRESHOLD`、`F0_RANGE_HZ`(Task 1)、`harmonicTone`、`silence`
- Produces:
  - `trackPitch(samples: Float32Array, sampleRate: number): PitchTrack`(フレーム長 40 ms、hop 10 ms、YIN しきい値 `YIN_THRESHOLD`、放物線補間、5点メディアン平滑、前後のフレームと比べて約1オクターブ(比 1.8〜2.2 または 0.45〜0.55)ずれたフレームを棄却して `null` にする)
  - `voicedMask(track: PitchTrack, totalSamples: number, sampleRate: number): boolean[]`(Task 2 の `longTermSpectrum` のフレームに対応する有声判定)
  - `hzToSemitone(hz: number, refHz?: number): number`(`refHz` 既定 100)

- [ ] **Step 1: Write the failing test**: (a) 200 Hz・harmonics 8 の合成音で、有声フレームの F0 中央値が 200 Hz ±2 Hz。(b) 120 Hz、350 Hz でも ±2 Hz。(c) サンプルレート 16000、44100、48000 で結果が ±2 Hz に収まる(Review Focus 4)。(d) 無音とホワイトノイズで有声フレームの割合が 5% 未満、`NaN` を含まない(Review Focus 2)。(e) 途中で 1 フレームだけ 2 倍(400 Hz)になる信号の、そのフレームが `null` になる。(f) `hzToSemitone(200, 100) ≈ 12`。
- [ ] **Step 2: Run** `npx vitest run tests/dsp/pitch.test.ts` — Expected: FAIL。
- [ ] **Step 3: Implement** YIN の差分関数、累積平均正規化差分、絶対しきい値、放物線補間。`clarity = 1 - d'(τ)`。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。
- [ ] **Step 5: Commit** `git commit -m "feat(dsp): add YIN pitch tracker with octave-jump rejection"`

### Task 4: 澄み具合の指標(CPPS、HNR、H1-H2、安定性)

**Files:**
- Create: `voice-analyzer/src/dsp/quality.ts`
- Test: `voice-analyzer/tests/dsp/quality.test.ts`

**Interfaces:**
- Consumes: `fft`(Task 2)、`PitchTrack`、`hzToSemitone`(Task 3)、`harmonicTone`
- Produces:
  - `cpps(samples: Float32Array, sampleRate: number, opts?: { removeSilence?: boolean }): number | null`(単位 dB。`removeSilence` が真なら、フレームRMSが全体の最大の -35 dB 未満のフレームを除いてから計算)
  - `hnrDb(samples: Float32Array, sampleRate: number, track: PitchTrack): number | null`(有声フレームの正規化自己相関 r から `10·log10(r/(1−r))` を取り、中央値を返す。有声フレームが10未満なら `null`)
  - `h1h2Db(samples: Float32Array, sampleRate: number, track: PitchTrack): number | null`(有声フレームの F0 付近と 2·F0 付近のスペクトルピークの差。補正なし)
  - `stabilitySt(track: PitchTrack): number | null`(有声F0の半音単位の標準偏差。有声フレームが10未満なら `null`)

- [ ] **Step 1: Write the failing test**: (a) 200 Hz・harmonics 10・ノイズなしの CPPS が、同じ信号に `noiseDb: -10` を足したものより大きい。(b) CPPS が、同じ入力に対して `NaN` を返さず、無音入力では `null`。(c) 文の読み上げを想定し、前後に 1 秒の無音を足した信号の CPPS が、`removeSilence: true` のとき無音なしの信号と ±1 dB 以内。(d) `hnrDb` が、ノイズなしの合成音で、`noiseDb: -10` のものより大きい。(e) `stabilitySt` が、ビブラート(±1半音)を付けた信号で、安定した信号より大きい。
- [ ] **Step 2: Run** `npx vitest run tests/dsp/quality.test.ts` — Expected: FAIL。
- [ ] **Step 3: Implement** CPPS の手順: Hann窓付きフレーム(窓長 40 ms、hop 10 ms)→ パワースペクトル dB → 逆FFT でケプストラム → quefrency 1/500〜1/60 秒の範囲でピークを探し、時間方向(約20 ms 相当)とquefrency方向で平滑化 → quefrency 軸の直線トレンド(Hillenbrand 方式)を引き、ピーク値とトレンドの差を dB で取り、全フレームで平均。パラメータは Praat のマニュアルで確認して確定する(設計書第6節)。この実装は暫定で、Task 13 で Parselmouth と照合する。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。
- [ ] **Step 5: Commit** `git commit -m "feat(dsp): add CPPS, HNR, H1-H2 and pitch stability"`

### Task 5: 課題ごとの特徴量

**Files:**
- Create: `voice-analyzer/src/dsp/features.ts`
- Test: `voice-analyzer/tests/dsp/features.test.ts`

**Interfaces:**
- Consumes: Task 2〜4 の関数、`READING_MORAE`(Task 1)、`TaskFeatures`、`SentenceFeatures`
- Produces:
  - `extractVowel(samples: Float32Array, sampleRate: number): TaskFeatures`(先頭と末尾の各0.75秒を除いた安定部で計算。`cpps` は `removeSilence: false`)
  - `extractSentence(samples: Float32Array, sampleRate: number): SentenceFeatures`(`cpps` は `removeSilence: true`。`speakingRate = READING_MORAE / 全体の秒数`、`articulationRate = READING_MORAE / 有声と短い無声区間を含む発話区間の秒数`。発話区間は、フレームRMSが最大の -35 dB 以上のフレームで、250 ms 以上の無音をポーズとして除く)
  - `f0RangeSt` は有声F0の半音の 95 パーセンタイル − 5 パーセンタイル。有声フレームが10未満なら F0 関連はすべて `null`(`NaN` は返さない)。

- [ ] **Step 1: Write the failing test**: (a) 200 Hz の合成音(5秒)で `extractVowel` の `f0MedianHz` が 200 ±2、`bandShare` の長さ12で合計が 1 ±1e-6、`voicedSeconds` が 3 以上。(b) 無音の入力で、すべての数値が `null` か有限値で、`NaN` が無い(Review Focus 2)。(c) 音声 8秒+前後1秒の無音の合成文で、`articulationRate > speakingRate`。(d) 8秒の音声と、10秒に引き伸ばして無音を足した信号で、`articulationRate` の差が 10% 以内。
- [ ] **Step 2: Run** `npx vitest run tests/dsp/features.test.ts` — Expected: FAIL。
- [ ] **Step 3: Implement** 上記2関数。ゲート(Task 6)は呼ばず、特徴量の計算だけを行う。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。
- [ ] **Step 5: Commit** `git commit -m "feat(dsp): extract per-task features for vowel and sentence"`

### Task 6: 録音品質ゲート

**Files:**
- Create: `voice-analyzer/src/diagnosis/gate.ts`
- Modify: `voice-analyzer/src/diagnosis/config.ts`(`GATE` 定数を追加)
- Test: `voice-analyzer/tests/diagnosis/gate.test.ts`

**Interfaces:**
- Consumes: `TaskFeatures`(Task 1)、`silence`、`harmonicTone`(Task 1)
- Produces:
  - `type GateResult = { ok: true; warnings: GateWarning[] } | { ok: false; reason: GateReason }`
  - `type GateReason = 'too-noisy' | 'clipping' | 'too-quiet' | 'no-voice' | 'vowel-too-short' | 'sentence-too-short'`
  - `type GateWarning = 'noise-borderline' | 'low-level' | 'bluetooth-band-limited' | 'processing-on'`
  - `checkGate(input: { samples: Float32Array; sampleRate: number; preRoll: Float32Array; task: 'vowel' | 'sentence'; features: TaskFeatures; processingOn: boolean }): GateResult`
  - `GATE`(`config.ts`): `snrOkDb = 30`、`snrRejectDb = 25`、`noiseFloorMaxDbfs = -50`、`clipRatioMax = 0.001`、`clipRunMax = 3`、`peakTargetDbfs = [-20, -3]`、`peakQuietDbfs = -30`、`vowelStableMinSeconds = 3`、`vowelFlatnessSdCentMax = 50`、`vowelLevelVarDbMax = 6`
- 録音前の無音区間 `preRoll`(録音開始前の0.5秒)をノイズフロアの推定に使う。SNR = 発声区間のRMS(dBFS) − `preRoll` のRMS(dBFS)。

- [ ] **Step 1: Write the failing test**: (a) 通常の合成音(peak -10 dBFS)と無音の `preRoll` で `ok: true`。(b) peak が全体の 0.2% で 0.99 以上なら `reason: 'clipping'`。(c) SNR 27 dB なら `ok: true` かつ `warnings` に `'noise-borderline'`、SNR 20 dB なら `reason: 'too-noisy'`。(d) 無音の入力で `reason: 'no-voice'`(Review Focus 2)。(e) peak -35 dBFS で `'low-level'` ではなく `reason: 'too-quiet'`。(f) 母音の `voicedSeconds` が 2 なら `'vowel-too-short'`。(g) `processingOn: true` で `warnings` に `'processing-on'`。
- [ ] **Step 2: Run** `npx vitest run tests/diagnosis/gate.test.ts` — Expected: FAIL。
- [ ] **Step 3: Implement** `checkGate`。判定の優先順は、no-voice → clipping → too-quiet → too-noisy → 長さ → 警告の収集。Bluetooth の帯域制限は、4 kHz 以上のパワーが全体の 0.1% 未満のとき `'bluetooth-band-limited'`。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。
- [ ] **Step 5: Commit** `git commit -m "feat(diagnosis): add recording quality gate with provisional thresholds"`

### Task 7: プロファイルと分類(パーセンタイル、中間タイプ、中央値)

**Files:**
- Create: `voice-analyzer/src/diagnosis/profile.ts`、`src/diagnosis/classify.ts`、`src/diagnosis/norms.json`、`scripts/build-norms.ts`
- Test: `voice-analyzer/tests/diagnosis/classify.test.ts`

**Interfaces:**
- Consumes: `SetFeatures`、`Profile`、`VoiceType`、`Sex`、`MID_BAND`(Task 1)
- Produces:
  - `norms.json` の形: `{ provisional: boolean; groups: Record<'female'|'male'|'all', { alphaRatioDb: { mean: number; sd: number }; cpps: { mean: number; sd: number } }> }`
  - `toProfile(set: SetFeatures, sex: Sex, norms: Norms): Profile`(明るさ = `alphaRatioDb` のz値を正規分布の累積確率に変換して 0〜100、澄み具合 = 文の `cpps` で同様。`sex` が `'unspecified'` なら `groups.all`)
  - `medianProfile(profiles: Profile[]): Profile`
  - `type Classification = { kind: 'type'; type: VoiceType } | { kind: 'mixed'; between: [VoiceType, VoiceType] | [VoiceType, VoiceType, VoiceType, VoiceType] }`
  - `classify(profiles: Profile[]): Classification`(`medianProfile` を取る。軸ごとに、中央値が `MID_BAND` 内なら「中間」。両軸とも中間でなく、かつ、全セットが同じ側にあるなら `type`。いずれかの軸が中間、またはセット間で軸の側が分かれるなら `mixed`、`between` には隣接する(その軸の両側の)タイプを入れる。両軸が中間なら4タイプすべて)
  - `typeFor(brightHigh: boolean, clearHigh: boolean): VoiceType`(`clear-bright` = 明るい×澄んでいる、`soft-bright` = 明るい×やわらかい、`clear-calm`、`soft-calm`)
  - `scripts/build-norms.ts`: 録音フォルダ(WAV)を読み、性別別の平均と標準偏差から `norms.json` を作る CLI(`npx tsx scripts/build-norms.ts <dir> --sex <female|male|all>`)。
- 初期の `norms.json` は `provisional: true`。値は、Task 5 の特徴量を、合成音(`harmonicTone` のパラメータを振った100本)に適用した平均と標準偏差から `build-norms` で生成する。実録音が集まったら置き換える。

- [ ] **Step 1: Write the failing test**: (a) 3つの同一プロファイル(明るさ 80、澄み 80)で `{kind:'type', type:'clear-bright'}`。(b) 明るさ 50(`MID_BAND` 内)なら `kind:'mixed'`、`between` が `clear-bright` と `clear-calm` を含む。(c) 3セットで明るさが 30、70、70(中央値 70)でも、1つが逆側なら `mixed`(Review Focus 5)。(d) セット1つだけでも `classify` が動く。(e) 空配列で例外を投げる。(f) `toProfile` が `sex:'unspecified'` で `groups.all` を使う。(g) `norms.json` の `provisional` が `true`。
- [ ] **Step 2: Run** `npx vitest run tests/diagnosis/classify.test.ts` — Expected: FAIL。
- [ ] **Step 3: Implement** 上記の関数と、`build-norms.ts`。`norms.json` を生成してコミットする。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。
- [ ] **Step 5: Commit** `git commit -m "feat(diagnosis): add percentile profile, mixed-type classification and provisional norms"`

### Task 8: フィードバック文と表現ルールの検査

**Files:**
- Create: `voice-analyzer/src/diagnosis/feedback.ts`、`src/diagnosis/copy.ts`
- Test: `voice-analyzer/tests/diagnosis/feedback.test.ts`

**Interfaces:**
- Consumes: `Classification`、`Profile`、`SetFeatures`、`VoiceType`(Task 1、7)
- Produces(`copy.ts`):
  - `FIXED_FOOTER: string`(設計書第5節の固定フッターの全文)
  - `STOP_NOTICE: string`(「痛み、疲れ、かすれの悪化があれば、練習をやめてください。」)
  - `ALLOWED_FIXED_COPY: string[]`(`[FIXED_FOOTER, STOP_NOTICE]`)
  - `BANNED_WORDS: string[]`(「診断」「検査」「スクリーニング」「異常」「正常」「リスク」「疑い」「悪化」「改善します」「高精度」)
  - `TYPE_LABEL: Record<VoiceType, string>`(「透明感」「ふんわり軽やか」「深み・安定」「やわらか包容」)
- Produces(`feedback.ts`):
  - `interface Feedback { headline: string; tendency: string; strengths: string[]; focus: string[]; practice: PracticeStep[]; sets: number }`、`interface PracticeStep { title: string; minutes: number; how: string }`
  - `buildFeedback(c: Classification, profile: Profile, last: SetFeatures, sets: number): Feedback`(`headline` は `「今回の録音では〇〇タイプの傾向です」`、中間タイプは「〇〇と△△の中間の傾向です」。`sets === 1` なら末尾に「(参考・1回)」。`focus` は最大2件。`practice` はウォームアップ(ハミングかストロー、1〜2分)、優先課題(各2〜3分、最大2)、転移(1分)の順で、合計5〜10分)
  - `findBannedWords(text: string): string[]`(`ALLOWED_FIXED_COPY` の文字列を取り除いたうえで、`BANNED_WORDS` の出現を返す)

- [ ] **Step 1: Write the failing test**: (a) 全4タイプ+中間タイプ+`sets` 1/2/3 の組み合わせで `buildFeedback` を呼び、`headline`、`tendency`、`strengths`、`focus`、`practice` の全文字列を連結した結果に、`findBannedWords` が空配列を返す。(b) `focus.length <= 2`、`practice` の `minutes` の合計が 5〜10。(c) `sets === 1` の `headline` に「参考」が含まれ、`sets === 3` には含まれない。(d) `findBannedWords(FIXED_FOOTER)` が空配列(許可文字列は除外される)。(e) `findBannedWords('今回は正常です')` が `['正常']`。(f) 「性格」「能力」「印象」を含む文が出ない。
- [ ] **Step 2: Run** `npx vitest run tests/diagnosis/feedback.test.ts` — Expected: FAIL。
- [ ] **Step 3: Implement** 文言テンプレートをタイプ別に `copy.ts` に置く。強みは `bandShare` の最大帯、伸ばすポイントは、澄み具合(CPPS)、抑揚(`f0RangeSt`)、安定性(`f0StabilitySt`)、話速のうち、プロファイルまたは本人比で弱いもの。段階目標は設計書第5節の暫定値(+0.5〜1半音、1〜2半音、数dB、10〜20%)を `how` に入れる。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。
- [ ] **Step 5: Commit** `git commit -m "feat(diagnosis): add feedback builder and banned-word lint"`

### Task 9: 録音(マイク取得、AudioWorklet、中断検知)

**Files:**
- Create: `voice-analyzer/src/audio/capture.ts`、`src/audio/recorder-worklet.ts`
- Test: `voice-analyzer/tests/audio/capture.test.ts`

**Interfaces:**
- Consumes: なし(ブラウザAPI)
- Produces:
  - `type MicError = 'denied' | 'no-device' | 'insecure-context' | 'unsupported'`
  - `class Recorder { static async open(): Promise<Recorder | { error: MicError }>; readonly sampleRate: number; readonly processingOn: boolean; start(onLevel: (rms: number, wave: Float32Array) => void): Promise<void>; stop(): Promise<{ samples: Float32Array; preRoll: Float32Array }>; discard(): void; onInterrupted: (() => void) | null }`
  - `open()` は、`navigator.mediaDevices.getUserMedia` に `{ audio: { echoCancellation: { ideal: false }, noiseSuppression: { ideal: false }, autoGainControl: { ideal: false } } }` を渡す。`processingOn` は `track.getSettings()` のいずれかが `true`。`sampleRate` は `audioContext.sampleRate`。`isSecureContext` が偽なら `'insecure-context'`。`NotAllowedError` は `'denied'`、`NotFoundError` は `'no-device'`。
  - `start()` は、0.5秒の `preRoll` を取り、その後の録音を Float32 PCM で蓄積する。
  - `AudioContext.state` が `'interrupted'` か `'suspended'` に変わったら `onInterrupted` を呼び、蓄積を破棄する。

- [ ] **Step 1: Write the failing test**(`navigator.mediaDevices` と `AudioContext` をモック): (a) `getUserMedia` が `NotAllowedError` なら `{ error: 'denied' }`、`NotFoundError` なら `'no-device'`、`isSecureContext === false` なら `'insecure-context'`(Review Focus 1)。(b) 制約オブジェクトに3つの `ideal: false` が入る。(c) `getSettings()` が `echoCancellation: true` を返すと `processingOn === true`。(d) `AudioContext` のモックが `sampleRate: 48000` のとき `recorder.sampleRate === 48000`。(e) 録音中に `state` が `'interrupted'` になると `onInterrupted` が呼ばれ、`stop()` が空の `samples` を返す(Review Focus 3)。
- [ ] **Step 2: Run** `npx vitest run tests/audio/capture.test.ts` — Expected: FAIL。
- [ ] **Step 3: Implement** AudioWorklet は `recorder-worklet.ts` を Vite の `?worker&url` 相当で読み込み、128フレームずつ `postMessage` で送る。AudioWorklet が使えない場合のみ ScriptProcessor にフォールバックする。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。
- [ ] **Step 5: Commit** `git commit -m "feat(audio): add recorder with worklet capture, settings check and interruption handling"`

### Task 10: 画面部品(SVGグラフ、3画面)

**Files:**
- Create: `voice-analyzer/src/ui/charts.ts`、`src/ui/screens.ts`、`src/ui/styles.css`
- Test: `voice-analyzer/tests/ui/charts.test.ts`、`tests/ui/screens.test.ts`

**Interfaces:**
- Consumes: `BAND_EDGES_HZ`、`BAND_COLORS`(Task 1)、`Feedback`、`FIXED_FOOTER`(Task 8)、`MicError`(Task 9)
- Produces:
  - `renderBarChart(bandShare: number[]): SVGSVGElement`(12本。高さは `bandShare` の最大値を 60 に正規化。各本の `fill` は `BAND_COLORS[i]`)
  - `renderPieChart(bandShare: number[]): SVGSVGElement`(12の扇形。ラベルは小数を丸めた % で、1%未満は省く)
  - `renderStart(onStart: (sex: Sex) => void): HTMLElement`(性別の選択は任意で、既定は `'unspecified'`。対象外の案内、「音声は端末の外に送りません」の記載を含む)
  - `renderRecording(): { el: HTMLElement; setPhase(p: 'vowel' | 'sentence'): void; setWave(w: Float32Array): void }`
  - `renderResult(f: Feedback, bandShare: number[], opts: { provisionalNorms: boolean; onAgain: () => void; canRecordMore: boolean }): HTMLElement`(固定フッター `FIXED_FOOTER` を末尾に置く。`provisionalNorms` が真なら「仮の基準」を表示)
  - `renderMicError(e: MicError): HTMLElement`(理由と対処を表示し、説明画面へ戻るボタンを持つ)
  - `renderRetry(reason: GateReason): HTMLElement`(録り直しの案内)

- [ ] **Step 1: Write the failing test**(jsdom): (a) `renderBarChart` が12個の `rect` を持ち、最大の `bandShare` の `rect` の高さが他より大きく、`fill` が `BAND_COLORS` と一致。(b) `renderPieChart` の `path` が12個。(c) `renderResult` に `FIXED_FOOTER` の全文が含まれ、`provisionalNorms: true` のとき「仮の基準」が含まれる。(d) `renderMicError('denied')` に理由と対処の文言があり、赤い警告色のクラスを使わない。(e) 全 `render*` の出力テキストに `findBannedWords` が空配列を返す(許可文字列を除く)。
- [ ] **Step 2: Run** `npx vitest run tests/ui` — Expected: FAIL。
- [ ] **Step 3: Implement** 見た目は白地、赤(`#c8213c`)のアクセント、明朝系の見出し、スマホ縦画面優先。グラフは SVG の手書き。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。
- [ ] **Step 5: Commit** `git commit -m "feat(ui): add SVG charts and start/recording/result screens"`

### Task 11: アプリ全体の組み立て(セットの管理、エラー、状態遷移)

**Files:**
- Create: `voice-analyzer/src/app.ts`
- Modify: `voice-analyzer/src/main.ts`
- Test: `voice-analyzer/tests/app.test.ts`

**Interfaces:**
- Consumes: Task 5〜10 のすべて
- Produces:
  - `class App { constructor(root: HTMLElement, deps: { openRecorder: () => Promise<Recorder | { error: MicError }>; norms: Norms }); start(): void }`
  - 1セットの流れ: 母音(約5秒、自動停止)→ 文(`READING_TEXT` を表示、最大15秒、「終了」ボタンで早く止められる)→ `extractVowel`、`extractSentence` → `checkGate`(母音と文の両方)→ いずれかが失敗なら `renderRetry`、成功なら `SetFeatures` を蓄積 → `classify` と `buildFeedback` → `renderResult`。
  - 2セット目以降は、「もう1セット録音する」で追加(最大3セット)。結果は蓄積した全セットの中央値に更新し、`sets` を渡す。
  - `Recorder.onInterrupted` が呼ばれたら、そのセットを破棄して `renderRetry('no-voice')` ではなく、中断用の案内(再録音)を出す。

- [ ] **Step 1: Write the failing test**(`openRecorder` をモックし、合成音を返す): (a) 1セットで `renderResult` が出て、`headline` に「参考」が含まれる。(b) 3セットで「参考」が消え、「もう1セット」ボタンが無い。(c) `openRecorder` が `{ error: 'denied' }` を返すと `renderMicError` が出て、例外が出ない(Review Focus 1)。(d) 母音が無音のセットは、結果ではなく `renderRetry` になり、蓄積されない(Review Focus 2)。(e) `onInterrupted` が録音中に呼ばれると、そのセットが破棄され、再録音の案内が出る(Review Focus 3)。(f) 性別が `'unspecified'` でも結果が出る(Review Focus 5)。
- [ ] **Step 2: Run** `npx vitest run tests/app.test.ts` — Expected: FAIL。
- [ ] **Step 3: Implement** `App` の状態遷移(`start → recording → result | retry | micError`)。`main.ts` で `norms.json` を読み込み、`App` を起動する。
- [ ] **Step 4: Run** `npx vitest run` — Expected: 全テスト PASS。`npm run build` が成功。
- [ ] **Step 5: Commit** `git commit -m "feat: wire app flow with multi-set median, retry and error states"`

### Task 12: 通し確認(Playwright)とネットワーク送信なしの検証

**Files:**
- Create: `voice-analyzer/playwright.config.ts`、`tests/e2e/flow.spec.ts`、`tests/e2e/fixtures/make-wav.ts`
- Test: 上記

**Interfaces:**
- Consumes: ビルド済みアプリ(`npm run build` と `vite preview`)
- 疑似マイクは、Chromium の `--use-fake-ui-for-media-stream`、`--use-fake-device-for-media-stream`、`--use-file-for-fake-audio-capture=<wav>` で、`make-wav.ts` が生成した合成音声(母音5秒+文の相当13秒の連続音)を流す。ブラウザは、`/opt/pw-browsers/chromium` を `executablePath` に指定し、`--trace off` で実行する。

- [ ] **Step 1: Write the failing test**: (a) スタート画面から「声を録音する」を押し、録音から結果画面まで進み、棒グラフの `rect` が12個、円グラフの `path` が12個、固定フッターが表示される。(b) テスト中の全リクエストを記録し、アプリのオリジン以外へのリクエストが0件、`POST` が0件(音声を送信しない)。(c) 「もう1セット」を2回押すと、3セットで「参考」が消える。(d) マイク許可を拒否するコンテキスト(`permissions: []`)で、説明画面が出る。
- [ ] **Step 2: Run** `npm run build && npx playwright test --trace off` — Expected: FAIL(未実装の部分があれば)または、初回から PASS なら、(b) のネットワーク検査が実際に機能することを、意図的に `fetch` を1回呼ぶ変更で失敗することを確認してから戻す。
- [ ] **Step 3: Implement** 設定とフィクスチャ。
- [ ] **Step 4: Run** 同コマンド — Expected: PASS。
- [ ] **Step 5: Commit** `git commit -m "test(e2e): add Playwright flow with fake mic and no-network assertions"`

### Task 13: Parselmouth との回帰テストと実機チェックリスト

**Files:**
- Create: `voice-analyzer/scripts/make-golden.py`、`tests/golden/golden.json`(生成物)、`tests/golden/golden.test.ts`、`docs/device-checklist.md`
- Test: `tests/golden/golden.test.ts`

**Interfaces:**
- `make-golden.py <wav-dir> <out.json>`: Parselmouth で各WAVの F0 中央値、HNR(`To Harmonicity (cc)`)、CPPS(`To PowerCepstrogram` と `Get CPPS`)を計算して JSON に書く。
- `golden.test.ts`: `golden.json` の各WAVについて、自前実装の値との差が、F0の中央値 ±1 Hz、HNR ±1.5 dB、CPPS ±0.5 dB に収まり、全WAV間の CPPS の相関が r > 0.95 であることを確認する。`golden.json` が無い場合は、理由を表示してテストをスキップする。
- `docs/device-checklist.md`: iPhone Safari と Android Chrome での手動確認項目(マイク許可、加工が切れているか、画面オフからの復帰、サンプルレート、Bluetooth、各ゲートの警告の出方)。

- [ ] **Step 1: Write the failing test**: `golden.test.ts` を、Step 3 で生成する `golden.json` を読む形で書く。
- [ ] **Step 2: Run** `pip install praat-parselmouth && python scripts/make-golden.py tests/golden/wav tests/golden/golden.json` — Expected: `tests/golden/wav` に、20〜50本の録音(実録音。無い場合は合成音のみ)があれば JSON が生成される。録音が無ければ、その旨を表示して終了する。
- [ ] **Step 3: Implement** スクリプトとテストとチェックリスト。許容差は設計書第9節の暫定値。
- [ ] **Step 4: Run** `npx vitest run tests/golden` — Expected: `golden.json` があれば PASS、無ければ「スキップ(理由付き)」。差が許容を超えたら、Task 4 の CPPS の実装(Praat のパラメータ確認)に戻る。
- [ ] **Step 5: Commit** `git commit -m "test: add Parselmouth golden regression and device checklist"`

---

## Self-Review

- **Spec coverage**: 第2節(画面、3セット、固定フッター)= Task 10、11。第3節(測定項目、表示しない指標)= Task 2〜5、Global Constraints。第4節(プロファイル、パーセンタイル、中間、中央値)= Task 7。第5節(フィードバック、表現ルール、固定フッター、中止の案内)= Task 8。第6節(AudioWorklet、実測サンプルレート、ideal指定と事後検証、中断、YIN、CPPS、HNR)= Task 3、4、9。第7節(品質ゲート)= Task 6。第8節(エラー処理)= Task 9、10、11。第9節(単体、Parselmouth、通し、実機)= Task 1〜13。第10節(プライバシー)= Task 12 のネットワーク検査と Global Constraints。弁護士確認と一次資料の確認は、実装外の作業で、計画には含まない。
- **未解決の点(要確認)**:
  - 設計書の第5節は、動的な文言で「悪化」を避けつつ、中止の案内に「かすれの悪化」を含めている。本計画は、中止の案内と固定フッターを許可文字列として検査から除外した。
  - 読み上げ文(`READING_TEXT`、61モーラ)と、`norms.json` の初期値(合成音から生成)は、設計書に指定がないため、本計画で決めた。実録音が集まったら置き換える。
  - Task 13 の実録音(20〜50本)は、まだ手元に無い。
- **Type consistency**: `SetFeatures`、`Profile`、`Classification`、`Feedback`、`GateResult`、`MicError` は、定義した Task と使う Task で名前が一致している。
- **Proportion**: 設計書より長いが、コードの本体は書かず、署名、テスト、数値だけを置いた。
