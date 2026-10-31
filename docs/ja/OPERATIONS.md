<!-- source: docs/en/OPERATIONS.md blob a204c3ba111468e51ceb3e6e7a2158c069f2ab3a -->
[English](../en/OPERATIONS.md) | 日本語 · [目次に戻る](README.md)

> この文書は[英語版](../en/OPERATIONS.md)の翻訳。内容が異なる場合は英語版が優先する。

# 運用手順書

デプロイしたアプリの運用をまとめる。どこを見るか、定期と日付の決まったチェック、インシデント、バックアップ、ログ、コンテンツの公開、課金が始まる操作を扱う。オーナーと、運用を手伝う人向けの文書だ。デプロイ、マイグレーション、ロールバックは [DEPLOYMENT.md](DEPLOYMENT.md)、AI の有効化は [AI_ENABLEMENT.md](AI_ENABLEMENT.md)、各ルールの根拠となる事実は [DECISIONS.md](../working/DECISIONS.md)（英語のみ）にある。

> [!WARNING]
> リモートでの Wrangler のコマンド、デプロイ、ロールバック、復元、アカウントや Access の変更は、どれもその時点でオーナーの承認が要る。ダッシュボードでの作業はオーナーがする。

最終確認日: 2026-10-24。

## 1. 何がどこで動いているか

| 環境 | 公開 Worker | 管理 Worker | D1 データベース |
|---|---|---|---|
| `preview` | `travel-discovery-preview` | `travel-discovery-admin-preview` | `travel-discovery-preview`（シードデータ） |
| `production` | `travel-discovery` | `travel-discovery-admin` | `travel-discovery-production` |

- 4 つの Worker はどれも `workers.dev`（`<worker>.<account subdomain>.workers.dev`）を使う。
- アカウントは Workers Free と Zero Trust Free。AI はすべての環境で無効。
- 無料枠の上限はアカウント全体で共有するので、プレビューを大量に使うと本番にも響く（[DEPLOYMENT.md](DEPLOYMENT.md) 9 節）。

## 2. どこを見るか

| シグナル | 場所 | 補足 |
|---|---|---|
| Worker ごとのリクエストとエラー | ダッシュボード: Workers & Pages → その Worker → Metrics | 呼び出しログを無効にしても見られる（プレビューで確認、2026-10-24）。 |
| アプリのログの行 | ダッシュボード: Workers & Pages → その Worker → Observability | 呼び出しログを無効にしているので、アプリ自身の行だけがある（6 節）。 |
| D1 の使用量 | ダッシュボード: その D1 データベース → Metrics *(要確認: 正確な場所)* | アカウントが D1 の 1 日の上限に達すると、Cloudflare からメールも届く。 |
| Workers AI の使用量 | ダッシュボード: Workers AI | AI を有効にしてから関係する。 |
| AI の上限用 Durable Object の使用量 | ダッシュボード: Durable Objects *(要確認: 正確な場所)* | `AiClientLimiter` のリクエスト数、書き込んだ行数、実行時間を、Workers Free の 1 日の割り当てと比べる（ADR-029）。 |
| アカウントの変更 | ダッシュボード: Manage Account → Audit Log | Wrangler のデプロイは、アップロード、デプロイ、"Update Worker Script Subdomain" の 3 つとして出る。 |

アプリのログの行は JSON で、1 行に 1 つ。2 種類ある。

**`{"event":"api_error","context":…,"code":…,"errorName":…}`**: リクエストが 500 か 503 で終わった（`server/http/errors.ts`）。`service_unavailable` は D1 の失敗を表し、1 日の上限に達した場合も含む。

**`{"event":"ai_explanation","outcome":…,"model":…,"latencyMs":…,"destinationCount":…}`**: AI のリクエストごとに 1 行。
- 結果（outcome）: `ok`、`content_mismatch`、`provider_error`、`timeout`、`invalid_output`、`disabled`、`rate_limited_window`、`rate_limited_daily`、`limiter_unavailable`。Phase 14 より前は、2 つの `rate_limited_*` の代わりに `rate_limited` が 1 つだった。
- `invalid_output` の行は、落ちたチェックを示す `reason` も持つ: `json`、`shape`、`too_long`、`duplicate_id`、`id_set`、`too_short`、`digit`、`link`、`markup`、`script` のどれか（ADR-026「Phase 14 amendments」）。
- `limiter_unavailable` は、上限用の Durable Object が失敗したか、ないことを表す（Workers Free の 1 日の上限に達した場合など）。モデルは呼ばず、クライアントには 503 を返す（ADR-029）。

