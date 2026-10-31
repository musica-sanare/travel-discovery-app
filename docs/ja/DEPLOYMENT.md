<!-- source: docs/en/DEPLOYMENT.md blob 2c0672b1f6e02f20318653d5a2004771e70bffb8 -->
[English](../en/DEPLOYMENT.md) | 日本語 · [目次に戻る](README.md)

> この文書は[英語版](../en/DEPLOYMENT.md)の翻訳です。内容が異なる場合は英語版が優先されます。

# デプロイ手順書

**状態（Phase 6、2026-10-18）: コマンドは現行の公式ドキュメントと照合済み（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の「Phase 6 verification log」）。** 進捗: プレビューの D1 データベース `travel-discovery-preview` を 2026-10-18 に作成し（リージョン APAC）、両方の Wrangler 設定の `env.preview`（C5）にその ID を設定した。マイグレーション `0000`〜`0001` を適用し、`db/seed/dev.sql` を読み込んだ（オーナー承認済み、プレビューのみ）。管理 Worker `travel-discovery-admin-preview` は、3.4 の Access 設定のために `workers_dev: false` で一度デプロイした（2026-10-18、バージョン `be458778`。Wrangler は "No targets deployed" と報告したので URL はない）。その後オーナーが Zero Trust と Worker レベルの Access（"All traffic"）を有効にし、生成された再利用可能なポリシーを、オーナーのアドレスに対する **Emails** の Include ルールに変更した。管理用の設定の `env.preview` に Access の値が入っている。`workers_dev: true` でのデプロイでは、管理 SPA が約 2 分間 Access なしで公開されてしまい（API は 403 のままだった）、`workers_dev: false` に戻した（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）「Phase 6 verification log」のインシデント。Access の適用範囲が "Previews only" になっていたので "All traffic" に戻した）。その後再デプロイし（バージョン `8bc1cc2c`）、Access の背後にあることを確認した: 認証されていないリクエストは Access のログインにリダイレクトされ、オーナーがサインインして管理 UI を使った（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の「Admin authentication status」）。公開 Worker `travel-discovery-preview` は 2026-10-18 にデプロイし（バージョン `ea2abe3d`、AI 無効）、Workers Logs のチェックを除く 6 節のチェックに合格した（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）「Phase 6 verification log」）。本番の D1 データベース `travel-discovery-production` を 2026-10-18 に作成し（リージョン APAC）、両方の Wrangler 設定の `env.production` にその ID を設定した。空のデータベースの Time Travel のブックマークを記録した後、マイグレーション `0000`〜`0001` を適用した（18 テーブル、コンテンツの行なし、シードデータなし）。本番の管理 Worker `travel-discovery-admin` は、Access の設定のために `workers_dev: false` で一度デプロイした（バージョン `86694c6e`、"No targets deployed"）。オーナーが Access を設定した後（All traffic、Emails ポリシー、適用範囲を再確認）、`workers_dev: true` で再デプロイした（バージョン `1b184825`）: 確認したすべてのパスが最初のリクエストからその後 2 分間 Access のログインにリダイレクトし、オーナーがサインインして空の管理画面の一覧を見て、`/api/admin/me` がオーナーのアドレスを返した。本番の公開 Worker `travel-discovery` は 2026-10-18 に空のデータベースでデプロイし（バージョン `87d11262`、AI 無効）、プレビューと同じ `curl` のチェックに合格した（コンテンツはまだなし: 旅行先 0 件、質問 0 問）。2026-10-24 に 4 つの Worker すべてを Workers Logs の呼び出しログを無効にして再デプロイし（プレビュー `def4b576`／`e45a9449`、本番 `f73d57c0`／`07a234a3`）、両方の管理 Worker の Access リダイレクトを含む同じチェックに合格した（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）「Phase 7 verification log」）。管理 Worker をコンテンツのインポート機能付きで再デプロイし（プレビュー `3e2b9f30`、本番 `9d51e1a4`）、2026-10-24 にプレビューと本番に `content/initial-v1.json` をインポートした: 本番には現在、公開済みの旅行先が 18 件、質問が 12 問ある（ADR-028）。ログイン、リソースの作成、アカウント設定の変更、デプロイを伴う手順はすべて、その時点でオーナーの明示的な承認が必要である。*(要確認)* の印がある項目はドキュメントに記載がなく、その手順を行うときに確認する。

## 1. 目標の構成

