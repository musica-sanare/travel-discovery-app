# Prompt 06 — Documentation, CI, and release preparation

Do not deploy until the user explicitly approves.

## Tasks
1. Complete README with product overview, architecture, local setup, environment variables, database setup/migrations/seeding, testing, AI behavior, admin setup, and deployment instructions.
2. Add/complete GitHub Actions for install from lockfile, lint, type-check, unit tests, E2E where CI environment permits, and production build.
3. Document how to set Cloudflare secrets and Access rules without placing secrets in files.
4. Document preview vs production configuration and migration procedure.
5. Document free-tier assumptions and links to official pricing/limits pages, with date checked.
6. Run dependency/security checks supported by the chosen toolchain.
7. Scan tracked files for secrets and sensitive data. Explain that a source-tree scan does not guarantee history is clean.
8. Provide a pre-public-release checklist for eventually making the repository public: history scan, secret scan, license review, third-party asset/license review, README screenshots, issue/template review, and removal of private notes.
9. Do not add a license automatically unless the owner has chosen one.
10. Do not create external resources or deploy without approval.

## Acceptance
A new developer can follow the documented local setup. CI is reproducible. Deployment steps and admin protection are clear. Known risks, free-tier caveats, and remaining manual actions are listed.