AI が無効でもレート制限の行が出ることがある。Phase 11 から、リミッターが停止スイッチより先に動くからだ。Phase 14 からは、AI が OFF の間は計画の画面が AI のトグルを無効にするので、そうしたリクエストは UI 以外のクライアントからしか来ない。

## 3. 定期チェック

**毎週と、Access タブ、Zero Trust のポリシー、アカウントのサブドメインを変えた後:**
- 両方の環境で、認証なしのチェックを実行する。どれかが失敗するとスクリプトは 1 で終わる。確かめる内容:
  - すべてのロケールでの公開 API と、セキュリティヘッダー
  - AI が無効の間の、AI エンドポイントと AI の状態（`{"enabled":false}`）
  - 管理 Worker の `/`、`/destinations`、`/api/admin/me` の Access のリダイレクト（`https://<team>.cloudflareaccess.com/...` への 302）

  ```bash
  node scripts/check-deployment.mjs <account subdomain> production
  ```

  ```bash
  node scripts/check-deployment.mjs <account subdomain> preview
  ```

  - 管理用の URL が 200 を返したらインシデントだ（4.2 節）。
  - 管理 Worker をデプロイした直後は `--watch-admin 120` を足し、Access のチェックを 10 秒ごとに 2 分間繰り返す。
  - スクリプトは最初のリクエストの前に TLS の準備をするので、macOS では数秒かかる。タイムアウト（リクエストあたり 15 秒）も失敗として数えるので、インシデントとして扱う前に、失敗した URL を `curl` で確かめる。
- 各管理 Worker の Access タブ: スコープが **All traffic**。Zero Trust のポリシー: オーナーのアドレスだけを指定した **Emails** の Include ルール。管理用のホスト名に当たる、Bypass ポリシーつきのホスト名やパスの Access アプリケーションがない（ADR-004）。
- 両方の公開 Worker の Observability: `api_error` の行が異常に多くない。

