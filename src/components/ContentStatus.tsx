import { useTranslation } from "react-i18next";
import type { ContentState } from "../diagnosis/quizSessionContext";

/** Loading and error states for the content snapshot; renders nothing when ready. */
export function ContentStatus({ content, onRetry }: { content: ContentState; onRetry: () => void }) {
  const { t } = useTranslation();
  if (content.status === "loading" || content.status === "idle") {
    return <p role="status">{t("common.loading")}</p>;
  }
  if (content.status === "error") {
    return (
      <div role="alert">
        <p>{t(`loadErrors.${content.error}`)}</p>
        <button type="button" onClick={onRetry}>
          {t("common.retry")}
        </button>
      </div>
    );
  }
  return null;
}
