<!-- source: docs/en/DEVELOPMENT.md blob 0ee45dc2807e9a9ad37b660239173db23c1cf544 -->
[English](../en/DEVELOPMENT.md) | 日本語 · [目次に戻る](README.md)

> この文書は[英語版](../en/DEVELOPMENT.md)の翻訳。内容が異なる場合は英語版が優先する。

# ローカル開発

Travel Discovery を自分のマシンで動かし、変更し、テストする人向けのガイド。セットアップ、npm のコマンド、プロジェクトの構成、よくある作業（データベース、管理アプリ、UI の文言）、テストと CI、環境変数を扱う。デプロイは [DEPLOYMENT.md](DEPLOYMENT.md) にある。

## 前提
- Node.js `>=22.22.0`（`.nvmrc` では 24 に固定）
- npm（Node に同梱。コミット済みの `package-lock.json` が正）

ローカル開発に Cloudflare のアカウント、ログイン、秘密情報はいらない。このガイドの手順でリモートのリソースを作ることはない。

## セットアップ

```bash
npm ci
npm run db:reset:local
```

`npm ci` が失敗したら「インストールの設定とトラブル対処」を見る。

## コマンド

| コマンド | 用途 |
|---|---|
| `npm run dev` | 公開アプリ: http://localhost:5173 の Vite 開発サーバー。公開 Worker をローカルの Workers ランタイムで動かす。 |
| `npm run dev:admin` | 管理アプリ: http://localhost:5174 の Vite 開発サーバー。管理 Worker を動かす。「ローカルでの管理画面」を参照。 |
| `npm run build` | 型チェックし、公開アプリ（`dist/`）と管理アプリ（`dist-admin/`）をビルドしてから `scripts/verify-bundles.mjs` を実行する。 |
| `npm run preview` / `npm run preview:admin` | 本番ビルドをローカルの Workers ランタイムで配信する（ポート 4173 / 4174）。先に `npm run build` を実行する。 |
| `npm run lint` | ESLint（型情報を使うルールとモジュール境界のルール）。 |
| `npm run typecheck` | TypeScript のプロジェクト参照のビルド。出力はしない。 |
| `npm test` | Vitest: `unit` プロジェクト（Node／jsdom）と `workers` プロジェクト（マイグレーション済みのローカル D1 を持つ Workers ランタイム）。 |
| `npm run check` | lint、型チェック、テスト、ビルドを順に実行する。 |
| `npm run test:e2e` | 本番ビルドに対する Playwright の E2E テスト（「E2E テスト」を参照）。`check` には含まない。 |
| `npm run ai:eval` | 実際の Workers AI のモデルを使う任意のモデル評価。Neurons を消費し、明示的な確認と認証情報が要る（[AI_EVALUATION.md](../working/AI_EVALUATION.md)、英語のみ）。`check` には決して含めない。 |
| `npm run quiz:simulate` | コンテンツバンドル（`test/simulation/`）で、クイズの変化を決定的にシミュレーションする。異なる質問の組み合わせの数、共通する質問、各質問と各旅行先が出る頻度を出す。`QUIZ_SIMULATE_BUNDLES` に `content/` 内のファイル名をカンマ区切りで指定する（既定は最新のバンドル）。ローカルだけで、ネットワークは使わない。`check` には決して含めない。 |
| `npm run e2e:db` | `.wrangler/e2e/state` にある E2E 専用のデータベースを作り直す（マイグレーションとシード）。`test:e2e` が自動で実行する。 |
| `npm run db:generate` | `server/db/schema.ts` から `migrations/` に SQL マイグレーションを生成する（drizzle-kit）。適用する前に SQL を確認する。 |
| `npm run db:migrate:local` | 未適用のマイグレーションをローカルの D1 データベースに適用する。 |
| `npm run db:seed:local` | `db/seed/dev.sql` をローカルのデータベースに読み込む（空でマイグレーション済みのデータベースが前提）。 |
| `npm run db:reset:local` | ローカルの D1 の状態を消してから、マイグレーションとシードをする。 |

> [!WARNING]
> デプロイ用のスクリプトとリモートのデータベース用コマンドは、意図して用意していない。`wrangler deploy` や `--remote` つきのコマンドは、オーナーの承認なしに実行しない。

