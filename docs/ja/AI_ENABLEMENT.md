<!-- source: docs/en/AI_ENABLEMENT.md blob 7b72ec493266865c891d5bc905536329b7d2c5c3 -->
[English](../en/AI_ENABLEMENT.md) | 日本語 · [目次に戻る](README.md)

> この文書は[英語版](../en/AI_ENABLEMENT.md)の翻訳。内容が異なる場合は英語版が優先する。

# AI 有効化の手順書

デプロイした Worker で任意の AI ノートを有効にし、試し、また止める手順をまとめる。オーナーと、オーナーの承認を受けるためにこれらの手順を準備する人向けの文書だ。一般的な手順、プレビューでの試行、AI を無効にしたままのリミッターの確認、本番での AI の有効化を扱う。ビルドとデプロイは [DEPLOYMENT.md](DEPLOYMENT.md)、監視は [OPERATIONS.md](OPERATIONS.md) にある。

> [!WARNING]
> AI の有効化、各試行、各デプロイ、その後の本番での利用は、どれも別々のオーナーの判断だ。以下の節は計画であって、承認ではない。

AI はすべての環境で無効になっている。AI が ON でも OFF でも、診断は動き続ける。

## 1. AI の有効化（一般的な手順）
この文書の各節は、ドキュメントを整理するまで [DEPLOYMENT.md](DEPLOYMENT.md) の 7 節にあった。

前提条件（ADR-026 A）:
- AI を有効にしている間も、アカウントは Workers Free のまま。
- 利用者ごとのリミッターが動いている。
- Workers Logs が有効。
- オーナーが Gemma の利用規約と禁止用途のポリシーを確認済み。

手順:
1. その環境の `vars` で `AI_ASSIST_ENABLED: "true"` にして、コミット、再ビルド、再デプロイする。
2. 4 言語すべてで AI ノートを確かめ、ダッシュボードで Workers AI の使用量を見る。
3. 監視と停止: ADR-026 E と [OPERATIONS.md](OPERATIONS.md) 4.4。
4. 本番では 4 節に従う（Phase 14 で用意したが、まだ承認されていない）。

## 2. プレビューでの試行（別途承認）
この試行では、本番について何か決める前に、利用者ごとのリミッター（ADR-026 A、前提条件 2）と AI ノートを確かめる。試行そのもの、各デプロイ、その後の本番での利用は、どれも別々のオーナーの判断だ。この節は計画であって、承認ではない。

**前提条件**（ADR-026「Readiness for enabling AI」）:
- アカウントが Workers Free で、Billing にはドメインの登録だけが載っている（[OPERATIONS.md](OPERATIONS.md) 3 節）。
- オーナーが Gemma の利用規約を確認した（2026-10-24 に完了）。
- プレビューに公開済みのコンテンツがある。
- 公開のプレビュー Worker で Workers Logs が ON で、呼び出しログは OFF。

**予算。** 試行でモデルを呼ぶのは**最大 10 回**。見込みは約 70〜140 Neurons、多くても約 1,050（1 日の割り当ての約 10%）。
- モデルは `@cf/google/gemma-4-26b-a4b-it`。
- 評価での実測: 1 回あたりの中央値は 7.3 Neurons（ADR-026「Evaluation round 2」）。
- 実際のリクエストの見積もり: 約 7〜14 Neurons、最悪で約 105（旅行先 5 件がすべて切り詰めの上限いっぱい。ADR-026 A）。
- Workers Free では 1 日 10,000 Neurons まで使え、00:00 UTC にリセットされる。超えると課金されずに失敗する。
- プレビューと本番でこの割り当てを共有するかは、料金ページに書かれていない（要確認）。計画では共有すると仮定する。
- 本文が不正なリミッター確認用のリクエストでは、モデルを呼ばない。

**期間。** 期間は短くする。有効化、テスト、無効化を同じ日の、UTC の早い時間に済ませ、URL は共有しない。公開のプレビュー Worker には Access の保護がないので、有効にしている間は URL を知っている人なら誰でも AI を使える。

