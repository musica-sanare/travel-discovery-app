# Prompt 19 — Results clarity and page basics

The public site now runs at `https://travel-discovery.apps.musica-sanare.com` (ADR-034). A walk through production on 2026-11-03 found two kinds of problems. On the results page, the top results look alike: their fits differ by a few points, and "Why it fits" often lists the same three attributes, because it shows the strongest wanted attributes and the user wants only a few. The same external-search note repeats on every card. The page also lacks basics that a real hostname makes visible: no description or link-preview metadata, no canonical URL, no favicon, and `/robots.txt` returns the app's HTML. This phase fixes both, following the plan the owner approved on 2026-11-03.

Ranking and fit values do not change. No schema change, no content change, and no new dependency. AI stays disabled. Do not push, commit, or deploy without the owner's explicit approval; a push to `main` deploys production.

## Read first
`CLAUDE.md`, [SPEC.md](../docs/en/SPEC.md) (results, localization), [DIAGNOSTIC_ALGORITHM.md](../docs/en/DIAGNOSTIC_ALGORITHM.md) sections 3–4 and "Fallback explanation data", [ARCHITECTURE.md](../docs/en/ARCHITECTURE.md) "8. Observability and privacy", `docs/working/DECISIONS.md` (ADR-022, ADR-031, ADR-034), `domain/diagnosis/ranking.ts`, `domain/diagnosis/scoring.ts`, `src/pages/ResultsPage.tsx`, `src/components/DocumentMetadata.tsx`, `src/app/RootLayout.tsx`, `src/i18n/messages/`, `index.html`, and `public/_headers`.

## Tasks
1. **Distinctive strengths (domain).** For each shown result, find the wanted attributes (`P[a] > 0`) where its contribution `P[a] · x_d[a]` exceeds the mean contribution of the shown results by a documented margin. Return at most two, strongest first, ties by slug, as a new field on each result, so the UI and tests use one definition. Return none when the results are alike or only one is shown. It is explanation data only: `fit`, coverage, and order stay as they are. Add unit tests for the margin, the limit, ties, one result, identical results, and negative preferences (a disliked attribute is never a strength).
2. **Results page.** Show the strengths on each card, for example "Compared with the others here: stronger for Nature", in all four locales, next to "Why it fits". Show nothing when there are none. Keep the fit number and bar as they are. Show the external-search note once for the list, not on every card; keep the search buttons on each card with their new-tab hint.
3. **Static metadata.** In `index.html`, add `<meta name="description">`, Open Graph tags (`og:title`, `og:description`, `og:type` `website`, `og:url`, `og:site_name`, `og:locale`), and `<link rel="canonical" href="https://travel-discovery.apps.musica-sanare.com/">`, in Japanese (the default locale). Extend `DocumentMetadata` so that the description follows the active locale like the title. No `og:image` in this phase.
4. **Favicon and robots.** Draw a small SVG favicon for this project (the plane motif of the header, readable at 16 px on light and dark tabs) in `public/favicon.svg` and link it. Add `public/robots.txt` that allows all crawlers. Check that both are served with the right content type and the security headers of `public/_headers`, and that the CSP needs no change.
5. **Hub link.** Add a small footer link to `https://musica-sanare.com/`, localized, as an ordinary link in the same tab. It sends no data.
6. **Tests and checks.** Component tests for the strengths and the single search note; a test that `index.html` carries the description, canonical, and Open Graph tags; E2E checks that `/favicon.svg` and `/robots.txt` are not the SPA's HTML. Run `npm run check` and `npm run test:e2e`. In the built-in browser, check home and results in all four locales at 375 px and desktop width: no missing keys, no overflow, strengths shown or absent as expected.
7. **Documentation.** Record the strengths rule in DIAGNOSTIC_ALGORITHM.md "Fallback explanation data", and the SPEC results item if needed, each with its Japanese twin in the same commit. Record ADR-035 (distinctive strengths, the margin, and why the fit display stays) and a "Phase 19 verification log" in `docs/working/DECISIONS.md`. Update IMPLEMENTATION_PLAN.md and the README status with its Japanese twin.

Deferred, not part of this phase: an `og:image`; a banded fit display; more cost estimates or destinations (a content phase); destination images; shareable result URLs; and production AI.

## Acceptance
- Each result carries at most two distinctive strengths from one documented, tested rule, and ranking and fit values are unchanged (the existing ranking tests pass unchanged).
- The results page shows the strengths in all four locales, and the external-search note appears once.
- `index.html` has the description, canonical, and Open Graph tags; the description follows the active locale; `/favicon.svg` and `/robots.txt` are served as real files.
- The footer links to `https://musica-sanare.com/`.
- `npm run check` and `npm run test:e2e` pass, AI is disabled, and the account stays on Workers Free.
