<!-- source: docs/en/DEVELOPMENT.md blob 9897623f82520e6616d77426b6851bbeb37d4de4 -->
[English](../en/DEVELOPMENT.md) | 日本語 · [目次に戻る](README.md)

> この文書は[英語版](../en/DEVELOPMENT.md)の翻訳です。内容が異なる場合は英語版が優先されます。

# ローカル開発

## 前提
- Node.js `>=22.22.0`（`.nvmrc` では 24 に固定）
- npm（Node に同梱。コミット済みの `package-lock.json` が正）

ローカル開発に Cloudflare のアカウント、ログイン、秘密情報は不要。このガイドの手順でリモートのリソースが作られることはない。

## セットアップ

```bash
npm ci
npm run db:reset:local
```

`.npmrc` の設定:
- `engine-strict=true`: 対応していない Node のバージョンではインストールが失敗する。
- `strict-allow-scripts=true`: `package.json` の `allowScripts` にないインストールスクリプトを持つ依存関係があると、インストールが失敗する。`esbuild`、`fsevents`、`workerd` のスクリプトは不要なので明示的に拒否している（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の ADR-016）。

`npm ci` が `ESTRICTALLOWSCRIPTS` で失敗した場合は、依存関係の更新で新しいインストールスクリプトが入ったということである。何をするスクリプトかを確認してから、`npm deny-scripts <pkg>`（推奨）か `npm approve-scripts <pkg>`（バージョン固定）で判断を記録する。`--dangerously-allow-all-scripts` や `npm approve-scripts --all` は決して使わない。

`--omit=optional` でインストールしない。`workerd` と `esbuild` のバイナリは、プラットフォームごとの optional dependencies から入る。

## コマンド

| コマンド | 用途 |
|---|---|
| `npm run dev` | 公開アプリ: http://localhost:5173 の Vite 開発サーバー。公開 Worker はローカルの Workers ランタイムで動く。 |
| `npm run dev:admin` | 管理アプリ: http://localhost:5174 の Vite 開発サーバーと管理 Worker。「Admin locally」（ローカルでの管理画面）を参照。 |
| `npm run build` | 型チェックをし、公開アプリ（`dist/`）と管理アプリ（`dist-admin/`）をビルドしてから `scripts/verify-bundles.mjs` を実行する。 |
| `npm run preview` / `npm run preview:admin` | 本番ビルドをローカルの Workers ランタイムで配信する（ポート 4173／4174）。先に `npm run build` を実行する。 |
| `npm run lint` | ESLint（型情報を使うルールとモジュール境界のルール）。 |
| `npm run typecheck` | TypeScript のプロジェクト参照のビルド（出力なし）。 |
| `npm test` | Vitest: `unit` プロジェクト（Node／jsdom）と `workers` プロジェクト（マイグレーション済みのローカル D1 を持つ Workers ランタイム）。 |
| `npm run check` | lint、型チェック、テスト、ビルドを順に実行する。 |
| `npm run test:e2e` | 本番ビルドに対する Playwright の E2E テスト（「End-to-end tests」を参照）。`check` には含まれない。 |
| `npm run ai:eval` | 実際の Workers AI モデルに対して任意で行うモデル評価。Neurons を消費し、明示的な確認と認証情報が必要（[AI_EVALUATION.md](../working/AI_EVALUATION.md)（英語のみ））。`check` には決して含めない。 |
| `npm run quiz:simulate` | コンテンツのバンドルで、クイズの変化を決定的にシミュレーションする（`test/simulation/`）。質問セットの種類数、共通する質問の数、各質問と各旅行先が出る割合を表示する。`QUIZ_SIMULATE_BUNDLES` に `content/` のファイル名をカンマ区切りで指定する（既定は最新のバンドル）。ローカルのみで、ネットワークは使わない。`check` には含めない。 |
| `npm run e2e:db` | `.wrangler/e2e/state` にある E2E 専用のデータベースを作り直す（マイグレーションとシード）。`test:e2e` が自動で実行する。 |
| `npm run db:generate` | `server/db/schema.ts` から `migrations/` に SQL マイグレーションを生成する（drizzle-kit）。適用する前に SQL を確認する。 |
| `npm run db:migrate:local` | 未適用のマイグレーションをローカルの D1 データベースに適用する。 |
| `npm run db:seed:local` | `db/seed/dev.sql` をローカルのデータベースに読み込む（空でマイグレーション済みのデータベースが前提）。 |
| `npm run db:reset:local` | ローカルの D1 の状態を削除してから、マイグレーションとシードを行う。 |

デプロイ用のスクリプトとリモートのデータベースを操作するコマンドは、意図的に用意していない。オーナーの承認なしに `wrangler deploy` や `--remote` を付けたコマンドを実行しない。`scripts/check-deployment.mjs` は、デプロイ済みの Worker に匿名のリクエストを送るだけである（[OPERATIONS.md](OPERATIONS.md)「3. Routine checks」）。

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

