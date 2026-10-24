import { describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../api";
import { parseBundle, planImport, type ImportBundle } from "./bundle";
import { loadExisting, runImport, type AdminCall, type StepState } from "./runImport";

const BUNDLE_TEXT = JSON.stringify({
  format: "travel-discovery-content",
  version: 1,
  countries: [{ slug: "peru", translations: { ja: { name: "ペルー" } } }],
  attributes: [{ slug: "nature", status: "active", translations: { ja: { name: "自然" } } }],
  destinations: [
    { slug: "cusco", country: "peru", attributeScores: [{ attribute: "nature", score: 4 }] },
    { slug: "lima", country: "peru", attributeScores: [] },
  ],
});

function bundle(): ImportBundle {
  const result = parseBundle(BUNDLE_TEXT);
  if (!result.bundle) throw new Error("invalid test bundle");
  return result.bundle;
}

/** A fake admin API: list endpoints return `lists`, creates return increasing IDs. */
function fakeApi(lists: Record<string, unknown>, failOn?: string) {
  let nextId = 100;
  const calls: { path: string; method: string; body: unknown }[] = [];
  const api: AdminCall = <T,>(path: string, init: { method?: string; body?: unknown } = {}) => {
    const method = init.method ?? "GET";
    calls.push({ path, method, body: init.body });
    if (method === "GET") {
      return Promise.resolve(lists[path] as T);
    }
    const slug = (init.body as { slug: string }).slug;
    if (slug === failOn) {
      return Promise.reject(new AdminApiError("invalid_request", [{ path: "translations", code: "base_locale_required" }]));
    }
    nextId += 1;
    return Promise.resolve({ id: nextId } as T);
  };
  return { api, calls };
}

const EMPTY_LISTS = {
  "/countries": { items: [] },
  "/attributes": { items: [] },
  "/categories": { items: [] },
  "/destinations?page=1": { items: [], hasMore: false },
  "/questions?page=1": { items: [], hasMore: false },
};

describe("loadExisting", () => {
  it("reads every taxonomy list and every page of destinations and questions", async () => {
    const { api, calls } = fakeApi({
      ...EMPTY_LISTS,
      "/countries": { items: [{ id: 1, slug: "peru", translations: {} }] },
      "/destinations?page=1": { items: [{ id: 2, slug: "cusco" }], hasMore: true },
      "/destinations?page=2": { items: [{ id: 3, slug: "lima" }], hasMore: false },
    });
    const existing = await loadExisting(api);
    expect(existing.countries.get("peru")).toBe(1);
    expect([...existing.destinations]).toEqual([
      ["cusco", 2],
      ["lima", 3],
    ]);
    expect(calls.map((call) => call.path)).toContain("/destinations?page=2");
  });
});

describe("runImport", () => {
  it("creates items in order and passes the new IDs to later references", async () => {
    const { api, calls } = fakeApi(EMPTY_LISTS);
    const existing = await loadExisting(api);
    const { steps } = planImport(bundle(), existing);
    const progress = vi.fn<(states: StepState[]) => void>();

    const outcome = await runImport(api, bundle(), steps, existing, progress);

    expect(outcome).toEqual({ states: ["created", "created", "created", "created"], error: null });
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts.map((call) => call.path)).toEqual(["/countries", "/attributes", "/destinations", "/destinations"]);
    expect(posts[2]?.body).toMatchObject({ slug: "cusco", countryId: 101, attributeScores: [{ attributeId: 102 }] });
    expect(progress).toHaveBeenCalledTimes(4);
  });

  it("stops at the first failure and leaves later steps pending", async () => {
    const { api, calls } = fakeApi(EMPTY_LISTS, "cusco");
    const existing = await loadExisting(api);
    const { steps } = planImport(bundle(), existing);

    const outcome = await runImport(api, bundle(), steps, existing, () => undefined);

    expect(outcome.states).toEqual(["created", "created", "failed", "pending"]);
    expect(outcome.error).toBeInstanceOf(AdminApiError);
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(3);
  });

  it("never posts items that already exist, and uses their IDs", async () => {
    const { api, calls } = fakeApi({ ...EMPTY_LISTS, "/countries": { items: [{ id: 9, slug: "peru", translations: {} }] } });
    const existing = await loadExisting(api);
    const { steps } = planImport(bundle(), existing);

    const outcome = await runImport(api, bundle(), steps, existing, () => undefined);

    expect(outcome.states[0]).toBe("skipped");
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts.map((call) => call.path)).not.toContain("/countries");
    expect(posts[1]?.body).toMatchObject({ countryId: 9 });
  });
});
