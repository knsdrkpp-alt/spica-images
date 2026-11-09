# ブラウザ完結型 音声分析の実装調査 (F0 / HNR / CPPS / スペクトル / LTAS / 品質ゲート)

> 調査上の制約: 本セッションはネットワークが制限され、Praat マニュアル (www.fon.hum.uva.nl) は名前解決失敗で取得できず、pitchy の GitHub 直取得は 404。WebSearch の要約のみ一次情報として使えた。**引用リンク付きの事実は少数**で、それ以外のアルゴリズム詳細は「Inferences」(著者の既存知識。未検証) として明示分離した。実装前に Praat マニュアルと各論文で必ず再確認すること。

## 1. ピッチ追跡 (YIN / pYIN / MPM / ACF / CREPE) とライブラリ選定

### Takeaway
MPM 実装の pitchy は MIT で `findPitch(buf, sampleRate)` が [周波数, clarity(0-1)] を返し、有声判定に clarity を使える。ただし発話・持続母音向けの厳密な精度、オクターブ誤り、ベンチマーク数値は今回の調査で一次情報を確認できなかった。自前実装 (YIN/ACF 系 + 後処理) を Parselmouth で検証する方針が妥当と推論する。

### Cited Findings
- pitchy は McLeod Pitch Method (McLeod & Wyvill "A Smarter Way to Find Pitch") を実装。`findPitch(input, sampleRate)` が検出 pitch(Hz) と 0〜1 の "clarity" を返し、低 clarity はノイズを示唆する — [npm / GitHub 検索結果 (pitchy)](https://github.com/ianprime0509/pitchy)
- pitchy は `PitchDetector` 構築時に指定した `inputLength` と常に同じ長さの入力が必須 — [pitchy](https://github.com/ianprime0509/pitchy)
- pitchy のライセンス: npm 一覧は MIT (v4.1.0)。GitHub README の License 節に Zero Clause BSD と書かれているとの検索要約があり、食い違いの可能性 (LICENSE ファイル要確認) — [npm pitchy](https://npmjs.com/package/pitchy); [GitHub](https://github.com/ianprime0509/pitchy)
- 他の JS 候補として pitchfinder (peterkhayes) と audiojs/pitch-detection が存在する (検索結果に出現のみ) — [pitchfinder](https://github.com/peterkhayes/pitchfinder)

### Inferences (未検証・既存知識)
- 自前実装推奨: 解析窓 40〜50 ms (最低 3 周期 at 60 Hz なら ≥ 50 ms)、hop 10 ms、探索範囲は成人 75〜500 Hz (要件の 60〜500 Hz でも可。Praat 既定 pitch floor 75 Hz)。
- 持続母音は ACF(正規化)+放物線補間、または YIN (しきい値 0.10〜0.15) + 3〜5 点メディアン + オクターブジャンプ (比 >1.8 or <0.55) 棄却。発話全体は Viterbi/pYIN 風の連続性コストが有効。
- CREPE 系 (TF.js) はモデル数十 MB、iOS のメモリ/起動時間リスクがあり、HNR/CPPS 用途の F0 には過剰。
- Praat 互換検証のため、F0 は Praat "To Pitch (ac)" 相当 (Boersma 1993: 窓 Hanning、窓長 3/floor、ACF を窓の ACF で除算) の自前実装が最も整合する。

### Gaps
- YIN/pYIN/MPM/CREPE のオクターブ誤り率・ベンチマーク数値 (論文本体未取得)。
- aubio.js / essentia.js / Meyda / wasm Praat 移植の成熟度・ライセンス・サイズ (essentia.js は AGPL の可能性があるが未確認)。

## 2. CPPS / HNR / スペクトル指標と Praat/Parselmouth 検証

### Takeaway
Praat の Get CPPS は PowerCepstrogram の全フレーム平均 CPP を返し、時間平滑化と Hillenbrand 流の直線トレンドを使う。パラメータ値 (60 Hz/0.002/0.0005 等) 自体は今回検索で確認できなかったため、Praat マニュアルで要確認。

### Cited Findings
- Praat の "Get CPPS" は選択した PowerCepstrogram の CPP をフレーム平均して返す。時間平均窓でケプストラムを平滑化し、trend type で背景を直線 (Hillenbrand et al. 1994 方式) またはモデル化する。最小二乗は後方互換用で精度は劣る旨の記述 — [Praat manual: PowerCepstrogram: Get CPPS](https://www.fon.hum.uva.nl/praat/manual/PowerCepstrogram__Get_CPPS___.html) (検索要約経由)
- CPPS は CPP の変形で、ピーク測定前にケプストラムを平均する — [Heman-Ackah ほか / 検索結果](https://pmc.ncbi.nlm.nih.gov/articles/PMC4630216)
- Hillenbrand アルゴリズムでの連続発話 CPPS 正常値の目安は ≥ 4.0 (Heman-Ackah 2014) — [同上](https://pmc.ncbi.nlm.nih.gov/articles/PMC4630216)
- Praat 設定により持続母音カットオフが大きく異なる (Delgado-Hernández 2019: 23.62 dB と 13.96 dB の 2 設定) — [ASHA AJSLP 2020](https://pubs.asha.org/doi/full/10.1044/2020_AJSLP-20-00001)

### Inferences (未検証)
- 実装手順 (Praat 流): 音声→Hanning 窓フレーム→パワースペクトル→log10 (dB) →逆 FFT でパワーケプストラム→時間方向平滑 (数フレーム) →quefrency 方向平滑→ピーク探索範囲を pitch floor/ceiling に対応する quefrency (1/330〜1/60 s 付近) に限定→指定範囲の直線回帰 (quefrency 範囲全体) の値を引いた高さが CPP。CPPS は平滑後のピーク差の平均。
- 絶対値は設定・ツール (Praat vs ADSV/SpeechTools) 依存のため閾値は自アプリ内で再較正が必要。
- HNR: Praat `To Harmonicity (cc)` はフレームごとの正規化相互相関ピーク r から HNR=10·log10(r/(1−r)) dB。`(ac)` は窓 ACF 補正付き。実装は Pitch 追跡の ACF とほぼ共用できる。silence threshold(0.1)・periods per window(1.0 cc / 4.5 ac) の既定を確認すること。
- 検証: Parselmouth で `call(sound,"To Harmonicity (cc)",0.01,75,0.1,1.0)`、`To PowerCepstrogram` + `Get CPPS` を実行し、合成信号 (既知 jitter/noise) と実録音 20〜50 本で比較。許容差の初期案: F0 中央値 ±1 Hz (または 0.5%)、HNR ±1.5 dB、CPPS ±0.5 dB (Praat 設定一致時)、スペクトル傾斜系 ±1 dB。相関 r>0.95 を受入条件に。
- H1-H2 は補正 (F1/F2 帯域の共鳴補正) 有無で別指標。持続母音では F0 が高い話者ほど補正なしは不安定。alpha ratio = (50-1000 Hz 帯 dB) − (1-5 kHz 帯 dB)、Hammarberg = 0-2 kHz 最大 − 2-5 kHz 最大 (dB)、centroid はパワースペクトル重心 (要定義明記)。

### Gaps
- Praat CPPS 既定値・HNR 既定値の正文 (マニュアル取得不可)。SpeechTools/ADSV との差異の一次情報。
- Hillenbrand 1994/96 原論文の窓長・平滑条件。

## 3. キャプチャパイプライン (getUserMedia / AudioWorklet / iOS Safari)

### Takeaway
iOS Safari では音声処理制約が長年不安定。echoCancellation を明示 false にする推奨があるが、`exact:false` で OverconstrainedError、track settings で実際の値を確認する必要がある。AudioContext は iOS で "interrupted" になり resume が必要で、sampleRate は要求値と一致しない場合がある。

### Cited Findings
- WebKit は echoCancellation を既定有効にする。Apple フォーラムでは constraints で明示的に false にするよう案内 — [Apple Developer Forums / WebKit bug 257495](https://bugs.webkit.org/show_bug.cgi?id=257495)
- iOS/iPadOS で制約が効かない問題が iOS 26.4 (iPhone 15 Pro) でも報告され、Safari が使う制約は echoCancellation のみとの報告あり (一次情報ではなく開発者報告) — [WebKit Bugzilla 検索結果](https://bugs.webkit.org/show_bug.cgi?id=311451)
- 2017 年の WebKit bug 179411 "getUserMedia constraints have no affect" は後に fixed — [WebKit 179411](https://bugs.webkit.org/show_bug.cgi?id=179411)
- 回避情報: echoCancellation を `exact:false` にすると Safari が OverconstrainedError、`noiseSuppression:{exact:false}` は通るとの開発者報告 — [検索結果要約](https://bugs.webkit.org/show_bug.cgi?id=179411)
- echoCancellation off で channelCount が無視されステレオ (macOS)、iOS 17.6.1/macOS で左チャンネルのみになる報告あり — [WebKit bug 267676 周辺](https://bugs.webkit.org/show_bug.cgi?id=267676)
- iOS 27 で echoCancellation 有効のマイクストリーム中に再生がクラックルする bug (2026-10 報告) — [WebKit bug 326286 周辺](https://bugs.webkit.org/show_bug.cgi?id=326286)
- iOS Safari ではページ離脱 (タブ切替/最小化/画面オフ) で AudioContext が "interrupted" になり resume() が必要 (MDN) — [MDN AudioContext.state](https://developer.mozilla.org/ja/docs/Web/API/AudioContext/state)
- "interrupted" のまま resume できないバグ (iOS 17)、外部アプリ再生で state が running のまま無音になる事例 — [WebKit 273511](https://lists.webkit.org/pipermail/webkit-unassigned/2024-April/1163125.html); [WebKit 283419](https://bugs.webkit.org/show_bug.cgi?id=283419)
- iOS はグローバルなサンプルレートを使い、44100 要求でも 48000 になる事例。getUserMedia 後に AudioContext を生成するサンプルあり (コミュニティ情報) — [ios-safe-audio-context](https://npmjs.com/package/ios-safe-audio-context)
- AudioWorkletNode と getUserMedia 併用で音声が歪む WebKit bug — [WebKit 251091](https://lists.webkit.org/pipermail/webkit-unassigned/2023-February/1085453.html)
- Bluetooth スピーカー切替後の Web Audio 歪み — [WebKit 258864](https://lists.webkit.org/pipermail/webkit-unassigned/2023-July/1111584.html)

### Inferences (未検証)
- `new AudioContext()` は既定のまま作り `ctx.sampleRate` を実測して全 DSP をその値で動かす (リサンプルを要求しない)。AudioWorklet で Float32 を蓄積 (128 サンプル quantum)、ScriptProcessor は非推奨フォールバック。MediaRecorder は圧縮でスペクトル指標が歪むため解析に使わない。
- getUserMedia は必ずユーザージェスチャ内、HTTPS 必須。`track.getSettings()` で echoCancellation/AGC/NS の実際の値を取得し、残っていれば品質警告または結果に「処理有り」フラグ。
- Bluetooth マイクは 8/16 kHz HFP になり得るため、`sampleRate`/帯域チェック (4 kHz 以上のエネルギー有無) で警告。

### Gaps
- Safari/Chrome 各バージョンでの制約対応の公式表、caniuse の AudioWorklet/AudioContext sampleRate 対応数値、Android Chrome 固有の挙動。

## 4. 品質ゲート (SNR・クリッピング・持続母音安定性)

### Takeaway
今回、ブラウザ向け品質ゲート値の一次情報は取得できなかった。以下は設計提案 (未検証)。

### Cited Findings
- (該当する引用可能な一次情報なし)

### Inferences (未検証)
- 事前 1.0 s の無音 (pre-roll) の RMS を noise floor とし、有声区間 RMS との差を SNR。推奨しきい値: SNR ≥ 30 dB (警告 20〜30、NG <20)、noise floor ≤ −50 dBFS。
- クリッピング: |x| ≥ 0.99 が連続 3 サンプル以上、または全体の 0.1% 超で NG。ピークの目標 −12〜−3 dBFS、有声 RMS −30〜−15 dBFS。
- 持続母音: 有声区間 ≥ 3 s (理想 5 s)、先頭・末尾各 0.5 s を除外、中間 2 s 以上で F0 の cent 変動 (SD) <= 約 50 cent、レベル変動 ±6 dB 以内。
- メッセージ例: 「周囲が騒がしいです」「音が大きすぎて歪んでいます」「声が短すぎます (3 秒以上)」「声の高さが安定していません」「端末のノイズ除去が有効な可能性」。

### Gaps
- 臨床的に妥当な SNR/レベル基準の文献。

## 5. テスト (合成信号・コーパス・Playwright)

### Takeaway
今回は一次情報を取得できず。以下は設計提案 (未検証)。

### Cited Findings
- (引用可能な一次情報なし)

### Inferences (未検証)
- 合成: 倍音列 (1/n^k 傾斜) + 指定 jitter (%)/shimmer + 加算ノイズ (目標 HNR) + 簡易フォルマント (Klatt 風共鳴フィルタ)。真値 F0/HNR が既知で回帰テストに有用。
- コーパス候補: Saarbruecken Voice Database (持続母音 /a i u/、病的音声含む)、JVS (日本語話者)、Common Voice Japanese (ノイズ多・発話)。各ライセンス・利用規約は未確認。
- Playwright/Chromium: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-audio-capture=/path/test.wav` (WAV、ループ再生に注意。`%noloop` サフィックスの存在は要確認)。iOS Safari 実機は自動化困難なので実機手動テスト枠を設ける。
- Vitest は Node 上で WAV を読み Parselmouth 出力 JSON (ゴールデン) と許容差比較。

### Gaps
- 上記コーパスの利用条件、Chromium フラグの現行仕様確認。

## 設計への推奨

### Takeaway
F0/HNR/CPPS は自前 TypeScript で Praat 互換実装し、Parselmouth のゴールデン値で回帰検証する。キャプチャは iOS の不安定さを前提に実測・検知・警告を設計に入れる。

### Cited Findings
- (上記各節の引用を参照: pitchy は MPM+clarity、MIT 表記 (README と食い違いの可能性)、iOS の "interrupted"/制約不安定/サンプルレート不一致の報告)

### Inferences (未検証、実装前に Praat マニュアルで確認)
**アルゴリズム選択**
- F0: 正規化 ACF (Praat ac 互換) + 放物線補間 + Viterbi 風パス/メディアン 5 + オクターブジャンプ棄却。窓 ≥ 3/floor (floor 60 or 75 Hz)、hop 10 ms、voicing しきい値 ACF 0.45 相当 (pitchy の clarity を使うなら 0.9 から開始し校正)。pitchy は比較用/代替として許容。
- HNR: (cc) 相当、10·log10(r/(1−r))、有声フレーム (中間区間) の平均。
- CPPS: Praat 手順を再現 (時間平滑・quefrency 平滑・直線トレンド・pitch 範囲内ピーク)。パラメータは Praat マニュアル値に固定し、結果を 2 設定で比較。
- スペクトル: 4096 点 FFT + Hann、LTAS 12 バンド (例: 0-500 Hz から約 1/2 オクターブ幅の対数配置) の平均を dB/有声フレーム限定、alpha ratio/Hammarberg/centroid を同じ PSD から算出。H1-H2 は補正なしを既定、補正版はフォルマント推定が安定した場合のみ。
**キャプチャ**
- AudioContext 既定 sampleRate を実測利用、AudioWorklet、`echoCancellation/noiseSuppression/autoGainControl:false` を ideal 指定し `getSettings()` で検査、`statechange` で interrupted/suspended を検知して再試行 UI、録音破棄。
**品質ゲート**: 第4節の値を初期値とし校正。
**リスク**
1. iOS Safari で処理制約が無効 (AGC/NS) → CPPS/HNR バイアス。
2. AudioContext interrupted/resume 失敗、sampleRate 不一致。
3. Bluetooth マイクの帯域制限。
4. 自前 CPPS が Praat と非一致 (パラメータ未確認)。要マニュアル確認。
5. pitchy ライセンス表記矛盾、他ライブラリ未調査。
6. 持続母音の閾値・コーパス使用条件は未検証。

### Gaps
- 本調査は一次情報へのアクセス制約により、数値パラメータの多くが未検証。Praat マニュアルと原論文ドメインの許可後に再調査を推奨。
