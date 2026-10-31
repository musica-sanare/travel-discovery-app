<!-- source: docs/en/README.md blob 2e1af70c1b42e2b730c0a520da104313fc0ef759 -->
[English](../en/README.md) | 日本語 · [リポジトリの README](../../README.ja.md)

> この文書は[英語版](../en/README.md)の翻訳。内容が異なる場合は英語版が優先する。

# Travel Discovery ドキュメント

Travel Discovery の仕様、設計、ガイドと、開発中に使う英語のみの作業用ドキュメント。

## 仕様と設計

| 文書 | 説明 |
|---|---|
| [プロダクト仕様](SPEC.md) | アプリの機能、対象ユーザー、MVP の範囲外のもの。 |
| [アーキテクチャ](ARCHITECTURE.md) | Worker、論理レイヤー、リクエストの流れ、管理者認証、AI の境界、プライバシー。 |
| [データモデル](DATA_MODEL.md) | D1 のエンティティ、ローカライズ用のテーブル、制約。 |
| [診断アルゴリズム](DIAGNOSTIC_ALGORITHM.md) | 決定的な質問の選択、スコアリング、順位付けの仕様。 |

## ガイド

| 文書 | 説明 |
|---|---|
| [ローカル開発](DEVELOPMENT.md) | セットアップ、コマンド、プロジェクトの構成、テスト、E2E、CI。 |
| [デプロイ手順書](DEPLOYMENT.md) | 環境、D1 とマイグレーション、Cloudflare Access、デプロイ、ロールバック、デプロイの履歴。 |
| [AI 有効化の手順書](AI_ENABLEMENT.md) | 任意の AI ノートの有効化: プレビューでの試行、リミッターの確認、本番での有効化、AI の止め方。 |
| [運用手順書](OPERATIONS.md) | 監視、定期チェックと日付の決まったチェック、インシデント、バックアップ、コンテンツの公開。 |

## 作業用ドキュメント（英語のみ）

| 文書 | 説明 |
|---|---|
| [Decisions](../working/DECISIONS.md)（英語のみ） | 設計判断の記録（ADR）と確認ログ。 |
| [Implementation plan](../working/IMPLEMENTATION_PLAN.md)（英語のみ） | フェーズ、各フェーズのプロンプトファイル、受け入れ基準。 |
| [AI model evaluation](../working/AI_EVALUATION.md)（英語のみ） | Workers AI モデルを比較するための計画、基準、記録。 |
| [Public release checklist](../working/PUBLIC_RELEASE.md)（英語のみ） | リポジトリを公開する前に済ませるチェック。 |