**毎月:**
- `npm audit --omit=dev`（期待: 脆弱性 0）と `npm audit`（開発時だけの既知の勧告あり、ADR-003）。
- 固定している GitHub Actions の新しいリリース。SHA とバージョンのコメントは一緒に更新する（ADR-027）。
- [DEPLOYMENT.md](DEPLOYMENT.md) 9 節の無料枠のページに変更がないか。
- Billing（オーナー、ダッシュボード）: Manage Account → Billing にドメインの登録だけがあり、他のサブスクリプションがなく、Workers のプランが Free のまま。それ以外ならインシデントだ。支払いもアップグレードもせず、見つけたことを [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録する（課金が始まる操作は 10 節にある）。

**日付の決まったもの:**
- **2026 年 12 月第 1 週（2026-12-01〜2026-12-07）**: 2026-12-01 に Workers Logs が Cloudflare Observability の料金体系に移った（7 節）。12 月の毎月のチェックと一緒にする:
  1. 7 節のリンク先の 2 つのページを読み直す。
  2. オーナーが、ダッシュボードでアカウントのログの取り込み量（表示されていれば Billable Usage、なければ Observability のイベント数）と Billing のページを読む。
  3. 日付と値を 7 節と [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録する。
  4. この項目と、9 節の対応する項目を消す。

  割り当て内の Free の利用以外ならインシデントだ。支払いもアップグレードもしない。

## 4. インシデント

### 4.1 公開サイトに「一時的に利用できません」と表示される
1. 公開 Worker の Metrics と `api_error` の行を見る。
2. Error 1027 か、Worker へのリクエストがまったくない: アカウントの 1 日 100,000 リクエストを使い切った。00:00 UTC まで打つ手はない。静的なページは読み込める。
3. `service_unavailable` の `api_error`: D1 の失敗。Cloudflare から D1 の 1 日の上限のメールが来ていれば、00:00 UTC にクエリが再開する。データには影響しない。
4. デプロイの直後に始まった: ロールバックする（[DEPLOYMENT.md](DEPLOYMENT.md) 8 節）か、前の正常なコミットを再デプロイする。
5. 上限から抜けるために、オーナーの判断なしにプランをアップグレードしない（ADR-015）。

### 4.2 管理 Worker に Access なしで到達できる
管理用の URL が、認証なしで 200 を返した場合だ。有効なトークンがなければ管理 API は 403 を返し続けるが、管理 UI は公開されてはならない。
1. すぐに URL を消す。方法は 2 つ:
   - その環境で `"workers_dev": false` にして Worker を再デプロイする（`CLOUDFLARE_ENV=<env>` で再ビルドし、`--config dist-admin/admin_worker/wrangler.json` でデプロイ）。
   - または、ダッシュボードで `workers.dev` を無効にする（Settings → Domains & Routes）。こちらのほうが速いが、次のデプロイで元に戻る。
2. Access タブのスコープとポリシー（3 節）を確かめ、Audit Log で何が変わったかを見る。
3. `workers_dev` を有効に戻して再デプロイし、リダイレクトを直後と 2 分間確かめる。
4. インシデントを [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録する。

### 4.3 誤ったコンテンツを公開した
管理コンソールでアーカイブするか直す。大きな誤りを取り消すには、Time Travel でデータベースを復元する（5 節）。

### 4.4 AI の問題や悪用（AI を有効にした後）
停止スイッチで AI を止める（[AI_ENABLEMENT.md](AI_ENABLEMENT.md)、ADR-026 E）。診断は動き続ける。止めるのは次のとき:
- 12:00 UTC より前に、Neurons が 1 日の割り当ての約 70% を超えた。
- レート制限（`rate_limited_window`、`rate_limited_daily`）や `provider_error` の結果が急に増えた。

## 5. バックアップと復元
- D1 の Time Travel は、Workers Free では 7 日分を保持する。コンテンツをまとめて変える前に、ブックマークを記録する: `npx wrangler d1 time-travel info travel-discovery-production`（リモートの読み取り。承認が要る）。
- 復元はデータベース全体を置き換える破壊的な操作だ（[DEPLOYMENT.md](DEPLOYMENT.md) 8 節）。必ずオーナーの承認が要る。
- 任意の SQL のエクスポート（`npx wrangler d1 export … --remote --output <file>`）は、リポジトリの外に置く。

## 6. ログとプライバシー
- 4 つの Worker すべてで、Workers Logs を有効にし、呼び出しログを無効にしている。呼び出しログは有効に戻さない。各リクエストを、IP アドレス、ヘッダー（管理 Worker では Access のトークンも含む）、位置情報とともに保存してしまう（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）「Phase 7 verification log」）。
- アプリ自身の行には、アドレス、回答、テキストを入れていない。ログの行を足すときも、そのままにする。
- 保持期間: Workers Free では 3 日、2026-12-01 からは 7 日。
- ログを共有するときは、先にアカウント ID とホスト名を消す。

## 7. 2026-12-01 からの Workers Logs の料金
2026-12-01 からは、Free プランで 1 日 0.5 GB まで取り込め、7 日間保持される。上限に達すると 00:00 UTC まで取り込みが止まり、課金はされない。2026-12-01 までの Free の上限は 1 日 200,000 イベント、保持は 3 日。割り当てはアカウントのすべての Worker で共有する。

2026-10-19 に確認し、2026-10-24 と 2026-10-25 にも再確認して変わりなし:
- https://developers.cloudflare.com/observability/pricing/（2026-10-15 更新）
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/（2026-10-12 更新）

量（オーナー、ダッシュボード、2026-10-24。[DECISIONS.md](../working/DECISIONS.md)（英語のみ）「Phase 9 verification log」）:
- 呼び出しログを無効にしているので、取り込まれるのは `api_error` と `ai_explanation` の行だけ。
- アカウント全体で、普段は 1 時間に約 1 行、手作業のチェック中に 1 分あたり約 30〜40 行のピークがある。
- 1 行 5 KB と仮定しても（行のサイズは文書にない）、多くて割り当ての数パーセント。
- 量が上限に近づいたら、その環境の `observability` ブロックで `head_sampling_rate` を下げる。
- 2026-12-01 の後に、実際の取り込み量を一度確かめる（3 節「日付の決まったもの」）。

## 8. 本番のコンテンツの公開
コンテンツは本番の管理コンソールからだけ入れる。フォームで入力するか、`content/` にある確認済みのバンドルを **Import** ページで取り込む（ADR-028）。`db/seed/dev.sql` は本番に決して読み込まない。以下のルールは [SPEC.md](SPEC.md)、[DIAGNOSTIC_ALGORITHM.md](DIAGNOSTIC_ALGORITHM.md)、管理画面の検証（`server/admin/validation.ts`）に基づく。

事前:
- Time Travel のブックマークを記録する（5 節）。

バンドルのインポート（ADR-028）:
1. 本番の管理コンソールで Import を開き、ファイル（例えば `content/initial-v1.json`）を読み込む。
2. 「Check」を選ぶ。概要に、作られるものと、スラッグがすでにあるので飛ばすものが並ぶ。問題が出たら、先にファイルを直す。
3. 「Import」を選び、「The import is complete」と出るまで待つ。途中で止まったら、メッセージに項目と理由が出る。ファイルを直し、もう一度チェックしてインポートし直す（作成済みの項目は飛ばされる）。

既存の項目の更新（ADR-028「Update mode」）:
1. Time Travel のブックマークを記録し、Import を開いてファイルを読み込み、「Check」の前に **Update existing items** を選ぶ。
2. 更新する項目すべての「Changes」を読む。
   - 国、属性、カテゴリー、旅行先、質問は、どれもファイルの内容で丸ごと置き換わる。ファイルを書いた後にフォームで変えた値は上書きされるので、残したい変更があれば先にファイルを直す。
   - 公開状態の変更が強調表示されていたら、意図したものでない限り誤りとして扱う。
   - ファイルの質問には、データベースで有効な選択肢をすべて書く。足りないとチェックがその選択肢を報告し、何も取り込まない。選択肢を無効にしたいときは質問のフォームで行う。
3. 「Import」を選ぶ。「changed after the check」で止まったら、もう一度チェックして新しい変更を確かめる。管理 API のリクエスト上限に達したときは、画面が 1 分ほど待ってから自動で続ける。

順序（後の項目は前の項目を参照する）:
1. 国。
2. 属性（`active`）。旅行先を採点する次元（0〜5）。
3. 質問カテゴリー（`active`）。
4. 旅行先。属性ごとにスコアをつける。
5. 質問。その選択肢は、有効な属性にゼロ以外の効果（−5〜5）を持つ。
6. クイズの設定（既定値: 最小 6 問、目標 10 問、最大 12 問。結果 5 件）。

役立つ診断のための最低限:
- 公開済みの旅行先が、少なくとも結果の件数（既定は 5）だけある。足りないと、結果に出る旅行先が減り、通知が出る。
- 公開済みの質問が、少なくとも目標の数（既定は 10）だけある。それぞれ有効な選択肢を 2 つ以上と、有効な属性への効果を 1 つ以上持つ（そうでなければ飛ばされる）。足りないと、クイズが早く終わり、通知が出る。目標より多くの質問があれば、セッションごとに変化が出る。
- 質問が複数のカテゴリーに散らばっている（選択はカテゴリーのバランスを取る）。

公開する各項目:
- 翻訳: 管理コンソールで公開するには `ja` か `en` が要る。できれば `ja`、`en`、`es`、`fr` で公開し、少なくとも `ja` と `en` はそろえる（[DEPLOYMENT.md](DEPLOYMENT.md) 10 節）。ないロケールは ADR-012 のとおりにフォールバックする。
- 費用: 目安の範囲だけにし、通貨、期間、翻訳したすべてのロケールでの基準、出典、確認した日付をつける。リアルタイム価格を思わせる言い回しは決して使わない（ADR-008）。
- 画像: `https` の URL、クレジット、翻訳したすべてのロケールでの代替テキスト。提供元のライセンスを確かめる（[PUBLIC_RELEASE.md](../working/PUBLIC_RELEASE.md)（英語のみ）4 節）。
- わかる範囲で、適した月、おすすめの日数、注意点。わからない値は推測せずに空にする。
- 人が書いた概要と見どころ。AI が OFF のときの説明にもなる。

事後:
- 本番について 3 節のチェックを実行する。
- スマートフォン大とデスクトップのウィンドウで、公開サイトを `ja`、`en`、`es`、`fr` で確かめる: クイズから結果まで、戻る・直す・やり直す、費用の基準と日付、AI が使えない旨の通知、外部の検索リンク。
- 新しい Time Travel のブックマークを記録する。

## 9. 未解決の項目
- **Access のポリシー外のアドレスが拒否されること:** 未確認。2 つ目の Cloudflare アカウントが要り、オーナーが先送りにした（2026-10-24）。
- **`AI_CLIENT_RATE_LIMITER` の 429 の応答。** 現在の状態（2026-10-31、Phase 14）: Durable Object による利用者ごとの厳密な上限（ADR-029）を本番にデプロイし（バージョン `cc06950d`）、そこでリミッターの確認に合格した（「Phase 14 verification log」）。本番で AI を有効にするかは、オーナーが別に判断する（ADR-026「Readiness for enabling AI」）。経緯:
  - 2026-10-25、プレビューでの AI 試行: 429 は出なかった（同じアドレスから 15 回送り、すべて 400。[DECISIONS.md](../working/DECISIONS.md)（英語のみ）「Phase 10 verification log」）。原因は要確認。これが本番で AI を有効にすることを止めている（ADR-026「Readiness for enabling AI」）。
  - 2026-10-25、Phase 11: IPv4 と IPv6 でキーが分かれる可能性と、Workers Free でバインディングが使えない可能性は否定された。リミッターは停止スイッチより先に動くようにした。
  - プレビューで AI を無効にしたままの確認（[AI_ENABLEMENT.md](AI_ENABLEMENT.md) 3 節、2026-10-25）では、1 本の接続では 6 回送った後に 429 を返したが、毎回新しい接続を開いた 15 回では 1 度も返さなかった。つまり、クライアントはバインディングを回避できる。
  - オーナーは Durable Object による利用者ごとの厳密な上限を選んだ（ADR-029、2026-10-25）。そのプレビューでの確認（[AI_ENABLEMENT.md](AI_ENABLEMENT.md) 3 節、2026-10-25）では、1 本の接続でも新しい接続でも、ちょうど 5 回通した後に 429 を返した（「Phase 11 verification log」）。
- **2026-12-01 の Cloudflare Observability の料金変更後のログの取り込み量:** 2026 年 12 月第 1 週に一度確かめる（3 節「日付の決まったもの」）。変更前の量は 2026-10-24 に記録した（7 節）。

## 10. 課金が始まる操作
アカウントは Workers Free のままにする。受け入れている課金は、既存のドメインの登録だけだ。以下のダッシュボードの操作は、どれもオーナーの判断なしにはしない。判断は、見込みの月額費用とともに [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録する。2026-10-24 にリンク先のページで確認した。
- **Workers Paid へのアップグレード:** アカウントあたり月 5 米ドル以上。含まれる割り当て（D1、Workers Logs、Queues など）を超えた利用は、失敗する代わりに課金されるようになる（https://developers.cloudflare.com/workers/platform/pricing/、2026-10-02 更新）。2026-12-01 以降は、有料のログの取り込みも、含まれる量を超えて自動的に続く（https://developers.cloudflare.com/observability/pricing/）。
- **Workers Logpush:** Workers Paid でだけ使える（https://developers.cloudflare.com/workers/observability/logs/logpush/、2026-10-12 更新）。
- **R2 の有効化:** 無料枠は Standard ストレージ 10 GB-月、月あたり Class A 操作 100 万回と Class B 操作 1,000 万回。それを超えると単価で課金される（https://developers.cloudflare.com/r2/pricing/、2026-10-01 更新）。R2 の有効化に支払い方法が要るかは、ページに書かれていない *(要確認)*。
- **Images Paid の購入:** 画像の保存（月あたり保存 100,000 枚ごとに 5 米ドル）と配信（100,000 回ごとに 1 米ドル）が使えるようになり、月 5,000 回を超える変換が課金される。Free プランでは、上限を超えた変換はエラー 9422 で失敗し、課金されない（https://developers.cloudflare.com/images/pricing/、2026-10-19 更新）。
- **Log Explorer のデータセット:** 取り込み 1 GB あたり 1 米ドルで別に課金される。Free のアカウントで使えるかは、ページに書かれていない（https://developers.cloudflare.com/observability/pricing/）。
- その他のプランのアップグレード、アドオンのサブスクリプション、Free 以外の Zero Trust のプラン。
