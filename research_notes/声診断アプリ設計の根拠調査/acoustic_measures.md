# 音響的音声指標の妥当性・信頼性・基準値と、スマートフォンマイク/録音環境の影響

方法メモ: 本セッションでは WebSearch の要約のみ利用可能で、論文本文の取得(WebFetch)は pubs.asha.org / pmc.ncbi.nlm.nih.gov / frontiersin.org がネットワーク許可外で失敗した。したがって「Cited Findings」は検索結果スニペットに明示された数値・主張に限り、本文未確認である。検索で裏が取れなかった数値(Hillenbrand の式、Titze の jitter 閾値、一般的な HNR 値など)は「Inferences」に「背景知識・未検証」と明記して分離した。設計に使う前に原典確認が必要。

## Q1. 各指標(F0, HNR, CPP/CPPS, スペクトル傾斜, LTAS, SPL, 話速, ピッチ変動)は何を測り、持続母音 vs 連続発話でどの程度妥当・信頼でき、どんな基準値/カットオフがあるか

### Takeaway
CPP/CPPS が dysphonia 判別で最もエビデンスが厚く、カットオフは課題(持続母音 > 連続発話)・ソフト(Praat > ADSV)・言語で大きく異なるため、他研究の値の流用は不可。日本語でのカットオフは今回の検索では見つからず(再現性・テキスト間変動のデータのみ)。F0/HNR/スペクトル傾斜/話速の日本語規準値も今回は一次情報が取れていない。

