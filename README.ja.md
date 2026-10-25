<!-- source: README.md blob b57093683a20cddc751c3ee37c13847c95788531 -->
[English](README.md) | 日本語

> この文書は[英語版](README.md)の翻訳です。内容が異なる場合は英語版が優先されます。

# Travel Discovery

Travel Discovery は、短く変化のあるクイズと任意の旅行の条件（日数、月、予算）から、都市・地域単位の海外の旅行先を推薦するレスポンシブな Web アプリです。診断は決定的で、AI なしで動きます。任意の AI ノートは既定で OFF で、順位を変えることはありません。結果には出典と日付を伴う目安の費用の範囲を表示し（リアルタイム価格ではありません）、航空券とホテルの検索にリンクします。UI は日本語・英語・スペイン語に対応し、既定は日本語です。

**状態:** Phase 0〜9 は完了しています。プレビューと本番は `workers.dev` 上で AI を無効にして動いています。次は Phase 10（プレビューでの AI の試行、ロールバックの確認、コンテンツの再確認）です（[Implementation plan](docs/working/IMPLEMENTATION_PLAN.md)、英語のみ）。ライセンスはまだ決めていません（[Public release checklist](docs/working/PUBLIC_RELEASE.md)、英語のみ）。

## クイックスタート

必要なもの: Node.js `>=22.22.0`（`.nvmrc` では 24 に固定）と npm。Cloudflare のアカウント、ログイン、秘密情報は不要です。

```bash
npm ci
npm run db:reset:local
npm run dev
```

http://localhost:5173 を開きます。`npm run db:reset:local` は既存のローカルの D1 データを削除してから、マイグレーションを適用し、シードデータを読み込みます。lint、型チェック、テスト、ビルドは `npm run check` で実行します。

## ドキュメント

- [ドキュメントの目次](docs/ja/README.md): 仕様、アーキテクチャ、ガイド、作業用ドキュメント。
- [ローカル開発](docs/ja/DEVELOPMENT.md): すべてのコマンド、管理アプリ、テスト、プロジェクトの構成。
- `CLAUDE.md` と `prompts/` には Claude Code 向けの指示があります。
