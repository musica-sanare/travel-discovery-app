-- Local development seed data (apply after migrations to an empty database:
-- `npm run db:reset:local`). Small curated sample with ja/en/es text.
-- No indicative cost estimates are seeded: no sourced estimates exist
-- yet, and seed data must not present invented prices (docs/SPEC.md §7).
-- Rows reference each other by slug so the file does not depend on IDs.
-- Multi-row VALUES are used because D1 limits compound SELECT terms.

-- Countries
INSERT INTO countries (slug, created_at, updated_at) VALUES
  ('portugal', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('taiwan', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('iceland', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('vietnam', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z');

WITH t(slug, locale, name) AS (VALUES
  ('portugal', 'ja', 'ポルトガル'),
  ('portugal', 'en', 'Portugal'),
  ('portugal', 'es', 'Portugal'),
  ('taiwan', 'ja', '台湾'),
  ('taiwan', 'en', 'Taiwan'),
  ('taiwan', 'es', 'Taiwán'),
  ('iceland', 'ja', 'アイスランド'),
  ('iceland', 'en', 'Iceland'),
  ('iceland', 'es', 'Islandia'),
  ('vietnam', 'ja', 'ベトナム'),
  ('vietnam', 'en', 'Vietnam'),
  ('vietnam', 'es', 'Vietnam'))
INSERT INTO country_translations (country_id, locale, name)
SELECT c.id, t.locale, t.name FROM t JOIN countries c ON c.slug = t.slug;

-- Attributes (scored 0-5 per destination)
INSERT INTO attributes (slug, status, created_at, updated_at) VALUES
  ('food', 'active', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('history-culture', 'active', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('nature', 'active', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('city-life', 'active', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('beach', 'active', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z');

WITH t(slug, locale, name) AS (VALUES
  ('food', 'ja', '食'),
  ('food', 'en', 'Food'),
  ('food', 'es', 'Gastronomía'),
  ('history-culture', 'ja', '歴史・文化'),
  ('history-culture', 'en', 'History and culture'),
  ('history-culture', 'es', 'Historia y cultura'),
  ('nature', 'ja', '自然'),
  ('nature', 'en', 'Nature'),
  ('nature', 'es', 'Naturaleza'),
  ('city-life', 'ja', '都市の街歩き'),
  ('city-life', 'en', 'City life'),
  ('city-life', 'es', 'Vida urbana'),
  ('beach', 'ja', 'ビーチ'),
  ('beach', 'en', 'Beaches'),
  ('beach', 'es', 'Playas'))
INSERT INTO attribute_translations (attribute_id, locale, name, description)
SELECT a.id, t.locale, t.name, NULL FROM t JOIN attributes a ON a.slug = t.slug;

-- Destinations (three published, one draft to demonstrate publication filtering)
-- best_months is a 12-bit mask (bit m - 1 = month m) mirroring each
-- destination's authored best-season text; NULL where that text names no
-- single period (South Iceland) or is missing (Da Nang).
-- Lisbon: Mar-May, Sep-Nov = 1820. Taipei: Oct-Apr = 3599.
WITH d(slug, country, type, days_min, days_max, best_months, status) AS (VALUES
  ('lisbon', 'portugal', 'city', 3, 6, 1820, 'published'),
  ('taipei', 'taiwan', 'city', 3, 5, 3599, 'published'),
  ('south-iceland', 'iceland', 'region', 5, 10, NULL, 'published'),
  ('da-nang', 'vietnam', 'city', 4, 7, NULL, 'draft'))
INSERT INTO destinations
  (slug, country_id, destination_type, recommended_days_min, recommended_days_max, best_months_mask, status, created_at, updated_at)
SELECT d.slug, c.id, d.type, d.days_min, d.days_max, d.best_months, d.status,
  '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'
FROM d JOIN countries c ON c.slug = d.country;

WITH t(slug, locale, name, summary, highlights, cautions, season) AS (VALUES
  ('lisbon', 'ja', 'リスボン',
    '坂道と路面電車の街並み、海沿いの景色、食文化を歩いて楽しめる首都。',
    '["歴史地区の散策","海沿いの地区","魚介料理"]',
    '坂や石畳が多いため、歩きやすい靴があると安心です。',
    '気候が穏やかな春と秋が過ごしやすい時期です。'),
  ('lisbon', 'en', 'Lisbon',
    'A hilly capital of trams, river views and food culture that rewards exploring on foot.',
    '["Historic neighborhoods","Riverside districts","Seafood dishes"]',
    'Expect steep hills and cobblestones; comfortable shoes help.',
    'Spring and autumn are usually the most comfortable seasons.'),
  ('lisbon', 'es', 'Lisboa',
    'Una capital de colinas, tranvías y vistas al río, ideal para recorrer a pie y disfrutar de su gastronomía.',
    '["Barrios históricos","Zonas junto al río","Pescados y mariscos"]',
    'Hay muchas cuestas y calles empedradas; conviene llevar calzado cómodo.',
    'La primavera y el otoño suelen ser las estaciones más agradables.'),
  ('taipei', 'ja', '台北',
    '夜市や屋台料理、寺院、近郊の温泉や山歩きまで、短い日程でも幅広く楽しめる都市。',
    '["夜市","寺院めぐり","近郊の温泉"]',
    '夏は暑さと雨が多く、台風の時期もあります。',
    '比較的過ごしやすいのは秋から春にかけてです。'),
  ('taipei', 'en', 'Taipei',
    'A compact city of night markets, temples and nearby hot springs and hiking, well suited to short trips.',
    '["Night markets","Temples","Nearby hot springs"]',
    'Summers are hot and rainy, and typhoons can occur.',
    'Autumn to spring is generally more comfortable.'),
  ('taipei', 'es', 'Taipéi',
    'Una ciudad compacta con mercados nocturnos, templos, aguas termales y senderos cercanos, ideal para viajes cortos.',
    '["Mercados nocturnos","Templos","Aguas termales cercanas"]',
    'Los veranos son calurosos y lluviosos, y puede haber tifones.',
    'De otoño a primavera el clima suele ser más agradable.'),
  ('south-iceland', 'ja', 'アイスランド南部',
    '滝、氷河、黒砂の海岸など、ダイナミックな自然景観を巡る地域。',
    '["滝","氷河","黒砂の海岸"]',
    '天候が急変しやすく、冬は日照時間が短く道路状況に注意が必要です。',
    '日が長く移動しやすいのは夏、オーロラ観賞は冬が中心です。'),
  ('south-iceland', 'en', 'South Iceland',
    'A region of waterfalls, glaciers and black-sand beaches for travelers who want dramatic landscapes.',
    '["Waterfalls","Glaciers","Black-sand beaches"]',
    'Weather changes quickly; winter brings short days and difficult road conditions.',
    'Summer offers long days for travel; winter is the main season for auroras.'),
  ('south-iceland', 'es', 'Sur de Islandia',
    'Una región de cascadas, glaciares y playas de arena negra para quienes buscan paisajes impresionantes.',
    '["Cascadas","Glaciares","Playas de arena negra"]',
    'El tiempo cambia rápidamente; en invierno los días son cortos y las carreteras pueden ser difíciles.',
    'El verano ofrece días largos para viajar; el invierno es la temporada principal de auroras.'),
  ('da-nang', 'ja', 'ダナン',
    '長いビーチと近郊の古い町並みを組み合わせて楽しめる海辺の都市。',
    '["ビーチ","近郊の旧市街"]', NULL, NULL),
  ('da-nang', 'en', 'Da Nang',
    'A coastal city combining long beaches with nearby historic towns.',
    '["Beaches","Nearby old towns"]', NULL, NULL))
INSERT INTO destination_translations
  (destination_id, locale, name, summary, highlights_json, cautions, best_season_text)
SELECT d.id, t.locale, t.name, t.summary, t.highlights, t.cautions, t.season
FROM t JOIN destinations d ON d.slug = t.slug;

WITH s(destination, attribute, score) AS (VALUES
  ('lisbon', 'food', 4),
  ('lisbon', 'history-culture', 4),
  ('lisbon', 'city-life', 4),
  ('lisbon', 'nature', 2),
  ('lisbon', 'beach', 3),
  ('taipei', 'food', 5),
  ('taipei', 'history-culture', 3),
  ('taipei', 'city-life', 5),
  ('taipei', 'nature', 3),
  ('taipei', 'beach', 1),
  ('south-iceland', 'food', 2),
  ('south-iceland', 'history-culture', 2),
  ('south-iceland', 'city-life', 1),
  ('south-iceland', 'nature', 5),
  ('south-iceland', 'beach', 1),
  ('da-nang', 'beach', 5),
  ('da-nang', 'food', 4))
INSERT INTO destination_attributes (destination_id, attribute_id, score)
SELECT d.id, a.id, s.score FROM s
JOIN destinations d ON d.slug = s.destination
JOIN attributes a ON a.slug = s.attribute;

-- Question categories
INSERT INTO question_categories (slug, status, created_at, updated_at) VALUES
  ('travel-style', 'active', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('interests', 'active', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z');

WITH t(slug, locale, name) AS (VALUES
  ('travel-style', 'ja', '旅のスタイル'),
  ('travel-style', 'en', 'Travel style'),
  ('travel-style', 'es', 'Estilo de viaje'),
  ('interests', 'ja', '興味・関心'),
  ('interests', 'en', 'Interests'),
  ('interests', 'es', 'Intereses'))
INSERT INTO question_category_translations (category_id, locale, name)
SELECT c.id, t.locale, t.name FROM t JOIN question_categories c ON c.slug = t.slug;

-- Questions (two published, one draft)
WITH q(slug, category, type, priority, display_order, status) AS (VALUES
  ('pace', 'travel-style', 'single_choice', 5, 1, 'published'),
  ('main-interest', 'interests', 'single_choice', 7, 2, 'published'),
  ('evening', 'travel-style', 'single_choice', 3, 3, 'draft'))
INSERT INTO questions
  (slug, category_id, question_type, priority_weight, display_order, status, created_at, updated_at)
SELECT q.slug, c.id, q.type, q.priority, q.display_order, q.status,
  '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'
FROM q JOIN question_categories c ON c.slug = q.category;

WITH t(slug, locale, prompt) AS (VALUES
  ('pace', 'ja', '旅のペースはどちらが好みですか？'),
  ('pace', 'en', 'What travel pace do you prefer?'),
  ('pace', 'es', '¿Qué ritmo de viaje prefieres?'),
  ('main-interest', 'ja', '旅先でいちばん楽しみたいことは？'),
  ('main-interest', 'en', 'What do you most want to enjoy on your trip?'),
  ('main-interest', 'es', '¿Qué es lo que más quieres disfrutar en tu viaje?'),
  ('evening', 'ja', '夜はどのように過ごしたいですか？'))
INSERT INTO question_translations (question_id, locale, prompt, description)
SELECT q.id, t.locale, t.prompt, NULL FROM t JOIN questions q ON q.slug = t.slug;

WITH o(question, value, display_order) AS (VALUES
  ('pace', 'relaxed', 1),
  ('pace', 'active', 2),
  ('main-interest', 'food', 1),
  ('main-interest', 'scenery', 2),
  ('main-interest', 'history', 3),
  ('evening', 'quiet', 1),
  ('evening', 'lively', 2))
INSERT INTO question_options (question_id, value, display_order, status)
SELECT q.id, o.value, o.display_order, 'active' FROM o JOIN questions q ON q.slug = o.question;

WITH t(question, value, locale, label) AS (VALUES
  ('pace', 'relaxed', 'ja', 'ゆったり過ごしたい'),
  ('pace', 'relaxed', 'en', 'Slow and relaxed'),
  ('pace', 'relaxed', 'es', 'Tranquilo y sin prisas'),
  ('pace', 'active', 'ja', 'たくさん動き回りたい'),
  ('pace', 'active', 'en', 'Active and on the move'),
  ('pace', 'active', 'es', 'Activo y en movimiento'),
  ('main-interest', 'food', 'ja', '食べ歩き'),
  ('main-interest', 'food', 'en', 'Food'),
  ('main-interest', 'food', 'es', 'La comida'),
  ('main-interest', 'scenery', 'ja', '自然の絶景'),
  ('main-interest', 'scenery', 'en', 'Natural scenery'),
  ('main-interest', 'scenery', 'es', 'Paisajes naturales'),
  ('main-interest', 'history', 'ja', '歴史や文化'),
  ('main-interest', 'history', 'en', 'History and culture'),
  ('main-interest', 'history', 'es', 'Historia y cultura'),
  ('evening', 'quiet', 'ja', '静かに過ごしたい'),
  ('evening', 'lively', 'ja', 'にぎやかな場所に出かけたい'))
INSERT INTO question_option_translations (option_id, locale, label)
SELECT o.id, t.locale, t.label FROM t
JOIN questions q ON q.slug = t.question
JOIN question_options o ON o.question_id = q.id AND o.value = t.value;

WITH e(question, value, attribute, weight) AS (VALUES
  ('pace', 'relaxed', 'beach', 2),
  ('pace', 'relaxed', 'city-life', -1),
  ('pace', 'active', 'nature', 2),
  ('pace', 'active', 'city-life', 1),
  ('main-interest', 'food', 'food', 3),
  ('main-interest', 'scenery', 'nature', 3),
  ('main-interest', 'history', 'history-culture', 3))
INSERT INTO option_score_effects (option_id, attribute_id, weight)
SELECT o.id, a.id, e.weight FROM e
JOIN questions q ON q.slug = e.question
JOIN question_options o ON o.question_id = q.id AND o.value = e.value
JOIN attributes a ON a.slug = e.attribute;