ESLint（`no-restricted-imports`）と `test/node/boundary.test.ts` によって、管理用のコードが公開 Worker と SPA に入らないようにしている（ADR-018）。同じ仕組みで、`domain/` が UI、サーバー、データベース、プラットフォーム、AI に依存しないようにしている（ADR-021）。

## データベース

両方の Worker が同じ D1 データベース（`travel-discovery`）をバインドする。ローカル開発では両方の設定がプレースホルダーの `database_id` `local-travel-discovery` を使い、`.wrangler/state`（git の管理対象外）にある 1 つのローカルデータベースを共有する。マイグレーションは `wrangler.admin.jsonc` からだけ適用する。

スキーマの変更:
1. `server/db/schema.ts` を編集する。
2. `npm run db:generate -- --name <short_name>` を実行し、生成された SQL を確認する。
3. `npm run db:migrate:local` を実行し、必要なら `db/seed/dev.sql` を更新する。
4. スキーマ、SQL ファイル、`migrations/meta/` をコミットする。

## ローカルでの管理画面

Cloudflare Access はローカルでは動かないので、管理 API は既定で 403 を返す。ローカルで管理 UI を使うには:

```bash
cp .dev.vars.example .dev.vars
npm run dev:admin
```

`.dev.vars`（git の管理対象外）で `ADMIN_DEV_IDENTITY_EMAIL` を設定する。これが効くのは Vite 開発サーバーの中だけで、本番ビルドにはそれを読むコードが含まれない（`npm run build` で確認している）。公開 API で公開済みの変更を見るには、同時に `npm run dev` も実行する。

### `.dev.vars` とビルドの出力

このリポジトリで確認したこと（2026-10-17、`@cloudflare/vite-plugin` 1.64.0）:
- `.dev.vars` ファイルがあると、`npm run build` はそれを `dist/worker/.dev.vars` と `dist-admin/admin_worker/.dev.vars` にコピーする。
- そのコピーがあっても、`npm run preview:admin` で配信した本番ビルドは管理 API のリクエストに 403 を返す。開発用の ID のコードがビルドに含まれないためである。