| | 公開 Worker | 管理 Worker |
|---|---|---|
| 設定 | `wrangler.jsonc` | `wrangler.admin.jsonc` |
| 提供するもの | 公開 SPA、読み取り専用 API、AI 説明のエンドポイント | 管理 SPA と管理 API |
| 保護 | なし（公開サイト） | Worker レベルの Cloudflare Access（"All traffic"）と、すべての管理 API ハンドラーでの JWT 検証（ADR-004） |
| D1 | 管理 Worker と同じデータベース。コード上は読み取り専用（ADR-018） | マイグレーションを管理する |
| 任意のバインディング | `AI`、`AI_CLIENT_RATE_LIMITER`（ADR-026）、Durable Object `AI_CLIENT_LIMITER`（ADR-029。AI に必須） | `ADMIN_RATE_LIMITER`（ADR-020） |

環境: `preview`（確認用）と `production`。それぞれ専用の D1 データベースを持つ。名前付きの環境は、その環境が自分の `name` を設定しない限り、`<name>-<environment>` という別の Worker としてデプロイされる:

| 環境 | 公開 Worker | 管理 Worker | D1 データベース |
|---|---|---|---|
| `preview` | `travel-discovery-preview` | `travel-discovery-admin-preview` | `travel-discovery-preview` |
| `production` | `travel-discovery`（`env.production` が `name` を設定。オーナーの判断 2026-10-18） | `travel-discovery-admin`（同様） | `travel-discovery-production` |

Worker の名前で `workers.dev` の URL（`<worker>.<account subdomain>.workers.dev`）が決まる。トップレベルの設定はローカル専用のままにする（`npm run dev`、テスト、E2E が使うもの）。`wrangler.admin.jsonc` の `env.e2e` はローカルのテスト用で、決してデプロイしてはならない。

## 2. 必要な承認（順番どおり）

1. ダッシュボードでアカウントのプランを確認する（Workers Free であること、支払い方法が登録されているかどうか）。
2. オーナーのターミナルから Cloudflare にログインする（3.1）。
3. 各 D1 データベースを作成する。
4. 設定変更 C5（3.3）。最初のデプロイの前にコミットする。
5. 各リモートデータベースにマイグレーションを適用する。
6. Cloudflare Zero Trust を有効にし、各管理 Worker の Access ポリシーを作成する。
7. 各デプロイ。`preview` を先に行う。
8. 後で AI を有効にするのは別の判断（7 節）。

## 3. 初回だけのセットアップ

### 3.1 ログイン
オーナーが自分のターミナルで実行する（ブラウザーでの OAuth。認証情報はユーザーのホームディレクトリに保存され、リポジトリには決して入らない）:

```bash
npx wrangler login
```

```bash
npx wrangler whoami
```

デプロイ用の API トークンを作らない。`.dev.vars`、`.env`、リポジトリ内のどのファイルにもトークンを決して置かない。Phase 4 の評価用トークンはデプロイ用ではなく、既に削除されているはずである（10 節）。

### 3.2 D1 データベース
環境ごとに 1 つのデータベース:

```bash
npx wrangler d1 create travel-discovery-preview
```

表示された `database_id` を、**両方の**設定の対応する環境に記録する（C5）。ID は秘密情報ではない。ローカル用のプレースホルダー `local-travel-discovery` を使い回さない。それでデプロイすると、他のデータベースに触れることなく失敗する（ADR-018）。`travel-discovery-production` は、本番が承認されたときにだけ同じ方法で作成する。`--location`（ロケーションのヒント）は任意で、オーナーが選ばない限り指定しない。

### 3.3 設定（C5、ADR-026「Stage 5 preparation decisions」C）
`env.preview` と `env.production` は両方の Wrangler 設定にあり（Phase 6、2026-10-18）、それぞれ専用のデータベースと `namespace_id` の値を持つ（プレビュー `1001`／`1002`、本番 `2001`／`2002`）。`env.production` はトップレベルの Worker 名を保つために `name` も設定している。`vars` とバインディングは名前付きの環境に継承されないので、各環境は使うものをすべて宣言する:
- 両方の Worker: その環境の `database_name` と `database_id` を持つ `d1_databases`（管理用の設定は `migrations_dir` も保持する）。`"observability": { "enabled": true, "logs": { "enabled": true, "invocation_logs": false } }`（アプリ自身の行だけの Workers Logs。呼び出しログは各リクエストの IP アドレス、ヘッダー、位置情報を保存するため。[DECISIONS.md](../working/DECISIONS.md)（英語のみ）「Phase 7 verification log」）。ダッシュボードとの食い違いが黙って生じないよう、明示的に設定した `"workers_dev": true` と `"preview_urls": false`。`upload_source_maps`。
- 公開 Worker: `ai` バインディング。`vars` の `AI_ASSIST_ENABLED: "false"` と `AI_MODEL: "@cf/google/gemma-4-26b-a4b-it"`。`ratelimits` バインディング `AI_CLIENT_RATE_LIMITER`（`simple: { limit: 5, period: 60 }`）。Durable Object のバインディング `AI_CLIENT_LIMITER`（クラス `AiClientLimiter`）とマイグレーション `v1`（`new_sqlite_classes`）。ローカル用にトップレベルにもある（ADR-029）。
- 管理 Worker: `ratelimits` バインディング `ADMIN_RATE_LIMITER`（推奨値 `limit: 120, period: 60`）。`vars` の `ACCESS_TEAM_DOMAIN` と `ACCESS_POLICY_AUD`（秘密情報ではない。3.4 の後で判明し、管理 Worker ごとに異なる）。
- `ratelimits` の各エントリーには専用の `namespace_id`（アカウント内で一意な正の整数を文字列で）が必要である。ID を共有するバインディングはカウンターも共有するので、プレビューと本番で共有してはならない。
- `ai`、`ratelimits`、AI の変数をトップレベルに決して追加しない。`ai` バインディングは、`npm run dev` やテストからでも常に Cloudflare に接続する。
- `CLOUDFLARE_ENV` をデプロイ環境に設定したまま `npm run dev` や `npm run dev:admin` を実行しない。また、環境向けのビルドの後に `npm run preview` を使わない。どちらもその環境の `ai` バインディングを使ってしまう。`dist/` と `dist-admin/` をローカルの設定に戻すには、`CLOUDFLARE_ENV` なしで `npm run build` を実行する。