手順:
1. オーナー: ダッシュボードで、その日すでに使った Workers AI の Neurons を控える。試行の使用量を差分で読むためだ。
2. 公開のプレビュー Worker だけで AI を有効にする:
   - `env.preview`（`wrangler.jsonc`）だけで `AI_ASSIST_ENABLED: "true"` にして、コミットする（オーナー承認済み）。
   - `CLOUDFLARE_ENV=preview npm run build` を実行する。
   - ドライランを確かめる: プレビューのデータベース、`AI_ASSIST_ENABLED` が `"true"`、`AI_CLIENT_RATE_LIMITER` が 60 秒に 5 回。
   - 公開のプレビュー Worker だけをデプロイする（[DEPLOYMENT.md](DEPLOYMENT.md) 5 節）。本番と管理 Worker はデプロイしない。
3. ノート（モデル呼び出し約 6 回）: 組み込みブラウザーで、AI のトグルを ON にして、`ja`、`en`、`es`、`fr` でそれぞれクイズを最初から最後まで 1 回答える。その後、1 つの結果ページで言語を 2 回切り替える。
   - 各手順でリクエストは 1 回。すでに表示した言語に戻すときは送らない（ADR-026 C4）。
   - リミッターに拒否されないよう、クイズの間は 60 秒以上空ける。
4. リミッター（モデル呼び出しなし）: 60 秒待ってから、1 つのアドレスから、本文が空のオブジェクトの同一オリジンのリクエストを送る。
   - ハンドラーの中の順番は、メソッド → オリジン → リミッター → 停止スイッチ → 本文。Phase 11 から、リミッターは停止スイッチより前にある。
   - だから最初のリクエストは 400 `invalid_request`、後のリクエストは 429 `rate_limited` になる（Phase 14 からは `limit` と `retryAfter` つき。ADR-026「Phase 14 amendments」）。

   ```bash
   for i in $(seq 1 15); do curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Origin: https://travel-discovery-preview.<account subdomain>.workers.dev" -H "Content-Type: application/json" --data "{}" https://travel-discovery-preview.<account subdomain>.workers.dev/api/ai/explanations; done
   ```

   400 と 429 の数を記録する。カウンターは Cloudflare の拠点ごとで、結果整合なので、最初の 429 が 6 回目以降になることもある。15 回送っても 429 が出なければ、このチェックは失敗だ（それ以上送らない）。
5. ログ（オーナー、`travel-discovery-preview` の Observability）:
   - `ai_explanation` の行は、どれもちょうど `event`、`outcome`、`model`、`latencyMs`、`destinationCount` を持つ。`invalid_output` の行は、落ちたチェックを示す固定のコード `reason` も持つ（Phase 14 から）。
   - どの行にも、アドレス、回答、条件、プロンプト、ノートの本文が入っていない。
   - 手順 3 で期待するもの: リクエストごとに `ok` の行が 1 つ。`model` は `@cf/google/gemma-4-26b-a4b-it`、`destinationCount` は表示したカードの数（既定は 5）、`latencyMs` は 8,000 未満。
   - 手順 4 で期待するもの: `latencyMs` が 0 の `rate_limited_window` の行（Phase 14 より前は `rate_limited`）。
   - `invalid_output`、`timeout`、`provider_error`、`content_mismatch` の行があれば数える。
