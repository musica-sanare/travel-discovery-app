import { useTranslation } from "react-i18next";
import type { ContentState } from "../diagnosis/quizSessionContext";
import { buttonClass, noticeClass } from "./classes";

/** Loading and error states for the content snapshot; renders nothing when ready. */
export function ContentStatus({ content, onRetry }: { content: ContentState; onRetry: () => void }) {
  const { t } = useTranslation();
  if (content.status === "loading" || content.status === "idle") {
    return (
      <p role="status" className="py-12 text-center text-muted">
        {t("common.loading")}
      </p>
    );
  }
  if (content.status === "error") {
    return (
      <div role="alert" className={`${noticeClass.warn} flex flex-col items-start gap-3`}>
        <p>{t(`loadErrors.${content.error}`)}</p>
        <button type="button" className={buttonClass.secondary} onClick={onRetry}>
          {t("common.retry")}
        </button>
      </div>
    );
  }
  return null;
}