C5 のチェック（ローカル、ログイン不要。`env.preview` について 2026-10-18 にすべて合格）: トップレベルのビルド出力（`dist/worker/wrangler.json`、`dist-admin/admin_worker/wrangler.json`）が、定義された環境の一覧以外は変わっていないこと。`CLOUDFLARE_ENV=preview npm run build` が期待どおりの平坦化した設定を書き出すこと。`npm run check` と `npm run test:e2e` が通ること。`npm run dev` でリモートバインディングの警告が出ないこと。

### 3.4 各管理 Worker の Cloudflare Access
Worker レベルの Access は存在する Worker にしか適用できず、管理 Worker は Access なしで到達できる状態になってはならない。そこで:
1. 管理 Worker の初回のデプロイは、その環境で `"workers_dev": false`（と `"preview_urls": false`）にして、URL を持たない状態で行う。そうした Worker でも Access のタブは使える（2026-10-18 に確認）。
2. 必要なら Zero Trust を有効にし（ダッシュボード）、チーム名を選ぶ。そこで Free プランのシート数の上限とログイン方法（例えば One-time PIN）を確認する *(要確認: ドキュメントに記載がない)*。
3. Workers & Pages → 管理 Worker → Access → "Protect this Worker behind Access" → 適用範囲は **All traffic**。クイックセットアップで選べるポリシーは "Cloudflare account" と "Email domain" だけである（2026-10-18 に確認）: **Cloudflare account**（このアカウントのメンバーだけ）を選んで適用し、その後 Zero Trust → Access controls → Policies を開いて、生成された再利用可能なポリシー（`<worker> - Production`）を編集し、Include ルールをオーナーの完全なアドレスを指定した **Emails** セレクターに変更する。公開のメールサービスに対して "Email domain" を選ばない（そこのすべてのアドレスを許可してしまう）。"Everyone" セレクターや、"Login Methods: One-time PIN" の Include ルールも選ばない。後者は PIN を受け取れる人なら誰でも許可してしまう。
4. AUD タグ（Zero Trust → Access controls → Applications → その Worker のアプリケーション。ドキュメントでは Configure → Additional settings → "Application Audience (AUD) Tag" とあるが、ダッシュボードは異なる場合がある）とチームドメイン（`https://<team>.cloudflareaccess.com`。Zero Trust → Settings、または Zero Trust を有効にしたときに選んだチーム名から導く）を、その環境の `ACCESS_POLICY_AUD` と `ACCESS_TEAM_DOMAIN` にコピーし、`"workers_dev": true` を設定して、コミット、再ビルド、再デプロイする。この 2 つの値がないと、管理 API のリクエストにはすべて 403 を返す（失敗時は拒否）。
5. Access のタブやポリシーを変更した後は、必ず適用範囲（**All traffic**）と、Worker の `workers.dev` の URL（Settings → Domains & Routes）の両方を確認する: 2026-10-18 には、Access の設定を保存した後に、適用範囲が "Previews only" になっていたことと、URL が無効になっていたことがそれぞれ一度あった。`workers_dev` を有効にするデプロイの直後に、`/` と `/api/admin/me` に認証なしのリクエストを送る: どちらも `https://<team>.cloudflareaccess.com/...` にリダイレクトしなければならない。`/` が 200 を返したら、すぐに `workers_dev: false` で再デプロイする。
6. 管理用のホスト名に一致する、Bypass ポリシー付きのホスト名やパス単位の Access アプリケーションを作らない（ADR-004 の不変条件 4）。アカウント全体の Worker 保護も使わない（公開サイトまで保護してしまう）。

