<!-- source: docs/en/OPERATIONS.md blob fb3b121a01ef58d36ef7f19d22dedfe2748b8cf4 -->
[English](../en/OPERATIONS.md) | 日本語 · [目次に戻る](README.md)

> この文書は[英語版](../en/OPERATIONS.md)の翻訳です。内容が異なる場合は英語版が優先されます。

# 運用手順書

最終確認日: 2026-10-24。このページは、デプロイ済みのアプリの運用を扱う。デプロイ、マイグレーション、AI の有効化、ロールバックの方法は [DEPLOYMENT.md](DEPLOYMENT.md) に、各ルールの根拠となる事実は [DECISIONS.md](../working/DECISIONS.md)（英語のみ）にある。リモートでの Wrangler コマンド、デプロイ、ロールバック、復元、アカウントや Access の変更はすべて、その時点でオーナーの承認が必要である。ダッシュボードでの手順はオーナーが行う。

## 1. 何がどこで動いているか

| 環境 | 公開 Worker | 管理 Worker | D1 データベース |
|---|---|---|---|
| `preview` | `travel-discovery-preview` | `travel-discovery-admin-preview` | `travel-discovery-preview`（シードデータ） |
| `production` | `travel-discovery` | `travel-discovery-admin` | `travel-discovery-production` |

4 つの Worker はすべて `workers.dev`（`<worker>.<account subdomain>.workers.dev`）を使う。アカウントは Workers Free と Zero Trust Free で、AI はすべての環境で無効である。無料枠の上限はアカウント全体で共有されるので、プレビューを大量に使うと本番にも影響する（[DEPLOYMENT.md](DEPLOYMENT.md) 9 節）。

## 2. どこを見るか

| シグナル | 場所 | 備考 |
|---|---|---|
| Worker ごとのリクエストとエラー | ダッシュボード: Workers & Pages → Worker → Metrics | 呼び出しログを無効にしていても使える（プレビューで確認、2026-10-24）。 |
| アプリのログの行 | ダッシュボード: Workers & Pages → Worker → Observability | 呼び出しログが無効なので、アプリ自身の行だけがある（6 節）。 |
| D1 の使用量 | ダッシュボード: D1 データベース → Metrics *(要確認: 正確なパス)* | アカウントが D1 の 1 日の上限に達したときは、Cloudflare からもメールが届く。 |
| Workers AI の使用量 | ダッシュボード: Workers AI | AI を有効にしてから関係する。 |
| アカウントの変更 | ダッシュボード: Manage Account → Audit Log | Wrangler でのデプロイはそれぞれ、アップロード、デプロイ、"Update Worker Script Subdomain" として表示される。 |

アプリのログの行（JSON、1 行に 1 件）:
- `{"event":"api_error","context":…,"code":…,"errorName":…}`: リクエストが 500 か 503 で終わった（`server/http/errors.ts`）。`service_unavailable` は、1 日の上限を含む D1 の障害を意味する。
- `{"event":"ai_explanation","outcome":…,"model":…,"latencyMs":…,"destinationCount":…}`: AI のリクエストごとに 1 件。結果は `ok`、`content_mismatch`、`provider_error`、`timeout`、`invalid_output`、`disabled`、`rate_limited`。Phase 11 からリミッターが停止スイッチより先に動くので、AI が無効なときにも `rate_limited` の行が出ることがある。

## 3. 定期チェック

毎週、および Access のタブ、Zero Trust のポリシー、アカウントのサブドメインを変更した後:
- 両方の環境について、認証なしのチェックを実行する。対象は、全ロケールの公開 API、セキュリティヘッダー、AI が無効な間の AI エンドポイント、管理 Worker の `/`、`/destinations`、`/api/admin/me` の Access リダイレクト（`https://<team>.cloudflareaccess.com/...` への 302）である。どれかが失敗するとスクリプトは 1 で終了する:

  ```bash
  node scripts/check-deployment.mjs <account subdomain> production
  ```

  ```bash
  node scripts/check-deployment.mjs <account subdomain> preview
  ```

  管理用の URL から 200 が返ったらインシデントである（4.2 節）。管理 Worker をデプロイした直後は、`--watch-admin 120` を付けて、Access のチェックを 10 秒ごとに 2 分間繰り返す。スクリプトは最初のリクエストの前に TLS を準備し、macOS ではそれに数秒かかる。タイムアウト（リクエストあたり 15 秒）も失敗として数えるので、インシデントとして扱う前に、失敗した URL を `curl` で確認する。
