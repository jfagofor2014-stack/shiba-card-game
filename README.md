# 至高の柴犬ライフ

柴犬テーマの2人用カードゲーム。CPU対戦とオンライン対戦（Firebase）に対応。

## セットアップ
1. Firebaseでプロジェクトを作成し、Realtime Database を有効化（テストモード可）
2. `src/firebase-config.example.js` を `src/firebase-config.js` にコピーし、コンソールの設定値を記入
3. ローカル確認: `python3 -m http.server 8000` → http://localhost:8000

## テスト
`npm test`

## デプロイ（GitHub Pages）
1. リポジトリにpush
2. Settings → Pages → Branch を main / root に設定
3. 公開URLにアクセス（icon-192.png / icon-512.png を用意するとホーム画面追加が綺麗）

## Firebase セキュリティルール
`database.rules.json` を Firebase コンソールの Realtime Database → ルール に貼り付けてデプロイする。
このルールは `rooms/$code` 配下のみ読み書きを許可し、それ以外へのアクセスを拒否する。
認証なしで部屋単位の読み書きを許可する「部屋内許可型」の設定で、2人用のプライベート対戦であれば許容できる（不特定多数が利用する公開用途には適さない）。

## アイコン
`icon-192.png`, `icon-512.png` を任意の柴犬画像で用意（無くても動作するがPWAインストール表示が簡素になる）。