本番の管理 Worker についても繰り返す。本番には専用の Access 設定と AUD がある。

### 3.5 秘密情報
現在の Worker には秘密情報が必要ない: AI バインディングには不要で、Access の値は秘密ではない。後で秘密情報を追加する場合は、その環境の Worker を対象に `npx wrangler secret put <NAME>` で設定するか、ダッシュボードで設定する。ファイル、`.dev.vars`、`.env` には決して置かない。デプロイで秘密情報が削除されることはない。

## 4. データベースのマイグレーション
マイグレーションは管理用の設定からだけ、プレビューを先に適用する:

```bash
npx wrangler d1 migrations apply travel-discovery-preview --remote --env preview --config wrangler.admin.jsonc
```

- Wrangler は未適用のマイグレーションを一覧表示し、確認を求め、適用前にバックアップを取る。
- プレビューのチェックに合格したら、`travel-discovery-production` と `--env production` で同じことを行う。
- 本番に適用する前に、復元ポイントを記録する: `npx wrangler d1 time-travel info travel-discovery-production`。追加で SQL のエクスポートを取ることもできる: `npx wrangler d1 export travel-discovery-production --remote --output <file>`。本番のエクスポートには公開済みのコンテンツが含まれるので、リポジトリの外に保管する。
- スキーマの変更は、前にデプロイしたコードと後方互換にする: コードのロールバックではデータベースは戻らない（8 節）。
- `db/seed/dev.sql` はローカルのテストデータである。プレビューのデータベースに読み込むかどうかは、その手順の時点でのオーナーの判断 *(要確認)*。本番には決して読み込まない。本番のコンテンツは管理コンソールから入力する。

## 5. ビルドとデプロイ
1. ビルドするマシンに `.dev.vars` がないこと、またはローカルのテスト値だけが入っていることを確かめる: ビルドはそれを `dist/` と `dist-admin/` にコピーする（[DEVELOPMENT.md](DEVELOPMENT.md)）。
2. デプロイするコミットをチェックアウトし、`git status` がクリーンな状態で `npm ci` と `npm run check` を実行する。
3. 両方の Worker をその環境向けにビルドする。`CLOUDFLARE_ENV` はビルド時に Vite プラグインが読み（`wrangler deploy` は無視する）、ビルドはその環境に平坦化した設定を書き出す。`npm run build` は型チェックとバンドルのチェックも実行する:

   ```bash
   CLOUDFLARE_ENV=preview npm run build
   ```

4. デプロイせずに、デプロイされる内容を確認する（ログイン不要。2026-10-18 に確認）:

   ```bash
   npx wrangler deploy --dry-run --config dist/worker/wrangler.json
   ```

   ```bash
   npx wrangler deploy --dry-run --config dist-admin/admin_worker/wrangler.json
   ```

   出力でバインディングと `vars` を確認する。dry run は Worker の名前を表示しないが、それは同じ `wrangler.json` の `name` 項目である。各ビルドはリダイレクト用のファイルも書き出す（公開アプリのビルドは `.wrangler/deploy/config.json`、管理アプリのビルドは `admin/.wrangler/deploy/config.json`。管理アプリの Vite のルートが `admin/` であるため）。Wrangler 4.151.1 で 2026-10-18 に確認したこと: リポジトリのルートから単に `npx wrangler deploy` を実行すると、リダイレクトに従って**公開 Worker だけ**がデプロイされる。`--config <生成された wrangler.json>` を付けるとリダイレクトは使われない。`--cwd admin` は、リダイレクトのファイルがユーザーの設定の隣にないので失敗する。必ず上の明示的な `--config` のパスでデプロイする。
5. 各 Worker を、`--dry-run` を外した同じコマンドでデプロイする。初回のセットアップ（3.4）では管理 Worker を先に、一般にはプレビューを先に行う。
6. 6 節を実行し、承認を得てから `production` で繰り返す。

## 6. 各デプロイ後のチェック
以下の認証なしのチェックは `node scripts/check-deployment.mjs <account subdomain> <preview|production>` で自動化している（管理 Worker のデプロイ後は `--watch-admin 120` を付ける）。継続的な監視、定期チェック、インシデント対応: [OPERATIONS.md](OPERATIONS.md)。

