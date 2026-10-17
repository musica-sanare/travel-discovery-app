import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { adminApi } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { useLoad } from "../hooks";
import { useContentText } from "../localizedContent";
import { CONTENT_STATUSES, type ContentStatus, type DestinationListItem, type Page } from "../types";

export function DestinationsPage() {
  const { t } = useTranslation();
  const content = useContentText();
  const id = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ContentStatus | "">("");
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState({ query: "", status: "" as ContentStatus | "" });

  const params = new URLSearchParams({ page: String(page) });
  if (applied.query) params.set("q", applied.query);
  if (applied.status) params.set("status", applied.status);
  const path = `/destinations?${params.toString()}`;
  const list = useLoad(() => adminApi<Page<DestinationListItem>>(path), path);

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h1 id={`${id}-heading`}>{t("pages.destinations")}</h1>
      <p>
        <Link to="/destinations/new">{t("common.create")}</Link>
      </p>
      <form
        className="filters"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied({ query, status });
        }}
      >
        <label htmlFor={`${id}-q`}>{t("common.search")}</label>
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <label htmlFor={`${id}-status`}>{t("common.filterStatus")}</label>
        <select
          id={`${id}-status`}
          value={status}
          onChange={(event) => {
            setStatus(CONTENT_STATUSES.find((value) => value === event.target.value) ?? "");
          }}
        >
          <option value="">{t("common.allStatuses")}</option>
          {CONTENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`status.${value}`)}
            </option>
          ))}
        </select>
        <button type="submit">{t("common.search")}</button>
      </form>

      {list.loading && <p role="status">{t("common.loading")}</p>}
      <ErrorBanner error={list.error} />
      {list.data?.items.length === 0 && <p>{t("common.empty")}</p>}
      {list.data && list.data.items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">{t("fields.slug")}</th>
              <th scope="col">{t("fields.name")}</th>
              <th scope="col">{t("fields.type")}</th>
              <th scope="col">{t("fields.status")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link to={`/destinations/${String(item.id)}`}>{item.slug}</Link>
                </td>
                <td>{content.text(item.names) ?? item.slug}</td>
                <td>{t(`destinationTypes.${item.type}`)}</td>
                <td>{t(`status.${item.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <nav className="pager" aria-label={t("pages.destinations")}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => {
            setPage(page - 1);
          }}
        >
          {t("common.previousPage")}
        </button>
        <button
          type="button"
          disabled={!list.data?.hasMore}
          onClick={() => {
            setPage(page + 1);
          }}
        >
          {t("common.nextPage")}
        </button>
      </nav>
    </section>
  );
}
