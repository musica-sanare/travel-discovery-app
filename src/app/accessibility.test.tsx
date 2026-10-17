// @vitest-environment jsdom
/**
 * Automated accessibility checks with axe-core on every public page state.
 * jsdom cannot compute colors, so contrast is checked in a real browser
 * (docs/DEVELOPMENT.md "Accessibility checks").
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLocale, SUPPORTED_LOCALES, type Locale } from "../../shared/locales";
import { sharedContentCache } from "../diagnosis/contentClient";
import { testContent } from "../diagnosis/testContent";
import { createI18n } from "../i18n/createI18n";
import { routes } from "./routes";

let failRequests = false;

beforeEach(() => {
  failRequests = false;
  sharedContentCache.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const locale = new URL(input, "https://app.example.test").searchParams.get("locale");
      if (failRequests || !isLocale(locale)) {
        return Promise.resolve(new Response("{}", { status: 503 }));
      }
      const content = testContent(locale);
      const [first, ...rest] = content.destinations;
      if (!first) throw new Error("fixture");
      // Exercise every detail section: image, highlights, cautions, several costs.
      const detailed = {
        ...first,
        highlights: ["One", "Two"],
        cautions: "Caution text",
        bestSeason: "Spring",
        image: { url: "https://images.example.test/a.jpg", alt: "Alt text", attribution: "Photographer" },
        costs: [
          {
            currency: "JPY" as const,
            period: "per_day" as const,
            scope: "per_person_excluding_international_flights" as const,
            min: 10000,
            max: 20000,
            basis: "Basis",
            basisLocale: locale,
            sourceName: "Source",
            sourceUrl: "https://source.example.test/",
            updatedAt: "2026-10-01",
          },
          {
            currency: "EUR" as const,
            period: "per_trip" as const,
            scope: "per_person_including_international_flights" as const,
            min: 900,
            max: 1500,
            basis: null,
            basisLocale: null,
            sourceName: "Other",
            sourceUrl: null,
            updatedAt: "2026-09-01",
          },
        ],
      };
      return Promise.resolve(new Response(JSON.stringify({ ...content, destinations: [detailed, ...rest] })));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderAt(path: string, locale: Locale = "ja") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <I18nextProvider i18n={createI18n(locale)}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
  return { router, container: view.container };
}

async function violations(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, {
    rules: {
      // jsdom has no layout or computed colors.
      "color-contrast": { enabled: false },
      // Rendered in a container, not a full document.
      region: { enabled: false },
    },
  });
  return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

async function toQuiz(locale: Locale) {
  const view = renderAt("/plan", locale);
  fireEvent.click(await screen.findByRole("button", { name: createI18n(locale).t("plan.submit") }));
  await screen.findByRole("heading", { name: createI18n(locale).t("quiz.progress", { current: 1, total: 2 }) });
  return view;
}

function answerFirst(locale: Locale) {
  const input = screen.getByRole("group").querySelector("input");
  if (!input) throw new Error("no option");
  fireEvent.click(input);
  fireEvent.click(screen.getByRole("button", { name: createI18n(locale).t("quiz.next") }));
}

describe("accessibility (axe-core)", () => {
  it("detects violations (harness check)", async () => {
    const { container } = render(
      <form>
        <input type="checkbox" />
        <img src="https://images.example.test/x.jpg" />
      </form>,
    );
    expect((await violations(container)).map((item) => item.split(":")[0])).toEqual(
      expect.arrayContaining(["image-alt", "label"]),
    );
  });

  it.each(SUPPORTED_LOCALES)("home and constraints pages have no violations (%s)", async (locale) => {
    const home = renderAt("/", locale);
    expect(await violations(home.container)).toEqual([]);
    cleanup();
    const plan = renderAt("/plan", locale);
    await screen.findByRole("button", { name: createI18n(locale).t("plan.submit") });
    expect(await violations(plan.container)).toEqual([]);
  });

  it("shows validation errors accessibly", async () => {
    const { container } = renderAt("/plan");
    fireEvent.change(await screen.findByLabelText(/旅行日数/), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "質問に進む" }));
    const days = await screen.findByLabelText(/旅行日数/);
    expect(days.getAttribute("aria-invalid")).toBe("true");
    expect(days.getAttribute("aria-describedby")).toBeTruthy();
    expect(await violations(container)).toEqual([]);
  });

  it("gives every option an accessible name from its label", async () => {
    await toQuiz("ja");
    const inputs = [...screen.getByRole("group").querySelectorAll("input")];
    expect(inputs.length).toBeGreaterThan(1);
    for (const input of inputs) {
      const name = input.labels?.[0]?.textContent.trim() ?? "";
      expect(name).not.toBe("");
      expect(screen.getByLabelText(name)).toBe(input);
    }
  });

  it.each(SUPPORTED_LOCALES)("quiz and results pages have no violations (%s)", async (locale) => {
    const { container } = await toQuiz(locale);
    expect(await violations(container)).toEqual([]);
    answerFirst(locale);
    await screen.findByRole("heading", { name: createI18n(locale).t("quiz.progress", { current: 2, total: 2 }) });
    answerFirst(locale);
    await screen.findByRole("heading", { name: createI18n(locale).t("results.heading") });
    for (const details of container.querySelectorAll("details")) {
      details.open = true;
    }
    expect(await violations(container)).toEqual([]);
  });

  it("the error state has no violations", async () => {
    failRequests = true;
    const { container } = renderAt("/plan");
    fireEvent.click(await screen.findByRole("button", { name: "質問に進む" }));
    await screen.findByRole("alert");
    expect(await violations(container)).toEqual([]);
  });
});