`scripts/check-deployment.mjs` は、デプロイ済みの Worker に匿名のリクエストを送るだけだ（[OPERATIONS.md](OPERATIONS.md)「3. 定期チェック」）。

## プロジェクトの構成

```text
index.html, src/        Public SPA (React)
admin/                  Admin SPA (index.html, src/, public/_headers)
worker/                 Public Worker: read-only API under /api/*
admin-worker/           Admin Worker: admin API under /api/admin/*
server/db/              Drizzle schema and client (shared)
server/http/            Error contract and request parsing (shared)
server/public/          Published-content reads and the AI explanation use case (public Worker only)
server/ai/              AI provider interface and model-output validation (public Worker only)
server/admin/           Admin validation, reads, writes, Access auth (admin only)
shared/                 Locale, currency, month, and API error constants (browser and Workers)
domain/diagnosis/       Pure diagnostic engine (docs/en/DIAGNOSTIC_ALGORITHM.md)
migrations/             Generated SQL migrations (+ drizzle-kit snapshots in meta/)
db/seed/dev.sql         Local seed data
content/                Reviewed content bundles for the admin Import page (ADR-028)
test/workers/           Workers-runtime tests (D1, auth, CRUD, public API)
test/node/              Static boundary checks, content bundle checks
scripts/                Build-time verification
wrangler.jsonc          Public Worker config (binding PUBLIC_DB)
wrangler.admin.jsonc    Admin Worker config (binding ADMIN_DB; owns migrations)
```

ESLint（`no-restricted-imports`）と `test/node/boundary.test.ts` が、管理用のコードを公開 Worker と公開 SPA に入れないようにしている（ADR-018）。同じ仕組みで、`domain/` が UI、サーバー、データベース、プラットフォーム、AI に依存しないようにしている（ADR-021）。

## データベース

両方の Worker が同じ D1 データベース（`travel-discovery`）をバインドする。ローカル開発では、どちらの設定もプレースホルダーの `database_id` `local-travel-discovery` を使う。だから `.wrangler/state`（Git の対象外）にある 1 つのローカルデータベースを共有する。マイグレーションは `wrangler.admin.jsonc` からだけ適用する。

スキーマを変えるとき:
1. `server/db/schema.ts` を編集する。
2. `npm run db:generate -- --name <short_name>` を実行し、生成された SQL を確認する。
3. `npm run db:migrate:local` を実行し、必要なら `db/seed/dev.sql` を更新する。
4. スキーマ、SQL ファイル、`migrations/meta/` をコミットする。

## ローカルでの管理画面

Cloudflare Access はローカルでは動かないので、管理 API は既定で 403 を返す。ローカルで管理 UI を使うには:

```bash
cp .dev.vars.example .dev.vars
```

```bash
npm run dev:admin
```

`.dev.vars`（Git の対象外）は `ADMIN_DEV_IDENTITY_EMAIL` を設定する。これが効くのは Vite の開発サーバーだけだ。本番ビルドにはこれを読むコードが入っていない（`npm run build` で確認している）。公開 API で公開した変更を見るには、同時に `npm run dev` も動かす。

### `.dev.vars` とビルドの出力

> [!WARNING]
> ビルドは `.dev.vars` を `dist/` と `dist-admin/` にコピーする。`.dev.vars` があるうちは、これらのディレクトリを共有、アップロード、公開しない。

このリポジトリで確認したこと（2026-10-17、`@cloudflare/vite-plugin` 1.64.0）:
- `.dev.vars` があると、`npm run build` はそれを `dist/worker/.dev.vars` と `dist-admin/admin_worker/.dev.vars` にコピーする。
- `npm run preview:admin` で配信した本番ビルドは、そのコピーがあっても管理 API のリクエストに 403 を返す。開発用の身元を扱うコードがビルドに入っていないからだ。

Cloudflare の文書にはあるが、ここでは確認していないこと: このコピーは "only used when running `vite preview` and is not deployed with your Worker" とされている（[Vite plugin: Secrets](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)）。

推奨:
- `.dev.vars` があるうちは、`dist/` や `dist-admin/` を共有、アップロード、公開しない（CI のアーティファクト、アーカイブ、静的ホストなど）。先にコピーされた `.dev.vars` を消すか、`.dev.vars` なしでビルドし直す。
- `.dev.vars` には、ローカル用の機密でないテスト値だけを入れる。デプロイした Worker の本物の秘密情報は `wrangler secret put` かダッシュボードで設定する。
- `@cloudflare/vite-plugin` を上げたら、コピーの挙動を確かめ直す。

