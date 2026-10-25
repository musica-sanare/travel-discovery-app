<!-- source: docs/en/DATA_MODEL.md blob 08f6705441dc67c7de82dc041669a1502a09e232 -->
[English](../en/DATA_MODEL.md) | 日本語 · [目次に戻る](README.md)

> この文書は[英語版](../en/DATA_MODEL.md)の翻訳です。内容が異なる場合は英語版が優先されます。

# データモデル — Travel Discovery

これは初期の論理モデルである。Claude Code は、現在の D1／ORM の互換性を確認したうえで、これを具体的なスキーマ、制約、インデックス、マイグレーションに落とし込む。

ローカライズのルール: ベーステーブルにはロケールに依存しないデータ（ID、スラッグ、列挙値、数値、URL、日付）だけを置く。ユーザーに見える文字列はすべて、`(entity_id, locale)` をキーとし `locale` が `ja`／`en`／`es` の `*_translations` テーブルに置く。翻訳がない場合のフォールバックは [DECISIONS.md](../working/DECISIONS.md)（英語のみ、ADR-012）で定めている。

## エンティティ

### countries
- `id`: 安定した主キー
- `slug`: 一意で安定したスラッグ
- `created_at`、`updated_at`

### country_translations
- `country_id`
- `locale`: `ja`／`en`／`es`
- `name`
- 複合主キー `(country_id, locale)`

### destinations
- `id`: 安定した主キー
- `slug`: 一意で安定したスラッグ
- `country_id`: 外部キー
- `destination_type`: city／region／island／その他の対応する列挙値
- `recommended_days_min`、`recommended_days_max`
- `best_months_mask`: 構造化した旅行に適した月（Phase 2、ADR-021）
- 目安の費用は `destination_cost_estimates` に置く（Phase 2、ADR-021）
- `image_url`、`image_attribution`
- `flight_search_config`／`hotel_search_config` は、安全で文書化されていて必要な場合だけ。それ以外はアプリのコードで既知の安全な URL を生成する
- `status`: draft／published／archived
- `created_at`、`updated_at`

### destination_translations
- `destination_id`
- `locale`: `ja`／`en`／`es`
- `name`
- `summary`
- `highlights`（正規化した子テーブルか、検証した JSON。どちらにしたかを文書化する）
- `cautions`
- `best_season_text`
- `image_alt`
- 複合主キー `(destination_id, locale)`

### destination_cost_estimates（Phase 2）
- `id`
- `destination_id`
- `currency`: `JPY`／`USD`／`EUR`。旅行先ごとに一意
- `period`: `per_day`／`per_trip`
- `scope`: 安定した列挙値（例: `per_person_excluding_international_flights`）。ラベルは UI のメッセージカタログでローカライズする
- `min`、`max`
- `source_name`、`source_url`
- `updated_at`（日付）

### destination_cost_estimate_translations（Phase 2）
- `estimate_id`
- `locale`: `ja`／`en`／`es`
- `basis`: 概算に何が含まれるか、どんな前提かの説明
- 複合主キー `(estimate_id, locale)`

### attributes
- `id`
- `slug`: 一意
- `status`

### attribute_translations
- `attribute_id`
- `locale`: `ja`／`en`／`es`
- `name`
- `description`（任意）
- 複合主キー `(attribute_id, locale)`

### destination_attributes
- `destination_id`
- `attribute_id`
- `score`: 初期の尺度は 0〜5
- 複合主キー `(destination_id, attribute_id)`

### questions
- `id`
- `slug`: 一意
- `category_id`、またはカテゴリーのスラッグ／参照
- `question_type`: single_choice／multiple_choice／range
- `priority_weight`
- `status`: draft／published／archived
- `selection_tags` または明示的な条件（小さく検証されたルールの集合に限る）
- `display_order`（任意）
- `created_at`、`updated_at`

### question_translations
- `question_id`
- `locale`: `ja`／`en`／`es`
- `prompt`
- `description`（任意）
- 複合主キー `(question_id, locale)`