- 各管理 Worker の Access のタブ: 適用範囲が **All traffic** であること。Zero Trust のポリシー: オーナーのアドレスだけを指定した **Emails** の Include ルールであること。管理用のホスト名に対する Bypass ポリシー付きのホスト名やパス単位の Access アプリケーションがないこと（ADR-004）。
- 両方の公開 Worker の Observability: `api_error` の行が異常に多くないこと。

毎月:
- `npm audit --omit=dev`（期待値: 脆弱性 0 件）と `npm audit`（既知の開発用だけの勧告。ADR-003）。
- 固定している GitHub Actions の新しいリリース。SHA とバージョンのコメントを一緒に更新する（ADR-027）。
- [DEPLOYMENT.md](DEPLOYMENT.md) 9 節にある無料枠のページに変更がないか。
- Billing（オーナー、ダッシュボード）: Manage Account → Billing にドメインの登録だけが載っていて他のサブスクリプションがなく、Workers のプランが Free のままであること。それ以外はインシデントである: 支払いやアップグレードをせず、見つかったものを [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録する（課金が始まる操作は 10 節に挙げている）。

日付の決まったもの:
- **2026 年 12 月の第 1 週（2026-12-01〜2026-12-07）**: 2026-12-01 に Workers Logs が Cloudflare Observability の料金体系に移った（7 節）。7 節にリンクした 2 つのページを読み直し、オーナーがダッシュボードでアカウントのログの取り込み量（表示されていれば Billable Usage、なければ Observability のイベント数）と Billing のページを読む。日付と値を 7 節と [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録し、この項目と 9 節の対応する項目を削除する。12 月の毎月のチェックと一緒に行う。割り当ての範囲内での Free の利用以外はインシデントである: 支払いやアップグレードをしない。

## 4. インシデント

### 4.1 公開サイトに「一時的に利用できません」と表示される
1. 公開 Worker の Metrics と `api_error` の行を確認する。
2. Error 1027、または Worker へのリクエストがまったくない場合: アカウントの 1 日 100,000 リクエストを使い切っている。00:00 UTC までできることはない。静的なページは読み込める。
3. `service_unavailable` の `api_error`: D1 の障害。Cloudflare から D1 の 1 日の上限のメールが届いていれば、クエリは 00:00 UTC に再開する。データには影響しない。
4. デプロイの直後に始まった場合: ロールバックする（[DEPLOYMENT.md](DEPLOYMENT.md) 8 節）か、直前の正常なコミットを再デプロイする。
5. オーナーの判断なしに、上限から抜け出すためにプランをアップグレードしない（ADR-015）。

### 4.2 管理 Worker に Access なしで到達できる
管理用の URL から認証なしで 200 が返った場合。有効なトークンがなければ管理 API は 403 を返し続けるが、管理 UI は公開されていてはならない。
1. すぐに URL を外す: その環境で `"workers_dev": false` にしてその Worker を再デプロイする（`CLOUDFLARE_ENV=<env>` で再ビルドし、`--config dist-admin/admin_worker/wrangler.json` でデプロイする）か、ダッシュボードで `workers.dev` を無効にする（Settings → Domains & Routes）。後者の方が速いが、次のデプロイで元に戻る。
2. Access のタブの適用範囲とポリシー（3 節）、および何が変わったかを Audit Log で確認する。
3. `workers_dev` を再び有効にして再デプロイし、リダイレクトをすぐに、そして 2 分間確認する。
4. インシデントを [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録する。

### 4.3 誤ったコンテンツを公開した
管理コンソールでアーカイブするか修正する。より大きな誤りを取り消すには、Time Travel でデータベースを復元する（5 節）。

### 4.4 AI の問題や悪用（AI を有効にした後）
停止スイッチで AI を止める（[DEPLOYMENT.md](DEPLOYMENT.md) 7 節、ADR-026 E）。診断はそのまま動く。12:00 UTC より前に Neurons が 1 日の割り当ての約 70% を超えたとき、または `rate_limited` や `provider_error` の結果が急増したときに止める。

## 5. バックアップと復元
- D1 の Time Travel は Workers Free で 7 日間保持される。コンテンツをまとめて変更する前に、ブックマークを記録する: `npx wrangler d1 time-travel info travel-discovery-production`（リモートの読み取り。承認が必要）。
- 復元はデータベース全体を置き換える破壊的な操作であり（[DEPLOYMENT.md](DEPLOYMENT.md) 8 節）、常にオーナーの承認が必要である。
- 任意の SQL エクスポート（`npx wrangler d1 export … --remote --output <file>`）はリポジトリの外に置く。

## 6. ログとプライバシー
- 4 つの Worker すべてで Workers Logs を有効にし、呼び出しログは無効にしている。呼び出しログは、各リクエストを IP アドレス、ヘッダー（管理 Worker では Access のトークンを含む）、位置情報とともに保存してしまう（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の「Phase 7 verification log」）。再び有効にしない。
- アプリ自身の行には、アドレス、回答、文章が含まれない。ログの行を追加するときもそれを守る。
- 保持期間: Workers Free で 3 日、2026-12-01 からは 7 日。
- ログのエントリーを共有するときは、先にアカウント ID とホスト名を取り除く。

## 7. 2026-12-01 からの Workers Logs の料金
2026-10-19 に確認し、2026-10-24 と 2026-10-25 に再確認して変更なし（https://developers.cloudflare.com/observability/pricing/、2026-10-15 更新。https://developers.cloudflare.com/workers/observability/logs/workers-logs/、2026-10-12 更新）: Free では 1 日の取り込み 0.5 GB、保持期間 7 日。上限に達すると 00:00 UTC まで取り込みが止まり、課金はされない。2026-12-01 までは、Free の上限は 1 日 200,000 イベント、保持期間 3 日である。この割り当ては、アカウントのすべての Worker で共有される。

量（オーナー、ダッシュボード、2026-10-24。[DECISIONS.md](../working/DECISIONS.md)（英語のみ）の「Phase 9 verification log」）: 呼び出しログが無効なので、取り込まれるのは `api_error` と `ai_explanation` の行だけである。アカウント全体の合計は通常 1 時間に約 1 行で、手作業でのチェック中には 1 分あたり約 30〜40 行のピークがある: 1 行 5 KB と仮定しても（行のサイズは文書化されていない）、多くても割り当ての数パーセントである。量が上限に近づいたら、その環境の `observability` ブロックで `head_sampling_rate` を下げる。2026-12-01 以降に、実際の取り込み量を一度確認する（3 節「日付の決まったもの」）。

## 8. 本番のコンテンツの公開
コンテンツは本番の管理コンソールからだけ入力する。フォームで入力するか、`content/` にある確認済みのバンドルを **Import** ページで取り込む（ADR-028）。`db/seed/dev.sql` は本番に決して読み込まない。以下のルールは [SPEC.md](SPEC.md)、[DIAGNOSTIC_ALGORITHM.md](DIAGNOSTIC_ALGORITHM.md)、管理画面の検証（`server/admin/validation.ts`）による。

事前:
- Time Travel のブックマークを記録する（5 節）。

バンドルのインポート（ADR-028）:
1. 本番の管理コンソールで Import を開き、ファイル（例えば `content/initial-v1.json`）を読み込む。
2. 「Check」を選ぶ: 概要に、作成されるものと、スラッグが既にあるためスキップされるものが一覧表示される。問題が報告されたら、先にファイルを直す。
3. 「Import」を選び、「The import is complete」と表示されるまで待つ。途中で止まった場合は、メッセージにその項目と理由が表示される。ファイルを直し、もう一度チェックしてインポートし直す（作成済みの項目はスキップされる）。

既存の旅行先の更新（ADR-028「Update mode」）:
1. Time Travel のブックマークを記録し、Import を開いてファイルを読み込み、「Check」の前に **Update existing destinations** を選ぶ。
2. 更新するすべての旅行先の「Changes」を読む。各旅行先はファイルの内容で丸ごと置き換えられるので、ファイルを書いた後にフォームで変更した値は上書きされる。その変更を残す必要があれば、先にファイルを直す。公開状態の変更が強調表示されている場合は、意図したものでない限り誤りとして扱う。
3. 「Import」を選ぶ。「changed after the check」で止まった場合は、もう一度チェックし、新しい変更を確認する。国、属性、カテゴリー、質問はこの方法では決して更新されない。それらはフォームで変更する。

順序（後の項目は前の項目を参照する）:
1. 国。
2. 属性（`active`）。旅行先をスコア付けする次元（0〜5）。
3. 質問カテゴリー（`active`）。
4. 旅行先。各属性のスコアを付ける。
5. 質問。その選択肢は、有効な属性にゼロ以外の効果（−5〜5）を持つ。
6. クイズの設定（既定値: 最小 6 問、目標 10 問、最大 12 問。結果 5 件）。

役に立つ診断のための最低限:
- 公開済みの旅行先が、少なくとも結果の件数（既定は 5）以上あること。それより少ないと、結果に表示される旅行先が少なくなり、通知が出る。
- 公開済みの質問が少なくとも目標の数（既定は 10）以上あり、それぞれ有効な選択肢を 2 つ以上と、有効な属性への効果を少なくとも 1 つ持つこと（そうでなければスキップされる）。それより少ないと、クイズが早く終わり、通知が出る。目標より多くの質問があると、セッションごとに変化が出る。
- 質問が複数のカテゴリーに分かれていること（選択はカテゴリーのバランスを取る）。

公開する各項目:
- 翻訳: 管理コンソールで公開するには `ja` か `en` が必要である。可能な限り `ja`、`en`、`es` で公開し、少なくとも `ja` と `en` は用意する（[DEPLOYMENT.md](DEPLOYMENT.md) 10 節）。ないロケールは ADR-012 のとおりにフォールバックする。
- 費用: 目安の範囲だけとし、通貨、期間、翻訳したすべてのロケールでの基準、出典、確認した日付を付ける。リアルタイム価格を思わせる文言は決して使わない（ADR-008）。
- 画像: `https` の URL、クレジット、翻訳したすべてのロケールでの代替テキスト。提供元のライセンスを確認する（[PUBLIC_RELEASE.md](../working/PUBLIC_RELEASE.md)（英語のみ）4 節）。
- 分かる範囲で、適した月、おすすめの日数、注意点。分からない値は推測せず空にする。
- 人が書いた概要と見どころ。これは AI が OFF のときの説明にもなる。

事後:
- 本番について 3 節のチェックを実行し、その後スマートフォンの大きさとデスクトップの大きさのウィンドウで、公開サイトを `ja`、`en`、`es` で確認する: クイズから結果まで、戻る・編集・やり直し、費用の基準と日付、AI が利用できない旨の通知、外部の検索リンク。
- 新しい Time Travel のブックマークを記録する。

## 9. 未解決の項目
- Access のポリシー外のアドレスが拒否されること: 未確認。2 つ目の Cloudflare アカウントが必要で、オーナーが先送りにした（2026-10-24）。
- `AI_CLIENT_RATE_LIMITER` の 429 の応答: 2026-10-25 のプレビューでの AI 試行では観測されなかった（同じアドレスから 15 回送り、すべて 400。[DECISIONS.md](../working/DECISIONS.md) の "Phase 10 verification log"）。原因は要確認。これが解決するまで本番で AI を有効にしない（ADR-026「Readiness for enabling AI」）。*更新（2026-10-25、Phase 11）*: IPv4 と IPv6 でキーが分かれたこと、Workers Free で binding が使えないことは否定された。リミッターは停止スイッチより先に動くようになり、AI を無効にしたままの確認（[DEPLOYMENT.md](DEPLOYMENT.md) 7.2）をプレビューで行う予定（「Phase 11 verification log」）。
- 2026-12-01 の Cloudflare Observability の料金変更後のログの取り込み量: 2026 年 12 月の第 1 週に一度確認する（3 節「日付の決まったもの」）。変更前の量は 2026-10-24 に記録した（7 節）。

## 10. 課金が始まる操作
アカウントは Workers Free のままにする。受け入れている課金は、既存のドメインの登録だけである。以下のダッシュボードでの操作は、オーナーの判断なしには一切行わず、判断は想定される月額費用とともに [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録する。2026-10-24 にリンク先のページで確認した。
- **Workers Paid へのアップグレード**: アカウントあたり月額 5 米ドル以上。含まれる割り当て（D1、Workers Logs、Queues など）を超えた利用は、失敗する代わりに課金されるようになる（https://developers.cloudflare.com/workers/platform/pricing/、2026-10-02 更新）。2026-12-01 以降は、有料プランのログの取り込みも、含まれる量を超えて自動的に続く（https://developers.cloudflare.com/observability/pricing/）。
- **Workers Logpush**: Workers Paid でのみ利用できる（https://developers.cloudflare.com/workers/observability/logs/logpush/、2026-10-12 更新）。
- **R2 の有効化**: 無料枠は Standard ストレージ 10 GB-月、月あたり Class A 操作 100 万回と Class B 操作 1,000 万回で、それを超えると単価で課金される（https://developers.cloudflare.com/r2/pricing/、2026-10-01 更新）。R2 の有効化に支払い方法が必要かどうかはページに記載がない *(要確認)*。
- **Images Paid の購入**: 画像の保存（月あたり保存 100,000 枚ごとに 5 米ドル）と配信（100,000 回ごとに 1 米ドル）が有効になり、月 5,000 回を超える変換が課金される。Free プランでは、上限を超えた変換はエラー 9422 で失敗し、課金されない（https://developers.cloudflare.com/images/pricing/、2026-10-19 更新）。
- **Log Explorer のデータセット**: 取り込み 1 GB あたり 1 米ドルで別途課金される。Free のアカウントで使えるかどうかはページに書かれていない（https://developers.cloudflare.com/observability/pricing/）。
- その他のプランのアップグレード、アドオンのサブスクリプション、Free 以外の Zero Trust のプラン。