Cloudflare が文書化しているが、ここでは確認していないこと（デプロイしていない）: このコピーは「`vite preview` の実行時にだけ使われ、Worker と一緒にはデプロイされない」（[Vite plugin: Secrets](https://developers.cloudflare.com/workers/vite-plugin/reference/secrets/)）。

推奨:
- `.dev.vars` ファイルがある間は、`dist/` や `dist-admin/` を共有、アップロード、公開しない（CI の成果物、アーカイブ、静的ホストなど）。先にコピーされた `.dev.vars` ファイルを削除するか、`.dev.vars` なしでビルドし直す。
- `.dev.vars` には、ローカル用の機密でないテスト値だけを置く。デプロイした Worker の本物の秘密情報は `wrangler secret put` かダッシュボードで設定する。
- `@cloudflare/vite-plugin` を更新したら、コピーの挙動を改めて確認する。

## アセットと Worker のルーティング
各 Worker の設定は `assets.run_worker_first: ["/api/*"]` を指定している。Worker を呼び出すのは `/api/*` へのリクエストだけで、それ以外のパスは静的アセットから配信し、不明なパスは `index.html` にフォールバックする（`not_found_handling: "single-page-application"`）。

```bash
curl "http://localhost:5173/api/destinations?locale=en"
```

## UI の文言の追加
1. キーと日本語の文言を `src/i18n/messages/ja.ts`（公開）または `admin/src/i18n/messages/ja.ts`（管理）に追加する。
2. 同じキーを `en.ts` と `es.ts` にも追加する。3 つが一致するまで型チェックが失敗する。
3. `useTranslation()` の `t("your.key")` を使う。コンポーネントに UI の文字列をハードコードしない。

## アクセシビリティのチェック

`src/app/accessibility.test.tsx` は、ja／en／es の公開ページのすべての状態（検証エラー、エラー状態、展開した結果の詳細を含む）に対して axe-core（開発用の依存関係）を実行する。jsdom は色を計算できないので、そこでは `color-contrast` を無効にしている。色を変えたときは、実際のブラウザー（ライトとダークの配色）でコントラストを確認する。キーボードの挙動とスクリーンリーダーの読み上げは、引き続き手作業での確認が必要である。

## E2E テスト

`npm run test:e2e` は、`e2e/` のスペックを Playwright（`playwright.config.ts`）で実行する: 公開画面のスペックをデスクトップとモバイル（Pixel 7）のプロジェクトで実行し、その後に `e2e/admin.spec.ts` を `admin` プロジェクト（デスクトップ）で実行する。admin は共有のデータベースでコンテンツを公開・アーカイブするので、後に回している。Playwright は 3 つのサーバーを起動し、どれも `E2E_STATE_DIR=.wrangler/e2e/state` を使うので、`.wrangler/state` の開発用データには一切触れない:

| ポート | サーバー | 用途 |
|---|---|---|
| 4180 | データベースを作り直した（`npm run e2e:db`）後の公開アプリの本番ビルド（`vite preview`） | 公開画面のスペック。`public/_headers` のセキュリティヘッダーが適用される |
| 4181 | `CLOUDFLARE_ENV=e2e` の管理用開発サーバー | 許可される管理パス。`wrangler.admin.jsonc` の `env.e2e` にあるローカルの ID `e2e-admin@example.test` を使う（開発ビルドのみ。その環境は決してデプロイしない） |
| 4182 | 管理アプリの本番ビルド（`vite preview`） | 拒否される管理パス。Access の JWT がなければ、管理 API のリクエストはすべて 403 でなければならない |

管理用のサーバーは、データベースが作り直されてから開くように公開サーバーを待ち（`scripts/wait-for-url.mjs`）、同時に起動できるようデバッガーのポートなしで動かす。

ブラウザー: 既定ではローカルにインストールされた Google Chrome（`channel: "chrome"`）を使うので、何もダウンロードしない。代わりに Playwright 同梱の Chromium を使う場合（例えば CI）は、`npx playwright install chromium` を実行し（Microsoft の CDN から数百 MB をダウンロードする。先にオーナーの承認を得る）、`PLAYWRIGHT_CHANNEL=bundled` を設定する。

管理画面のスペックが扱うもの: 本番ビルドでの認可（トークンのないリクエストは Cookie だけの場合も含めてすべて 403 で、UI にはローカライズされたエラーが出る）、開発サーバーでのコンテンツのワークフロー（draft → published → archived を公開 API と診断のスナップショットで確認し、不正なスラッグが拒否されることも確認する）、文書のメタデータを含む管理画面の言語切り替えと、再読み込み後も選択が保存されていること、すべての管理ページでの axe-core。公開画面のスペックが扱うもの: AI なしの主要な流れ、任意の AI ノート（OFF: リクエストなし。ON: AI を設定していない実際のプレビューサーバーへの 1 回のリクエストが 503 を返すことと、モックした成功。モデルを呼ぶことは一切ない）、戻る・編集・やり直し、再読み込み時の挙動と保存内容、言語の検出と切り替え、API のエラーと空のコンテンツ、セキュリティヘッダーと CSP のエラー、横方向のはみ出し、キーボードだけの操作（デスクトップ）、ライトモードとダークモードでの axe-core のチェック。axe はインラインスクリプトとして注入されるので、axe のテストは自分のコンテキストに限って CSP を無効にしている。

## 継続的インテグレーション

`.github/workflows/ci.yml` は、`main` と `dev` への push と pull request で 2 つのジョブを実行する（[DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-027）: `check`（`npm ci`、`npm run check`）と `e2e`（`npm ci`、ランナーのイメージにあらかじめ入っている Google Chrome での `npm run test:e2e`。何もダウンロードしない）。E2E が失敗した場合は、`test-results/`（ローカルのシードデータだけを含むトレース）を 7 日間保持する成果物としてアップロードする。どちらのジョブも秘密情報を必要としない。2026-10-24 時点で、ローカルでの E2E の全実行には約 1 分かかった。

## 環境変数
- ローカル: `.dev.vars`（「ローカルでの管理画面」を参照）。`.env.example` にすべての変数を載せている。
- デプロイした管理 Worker（オーナーが Access の設定を承認した後にだけ設定する）: `ACCESS_TEAM_DOMAIN`、`ACCESS_POLICY_AUD`。これがないと、管理 API のリクエストはすべて 403 で拒否される。任意の Rate Limiting バインディング `ADMIN_RATE_LIMITER`（Access のメールアドレスをキーにする。まだ設定していない。[DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-020）。
- 公開 Worker の AI 説明（[DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-026。まだどれも設定していない）: `AI_ASSIST_ENABLED`（`"true"` でエンドポイントが有効になる。未設定を含むそれ以外の値では無効になり、モデルは呼ばれない）、`AI_MODEL`（`server/ai/workers-ai.ts` にあるモデル ID のいずれか）、`AI` バインディング、任意のクライアントごとのレート制限バインディング `AI_CLIENT_RATE_LIMITER`（全体のリミッターは意図的に置いていない。ADR-026）、Durable Object のバインディング `AI_CLIENT_LIMITER`（厳密なクライアントごとの上限。ADR-029。`wrangler.jsonc` のトップレベルにもあり、そこではローカルでのみ動く。これがないと AI は動かない）。AI を無効にするには、`AI_ASSIST_ENABLED` を `"true"` 以外にするか削除する。診断はそのまま動く。テストはフェイクを使い、Workers AI を呼ばない。`ai` バインディングは常に Cloudflare に接続するので、これらの設定は名前付きのデプロイ環境にだけ置き、`npm run dev`、テスト、E2E が使うトップレベルの `wrangler.jsonc` には決して置かない（[DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-026、C）。実際のモデルでの実行は、[AI_EVALUATION.md](../working/AI_EVALUATION.md)（英語のみ）にある任意の評価手順でだけ行う。ビルドが `.dev.vars` を `dist/` にコピーするので、Cloudflare の API トークンを `.dev.vars` に決して置かない。
