<!-- source: README.md blob f3695f9769c637d78cce8340a464d8f3088f5d99 -->
[English](README.md) | 日本語

> この文書は[英語版](README.md)の翻訳。内容が異なる場合は英語版が優先する。

# Travel Discovery

Travel Discovery は、都市・地域単位の海外の旅行先を推薦するレスポンシブな Web アプリだ。短く変化のあるクイズと、任意で入れる旅行の条件（日数、月、予算）から旅行先を選ぶ。診断は決定的で、AI なしで動く。任意の AI ノートは既定で OFF で、順位を変えることはない。結果には目安の費用の範囲を出典と日付つきで示し、リアルタイム価格は出さない。航空券とホテルの検索へのリンクもある。UI は日本語・英語・スペイン語・フランス語に対応し、既定は日本語。

## 状態

- Phase 0〜15 は完了。
- プレビューと本番は `workers.dev` 上で AI を無効にして動いている。どちらも 23 か国・30 件の旅行先（11 の属性で採点）と、29 問のクイズの質問を提供している。
- Phase 14 で、AI の上限と提供状況を UI に表示し、利用者ごとの厳密な AI の回数制限を両方の環境にデプロイした。
- Phase 15 で、有力な旅行先を見分けやすい質問をクイズが優先して出すようにした。
- 本番で AI を有効にする手順は用意してある。オーナーが承認するまで AI は無効のまま（[Implementation plan](docs/working/IMPLEMENTATION_PLAN.md)、英語のみ）。
- ライセンスはまだ決めていない（[Public release checklist](docs/working/PUBLIC_RELEASE.md)、英語のみ）。

## クイックスタート

必要なもの: Node.js `>=22.22.0`（`.nvmrc` では 24 に固定）と npm。Cloudflare のアカウント、ログイン、秘密情報はいらない。

```bash
npm ci
npm run db:reset:local
npm run dev
```

http://localhost:5173 を開く。

- `npm run db:reset:local` は既存のローカルの D1 データを消してから、マイグレーションを適用してシードデータを読み込む。
- `npm run check` で lint、型チェック、テスト、ビルドをまとめて実行する。

## ドキュメント

- [ドキュメントの目次](docs/ja/README.md): 仕様、アーキテクチャ、ガイド、作業用ドキュメント。
- [ローカル開発](docs/ja/DEVELOPMENT.md): すべてのコマンド、管理アプリ、テスト、プロジェクトの構成。
- `CLAUDE.md` と `prompts/` には Claude Code 向けの指示がある。
