import { describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../api";
import { parseBundle, planImport, type ImportBundle } from "./bundle";
import type { DestinationDetail } from "../types";
import {
  ImportConflictError,
  loadCurrentDestinations,
  loadExisting,
  runImport,
  type AdminCall,
  type StepState,
} from "./runImport";

const BUNDLE_TEXT = JSON.stringify({
  format: "travel-discovery-content",
  version: 1,
  countries: [{ slug: "peru", translations: { ja: { name: "ペルー" } } }],
  attributes: [{ slug: "nature", status: "active", translations: { ja: { name: "自然" } } }],
  destinations: [
    {
      slug: "cusco",
      country: "peru",
      type: "city",
      status: "published",
      recommendedDays: { min: null, max: null },
      image: null,
      translations: {},
      attributeScores: [{ attribute: "nature", score: 4 }],
    },
    { slug: "lima", country: "peru", attributeScores: [] },
  ],
});

function bundle(): ImportBundle {
  const result = parseBundle(BUNDLE_TEXT);
  if (!result.bundle) throw new Error("invalid test bundle");
  return result.bundle;
}

/**
 * A fake admin API: GET returns `lists[path]` (a function is called on each
 * request), creates return increasing IDs.
 */
function fakeApi(lists: Record<string, unknown>, failOn?: string) {
  let nextId = 100;
  const calls: { path: string; method: string; body: unknown }[] = [];
  const api: AdminCall = <T,>(path: string, init: { method?: string; body?: unknown } = {}) => {
    const method = init.method ?? "GET";
    calls.push({ path, method, body: init.body });
    if (method === "GET") {
      const value = lists[path];
      return Promise.resolve((typeof value === "function" ? (value as () => unknown)() : value) as T);
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

describe("update mode", () => {
  const STORED: DestinationDetail = {
    id: 2,
    slug: "cusco",
    countryId: 1,
    type: "city",
    status: "published",
    recommendedDays: { min: null, max: null },
    bestMonths: [],
    costs: [],
    image: null,
    translations: {},
    attributeScores: [{ attributeId: 4, score: 1 }],
    updatedAt: "2026-10-24T03:40:00.000Z",
  };

  const LISTS = {
    ...EMPTY_LISTS,
    "/countries": { items: [{ id: 1, slug: "peru", translations: {} }] },
    "/attributes": { items: [{ id: 4, slug: "nature", translations: {} }] },
    "/destinations?page=1": { items: [{ id: 2, slug: "cusco" }], hasMore: false },
  };

  async function plannedRun(stored: () => DestinationDetail) {
    const { api, calls } = fakeApi({ ...LISTS, "/destinations/2": () => ({ item: stored() }) });
    const existing = await loadExisting(api);
    const current = await loadCurrentDestinations(api, bundle(), existing);
    const { steps } = planImport(bundle(), existing, current);
    const outcome = await runImport(api, bundle(), steps, existing, () => undefined);
    return { calls, current, steps, outcome };
  }

  it("loads only the bundle destinations that already exist", async () => {
    const { current, calls } = await plannedRun(() => STORED);
    expect([...current.keys()]).toEqual(["cusco"]);
    expect(calls.filter((call) => call.path.startsWith("/destinations/"))).toHaveLength(3);
  });

  it("re-reads the destination and replaces it with PUT when it has not changed since the check", async () => {
    const { calls, steps, outcome } = await plannedRun(() => STORED);
    expect(steps.map((step) => step.action)).toEqual(["skip", "skip", "update", "create"]);
    expect(outcome).toEqual({ states: ["skipped", "skipped", "updated", "created"], error: null });
    const put = calls.find((call) => call.method === "PUT");
    expect(put?.path).toBe("/destinations/2");
    expect(put?.body).toMatchObject({ slug: "cusco", countryId: 1, attributeScores: [{ attributeId: 4, score: 4 }] });
  });

  it("stops without writing when the destination changed after the check", async () => {
    let reads = 0;
    const { calls, outcome } = await plannedRun(() => {
      reads += 1;
      return reads === 1 ? STORED : { ...STORED, updatedAt: "2026-10-24T04:00:00.000Z" };
    });
    expect(outcome.states).toEqual(["skipped", "skipped", "failed", "pending"]);
    expect(outcome.error).toBeInstanceOf(ImportConflictError);
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("sends nothing for a destination that matches the file", async () => {
    const { calls, outcome } = await plannedRun(() => ({ ...STORED, attributeScores: [{ attributeId: 4, score: 4 }] }));
    expect(outcome.states).toEqual(["skipped", "skipped", "unchanged", "created"]);
    expect(calls.filter((call) => call.method === "PUT")).toEqual([]);
  });
});
