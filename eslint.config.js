import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

// Module boundaries (docs/DECISIONS.md, ADR-004 and ADR-018). The public Worker
// and public SPA must never import admin code or write helpers; the public
// read-only status is enforced by these rules and tests, not by the database.
const ADMIN_ONLY_IMPORTS = [
  { group: ["**/server/admin/**", "**/admin-worker/**"], message: "Admin-only module." },
];
const SERVER_ONLY_IMPORTS = [
  { group: ["**/server/**", "**/worker/**", "**/admin-worker/**"], message: "Server-only module." },
];

export default tseslint.config(
  { ignores: ["dist", "dist-admin", ".wrangler", "coverage", "node_modules"] },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "admin/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: { "no-restricted-imports": ["error", { patterns: SERVER_ONLY_IMPORTS }] },
  },
  {
    files: ["worker/**/*.ts", "server/public/**/*.ts", "server/http/**/*.ts", "server/db/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: ADMIN_ONLY_IMPORTS }] },
  },
  {
    files: ["*.config.{js,ts}", "scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
