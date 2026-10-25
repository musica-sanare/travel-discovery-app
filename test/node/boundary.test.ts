/**
 * Enforces the public/admin boundary (docs/working/DECISIONS.md, ADR-018) by walking
 * the relative import graph. The public Worker's read-only status is a
 * code-level constraint, not a database permission, so this test and the ESLint
 * import restrictions are what keep write paths out of it.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

// Static `import … from`, `export … from`, side-effect `import "x"`, and dynamic `import("x")`.
const IMPORT_PATTERN =
  /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

function resolveModule(fromFile: string, specifier: string): string | undefined {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && candidate.match(/\.tsx?$/)) {
      return candidate;
    }
  }
  return undefined;
}

/** All local source files reachable from `entry` (package imports are listed separately). */
function reachable(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [path.join(root, entry)];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || files.has(file)) continue;
    files.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (!specifier) continue;
      if (specifier.startsWith(".")) {
        const resolved = resolveModule(file, specifier);
        if (resolved) queue.push(resolved);
      } else {
        packages.add(specifier);
      }
    }
  }
  return { files: [...files].map((file) => path.relative(root, file)).sort(), packages: [...packages].sort() };
}

const WRITE_PATTERNS = [
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
  /\.batch\s*\(/,
  /\.exec\s*\(/,
  /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE)\s/,
];

describe("public Worker boundary", () => {
  const graph = reachable("worker/index.ts");

  it("does not reach admin modules", () => {
    expect(graph.files).toContain("server/public/content.ts");
    for (const file of graph.files) {
      expect(file).not.toMatch(/^(server\/admin|admin-worker|admin)\//);
    }
  });

  it("does not use write queries in reachable code", () => {
    for (const file of graph.files) {
      if (file === "server/db/schema.ts") continue; // table definitions only
      const source = readFileSync(path.join(root, file), "utf8");
      for (const pattern of WRITE_PATTERNS) {
        expect(source, `${file} matches ${String(pattern)}`).not.toMatch(pattern);
      }
    }
  });

  it("uses only expected packages", () => {
    expect(graph.packages).toEqual(["drizzle-orm", "drizzle-orm/d1", "drizzle-orm/sqlite-core", "hono", "zod", "zod/mini"]);
  });
});

describe("public SPA boundary", () => {
  it("does not reach server or Worker code", () => {
    for (const file of reachable("src/main.tsx").files) {
      expect(file).not.toMatch(/^(server|worker|admin-worker|admin)\//);
    }
  });
});

describe("diagnostic domain boundary", () => {
  const graph = reachable("domain/diagnosis/index.ts");

  it("reaches only domain and shared modules", () => {
    expect(graph.files).toContain("domain/diagnosis/ranking.ts");
    for (const file of graph.files) {
      expect(file).toMatch(/^(domain|shared)\//);
    }
  });

  it("uses no packages (no UI, database, platform, or AI SDKs)", () => {
    expect(graph.packages).toEqual([]);
  });

  it("uses no network, clock, or uncontrolled randomness", () => {
    const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /Math\.random/, /Date\.now/, /new Date\(/];
    for (const file of graph.files) {
      const source = readFileSync(path.join(root, file), "utf8");
      for (const pattern of forbidden) {
        expect(source, `${file} matches ${String(pattern)}`).not.toMatch(pattern);
      }
    }
  });
});