6. オーナーが `ja`、`en`、`es`、`fr` のノートを確認する:
   - 選んだ言語で書かれている。`ja` では UI と同じ丁寧な文体、`fr` では `vous` を使う。
   - 順位、スコア、旅行先同士の比較がない。
   - 旅行先の人が書いた文章にない価格、費用、日付、季節、営業時間、ビザや入国のルール、安全についての主張、施設・イベント・店の名前がない。
   - 決定的な説明と矛盾しない。
   - 各ノートに AI が書いたというラベルがある。決定的な説明、費用、季節の注記は変わらない。カードの順番は AI が OFF のときと同じ。
   - ロケールごとの結果を [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録する。ノートの文章はリポジトリにコピーしない。
7. オーナー: Workers AI の Neurons をもう一度読み、差分を記録する。
8. 無効化: `AI_ASSIST_ENABLED` を `"false"` に戻し、コミット、再ビルドして、公開のプレビュー Worker を再デプロイする。`scripts/check-deployment.mjs <account subdomain> preview` で、503 `ai_unavailable` と、`/api/ai/status` の `{"enabled":false}` を確かめる。AI を有効にしている間は、このスクリプトの AI のチェックは意図どおり失敗する。

**すぐに止める**（他の手順を終えずに手順 8 へ）のは、次のどれかのとき:
- 試行で使った Neurons が 1,000 を超えた。
- モデルを 10 回呼んだ。
- 2 つのレスポンスが `ok`、`rate_limited_window`、`rate_limited_daily` 以外で終わった。
- ノートに価格、日付、順位など、禁じた内容が入っていた。
- ログや Billing のページに予期しないものが出た。

その間も診断は動き続ける。ダッシュボードで変数を変えるほうが再デプロイより早いが、次の `wrangler deploy` で上書きされる。だから再デプロイの前に `"false"` をコミットする。

**記録する**もの（[DECISIONS.md](../working/DECISIONS.md)、英語のみ）: 日付、バージョン ID、モデルを呼んだ回数、前後の Neurons、手順 4 の 400／429 の数、手順 5 の結果の件数とレイテンシー、手順 6 のオーナーの確認結果。

**後の本番の判断を止める**もの（どれか 1 つでも）:
- 手順 4 で 429 が出なかった。
- 手順 3 のリクエストのうち 2 つ以上で `invalid_output`、`timeout`、`provider_error` が出た。
- 順位、比較、データにない事実を含むノートがあった。
- 1 回あたりの Neurons が見積もりを大きく上回った（平均で約 30 超）。
- ログの行に 5 つ（`invalid_output` は `reason` を含めて 6 つ）より多い項目があった、またはリクエストの内容が入っていた。
- アカウントが Workers Free でない、または Billing に新しい請求がある。
- Workers Logs の量が Free の上限に近い（[OPERATIONS.md](OPERATIONS.md) 7 節）。

プレビューと本番で Neurons の割り当てを共有するかは要確認のままで、共有する前提で計画している。本番で AI を有効にするのは、この手順書に沿った別のオーナーの判断で、この記録ができてから下す。

## 3. AI を無効にしたままのリミッターの確認（別途承認）
リミッターは、`AI_ASSIST_ENABLED` が `"false"` のデプロイでも確かめられる。モデルは呼ばれず、確認の間に AI を使える人はいない。Phase 11 から、公開 Worker は停止スイッチより前に `AI_CLIENT_RATE_LIMITER`、続いて上限用の Durable Object `AI_CLIENT_LIMITER`（ADR-029）を参照するからだ。

- リミッターに拒否されたリクエストは 429 `rate_limited` を返す（Phase 14 からは `limit` `window` と `retryAfter` つきで、`rate_limited_window` の行を書く）。
- それ以外は 503 `ai_unavailable` を返し、`disabled` の行を書く。
- 1 回の実行ごとに、そのアドレスの 1 日 30 回の上限にも数えられる（2 回の実行で 10 回分）。
- 各リクエストは Workers Free の 1 日のリクエスト上限にも数えられる（ここでは無視できる量）。
- デプロイと確認は、それぞれオーナーの承認が要る。この確認のために本番はデプロイしない。

手順:
1. 確かめるコミットを、公開のプレビュー Worker だけにデプロイする（[DEPLOYMENT.md](DEPLOYMENT.md) 5 節）。`AI_ASSIST_ENABLED` は `"false"`。
   - ドライランで、`AI_CLIENT_RATE_LIMITER`（60 秒に 5 回）と Durable Object の `AI_CLIENT_LIMITER`（`AiClientLimiter`）があることを確かめる。
   - Durable Object を含む最初のデプロイで、そのマイグレーション `v1`（`new_sqlite_classes`）が適用される。後でクラスを外すには `deleted_classes` のマイグレーションが要る。
2. 同じアドレスからの他の AI リクエスト（`scripts/check-deployment.mjs` を含む）から、60 秒以上待つ。
3. 実行 A、接続 1 本: 1 回の `curl` で 15 リクエストを送り、接続を使い回す（`num_connects` は最初のリクエストが 1、残りは 0）。`-4` でリクエストを IPv4 にそろえ、同じキーを共有させる:

   ```bash
   URL=https://travel-discovery-preview.<account subdomain>.workers.dev; args=(); for i in $(seq 1 15); do args+=("$URL/api/ai/explanations" -o /dev/null); done; curl -4 -s -X POST -H "Origin: $URL" -H "Content-Type: application/json" --data "{}" -w "%{http_code} %{num_connects}\n" "${args[@]}"
   ```

4. 60 秒以上待ってから、実行 B。リクエストごとに新しい接続を使う:

   ```bash
   URL=https://travel-discovery-preview.<account subdomain>.workers.dev; for i in $(seq 1 15); do curl -4 -s -o /dev/null -X POST -H "Origin: $URL" -H "Content-Type: application/json" --data "{}" -w "%{http_code} %{num_connects}\n" "$URL/api/ai/explanations"; done
   ```

5. 60 秒以上待ってから、`node scripts/check-deployment.mjs <account subdomain> preview` を実行する。この AI のチェックは 503 と、Phase 14 からは `GET /api/ai/status` が `{"enabled":false}` を返すことを期待する。
6. オーナー、`travel-discovery-preview` の Observability:
   - 実行 A と B の `rate_limited_window`（Phase 14 より前は `rate_limited`）と `disabled` の行を数える。429 と 503 の数と一致するはずだ。
   - ダッシュボードで、Durable Object のリクエスト数と書き込んだ行数を控える。Worker のリクエスト数に Durable Object の呼び出しが含まれるかも控える（ADR-029、要確認）。

**記録する**もの（[DECISIONS.md](../working/DECISIONS.md)（英語のみ）「Phase 11 verification log」）: バージョン ID と、実行ごとのステータスコードと接続数の並び。アドレスは決して記録しない。

**読み方。** 上限用の Durable Object があれば、どちらの実行でもちょうど 503 が 5 回、その後 429 にならなければならない。1 つのオブジェクトがそのアドレスのリクエストをすべて数えるからだ。
- どちらかの実行で 503 が 6 回以上、または 429 が出ないなら失敗だ。AI は無効のままにして記録する。
- 比較のため: Durable Object なし（2026-10-25）では、バインディングだけだと 429 が出たのは実行 A だけだった。新しい接続のリクエスト同士では数が共有されない。
- 新しい判断なしに、15 リクエストの実行 2 回を超えて送らない。

## 4. 本番での AI の有効化（別途承認）
オーナーが日付を決めてこの手順を承認するまで、本番の AI は無効のまま。この節は 2026-10-31（Phase 14）にオーナーの依頼で用意したもので、計画であって承認ではない。推奨は、2026 年 12 月第 1 週の日付つきの Workers Logs と Billing のチェック（[OPERATIONS.md](OPERATIONS.md) 3 節）の後に実施すること。

**前提条件:**
- ADR-026「Readiness for enabling AI」に、満たしていない項目がない。
- Billing にはドメインの登録だけが載っていて、プランは Free（[OPERATIONS.md](OPERATIONS.md) 3 節）。
- プレビューの AI は無効。
- `travel-discovery` で Workers Logs が ON で、呼び出しログは OFF。
- 本番の上限用 Durable Object がデプロイ済み（バージョン `cc06950d` 以降）。

**利用者にとって変わること。** 本番の URL は公開されているので、プレビューの試行と違って短い期間というものはない。上限の範囲なら誰でも AI を使える。
- 計画の画面でトグルが使える状態で表示される（`/api/ai/status` が `{"enabled":true}` を返す）。
- 利用者ごとに、AI のリクエストは最大で 60 秒に 5 回、UTC の 1 日に 30 回（ADR-029）。
- 決定的な結果は変わらない。

**予算。**
- Workers Free には 1 日 10,000 Neurons が含まれ、00:00 UTC にリセットされる。超えると課金されずに失敗する。プレビューと本番で共有する前提で計画している（要確認）。
- 実測の 1 回 7〜14 Neurons（試行では約 11.8）なら、1 日あたりおよそ 700〜1,400 回。
- 1 つのアドレスが 1 日に使えるのは最大で約 420 Neurons（最悪で約 3,150）。
- アプリ全体の 1 日の上限はない（ADR-029「Not covered」）。多くのアドレスが合わせて割り当てを使い切ることがあり、そうなると 00:00 UTC まで全員が AI を使えなくなる。

手順:
1. オーナー: 前提条件を確かめ、その日すでに使った Workers AI の Neurons を控える。
2. 公開の本番 Worker だけで AI を有効にする:
   - `env.production`（`wrangler.jsonc`）だけで `AI_ASSIST_ENABLED: "true"` にして、コミットする（オーナー承認済み）。
   - 公開の本番 Worker だけについて [DEPLOYMENT.md](DEPLOYMENT.md) 5 節を実行する: `npm ci`、`npm run check`、`CLOUDFLARE_ENV=production npm run build`、ドライラン。
   - ドライランには、本番のデータベース、`AI_ASSIST_ENABLED` が `"true"`、`AI_CLIENT_RATE_LIMITER` が 60 秒に 5 回、`AI_CLIENT_LIMITER (AiClientLimiter)` が出ていなければならない。
   - `travel-discovery` だけをデプロイする。プレビューと管理 Worker はデプロイしない。バージョン ID と時刻を記録する。
3. 確認（モデル呼び出し約 4 回）:
   - `GET /api/ai/status` が `{"enabled":true}` を返す。
   - `scripts/check-deployment.mjs <account subdomain> production` が、AI のチェック以外は通る。AI のチェックは、AI を有効にしている間は意図どおり失敗する（状態が `{"enabled":true}` で、503 が出ない）。
   - 組み込みブラウザーで、AI のトグルを ON にして、`ja`、`en`、`es`、`fr` でそれぞれクイズを最初から最後まで 1 回答える。間は 60 秒以上空ける。
   - 各ノートに AI が書いたというラベルがあり、カードの順番と決定的な文章は AI が OFF のときと同じ。
   - オーナーが、2 節の手順 6 と同じようにノートを確認する。
4. 監視（オーナー）: 手順 2 の約 1 時間後、その UTC の日の終わり、最初の 1 週間は毎日、その後は週ごとの定期チェックのときに、次を読む:
   - Workers AI: その日に使った Neurons。
   - `travel-discovery` の Observability: `ai_explanation` の結果ごとの件数（`ok`、`reason` つきの `invalid_output`、`timeout`、`provider_error`、`content_mismatch`、`rate_limited_window`、`rate_limited_daily`、`limiter_unavailable`）と、`ok` のレイテンシー。どの行も 5 つの項目（`invalid_output` は 6 つ）だけを持ち、リクエストの内容は入っていない。
   - Worker の 1 日のリクエスト数と Workers Free の 100,000 との比較、Durable Object のエラー、Billing。
5. [DECISIONS.md](../working/DECISIONS.md)（英語のみ）に記録する: 日付、バージョン ID、手順 3 の前後の Neurons、各監視の時点の結果の件数、ノートについてのオーナーの確認結果。ノートの文章はリポジトリにコピーしない。

**すぐに止める**（他の手順を終えずに、下のとおり無効にする）のは、次のどれかのとき:
- 12:00 UTC より前に、使った Neurons が 7,000（1 日の割り当ての 70%）を超えた。
- Billing に新しい請求か、Free 以外のプランが出た。
- モデル呼び出しが 10 回以上あった日に、20% を超えるものが `invalid_output`、`timeout`、`provider_error` で終わった。
- ノートに価格、日付、順位、比較、旅行先の文章にない事実が入っていた。
- ログの行に上より多い項目か、リクエストの内容が入っていた。
- `limiter_unavailable` の行が出た（上限の仕組みが失敗したので、AI はすでに拒否側に倒れている）。
- Worker のリクエストが 1 日で 70,000 を超えた。
- その他、ログや Billing のページに予期しないものが出た。

その間も診断は動き続ける。

**無効化。**
- **速い方法**（オーナー、ダッシュボード）: Workers & Pages → `travel-discovery` → Settings → Variables *(要確認: 正確な表示名)* で、`AI_ASSIST_ENABLED` を `false` にする。
  - 新しいリクエストにはすぐ効く。計画の画面は 1 分以内に AI を OFF と表示する（状態は 60 秒キャッシュされることがある）。
  - ダッシュボードでの変更は次の `wrangler deploy` で上書きされる。だからその後、`env.production` で `"false"` にして、コミット、再ビルドし、公開の本番 Worker を再デプロイする。
- **通常の方法:** ダッシュボードを使わずに、同じコミットと再デプロイをする。
- どちらの場合も、`scripts/check-deployment.mjs <account subdomain> production` で、`/api/ai/status` が `{"enabled":false}` を、AI エンドポイントが 503 `ai_unavailable` を返すことを確かめ、時刻を記録する。
