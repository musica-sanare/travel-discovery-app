import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { adminApi } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import { useLoad } from "../hooks";
import { useContentText } from "../localizedContent";
import {
  CONTENT_STATUSES,
  type ContentStatus,
  type Page,
  type QuestionListItem,
  type TaxonomyItem,
} from "../types";

export function QuestionsPage() {
  const { t } = useTranslation();
  const content = useContentText();
  const id = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ContentStatus | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState({ query: "", status: "", categoryId: "" });

  const params = new URLSearchParams({ page: String(page) });
  if (applied.query) params.set("q", applied.query);
  if (applied.status) params.set("status", applied.status);
  if (applied.categoryId) params.set("categoryId", applied.categoryId);
  const path = `/questions?${params.toString()}`;
  const list = useLoad(() => adminApi<Page<QuestionListItem>>(path), path);
  const categories = useLoad(() => adminApi<{ items: TaxonomyItem[] }>("/categories"), "categories");

  const categoryName = (categoryIdValue: number) => {
    const category = categories.data?.items.find((item) => item.id === categoryIdValue);
    return category ? (content.name(category.translations) ?? category.slug) : "";
  };

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h1 id={`${id}-heading`}>{t("pages.questions")}</h1>
      <p>
        <Link to="/questions/new">{t("common.create")}</Link>
      </p>
      <form
        className="filters"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied({ query, status, categoryId });
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
        <label htmlFor={`${id}-category`}>{t("fields.category")}</label>
        <select
          id={`${id}-category`}
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
          }}
        >
          <option value="">{t("common.allStatuses")}</option>
          {categories.data?.items.map((category) => (
            <option key={category.id} value={category.id}>
              {content.name(category.translations) ?? category.slug}
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
              <th scope="col">{t("fields.prompt")}</th>
              <th scope="col">{t("fields.category")}</th>
              <th scope="col">{t("fields.status")}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link to={`/questions/${String(item.id)}`}>{item.slug}</Link>
                </td>
                <td>{content.text(item.prompts) ?? item.slug}</td>
                <td>{categoryName(item.categoryId)}</td>
                <td>{t(`status.${item.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <nav className="pager" aria-label={t("pages.questions")}>
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