[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の「Admin authentication status」と確認ログによると、次はデプロイした Worker でしか確認できない:
- すべての管理用 URL（`workers.dev`、ルート、カスタムドメイン）が、サインインしていないときは Access のログインにリダイレクトする。管理用の静的アセットにはログインなしで到達できない。
- ログイン後、管理 API がリクエストを受け付ける: `Cf-Access-Jwt-Assertion` ヘッダーが静的アセットのルーターを通って Worker に届き、トークンの検証（RS256、発行者、オーディエンス）が通る。
- 両方の Worker で Version URL が無効になっている（`npx wrangler versions list --name <worker>` でデプロイ済みのバージョンを一覧できる）。
- 公開 Worker と管理 Worker が同じ D1 のデータを見ている（管理画面で公開してから、公開 API で確認する）。
- 公開サイトが `ja`、`en`、`es` で最初から最後まで動く。AI が無効の間、AI トグルは「利用できません」の通知を表示する。
- Rate Limiting のバインディングがエラーなくデプロイされる（アカウントで使えるかどうかは未確認。ADR-026）。デプロイで拒否された場合は、その環境から削除し、結果を記録し、AI を無効のままにする（ADR-026 A、前提条件 2）。
- Workers Logs に、アドレスや回答を含まない、AI エンドポイントの `disabled` の結果の行が表示される。

## 7. AI の有効化（別途承認）
前提条件（ADR-026 A）: AI を有効にしている間、アカウントは Workers Free のままであること。クライアントごとのリミッターが有効であること。Workers Logs が有効であること。オーナーが Gemma の利用規約と禁止用途のポリシーを確認していること。
1. その環境の `vars` で `AI_ASSIST_ENABLED: "true"` を設定し、コミット、再ビルド、再デプロイする。
2. 3 言語すべてで AI ノートを確認し、ダッシュボードで Workers AI の使用量を確認する。
3. 監視と停止: ADR-026 E と [OPERATIONS.md](OPERATIONS.md) 4.4。

### 7.1 プレビューでの試行（別途承認）
本番について判断する前に、クライアントごとのリミッター（ADR-026 A、前提条件 2）と AI ノートを確認する。試行そのもの、各デプロイ、その後の本番での利用は、それぞれ別のオーナーの判断である。この節は計画であり、承認ではない。

前提条件（ADR-026「Readiness for enabling AI」）: アカウントが Workers Free で、Billing にはドメインの登録だけが載っていること（[OPERATIONS.md](OPERATIONS.md) 3 節）。オーナーが Gemma の利用規約を確認済みであること（2026-10-24 に完了）。プレビューに公開済みのコンテンツがあること。公開プレビュー Worker の Workers Logs が有効で、呼び出しログが無効であること。

**予算。** モデルは `@cf/google/gemma-4-26b-a4b-it`。評価での実測値: 1 回の呼び出しあたり中央値 7.3 Neurons（ADR-026「Evaluation round 2」）。実際のリクエストでの見積もり: 約 7〜14 Neurons、最悪の場合で約 105（旅行先 5 件がすべて切り詰めの上限に達した場合、ADR-026 A）。Workers Free では 1 日 10,000 Neurons まで使え、00:00 UTC にリセットされ、それを超えると課金なしで呼び出しが失敗する。プレビューと本番がこの割り当てを共有するかどうかは料金ページに記載がない（要確認）。この計画では共有すると仮定する。試行でのモデル呼び出しは**最大 10 回**: 見込みは約 70〜140 Neurons、最大で約 1,050（1 日の割り当ての約 10%）。本文が不正なリミッター用のリクエストではモデルを呼ばない。

**時間帯。** 公開プレビュー Worker には Access の保護がないので、AI が有効な間は URL を知っている人なら誰でも AI を使える。有効にする時間を短くする: 同じ日の UTC の早い時間帯に、有効化・テスト・無効化を済ませ、URL は共有しない。

手順:
1. オーナー: ダッシュボードで、その日に既に使った Workers AI の Neurons を記録しておき、試行での使用量を差分として読めるようにする。
2. `env.preview`（`wrangler.jsonc`）だけで `AI_ASSIST_ENABLED: "true"` を設定し、コミットし（オーナー承認）、`CLOUDFLARE_ENV=preview npm run build` を実行し、dry run を確認し（プレビューのデータベース、`AI_ASSIST_ENABLED` が `"true"`、`AI_CLIENT_RATE_LIMITER` が 60 秒あたり 5）、公開プレビュー Worker だけをデプロイする（5 節）。本番と管理 Worker はデプロイしない。
3. ノート（モデル呼び出し約 5 回）: 内蔵ブラウザーで、AI トグルを ON にして、`ja`、`en`、`es` のそれぞれで最初からクイズを 1 回ずつ最後まで回答し、その後 1 つの結果ページで言語を 2 回切り替える。各ステップでリクエストが 1 回送られる。既に表示した言語に戻っても送られない（ADR-026 C4）。リミッターに拒否されないよう、クイズの間は 60 秒以上空ける。
4. リミッター（モデル呼び出しなし）: 60 秒待ってから、1 つのアドレスから、空のオブジェクトを本文にした同一オリジンのリクエストを送る。ハンドラーの処理順はメソッド → オリジン → リミッター → 停止スイッチ → 本文なので（Phase 11 からリミッターが停止スイッチより先）、最初のリクエストは 400 `invalid_request`、その後は 429 `rate_limited` を返す（Phase 14 から `limit` と `retryAfter` 付き。ADR-026「Phase 14 amendments」）:

   ```bash
   for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Origin: https://travel-discovery-preview.<account subdomain>.workers.dev" -H "Content-Type: application/json" --data "{}" https://travel-discovery-preview.<account subdomain>.workers.dev/api/ai/explanations; done
   ```

   400 と 429 の応答の数を記録する。カウンターは Cloudflare のロケーションごとで、結果整合なので、最初の 429 は 5 回を超えてから来ることがある。15 回送っても 429 が来なければ、このチェックは不合格である（それ以上送り続けない）。
5. ログ（オーナー、`travel-discovery-preview` の Observability）: すべての `ai_explanation` の行が `event`、`outcome`、`model`、`latencyMs`、`destinationCount` をちょうど持ち（Phase 14 から、`invalid_output` の行は落ちた検査を示す固定のコード `reason` も持つ）、アドレス、回答、条件、プロンプト、ノートの文章を含まないこと。期待する結果: 手順 3 のリクエストごとに `ok` の行が 1 つあり、`model` が `@cf/google/gemma-4-26b-a4b-it`、`destinationCount` が表示したカードの数（既定は 5）、`latencyMs` が 8,000 未満。手順 4 については `latencyMs` が 0 の `rate_limited_window` の行（Phase 14 より前は `rate_limited`）。`invalid_output`、`timeout`、`provider_error`、`content_mismatch` の行があれば数える。
6. `ja`、`en`、`es` のノートのオーナーによる確認: 選択した言語で書かれており、`ja` では UI と同じ丁寧な文体であること。順位、スコア、旅行先同士の比較がないこと。旅行先の人が書いたテキストにない価格、費用、日付、季節、営業時間、ビザや入国の規則、安全性の主張、名前の挙がった施設・イベント・事業者がないこと。決定的な説明と矛盾する内容がないこと。あわせて、各ノートに AI が書いたことを示すラベルがあること、決定的な説明・費用・季節の注記が変わっていないこと、カードの順序が AI OFF のときと同じであることも確認する。結果はロケールごとに [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録し、ノートそのものはリポジトリにコピーしない。
7. オーナー: Workers AI の Neurons を再び読み、差分を記録する。
8. 無効化: `AI_ASSIST_ENABLED` を `"false"` に戻し、コミット、再ビルドし、公開プレビュー Worker を再デプロイし、`scripts/check-deployment.mjs <account subdomain> preview` で 503 `ai_unavailable` と `/api/ai/status` の `{"enabled":false}` を確認する（AI が有効な間は、その AI のチェックは設計上失敗する）。

**すぐに停止する**（他の手順を終えずに手順 8 へ）条件: 試行で使った Neurons が 1,000 を超えた。モデル呼び出しが 10 回に達した。2 つの応答が `ok`、`rate_limited_window`、`rate_limited_daily` 以外で終わった。ノートに価格、日付、順位、その他の禁止された内容が含まれていた。ログや Billing のページに想定外のものが現れた。診断はその間もずっと動く。ダッシュボードで変数を編集する方が再デプロイより速いが、次の `wrangler deploy` で上書きされるので、再びデプロイする前に `"false"` をコミットする。

[DECISIONS.md](../working/DECISIONS.md)（英語のみ）に**記録する**もの: 日付、バージョン ID、行ったモデル呼び出しの数、前後の Neurons、手順 4 の 400／429 の数、手順 5 の結果の件数とレイテンシー、手順 6 のオーナーの確認結果。

**後の本番の判断を妨げる**もの（どれか 1 つでも）: 手順 4 で 429 が観測されなかった。手順 3 のリクエストのうち 2 つ以上で `invalid_output`、`timeout`、`provider_error` が出た。順位、比較、データにない事実を含むノートがあった。1 回あたりの Neurons が見積もりを大きく上回った（平均で約 30 を超える）。5 つの項目（`invalid_output` は `reason` を含めて 6 つ）より多い項目を持つ、またはリクエストの内容を含むログの行があった。アカウントが Workers Free でない、または Billing に新しい請求がある。Workers Logs の量が Free の割り当てに近い（[OPERATIONS.md](OPERATIONS.md) 7 節）。プレビューと本番が Neurons の割り当てを共有するかどうかは要確認のままで、共有するものとして計画する。本番で AI を有効にするのは 7 節による別のオーナーの判断であり、この記録ができてから行う。

### 7.2 AI を無効にしたままのリミッターの確認（別途承認）
Phase 11 から、公開 Worker は停止スイッチより先に `AI_CLIENT_RATE_LIMITER`、続いて上限用の Durable Object `AI_CLIENT_LIMITER`（ADR-029）を確かめる。そのため、`AI_ASSIST_ENABLED` が `"false"` のデプロイでリミッターを確認できる: モデルは呼ばれず、確認中に誰も AI を使えない。リミッターが拒否したリクエストは 429 `rate_limited` を返し（Phase 14 から `limit` が `window` で `retryAfter` 付き、ログは `rate_limited_window`）、それ以外は 503 `ai_unavailable` を返して `disabled` の行を書く。各実行は、そのアドレスの 1 日の上限 30 回にも数えられる（2 回の実行で 10 回分）。各リクエストは Workers Free の 1 日のリクエスト上限に数えられる（ここでは無視できる量）。デプロイと確認はそれぞれオーナーの承認が必要で、この確認のために本番はデプロイしない。

1. 確認するコミットを、公開プレビュー Worker だけにデプロイする（5 節）。`AI_ASSIST_ENABLED` は `"false"` のまま。ドライランで `AI_CLIENT_RATE_LIMITER`（60 秒に 5 回）と Durable Object `AI_CLIENT_LIMITER`（`AiClientLimiter`）があることを確認する。Durable Object を含む最初のデプロイでマイグレーション `v1`（`new_sqlite_classes`）が適用される。後でクラスを取り除くには `deleted_classes` のマイグレーションが必要である。
2. 同じアドレスからの他の AI リクエスト（`scripts/check-deployment.mjs` を含む）から 60 秒以上待つ。
3. 実行 A、1 本の接続: 1 回の `curl` で 15 回送る。接続は使い回される（`num_connects` は最初のリクエストで 1、その後は 0）。`-4` でリクエストを IPv4 にそろえ、同じキーにする:

   ```bash
   URL=https://travel-discovery-preview.<account subdomain>.workers.dev; args=(); for i in $(seq 1 15); do args+=("$URL/api/ai/explanations" -o /dev/null); done; curl -4 -s -X POST -H "Origin: $URL" -H "Content-Type: application/json" --data "{}" -w "%{http_code} %{num_connects}\n" "${args[@]}"
   ```

4. 60 秒以上待ってから、実行 B、リクエストごとに新しい接続:

   ```bash
   URL=https://travel-discovery-preview.<account subdomain>.workers.dev; for i in $(seq 1 15); do curl -4 -s -o /dev/null -X POST -H "Origin: $URL" -H "Content-Type: application/json" --data "{}" -w "%{http_code} %{num_connects}\n" "$URL/api/ai/explanations"; done
   ```

5. 60 秒以上待ってから、`node scripts/check-deployment.mjs <account subdomain> preview` を実行する（その AI のチェックは 503 と、Phase 14 から `GET /api/ai/status` の `{"enabled":false}` を期待する）。
6. オーナー: `travel-discovery-preview` の Observability で、実行 A と B の `rate_limited_window`（Phase 14 より前は `rate_limited`）と `disabled` の行を数える。429 と 503 の数と一致するはずである。ダッシュボードで、Durable Object のリクエストと書き込んだ行、Worker のリクエスト数に Durable Object の呼び出しが含まれるかを記録する（ADR-029、要確認）。

[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の「Phase 11 verification log」に、バージョン ID と、実行ごとのステータスコードと接続数の並びを記録する。アドレスは記録しない。解釈: 上限用の Durable Object があれば、1 つのオブジェクトがそのアドレスのリクエストをすべて数えるので、どちらの実行もちょうど 5 回の 503 のあとに 429 を返さなければならない。どちらかの実行で 503 が 5 回を超えるか、429 が出なければ不合格で、AI は無効のままにして記録する（Durable Object がない状態では、2026-10-25 に binding だけでは実行 A でしか 429 が出なかった: 新しい接続で届いたリクエストはまとめて数えられない）。新しい判断なしに、15 回の実行 2 回を超えて送らない。

## 8. ロールバック
- コード: `npx wrangler rollback <VERSION_ID> --name <worker>` またはダッシュボード（Workers & Pages → Worker → Deployments → Rollback）。即座に反映され、直近 100 個のバージョンに使え、バインドしたリソースは変えない: データベースは現在のスキーマとデータのままである。静的アセットもバージョンと一緒に戻る: 2026-10-25 に公開プレビュー Worker で確認した（[DECISIONS.md](../working/DECISIONS.md) の "Phase 10 verification log"）。配信される `index.html` とクライアントバンドルは、戻す方向でも元に戻す方向でも約 20 秒以内に戻し先のバージョンのものに切り替わり、もう一方のバージョンのバンドルは配信されなくなった。代わりの方法は、直前の正常なコミットのビルドを再デプロイすることである。
- データ: `npx wrangler d1 time-travel restore <database> --timestamp <unix|RFC3339>`（または `--bookmark`）で、Workers Free では 7 日以内の時点に復元できる。これは**破壊的**である: すべてのデータを置き換え、実行中のクエリを取り消し、元に戻すためのブックマークを表示する。復元するたびにオーナーの承認を得る。
- AI の問題: ロールバックではなく停止スイッチ（7 節）を使う。

## 9. 無料枠の前提（デプロイ前に再確認する）
2026-10-18 に確認（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の「Phase 6 verification log」）。無料枠と上限は変わる。
- Workers Free: アカウントあたり 1 日 100,000 リクエスト（超えると Error 1027、00:00 UTC にリセット）、リクエストあたり CPU 10 ms。静的アセットへのリクエストは Worker を呼び出さない（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の Phase 0 のログ）。https://developers.cloudflare.com/workers/platform/limits/
- D1 Free: アカウント全体で 1 日あたり読み取り 500 万行、書き込み 100,000 行（超えると 00:00 UTC まで `D1_ERROR` でクエリが失敗する）、データベースあたり 500 MB、7 日間の Time Travel。https://developers.cloudflare.com/d1/platform/pricing/
- Workers AI: 1 日 10,000 Neurons まで無料。Workers Free では、それを超えると課金なしで利用が失敗する。https://developers.cloudflare.com/workers-ai/platform/pricing/
- Workers Logs: Free では 1 日 200,000 イベント、保持期間 3 日。**2026-12-01 から Workers Logs は Cloudflare Observability の料金体系に移る**: Free では 1 日の取り込み 0.5 GB、保持期間 7 日で、上限に達すると課金なしで取り込みが止まる（2026-10-19 に確認し、2026-10-24 と 2026-10-25 に再確認して変更なし。[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の「Phase 7 verification log」「Phase 8 verification log」「Phase 9 verification log」）。2026-10-24 に読んだアカウントの 1 日の量は、多くても割り当ての数パーセントである。変更後の最初のチェックは日付の決まった作業である（[OPERATIONS.md](OPERATIONS.md) 3 節と 7 節）。https://developers.cloudflare.com/workers/observability/logs/workers-logs/, https://developers.cloudflare.com/observability/pricing/
- Rate Limiting バインディング: Workers Free で使えるかどうかと料金は文書化されていない。承認されたプレビューのデプロイでしか確認できない。https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Cloudflare Zero Trust Free: シート数の上限、料金、ログイン方法がプランのページに記載されていない。ダッシュボードで確認する。https://www.cloudflare.com/plans/zero-trust-services/

## 10. 最初のデプロイ前の手作業のチェック（オーナー）
- [ ] デプロイするコミットで `npm run check` と `npm run test:e2e` が通る。push 後に GitHub の CI が緑になる。
- [ ] `git status` がクリーンで、`.dev.vars`、`.env`、`.ai-eval/`、`dist*/` の内容がコミットされていない。
- [ ] Chrome で、公開クイズと管理画面の旅行先フォームをキーボードだけで操作でき、フォーカスが見える。
- [ ] クイズ、結果、言語切り替えをスクリーンリーダー（VoiceOver）で抜き取り確認する。
- [ ] スマートフォンの大きさとデスクトップの大きさのウィンドウで、ライトモードとダークモード、200% のズームを確認する。
- [ ] 動きを減らす設定: 操作を妨げるアニメーションがない。
- [ ] コンテンツの確認: 費用に基準、出典、日付が表示される。リアルタイム価格を思わせる文言がない。公開済みのコンテンツにはすべて、少なくとも `ja` と `en` の翻訳がある。
- [ ] 外部の検索リンクは、サービスのトップページだけを新しいタブで開く。
- [x] Stage 5 の評価用 API トークンをダッシュボードで削除した（オーナー、2026-10-24）。
- [x] Gemma の利用規約と禁止用途のポリシーを確認した（AI を有効にする前。オーナー、2026-10-24）。
- [ ] コミットの作成者のメールアドレスが、リポジトリの想定する公開範囲にとって問題ない（[PUBLIC_RELEASE.md](../working/PUBLIC_RELEASE.md)（英語のみ））。