## アセットと Worker のルーティング
各 Worker の設定は `assets.run_worker_first: ["/api/*"]` を指定している。Worker が動くのは `/api/*` のリクエストだけだ。それ以外のパスは静的アセットから返し、知らないパスは `index.html` にフォールバックする（`not_found_handling: "single-page-application"`）。

```bash
curl "http://localhost:5173/api/destinations?locale=en"
```

## UI の文言の追加
1. キーと日本語の文言を `src/i18n/messages/ja.ts`（公開）か `admin/src/i18n/messages/ja.ts`（管理）に足す。
2. 同じキーを `en.ts` と `es.ts` にも足す。3 つがそろうまで型チェックが失敗する。
3. `useTranslation()` の `t("your.key")` を使う。UI の文字列をコンポーネントにハードコードしない。

## アクセシビリティのチェック

`src/app/accessibility.test.tsx` は、公開ページのすべての状態について、ja／en／es／fr で axe-core（dev dependency）を実行する。検証エラー、エラー状態、結果の詳細を開いた状態も含む。

- jsdom は色を計算できないので、そこでは `color-contrast` を無効にしている。色を変えたら、実際のブラウザー（ライトとダークの両方の配色）でコントラストを確かめる。
- キーボードの挙動とスクリーンリーダーの読み上げは、引き続き手で確かめる必要がある。

## E2E テスト

`npm run test:e2e` は、`e2e/` のスペックを Playwright（`playwright.config.ts`）で実行する:
- 公開のスペックは、デスクトップとモバイル（Pixel 7）の 2 つのプロジェクトで動く。
- その後、`e2e/admin.spec.ts` を `admin` プロジェクト（デスクトップ）で動かす。共有のデータベースでコンテンツを公開・アーカイブするので、公開のスペックの後に回す。

Playwright は 3 つのサーバーを起動する。どれも `E2E_STATE_DIR=.wrangler/e2e/state` を使うので、`.wrangler/state` の開発用データには触れない:

| ポート | サーバー | 用途 |
|---|---|---|
| 4180 | データベースを作り直した（`npm run e2e:db`）後の公開の本番ビルド（`vite preview`） | 公開のスペック。`public/_headers` のセキュリティヘッダーが効く |
| 4181 | `CLOUDFLARE_ENV=e2e` の管理の開発サーバー | 許可される管理のパス。`wrangler.admin.jsonc` の `env.e2e` にあるローカルの身元 `e2e-admin@example.test` を使う（開発ビルドだけ。この環境は決してデプロイしない） |
| 4182 | 管理の本番ビルド（`vite preview`） | 拒否される管理のパス。Access の JWT がなければ、管理 API のリクエストはすべて 403 でなければならない |

管理のサーバーは公開のサーバーを待つ（`scripts/wait-for-url.mjs`）。データベースが作り直されてから開くためだ。デバッガーのポートなしで動かすので、同時に起動できる。

**ブラウザー。** 既定ではローカルにインストールした Google Chrome（`channel: "chrome"`）を使うので、何もダウンロードしない。代わりに Playwright 同梱の Chromium を使う（CI など）なら、`npx playwright install chromium` を実行して `PLAYWRIGHT_CHANNEL=bundled` を設定する。このインストールは Microsoft の CDN から数百 MB をダウンロードするので、先にオーナーの承認を得る。

**管理のスペックが確かめること:**
- 本番ビルドでの認可: トークンなしのリクエストはすべて 403（Cookie だけでも同じ）、UI にローカライズしたエラーを表示。
- 開発サーバーでのコンテンツの流れ: draft → published → archived を公開 API と診断のスナップショットで確認し、不正なスラッグが拒否されることも確かめる。
- 管理画面の言語切り替え: 文書のメタデータと、再読み込み後も選んだ言語が残ること。
- すべての管理ページでの axe-core。

