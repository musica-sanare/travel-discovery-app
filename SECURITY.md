# Security policy

Report security problems privately through GitHub, not in public issues. The maintainer reviews reports on a best-effort basis; this is a personal project without a guaranteed response time.

## Report a vulnerability

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability** and describe the problem, the affected URL or file, and the steps to reproduce it.

Do not include personal data or real credentials in the report.

## Scope

- The public site and its API (`/api/*`).
- The admin console and admin API, which must never be reachable without Cloudflare Access.
- The code in this repository, including the deployment configuration.

Out of scope: denial-of-service tests, automated scanning that creates heavy traffic, and social engineering.

## Supported versions

Only the version deployed from `main` is supported.
