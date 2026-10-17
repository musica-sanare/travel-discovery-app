/**
 * Admin API (all routes under /api/admin). Every route runs behind the
 * Access JWT check; there are no unauthenticated admin endpoints.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  authenticateAdmin,
  isSameOriginRequest,
  type AccessConfig,
  type AdminIdentity,
  type AuthOptions,
} from "../server/admin/access-auth";
import * as mutations from "../server/admin/mutations";
import * as queries from "../server/admin/queries";
import { settingsInput } from "../server/admin/settings";
import {
  attributeInput,
  categoryInput,
  countryInput,
  destinationInput,
  questionInput,
} from "../server/admin/validation";
import { CONTENT_STATUSES } from "../server/db/schema";
import { createDatabase } from "../server/db/client";
import { ApiError, errorResponse, jsonResponse, toErrorResponse } from "../server/http/errors";
import { parseIdParam, readJsonBody, toValidationIssues } from "../server/http/request";

export interface AdminEnv extends AccessConfig {
  ADMIN_DB: D1Database;
}

type AdminContext = Context<{ Bindings: AdminEnv; Variables: { identity: AdminIdentity } }>;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

function parseListQuery(c: AdminContext) {
  const result = listQuery.safeParse(c.req.query());
  if (!result.success) {
    throw new ApiError("invalid_request", toValidationIssues(result.error));
  }
  const { q, status, categoryId, page } = result.data;
  return { q: q === "" ? undefined : q, status, categoryId, page };
}

function db(c: AdminContext) {
  return createDatabase(c.env.ADMIN_DB);
}

export function createAdminApp(authOptions: AuthOptions) {
  const app = new Hono<{ Bindings: AdminEnv; Variables: { identity: AdminIdentity } }>();

  app.use("/api/admin/*", async (c, next) => {
    if (MUTATING_METHODS.has(c.req.method) && !isSameOriginRequest(c.req.raw)) {
      return errorResponse("forbidden");
    }
    const identity = await authenticateAdmin(c.req.raw, c.env, authOptions);
    if (!identity) {
      return errorResponse("forbidden");
    }
    c.set("identity", identity);
    await next();
  });

  app.get("/api/admin/me", (c) => jsonResponse({ email: c.get("identity").email }));

  // Countries
  app.get("/api/admin/countries", async (c) => jsonResponse({ items: await queries.listCountries(db(c)) }));
  app.post("/api/admin/countries", async (c) => {
    const input = await readJsonBody(c.req.raw, countryInput);
    return jsonResponse({ id: await mutations.createCountry(db(c), input) }, 201);
  });
  app.put("/api/admin/countries/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const input = await readJsonBody(c.req.raw, countryInput);
    await mutations.updateCountry(db(c), id, input);
    return jsonResponse({ id });
  });

  // Attributes
  app.get("/api/admin/attributes", async (c) =>
    jsonResponse({ items: await queries.listAttributes(db(c)) }),
  );
  app.post("/api/admin/attributes", async (c) => {
    const input = await readJsonBody(c.req.raw, attributeInput);
    return jsonResponse({ id: await mutations.createAttribute(db(c), input) }, 201);
  });
  app.put("/api/admin/attributes/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const input = await readJsonBody(c.req.raw, attributeInput);
    await mutations.updateAttribute(db(c), id, input);
    return jsonResponse({ id });
  });

  // Question categories
  app.get("/api/admin/categories", async (c) =>
    jsonResponse({ items: await queries.listCategories(db(c)) }),
  );
  app.post("/api/admin/categories", async (c) => {
    const input = await readJsonBody(c.req.raw, categoryInput);
    return jsonResponse({ id: await mutations.createCategory(db(c), input) }, 201);
  });
  app.put("/api/admin/categories/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const input = await readJsonBody(c.req.raw, categoryInput);
    await mutations.updateCategory(db(c), id, input);
    return jsonResponse({ id });
  });

  // Destinations
  app.get("/api/admin/destinations", async (c) =>
    jsonResponse(await queries.listDestinations(db(c), parseListQuery(c))),
  );
  app.get("/api/admin/destinations/:id", async (c) => {
    const item = await queries.getDestination(db(c), parseIdParam(c.req.param("id")));
    return item ? jsonResponse({ item }) : errorResponse("not_found");
  });
  app.post("/api/admin/destinations", async (c) => {
    const input = await readJsonBody(c.req.raw, destinationInput);
    return jsonResponse({ id: await mutations.createDestination(db(c), input) }, 201);
  });
  app.put("/api/admin/destinations/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const input = await readJsonBody(c.req.raw, destinationInput);
    await mutations.updateDestination(db(c), id, input);
    return jsonResponse({ id });
  });

  // Questions (with options and score effects)
  app.get("/api/admin/questions", async (c) =>
    jsonResponse(await queries.listQuestions(db(c), parseListQuery(c))),
  );
  app.get("/api/admin/questions/:id", async (c) => {
    const item = await queries.getQuestion(db(c), parseIdParam(c.req.param("id")));
    return item ? jsonResponse({ item }) : errorResponse("not_found");
  });
  app.post("/api/admin/questions", async (c) => {
    const input = await readJsonBody(c.req.raw, questionInput);
    return jsonResponse({ id: await mutations.createQuestion(db(c), input) }, 201);
  });
  app.put("/api/admin/questions/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const input = await readJsonBody(c.req.raw, questionInput);
    await mutations.updateQuestion(db(c), id, input);
    return jsonResponse({ id });
  });

  // Settings
  app.get("/api/admin/settings", async (c) => jsonResponse(await queries.getSettings(db(c))));
  app.put("/api/admin/settings", async (c) => {
    const input = await readJsonBody(c.req.raw, settingsInput);
    await mutations.saveSettings(db(c), input);
    return jsonResponse(await queries.getSettings(db(c)));
  });

  app.notFound(() => errorResponse("not_found"));
  app.onError((error) => toErrorResponse(error, "admin_api"));

  return app;
}
