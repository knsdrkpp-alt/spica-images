# 声のタイプチェック(voice-analyzer)

短い録音(「あー」を約5秒と、短い文の読み上げ)から、声の特徴をグラフで見える化し、練習のヒントを表示する
ブラウザだけで動くセルフチェックのアプリです。医療機器ではありません。
結果画面では、声の周波数ごとの強さを、色分けした円の上の「波形」の輪(外側=文の読み上げ、内側=「あー」)と、6色または12色の割合(このアプリ独自の計算による目安)で表示します。

## プライバシー

録音した音声は、端末の外に送りません。分析はすべてブラウザの中で行い、サーバーへの送信や保存はしません
(e2e テストで、ページが自分のサイト以外に通信しないことを確かめています)。

## 必要なもの

- Node.js 20 以上。ターミナルで `node -v` と打って、`v20` 以上が表示されれば大丈夫です。
- マイクのあるパソコンかスマートフォン(Chrome、Safari など新しめのブラウザ)。

## 使い方(開発用コマンド)

このフォルダ(`voice-analyzer/`)で実行します。

```sh
npm install        # 最初に1回だけ。必要なライブラリを入れます
npm run dev        # 開発用サーバーを起動します
```

起動したら、ブラウザで http://localhost:5173 を開きます。
ブラウザの決まりで、マイクは **https のページか localhost** でしか使えません。
スマートフォンから試すときは、https で配信したビルド(下の「公開する」)を使ってください。

| コマンド | 内容 |
| --- | --- |
| `npm test` | 単体テスト(Vitest)をすべて実行します |
| `npm run build` | 型チェックのあと、公開用のファイルを `dist/` に作ります |
| `npm run e2e` | ブラウザを使った通しテスト(Playwright、偽のマイク)を実行します |
| `npm run norms:synthetic` | 仮の基準値(合成音から作る)を作り直します。約50秒かかります |

### e2e テストを初めて動かすとき

Playwright 用のブラウザを一度だけ入れます。

```sh
npx playwright install chromium
npm run e2e
```

別の場所にある Chromium を使いたいときは、環境変数 `PW_CHROMIUM` にその実行ファイルのパスを入れます
(例: `PW_CHROMIUM=/path/to/chrome npm run e2e`)。指定が無い場合は、`/opt/pw-browsers/chromium` があればそれを、
無ければ Playwright が入れたブラウザを使います。テスト中のスクリーンショットは `test-results/` に保存されます。

### 仮の基準値(`npm run norms:synthetic`)

結果のタイプ分けに使う基準値(`src/diagnosis/norms.json`)は、いまは**合成音から作った仮のもの**です。
このコマンドは合成音を分析し直して、`src/diagnosis/norms.json` を上書きします(約50秒)。
実際の人の録音から作る手順は `scripts/build-norms.ts` の先頭に書いてあります。

### ゴールデンテスト(Praat との照合)

`tests/golden/` では、声の高さなどの計算結果を、音声分析ソフト Praat(Python の Parselmouth 経由)の値と比べています。
比べる値(`tests/golden/golden.json`)はリポジトリに入っているので、`npm test` を動かすだけなら Python は要りません。
値を作り直すときだけ、次を実行します。

```sh
pip install praat-parselmouth
npx tsx scripts/make-synthetic-wavs.ts                                   # 合成音の WAV を tests/golden/wav に作る
python3 scripts/make-golden.py tests/golden/wav tests/golden/golden.json # Praat の値を書き出す
```

## 公開する(GitHub Pages などの静的ホスティング)

`npm run build` で `dist/` にできたファイルを、そのまま静的ホスティングに置くだけで動きます。
`vite.config.ts` で `base: './'` にしているので、`https://<ユーザー名>.github.io/<リポジトリ名>/` のような
サブパスに置いても動きます(e2e テスト「works from a sub-path」で確かめています)。
マイクを使うため、**必ず https で配信してください**(GitHub Pages は https です)。

## 実機での確認

自動テストの偽マイクでは確かめられないこと(マイク許可、端末の音声処理、うるさい部屋での動きなど)は、
[docs/device-checklist.md](docs/device-checklist.md) のチェックリストで、iPhone Safari と Android Chrome の実機で確かめます。

## 状態と限界

- しきい値や基準値は、すべて**仮のもの**です。今後の調整で結果の表示が変わることがあります。
- 計算結果は、**合成音でだけ** Praat と照合しています。実際の人の録音での照合と、実機での確認はまだです。
- 医療機器ではなく、医療や専門的な評価の代わりにはなりません。
- 画面の文言には決まりがあります。医療的な判定を思わせる言葉(一覧は `src/diagnosis/copy.ts` の `BANNED_WORDS`)は、
  決まった2つの注意書き(`FIXED_FOOTER` と `STOP_NOTICE`)以外では使いません。性格や印象を決めつける
  表現も使わず、言い切らない書き方(「〜の傾向があります」「目安です」)にします。テストがこの決まりを確かめています。