### Cited Findings
- CPP カットオフ(英語、同一研究): 持続母音 /a/ で ADSV 11.46 dB、Praat 14.45 dB。Rainbow Passage で ADSV 6.11 dB、Praat 9.33 dB。複数研究を通じ、連続発話のしきい値は持続母音より常に低い — [AJSLP 2020 (Experiment 1)](https://pubs.asha.org/doi/full/10.1044/2020_AJSLP-20-00001)(スニペット経由、母集団・n は未確認)
- Heman-Ackah ら(2003)の Hillenbrand 法 CPPS では、軽度 vs 重度の境界が持続母音 約10 dB、連続発話 約5 dB(上記 AJSLP の文献表の要約) — [AJSLP 2020 表](https://pubs.asha.org/doi/full/10.1044/2020_AJSLP-20-00001)
- 韓国の研究では持続母音で 12 dB(ADSV) — [検索要約: 日本語 CPPS 検索結果](https://pubs.asha.org/doi/abs/10.1044/2020_AJSLP-20-00001)(二次的記述)
- スペイン語: dysphonic 136名・健常 47名、Praat 既定設定と AVQI 由来設定の両方で、/a/ と文章の CPPS の AUC は約 0.84-0.88。設定別カットオフ値は表の列が不明瞭で未確認 — [Delgado-Hernández 2019, Loquens](https://loquens.revistas.csic.es/index.php/loquens/article/view/64)
- 日本語話者210名: CPPS はテキスト(音読文)によって中〜大きく変動し、無音区間を削除する、またはその他の補正でばらつきが減り、特に無音削除で診断精度が最良 — [Intertext Variability of CPPS, J Voice 2020](https://katalog.lib.cas.cz/KNAV/EdsRecord/edsair,edsair.doi.dedup.....195cd66fa6e69ebf012cf6215bc8eeb8)
- 日本人健常成人60名: CPP と CSID(ADSV 系)は持続母音 /a/ と短文のどちらでも高い test-retest 信頼性(カットオフ研究ではない) — [日本ロゴペディクス・音声言語医学会誌 61(1)](https://www.jstage.jst.go.jp/article/jjlp/61/1/61_18/_article/-char/en)(年・著者・正確な ICC は未確認)
- Praat バージョン間: 持続 /a/ の指標はおおむね安定。文章での SD of F0 と CPPS、音声での F0 と SD of F0 はバージョン間で差があり、信頼性は中等度〜優秀 — [PMC 検索要約(smartphone 検索結果)](https://pubs.asha.org/doi/10.1044/2020_JSLHR-20-00212)(出典の同定は不確実)
- 声の SPL が上がると jitter・shimmer が低下し HNR が上がる(p<0.001、症例対照研究)。標準母音は /a/ — [PMC7053781 (検索結果)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7053781)(スニペットのみ)
- 健常スペイン成人154名: 持続 /a/ の HNR 95パーセンタイル 18 dB(著者は他報告より高いと注記)。年齢・性・F0 は jitter/shimmer/HNR に有意な影響なし。jitter 0.5% が許容、shimmer 3% は健常の13%を除外する — [PMC9445921 (検索結果)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9445921/)(スニペットのみ。同定が不確実)
- 日本の臨床研究(2023): SFF は高い順に 持続母音平均 > 数唱 > 音読 > 自発話(男女とも) — [Analysis of Speech Fundamental Frequencies for Different Tasks in Japanese](https://katalog.lib.cas.cz/KNAV/EdsRecord/edsair,edsair.doi.dedup.....3f08bca0d0fd81c1c81d6c92bd039d2c)
- 日本人女性は米国人女性より全条件で SFF が高く、多くが SFF 分布が二峰性 — [Yamazawa & Hollien, Folia Phoniatr](https://www.degruyterbrill.com/document/doi/10.1159/000261907/html)
- Grandfather Passage、男性: SFF 平均 122.73 Hz、pitch sigma 2.18 ST、SFF range 11.33 ST(女性値は切れて不明) — [escholarship 学位論文](https://escholarship.org/content/qt1gh6x943/qt1gh6x943.pdf?t=l921bp)(英語話者と推定、母集団未確認)
- Hz で見た性差が semitone に変換すると消えることがある。男性の平均話声 F0 は 100-150 Hz、女性 180-230 Hz — [Stolarski 2017, Lingua Posnaniensis](https://journals.pan.pl//Content/101757/PDF/LS%2038_17%20Stolarski.pdf)
- 話速: 日本語自発話の平均はおよそ 8 mora/s(フィルタ設計文脈の概数) — [京大リポジトリ](https://repository.kulib.kyoto-u.ac.jp/server/api/core/bitstreams/3770fee5-6f6b-4b6d-88a3-c46eda147322/content)。speaking rate(ポーズ含む)と articulation rate(ポーズ除く)の区別あり — [Speech tempo](https://Www.wikipedia.org/wiki/Speech_tempo)
- alpha ratio は一般に 0-1 kHz と 1-5 kHz の帯域レベル差と定義され、低値は hyperfunctional と関連。女性は複数帯域でスペクトル強度が高い — [DergiPark LTAS 研究](https://dergipark.org.tr/tr/download/article-file/4567063)
- CPP と low/high spectral ratio の規準研究(2013 学位論文): 持続母音では男性が良好、連続発話の CPP では女性が良好。年齢・性別別規準を推奨 — [UW-Milwaukee 学位論文](https://minds.wisconsin.edu/handle/1793/92083)
- Voxplot による 23 指標の規準(スペイン、2026)があり、スペクトル特性に有意な性差 — [Salamanca repository](https://gredos.usal.es/xmlui/handle/10366/171879)

### Inferences
- (研究で確認済みの傾向からの推論) CPPS を単一しきい値で「健康/不調」と二値表示するのは危険。持続母音と文章でしきい値が約 5 dB 違うこと、ソフト差が 2-3 dB あること、日本語テキスト間変動があることから、アプリ内で使う実装(Praat 互換か自前 JS か)で独自の相対スケール(自己ベースライン比、パーセンタイル)にするのが安全。
- (背景知識・未検証) Praat の CPPS(Maryn & Weenink 2015, J Voice の設定: 持続母音 /a/ 用と連続発話用に同一の smoothing 設定、quefrency 60-333 Hz、time-averaging window 0.02 s、quefrency-averaging window 0.0005 s)を JS 実装でそのまま再現するのは可能だが、検証用に Praat 出力との突き合わせテストが必要。
- (背景知識・未検証) 健常者の持続 /a/ HNR は Praat(cross-correlation)で概ね 18-25 dB 前後、女性でやや高い傾向と記憶しているが、スペイン研究の 95%ile 18 dB と食い違うように、手法依存が大きく一般的な基準にはできない。表示するなら絶対値でなく「自己ベースラインとの差」とする。
- (背景知識・未検証) 日本語音読の articulation rate は概ね 7-9 mora/s、speaking rate(ポーズ込み)は 6-8 mora/s 前後と記憶するが、今回の検索では読み上げ課題の一次ソースを取得できなかった。
- (背景知識・未検証) 話声 F0 の SD は semitone で健常成人の音読でおよそ 2-3 ST(上記 Grandfather Passage 男性 2.18 ST と整合)。Hz SD は性差が出るので必ず semitone(または log F0)で算出し、5 s 母音では「ピッチ変動」ではなく安定性の指標(通常 <0.5 ST 程度と推測)として扱う。
- H1-H2, H1-A3, Hammarberg index の規準: 今回は取得できず。H1-H2 / H1-A3 は母音・F1・F0・マイクの周波数特性・声門下位置に依存し、スマホでは H1 付近(低域)の応答差に弱い(下記 Q3 の「スペクトル傾斜が録音方法に影響される」報告と整合)ので、絶対値の解釈は避けるべき。

### Gaps
- 日本語話者における CPPS(持続母音/音読)の公表カットオフ — 今回の検索では未発見。Kitayama/Umatani 系グループの J Voice 2020 以外は確認できず。
- Hammarberg index・alpha ratio の性別・課題別規準値(連続発話) — 未発見(Hammarberg 1986/Sundberg 系の原典、LTAS 規準研究が必要)。
- 日本語 音読の mora/s 規準(speaking vs articulation) — 一次文献未発見(CSJ、NINJAL、日本音響学会誌、音声研究を要検索)。
- 日本語話者の F0 SD(semitone)規準値、Keating & Kuo 2012 の semitone 値 — スニペットに数値なし。
- H1-H2/H1-A3 の規準 — 未発見。
- CPPS の systematic review/meta-analysis(Voice Foundation abstract)の結果 — 未確認。

## Q2. ユーザーに見せるべきでない(信頼性が不十分な)指標は何か — jitter/shimmer など

### Takeaway
jitter/shimmer は録音機器・ノイズ・残響・SPL・ソフトに強く依存し、スマホではランダム誤差が「問題あり」と評価される。ユーザー向けの値としては表示せず、品質ゲートの内部指標か非表示にするのが妥当。

### Cited Findings
- スマホ vs スタジオ機器: CPPS は持続母音・音読の両方で有意なバイアスがあるが、平均 F0 と CPPS はランダム誤差が許容範囲、jitter と shimmer のランダム誤差は問題 — [PubMed 33186510](https://www.pubmed.gov/33186510/)(要約の読み取り。著者・年は未確認)
- メタアナリシス: スマホ録音は音響的音声品質パラメータで CRS(研究用システム)との不一致があり、Samsung は jitter で有意差・大きな効果量。Apple と Samsung 間でも jitter と CPPS に有意差 — [PMC10754240(検索結果)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10754240)
- マイク選択で jitter・shimmer・HNR・CPP が有意に異なり、録音環境で shimmer・HNR・CPP が有意に異なる — [JSLHR 2020 (Awan 系)](https://pubs.asha.org/doi/10.1044/2020_JSLHR-20-00212)
- 残響時間 <1 s では jitter・HNR・alpha ratio は安定、shimmer は 0.53 s でも非常に敏感 — [MDPI Bioengineering 2024](https://www.mdpi.com/2306-5354/11/12/1253)
- 再現性研究: jitter と CPPS が室内音響・背景雑音・マイク品質に最もロバスト、HNR はやや劣る。室内音響と背景雑音の影響の方がマイク種類より大きい — [Reproducibility of Voice Parameters, Loughborough](https://vufind.lboro.ac.uk/PrimoRecord/cdi_pubmedcentral_primary_oai_pubmedcentral_nih_gov_6529301)(jitter の扱いが他研究と矛盾する点に注意: 上記スマホ研究では jitter が不安定)
- 孤立母音研究(Bridge2AI-Voice): CPP・スペクトル傾斜・jitter/shimmer が録音方法とノイズで有意に影響 — [Bridge2AI-Voice タブレット研究](https://healthscholars.usf.edu/ivhi/publications/evidence-based-recommendations-tablet-recordings-bridge2ai-voice-acoustic-experiments)
- 録音の微小な周波数誤差が perturbation に大きな誤差を生む。SNR 約30 dB 未満で jitter/shimmer の信頼性が低下するとのレビュー記述 — [MDPI Bioengineering 2024 / PMC8632479](https://pmc.ncbi.nlm.nih.gov/articles/PMC8632479)(二次引用)
- 2025 学位論文: スペクトル系指標は安定、shimmer・jitter は背景雑音で悪化 — [QMU eresearch](https://eresearch.qmu.ac.uk/handle/20.500.12289/14239)(スニペット経由)

### Inferences
- (研究に基づく) 非表示推奨: jitter(local, RAP, PPQ5)、shimmer(local, APQ)、NHR。理由: ①機種差(Samsung jitter の大きな効果量)、②SNR/残響/AGC 感度、③SPL と F0 への依存(声が大きいほど低下)、④基準値が研究・ソフトで食い違う(健常 jitter 閾値 0.5% vs 1.04% 等の揺れ。Titze の「低 SNR・非周期声で perturbation は不適切」は背景知識・未検証)。
- 表示可否の判定は「ゲートを通ったときの自己比較のみ」程度に留めるのが無難。診断・疾患示唆の表現も避ける(医療機器的主張になる)。
- F0 推定自体は autocorrelation 系でロバスト(Bahr 2025)だが、CPP から導く F0 は不安定なので使わない。

### Gaps
- jitter の頑健性について、再現性研究(ロバスト)とスマホ研究(不安定)が食い違う理由(測定 SNR・F0 追跡方式・サンプリング)は本文未確認のため解消できていない。
- 健常 jitter/shimmer の閾値(Praat 既定値 1.04% / 3.81% など)の一次ソースは今回取得できず(背景知識として記憶のみ)。

## Q3. スマホマイク・ノイズ・距離・AGC・ノイズ抑制・サンプリングレートの影響、およびスマホ/ブラウザ録音の妥当性検証。推奨 SNR・録音レベル・距離・品質ゲート

### Takeaway
スマホ録音は F0 と CPP 系・AVQI は概ね使えるが、機種・設定(環境)・距離で系統的なバイアスが出る(ただし予測可能で補正可能)。環境雑音と室内音響の影響はマイク種類より大きい。AGC は内蔵マイクの本質的課題で、SPL 絶対値は信頼できない。ブラウザ録音(getUserMedia)に特化した検証は今回見つからなかった。

### Cited Findings
- Awan ら(2023, "Smartphone Recordings are Comparable to Gold Standard Recordings for Acoustic Measurements of Voice"): 機器は CPP に弱い影響、L/H ratio(両文脈)と CSID(文章)に強い影響。録音距離は CPP と CSID に小〜中の影響。録音環境(setting)は L/H ratio(母音)以外の3指標に強い影響。回帰で金標準相当値へ小さい誤差で変換可能 — [PMC10545813](https://pmc.ncbi.nlm.nih.gov/articles/PMC10545813) / [PubMed 37019804](https://bohrium.dp.tech/paper/arxiv/37019804)
- Awan ら(JSLHR 2024): iPhone 13 Pro と Pixel 6 の内蔵マイクを高価な基準と比較(F0・perturbation・CPP・spectral tilt)。機器・環境・距離は有意に影響するが、効果は高度に予測可能で補正可能。低コストのヘッドセットマイク併用のスマホを推奨(口-マイク距離の固定) — [JSLHR 2024](https://pubs.asha.org/doi/10.1044/2024_JSLHR-23-00759)
- Bridge2AI-Voice(Bahr ら 2025): CPP はマイク種類・ノイズ・文タイプに敏感。autocorrelation の F0 は録音方法間でロバスト、CPP 由来 F0 は高変動。距離・雑音の制御が必須 — [Frontiers Digit Health 2025](https://www.frontiersin.org/articles/10.3389/fdgth.2025.1610772/full)
- Uloza ら(J Voice 2023): AVQI は口元スタジオマイクとスマホ(人工ノイズ追加含む)で有意な系統差なし、ランダム誤差許容(防音室、ノイズは後から加算) — [PubMed 33676807 の関連文献](https://www.pubmed.gov/33676807/)(同定は不確実)
- AGC: 内蔵マイクはメーカー独自の AGC を備え、機種間で不変の特徴量があるかが核心的問題 — [Springer, Int J Speech Technol 2021](https://link.springer.com/article/10.1007/s10772-021-09877-1)
- ノイズ: CPP のベースラインからのずれは SNR 悪化で増大し、約30 dB付近から目立つ(0.004 @50 dB、0.43 @30 dB、6.77 @0 dB、小児・ホワイトノイズ・抄録段階) — [Voice Foundation 2026 abstract](https://voicefoundation.org/view/2026-abstracts/entry/7094/)
- HNR は雑音が約47.7 dB(A)を超えると有意に低下(SNR ではなく音圧レベル) — [PMC8632479](https://pmc.ncbi.nlm.nih.gov/articles/PMC8632479)(二次引用)
- Švec & Granqvist(AJSLP 2010): 周波数特性の変動が最低想定 F0〜関心最高周波数で 2 dB 未満、等価雑音は最も小さな発声の音圧レベルより 15 dB 以上低く、指向性マイクは近接効果を避ける距離で使用。数値は 30 cm と 5 cm の距離に対して導出され、著者自身が予備的と述べる — [AJSLP 2010; 19(4):356-368](https://pubs.asha.org/doi/10.1044/1058-0360(2010/09-0091))
- 大規模データ収集では ヘッドセット併用が距離とノイズの変動を減らす — [Bridge2AI-Voice](https://healthscholars.usf.edu/ivhi/publications/evidence-based-recommendations-tablet-recordings-bridge2ai-voice-acoustic-experiments)

### Inferences
- (研究からの推論) ブラウザ録音はスマホ内蔵マイクと同じ系統の誤差に、さらに OS/ブラウザ側の処理(getUserMedia の既定で echoCancellation / noiseSuppression / autoGainControl が有効)が加わる。実装では `echoCancellation:false, noiseSuppression:false, autoGainControl:false` を明示要求し、`track.getSettings()` で実際に無効になったかを確認、無効化できない端末は警告または結果の信頼度を下げる(背景知識。これを検証した研究は今回未発見)。
- (背景知識・未検証) サンプリング: 44.1/48 kHz で収録、Praat 系 CPPS 計算は 22.05 kHz までのダウンサンプルで可。最低でも 16 kHz 以上(ナイキスト 8 kHz)なしでは Q4 の 100 Hz-8 kHz バンド解析が成立しない。圧縮コーデック(Bluetooth 等)は避ける。
- (背景知識・未検証、数値は設計案) 推奨ゲート案: 背景雑音(無音区間 RMS)を測り 発声区間との SNR ≥ 30 dB を「良」、25-30 dB を「注意」、<25 dB を「再録音」。クリップ率 0.1%超(サンプル |x|≥0.99)で再録音。ピークは -6〜-3 dBFS 付近が目標で、-30 dBFS 未満の RMS は低すぎ。口-マイク距離は 15-30 cm(研究では 4-10 cm の口元距離も使われる。Švec の数値は 30 cm と 5 cm 前提)で、プロトコルで固定し、距離の変動で CPP が影響を受ける(Awan 2023)ことを説明。
- SNR 30 dB は「大まかな目安」で、正式な合意基準は見つからない。ゲート値は経験的に調整すること。

### Gaps
- ブラウザ(WebAudio/MediaRecorder/getUserMedia)録音と Praat/ラボ録音との直接比較 — 未発見。
- 機種別 AGC/ノイズ抑制を無効化した時の効果の定量研究 — 未発見。
- Maryn 系スマホ検証、Munnings の知見、Lin 2012(iPhone)、Jannetts 2025 の詳細 — スニペットのみ、本文未確認。
- 推奨サンプリングレート、推奨録音レベル(dBFS)の一次ソース — 未発見。Bridge2AI の具体設定も確認できず。

## Q4. スペクトルバンドエネルギー(LTAS を 100 Hz-8 kHz の12対数バンド)の意味と、2.5-4 kHz(singer's/speaker's formant)の解釈、スマホマイクでの限界

### Takeaway
LTAS は声門源の傾斜と共鳴の組み合わせを粗く表す指標で、2.5-4 kHz 帯の相対エネルギーはトレーニングされた声(singer's formant、speaker's ring)と関連するが、一般ユーザーの「声質タイプ」には強い解釈は与えられない。スマホマイクの帯域別応答差を定量した研究は今回見つからず、絶対バンドエネルギーは機種依存、相対(正規化)のみ使うべき。

### Cited Findings
- singer's formant は約3 kHz付近のスペクトル包絡ピークで、主に第3〜5フォルマントのクラスタリングによる共鳴現象。F1 に対するレベルは母音・声の大きさに依存 — [Level and center frequency of the singer's formant](https://read.qxmd.com/read/11411472/level-and-center-frequency-of-the-singer-s-formant)
- 訓練された歌手は未訓練者より 2.2-3.4 kHz と 7.5-8.4 kHz に有意なエネルギー集中(LTAS 研究、2008) — [Singer's Formant and Speaker's Ring Resonance: LTAS](https://search.bvsalud.org/gim/resource/pt/wpr-62423)
- マイク種類で中域に持ち上がりがあると値が歪む(ピエゾで最悪)。singer's formant 帯(約2.8-3.5 kHz)はそうした色付けを最も受けやすい — [Polito thesis](https://webthesis.biblio.polito.it/7218/1/tesi.pdf) / [Euronoise 2018](https://www.euronoise2018.eu/docs/papers/311_Euronoise2018.pdf)
- 8機種のスマホ周波数応答(200 Hz-20 kHz)を測ったデータセットが存在し、機種間の性能差が機種非依存の音響解析を制限しうると指摘(具体値は未確認) — [IEEE DataPort](https://ieee-dataport.org/documents/8phoneacoustictestingdataset)
- 機器は L/H ratio(低高域比のスペクトル指標)に強い影響を与える(Awan 2023, 母音・文の両方) — [PMC10545813](https://pmc.ncbi.nlm.nih.gov/articles/PMC10545813)
- Bridge2AI: スペクトル傾斜が録音方法・ノイズで有意に影響 — [Bridge2AI-Voice](https://healthscholars.usf.edu/ivhi/publications/evidence-based-recommendations-tablet-recordings-bridge2ai-voice-acoustic-experiments)
- 高 SPL・Lombard 効果で alpha ratio が上昇(女性でより大きく: 6.9 vs 3.8 dB) — [EMALG arXiv](https://arxiv.org/pdf/2309.06858)(中国語・Lombard 条件で、規準値ではない)

### Inferences
- (研究に基づく推論) 12バンドは、①バンド合計で正規化した相対値(dB re 全帯域 or re 中域)にする、②下端(<200 Hz)は機種の低域ロールオフ・風/ポップ雑音・AGC で信頼できない、③上端(>6-8 kHz)は機種の応答差・アンチエイリアス・ノイズ抑制の影響が大きい、という点で「解釈は粗く、相対のみ」とすべき。
- (背景知識・未検証) LTAS ベースの singing power ratio / 2-4 kHz 帯対 0-2 kHz 帯比は、声の大きさ(SPL)に強く依存する。SPL が AGC で不明なアプリでは、音量補正なしに「共鳴が良い」等と言えない。
- 3 kHz 帯の相対エネルギーは「明るさ・通りやすさ」の自己ベースライン比較や、同一端末内の経時変化には使える可能性があるが、端末横断の比較・基準値は不可。
- 「声タイプ診断」としての使用は(エンタメ的ラベルであれば)許容されうるが、医学的解釈や基準値との比較に見せない。

### Gaps
- スマホで LTAS/SPR/alpha ratio を基準マイクと比較した検証 — 未発見。
- 2.5-4 kHz 帯の機種別誤差の定量 — 未発見(IEEE DataPort の中身未確認)。
- 12対数バンド LTAS の妥当性を検証した研究 — 未発見(設計独自の特徴量)。
- 話声 LTAS の規準値(性別・日本語) — 未発見。

## 設計への推奨

各項目に信頼度(高/中/低)を付す。「根拠」は上記 Q1-Q4 を参照。数値で「設計案」とあるものは文献の値ではなく、文献の傾向に基づく暫定値で、実機データで調整すること。

### A. 表示してよい指標と扱い
| 指標 | 課題 | 推奨 | 信頼度 |
|---|---|---|---|
| F0 平均(Hz) と F0 の SD(semitone、log 変換後) | 母音/文章 | 表示可。F0 は autocorrelation 系(Praat 方式 / YIN 系)で抽出し、CPP からは導かない。SD は必ず ST。持続母音は安定性指標、文章はイントネーション幅指標と分けて説明 | 高(F0 ロバスト性)/ 中(ST SD の基準値) |
| CPPS | 母音と文章を別々に計算 | 表示可だが「絶対カットオフ判定」にしない。課題別・ソフト別に別スケール(母音 > 文章、差は約5 dB: 英語研究 14.45 vs 9.33 dB (Praat))。文章では無音区間を除去してから計算(日本語210名の研究で診断精度最良)。自己ベースライン比または集団内パーセンタイルで表示 | 中 |
| HNR | 母音 | 補助表示。絶対カットオフは避ける(手法・SNR・SPL 依存) | 低-中 |
| スペクトル傾斜(alpha ratio, Hammarberg, H1-H2/H1-A3) | 母音/文章 | alpha ratio / Hammarberg は文章で、相対値(自己比較)のみ。H1-H2/H1-A3 は端末依存のため、非表示または「参考」扱い | 低-中 |
| SPL/RMS | 両方 | 絶対 dB SPL は表示しない(AGC・マイク感度不明)。品質ゲートの入力レベル検査のみ | 高 |
| 話速 | 文章 | 日本語は mora/s で算出(音声認識や強制整列で mora 数を取得)。speaking rate と articulation rate を分けて計算し articulation を主表示。基準は暫定(自発話 約8 mora/s、設計案として読み上げ articulation 7-9 mora/s を「ふつう」帯)。一次ソース未取得 | 低-中 |
| ピッチ変動 | 文章 | ST SD と範囲(5-95%ile)。日本語女性は SFF が高く分布が二峰性との報告(Yamazawa & Hollien)があるため、平均 F0 ではなく中央値を使用 | 中 |

### B. 表示しない(または内部のみ)
- jitter、shimmer、NHR、APQ/PPQ: ユーザー非表示。内部の品質ゲートの診断にのみ使用可(信頼度: 高)。
- CPP 由来の F0、絶対 SPL、絶対スペクトルバンド値(端末間比較): 非表示(高)。
- 「病的/健常」などの二値判定、疾患名の示唆: 日本語の公表カットオフが未確認であること、機種で CPP にバイアスがあることから不可(高)。

### C. 品質ゲート(設計案。SNR 30 dB は文献上の目安、他は暫定値)
- 無音区間(録音前後 0.5-1 s)の RMS と発声区間の RMS の比から SNR を推定: ≥30 dB で通常、25-30 dB で警告、<25 dB で再録音要求(信頼度: 中)。
- クリッピング: |x|≥0.99 のサンプルが 0.1% を超えたら再録音(中)。
- 入力レベル: 発声区間ピーク -20〜-3 dBFS を目標、-30 dBFS 未満は「声が小さい/遠い」警告(低-中)。
- 有声区間: 持続母音は安定部 3 s 以上(開始・終了の各約 0.5-1 s を除外)(中。慣行で、今回の文献では未確認)。文章はポーズ除去後の有声区間の割合・時間を確認。
- 距離: 口-マイク 15-30 cm(固定、ヘッドセットが使えれば推奨)。距離は CPP に小〜中の影響があるため、UI で距離を案内(中)。
- 環境: 静かな室内。残響の影響が雑音と同程度に大きいため、浴室・広い反響室内は避ける旨を案内(中)。
- 機器: getUserMedia で echoCancellation/noiseSuppression/autoGainControl を false にして要求し、`getSettings()` で適用を検証。無効化できない場合は結果に「信頼度低」フラグを付ける(中。ブラウザ検証研究は未発見)。
- サンプリング: 48 kHz 優先(最低 16 kHz。LTAS 8 kHz 帯のため)。非圧縮 PCM(AudioWorklet / WAV)で保持し、MediaRecorder の圧縮コーデックは使わない(中。背景知識)。

### D. アルゴリズム選択
- F0: Praat 方式 autocorrelation または YIN/pYIN、探索範囲は男性 75-300 Hz・女性 100-500 Hz(性別の自己申告に依存せず広めに取り、オクターブ誤りを検査)(中)。
- CPPS: Maryn & Weenink 2015 の Praat 設定を再現し、Praat で作成した参照値との突き合わせ回帰テストを実装(中。設定値は背景知識・未検証)。
- 文章の話速: ポーズ検出(エネルギー閾値)+ mora 数(テキストが既知なのでかな→mora 数を既知にでき、強制整列は不要)で speaking/articulation rate を算出(中)。
- LTAS: 12対数バンド(100 Hz-8 kHz)は、全帯域総和に対する相対 dB と、2.5-4 kHz の相対値を「明るさ」指標として自己比較/タイプ分類にのみ使用。絶対評価・基準比較はしない(中-低)。
- 性別別基準: 性による差(CPP、LTAS、F0)があるため、基準・パーセンタイルは性別(および年齢)で分ける。ただし日本語の規準は未確認なので、まず自己ベースラインを軸にする(中)。

### E. 追加調査が必要な事項(実装前)
1. Maryn & Weenink 2015、Awan 2023/2024、Bahr 2025 の本文確認(ネットワーク許可が必要: pubs.asha.org, pmc.ncbi.nlm.nih.gov, frontiersin.org)。
2. 日本語の CPPS カットオフ(日本音声言語医学会誌、J-STAGE)、日本語 mora/s と F0 SD(ST)の規準。
3. ブラウザ録音での実機検証(複数機種で Praat 基準との相関・バイアスを自前測定)。