**公開のスペックが確かめること:**
- AI なしの主な流れ。
- 任意の AI ノート。OFF ならリクエストなし。ON なら、AI を設定していない本物のプレビューサーバーへのリクエスト 1 回（503 が返る）と、モックした成功。モデルは一度も呼ばない。
- 戻る・直す・やり直す、再読み込みの挙動と保存、言語の検出と切り替え。
- API のエラーと空のコンテンツ、セキュリティヘッダーと CSP のエラー、横方向のはみ出し。
- キーボードだけの操作（デスクトップ）と、ライト・ダークでの axe-core のチェック。axe はインラインスクリプトとして注入するので、axe のテストは自分のコンテキストでだけ CSP を無効にする。

## 継続的インテグレーション

`.github/workflows/ci.yml` は、`main` と `dev` への push と pull request で 2 つのジョブを動かす（[DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-027）。どちらのジョブも秘密情報を使わない。
- `check`: `npm ci`、`npm run check`。
- `e2e`: `npm ci`、`npm run test:e2e`。ランナーのイメージに入っている Google Chrome を使うので、何もダウンロードしない。E2E が失敗したら、`test-results/`（ローカルのシードデータだけを含むトレース）をアーティファクトとしてアップロードし、7 日間保持する。

ローカルで E2E を全部動かすと、2026-10-24 時点で約 1 分かかった。

## 環境変数

ローカルの値は `.dev.vars` に入れる（「ローカルでの管理画面」を参照）。すべての変数は `.env.example` に並べてある。

**デプロイした管理 Worker**（オーナーが Access の設定を承認してから設定する）:
- `ACCESS_TEAM_DOMAIN`、`ACCESS_POLICY_AUD`。これらがないと、管理 API のリクエストはすべて 403 で拒否される。
- 任意の Rate Limiting バインディング `ADMIN_RATE_LIMITER`。Access のメールアドレスをキーにする。まだ設定していない（[DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-020）。

**公開 Worker の AI 説明**（[DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-026。まだどれも設定していない）:

| 設定 | 意味 |
|---|---|
| `AI_ASSIST_ENABLED` | `"true"` でエンドポイントを有効にする。それ以外（未設定を含む）なら無効で、モデルは呼ばない。 |
| `AI_MODEL` | `server/ai/workers-ai.ts` にあるモデル ID のどれか。 |
| `AI` バインディング | Workers AI のバインディング。 |
| `AI_CLIENT_RATE_LIMITER` | 任意の、利用者ごとのレート制限バインディング。全体用のリミッターは意図して置いていない（ADR-026）。 |
| `AI_CLIENT_LIMITER` | 利用者ごとの厳密な上限のための Durable Object バインディング（ADR-029）。`wrangler.jsonc` のトップレベルにも設定してあり、そこではローカルでだけ動く。これがないと AI は動かない。 |

- AI を無効にするには、`AI_ASSIST_ENABLED` を `"true"` 以外にするか、消す。診断は動き続ける。
- テストはフェイクを使い、Workers AI を呼ばない。
- これらの設定は名前つきのデプロイ環境にだけ置く。`npm run dev`、テスト、E2E が使うトップレベルの `wrangler.jsonc` には決して置かない。`ai` バインディングは常に Cloudflare に接続するからだ（[DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-026、C）。
- 本物のモデルを動かすのは、[AI_EVALUATION.md](../working/AI_EVALUATION.md)（英語のみ）にある任意の評価手順だけ。
- Cloudflare の API トークンを `.dev.vars` に決して入れない。ビルドがそのファイルを `dist/` にコピーするからだ。

## インストールの設定とトラブル対処

`.npmrc` の設定:
- `engine-strict=true`: 対応していない Node のバージョンではインストールが失敗する。
- `strict-allow-scripts=true`: `package.json` の `allowScripts` にないインストールスクリプトを持つ依存関係があると、インストールが失敗する。`esbuild`、`fsevents`、`workerd` のスクリプトは不要なので明示的に拒否している（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の ADR-016）。

`npm ci` が `ESTRICTALLOWSCRIPTS` で失敗したら、依存関係の更新で新しいインストールスクリプトが入ったということだ。何をするスクリプトかを確かめてから、`npm deny-scripts <pkg>`（推奨）か `npm approve-scripts <pkg>`（バージョン固定）で判断を記録する。`--dangerously-allow-all-scripts` や `npm approve-scripts --all` は決して使わない。

`--omit=optional` でインストールしない。`workerd` と `esbuild` のバイナリは、プラットフォームごとの optional dependencies から入る。
