[Docs index](../en/README.md)

# Pre-Public-Release Checklist

The repository is private. Making it public is a separate owner decision; this checklist must be complete before that. It is independent of deploying the app ([DEPLOYMENT.md](../en/DEPLOYMENT.md)).

A scan of the current source tree does not show what earlier commits contained: a secret that was committed and later removed is still readable in the history. Every check below therefore covers **all reachable history and every branch and tag that will be published**, not only the working tree.

## 1. History and secret scan
- [x] Run a dedicated secret scanner over the full history (for example gitleaks or TruffleHog). Installing one is a new tool download and needs the owner's approval; it is not a project dependency. Done on 2026-11-01 with gitleaks 8.30.1 over all 123 commits ("Phase 18 verification log" in [DECISIONS.md](DECISIONS.md)). Run it again on the commit to publish:

  ```bash
  gitleaks git --log-opts="--all" --redact --report-format json --report-path <file outside the repository> .
  ```

- [x] Review every finding. The regular-expression scan of 2026-10-18 found only the fake account ID in `test/node/ai-eval-runner.test.ts` ("Phase 6 verification log" in [DECISIONS.md](DECISIONS.md)). The gitleaks scan of 2026-11-01 found four matches, none a secret: three Access AUD tags in `wrangler.admin.jsonc` (identifiers, kept by owner decision) and the placeholder `<token>` in the former `docs/AI_EVALUATION.md`.
- [x] Check that no file was ever committed under `.env*` (except `.env.example`), `.dev.vars*` (except `.dev.vars.example`), `.wrangler/`, `dist/`, `dist-admin/`, `.ai-eval/`, or `.claude/settings.local.json`. Checked on 2026-11-01 over all branches: none.
- [x] Not applicable so far: no real secret was found on 2026-11-01. If a real secret is found: revoke or rotate it first. Rewriting history needs the owner's explicit instruction and does not help for copies that were already pushed or cloned.
- [ ] Decide which branches and tags are published; delete or keep private everything else.

## 2. Commit identities
- [x] Every commit uses the author and committer identity `musica-sanare` with its GitHub `noreply` address. The earlier local identity, which revealed a local user and host name, was replaced by an owner-instructed history rewrite on 2026-10-25, and `dev` and `main` were force-pushed; anyone with an older clone must re-clone. Future commits use the same identity.
- [x] Commit messages contain no AI co-author trailers; the same rewrite removed them.

## 3. License
- [x] The owner chooses a license. Chosen on 2026-11-01: MIT for the code, docs, and content bundles (`LICENSE`, README "License").
- [x] Check compatibility with the dependencies' licenses (`npm ls` plus each package's license field, or a license-report tool after approval). Checked on 2026-11-01 from `package-lock.json`: production dependencies are MIT, Apache-2.0, or both; LGPL-3.0 (`sharp` libvips) and MPL-2.0 (`lightningcss`, `axe-core`) come only with development tools and are not in the deployed bundles. No conflict with MIT.

## 4. Third-party material
- [ ] Destination texts, cost estimates, and their cited sources: authored by the owner, with the right to publish them; sources are cited, not copied.
- [ ] Images: published content may reference external image URLs ([ARCHITECTURE.md](../en/ARCHITECTURE.md) "8. Observability and privacy"); check each provider's license and attribution requirements. `db/seed/dev.sql` contains no external URLs (checked 2026-10-18).
- [ ] Fonts and icons: no font or image files and no third-party icon sets; system font stacks only (checked 2026-10-18). The public UI's icons, map lines, sunset illustration, and barcode are inline SVGs drawn for this project (`src/components/Decorations.tsx`, `src/components/DestinationBand.tsx`; checked 2026-10-25). Re-check if any are added.
- [ ] AI: the Gemma terms of use and prohibited-use policy have been reviewed (ADR-026 "Model decision"). The evaluation cases in `test/ai-eval/cases.json` are authored test inputs (some name real cities) without personal data; raw model outputs stay in the git-ignored `.ai-eval/`.

## 5. Private notes and internal material
- [ ] Decide whether `prompts/`, `CLAUDE.md`, and the verification logs in [DECISIONS.md](DECISIONS.md) stay public. They contain no secrets, but describe internal decisions, account plans, and open security items.
- [ ] Remove personal notes, local paths, and account identifiers (account ID, team name, AUD tags, D1 IDs) that should not be public. D1 IDs and AUD tags are not secrets, but publishing them is unnecessary.
- [ ] Check [DEPLOYMENT.md](../en/DEPLOYMENT.md) and [DECISIONS.md](DECISIONS.md) for the owner's email address or Access policy details.

## 6. Repository presentation
- [ ] README screenshots of the public site (light and dark, one per language as needed), taken from a preview deployment or a local build with seed data only.
- [ ] Issue and pull request templates, `SECURITY.md` (how to report vulnerabilities privately), and `CONTRIBUTING.md` if outside contributions are wanted.
- [ ] GitHub settings: secret scanning and push protection, Dependabot alerts, branch protection for `main` (required CI check), Actions permissions limited to the pinned actions.

## 7. Final checks
- [ ] `npm ci`, `npm run check`, and `npm run test:e2e` pass on the commit to publish; CI is green.
- [ ] `npm audit --omit=dev` reports no vulnerabilities; the known development-only advisory (ADR-003) is re-evaluated.
- [ ] The deployed site, if any, contains no test data from `db/seed/dev.sql`.