### question_categories
- `id`
- `slug`: 一意
- `status`

### question_category_translations
- `category_id`
- `locale`: `ja`／`en`／`es`
- `name`
- 複合主キー `(category_id, locale)`

### question_option_translations
- `option_id`
- `locale`: `ja`／`en`／`es`
- `label`
- 複合主キー `(option_id, locale)`

### question_options
- `id`
- `question_id`
- `value`
- `display_order`
- `status`

### option_score_effects
- `option_id`
- `attribute_id`
- `weight`: 符号付きの数値の効果。範囲は文書化し、検証する
- 複合主キー `(option_id, attribute_id)`

### app_settings
- `key`
- `value_json`
- `updated_at`
- `updated_by` は、検証済みの管理者の ID が得られ、かつ必要な場合だけ

## 関係
- 1 つの国は多くの旅行先を持つ。
- 1 つの旅行先は 1 つの国に属する。
- 旅行先と属性は `destination_attributes` を介した多対多。
- ローカライズしたテキストは、安定した ID やスコアリング用データとは別に保存する。
- 1 つの質問は多くの選択肢を持つ。
- 選択肢と属性は `option_score_effects` を介した多対多。
- 質問はカテゴリーに属する。
- 全体設定はキー／値の設定で、キーごとにスキーマで検証する。

## 設計ルール
- 他から参照されるレコードは、物理削除より論理的なアーカイブを優先する。
- 公開の一覧、状態、スラッグ、結合のために外部キーとインデックスを追加する。
- 範囲と関係は API の境界で検証し、可能な場合は DB の制約でも検証する。
- タイムスタンプの形式を揃える（API の境界では UTC の ISO 8601。DB での保存形式は互換性のある取り決めを選ぶ）。
- MVP ではユーザーの回答を永続的なテーブルに保存しない。
- 質問の条件に、任意の実行可能な式や JavaScript を保存しない。小さく型付けされた条件の形式を使う。
- JSON の項目を選んだ場合は、トレードオフを文書化し、実行時に検証する。
- 公開するシードのコンテンツにはすべて、人が整えた `ja`・`en`・`es` の翻訳を必須とする。管理者が入力した不完全なコンテンツには、文書化したフォールバックを適用する。
- 金額は整数の補助単位、または明確に定義した整数の単位で保存する。明示的な換算のメタデータなしに通貨を混在させない。
- 費用のレコードには、対象範囲、基準、出典、更新日を必ず含める。
- 外部リンクは安全に生成し、許可リストか固定のテンプレートで検証する。

## シードデータ
体験を示せるだけのサンプルコンテンツを作るが、裏付けのない細かすぎる事実は避ける。旅行先 30〜50 件、質問 30〜50 問程度にするのは、品質と出所を保てる場合だけにする。小さく整えたデータセットから始めて、後で増やしてもよい。

シードする旅行先にはそれぞれ、目安の費用の出典・基準を含めるか、費用が例示で未検証であることを明記する。シードの値を現在のリアルタイム価格として提示しない。

## Phase 1 のスキーマに関する注記

具体的なスキーマは `server/db/schema.ts`（Drizzle ORM 0.45）と、`migrations/` にある生成されたマイグレーションである。上の論理モデルからの調整と、その理由:

- **ID とタイムスタンプ**: 整数の自動採番の主キー（内部用。公開 API はスラッグだけを使う）。`created_at`／`updated_at` はアプリが書き込む UTC の ISO 8601 のテキスト。`cost_updated_at` は ISO の日付（`YYYY-MM-DD`）。
- **状態の値**: 旅行先と質問は `draft / published / archived`、属性・質問カテゴリー・質問の選択肢は `active / archived`。国には状態がない（参照データであり、削除しない）。許可された値は CHECK 制約で守る。
- **翻訳**: ユーザーに見える文字列をすべてローカライズするため（上のローカライズのルール参照）、`country_translations`、`attribute_translations`、`question_category_translations` を追加した。`locale` は `ja`、`en`、`es` に制約する。
- **見どころ**: 子テーブルではなく、検証した文字列の JSON 配列（`destination_translations.highlights_json`、最大 8 項目、各 200 文字）として保存する。トレードオフ: 短い順序付きリストの読み書きが簡単になる。書き込み時と読み込み時に Zod で検証する。
- **目安の費用**（*「Phase 2 のスキーマに関する注記」で置き換え済み*）: `cost_min`／`cost_max` は `cost_currency`（ISO 4217 のコード）の整数の単位。目安の範囲に補助単位の精度は不要。CHECK 制約で、費用の項目群（最小、最大、通貨、対象範囲、出典名、更新日。出典 URL は任意）を全部入力するか全部空にするかのどちらかにし、`0 <= cost_min <= cost_max` とする。費用を設定するときは、入力したすべての翻訳に `cost_basis` を含める（API で検証）。`cost_scope` は安定した列挙値で、ラベルは UI でローカライズする。
- **画像**: `image_url` と `image_attribution` は旅行先に、`image_alt` は翻訳ごとに持つ（画像を設定した場合、入力した各翻訳で必須）。URL は `https` でなければならない。
- **尺度**: `destination_attributes.score` は 0〜5 の整数。`option_score_effects.weight` は −5〜5 のゼロ以外の整数（初期の範囲。スコアの計算式を文書化する Phase 2 で見直す可能性がある）。`questions.priority_weight` は 1〜10 の整数（既定は 5）。
- **質問タイプ**: 実装しているのは `single_choice` と `multiple_choice` だけで、Phase 2 からはどちらも公開できる（[DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-021）。論理モデルの `range` は実装していない。範囲のある唯一の数値入力である予算は、旅行の条件として扱うためである（ADR-021）。後で追加する場合は、CHECK 制約を広げるマイグレーションになる。
- **選択の条件**: 保存しない。Phase 2 の質問選択は、質問ごとの条件ではなく属性のカバー状況によって適応する（[DIAGNOSTIC_ALGORITHM.md](DIAGNOSTIC_ALGORITHM.md) §7）。
- **選択肢**: 質問ごとに `value`（安定したスラッグ）で一意なので、更新時は value で選択肢を対応付ける。管理画面の更新で省かれた選択肢は、削除ではなくアーカイブされる。
- **設定**: `app_settings` は `quiz` キー（検証済みの JSON）を保存する。[DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-020 を参照。
- **削除**: API による物理削除はしない。外部キーの `ON DELETE CASCADE` は、親の行からその翻訳・子の行への場合だけに使い、独立したエンティティ同士の参照には `RESTRICT` を使う。

## Phase 2 のスキーマに関する注記

マイグレーション `0001`（判断: [DECISIONS.md](../working/DECISIONS.md)（英語のみ） ADR-021、アルゴリズム: [DIAGNOSTIC_ALGORITHM.md](DIAGNOSTIC_ALGORITHM.md)）:

- **費用の概算**: `destinations` の費用の列を `destination_cost_estimates` に置き換え、`destination_translations.cost_basis` を `destination_cost_estimate_translations.basis` に置き換えた。概算は `(destination_id, currency)` ごとに最大 1 件。`currency` は `JPY`、`USD`、`EUR`（`shared/costs.ts`）、`period` は `per_day` または `per_trip`、`min`／`max` は通貨の整数の単位で `0 <= min <= max`。旅行先が翻訳を持つすべてのロケールで、各概算の basis が必要（API で検証）。概算は旅行先の集約の `PUT` の一部として置き換えられる。
- **旅行に適した月**: `destinations.best_months_mask` は `NULL`（不明）または 1〜4095 で、ビット `m − 1` は `m` 月が旅行に適した月であることを表す。API ではソートした月のリストとしてやり取りする（`shared/months.ts`）。
- **マイグレーションの安全性**: `destinations` の作り直しでは、ID、翻訳、属性スコアを保持する（ADR-021 参照）。以前の単一通貨の費用の値は破棄する。
