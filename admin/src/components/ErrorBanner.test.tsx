// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";
import { AdminApiError } from "../api";
import { createAdminI18n } from "../i18n/createAdminI18n";
import { ErrorBanner } from "./ErrorBanner";

describe("ErrorBanner", () => {
  afterEach(cleanup);

  it("renders a localized message and field issues", () => {
    render(
      <I18nextProvider i18n={createAdminI18n("en")}>
        <ErrorBanner
          error={
            new AdminApiError("invalid_request", [
              { path: "translations", code: "base_locale_required" },
              { path: "slug", code: "something_new" },
            ])
          }
        />
      </I18nextProvider>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Some fields are invalid");
    expect(alert.textContent).toContain("A Japanese or English translation is required to publish.");
    expect(alert.textContent).toContain("Please check this field.");
  });

  it("renders nothing without an error", () => {
    const { container } = render(
      <I18nextProvider i18n={createAdminI18n()}>
        <ErrorBanner error={null} />
      </I18nextProvider>,
    );
    expect(container.innerHTML).toBe("");
  });
});
