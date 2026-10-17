# Travel Discovery — Claude Code starter pack

このディレクトリは、海外旅行先提案Webアプリ「Travel Discovery」の要件・設計方針・Claude Code向け指示をまとめたものです。

## 使い方

1. GitHubでPrivateリポジトリを作成し、作業ディレクトリにこの文書群を配置します。
2. Claude Codeでリポジトリを開きます。
3. `CLAUDE.md` と `docs/SPEC.md` などを読み込ませます（このパックをそのままルートに置く場合は、`docs/` 内のファイルをルート直下に置くか、参照パスを調整してください）。
4. `prompts/00-bootstrap.md` の指示を最初に渡します。
5. 以降は `prompts/` の番号順に、各フェーズを一つずつ進めます。各フェーズの受け入れ条件を満たすまで次へ進みません。

## 推奨リポジトリ配置

このスターターパック内の `docs/` を作り、以下のように整理してから使うのがおすすめです。

```text
travel-discovery/
├── CLAUDE.md
├── README.md
├── docs/
│   ├── SPEC.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── DECISIONS.md
├── prompts/
│   ├── 00-bootstrap.md
│   ├── 01-foundation.md
│   ├── 02-data-admin.md
│   ├── 03-diagnostic-engine.md
│   ├── 04-public-ui.md
│   ├── 05-ai-assist.md
│   └── 06-release.md
└── (application source files created by Claude Code)
```

## Language policy
- Claude Code conversations with the owner: Japanese.
- Repository documentation, source comments, and docstrings: English.
- App UI from MVP: Japanese, English, and Spanish (`ja`, `en`, `es`), with Japanese as default.

## Principles

- 診断の中心ロジックは通常のコードで動作させ、AI停止時にも主要機能を維持する。
- AI補助はユーザーがGUIから明示的に選択できる。初期状態はOFFとする。
- 旅行先の選定はスコアリングで行い、AIに候補の順位を決めさせない。
- 旅行先は都市・地域を主単位にし、国情報を関連付ける。
- 費用は「参考価格帯」として扱い、出典・基準・最終更新日を保持する。リアルタイム価格とは表示しない。
- 初期公開ではアカウント登録や診断履歴のサーバー保存を行わない。
- 無料枠・利用可能モデル・料金・制限は変わり得るため、実装時に公式ドキュメントを確認する。
- まず動く最小構成を作り、段階ごとにテスト・レビューしてから次へ進む。

## 重要

この文書群は初期仕様 v0.1 です。Claude Codeには不明点を黙って推測させず、`要確認` として列挙させ、影響が大きい場合は実装前に質問させます。
