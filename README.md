# Dixit Online

友人とオンラインで遊べる、Dixitルール準拠のストーリーテリングゲームです。
Next.js (App Router) + Socket.io によるリアルタイム対戦。カード絵は著作権の関係で
本物のDixitアートではなく、カードIDから決定的に生成される抽象アートのプレースホルダーを使用しています
(`lib/cardArt.ts`)。後から実画像に差し替える場合は `components/Card.tsx` の `CardFace` を置き換えてください。

## ローカル開発

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いてください。カスタムサーバー(`server.ts`)が
Next.jsとSocket.ioを同一プロセス・同一ポートで提供します(`next dev`単体では動きません)。

友人と一緒に試すには、部屋を作成してから表示される部屋コード/リンクを共有し、
それぞれが `npm run dev` ではなく、後述のクラウドデプロイ先のURLにアクセスしてもらう必要があります。

## ゲームルール実装メモ

- 3〜6人対応、手札6枚、山札84枚(`lib/types.ts`)
- 得点計算・語り手交代・山札切れ/30点到達での終了は `lib/gameEngine.ts` に実装
- 部屋の状態はサーバーのメモリ内で管理(`lib/rooms.ts`)。プロセス再起動で消えます

## クラウドデプロイ

このアプリはWebSocketを使い続けるため、サーバーレス(Vercel等)ではなく、
常駐プロセスを実行できるホスティング(Railway, Render, Fly.ioなど)が必要です。

付属の `Dockerfile` を使ってデプロイできます:

```bash
docker build -t dixit-online .
docker run -p 3000:3000 dixit-online
```

Railway / Render の場合は、リポジトリを接続してDockerfileを検出させるか、
ビルドコマンド `npm run build`、起動コマンド `npm start` を指定してください。
`PORT` 環境変数はホスティング側が自動設定するものをそのまま使えます。
