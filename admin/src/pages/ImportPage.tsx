import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { adminApi } from "../api";
import { ErrorBanner } from "../components/ErrorBanner";
import {
  IMPORT_KINDS,
  parseBundle,
  planImport,
  type BundleIssue,
  type ExistingIds,
  type ImportBundle,
  type PlanStep,
} from "../import/bundle";
import {
  ImportConflictError,
  loadCurrentDestinations,
  loadExisting,
  runImport,
  type StepState,
} from "../import/runImport";

interface Plan {
  bundle: ImportBundle;
  existing: ExistingIds;
  steps: PlanStep[];
}

const MAX_VALUE_LENGTH = 200;

function formatValue(value: unknown, empty: string): string {
  if (value === undefined) return empty;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

/**
 * Imports a content bundle through the regular admin API (ADR-028): check
 * first (nothing is written), then create the new items one by one. In the
 * opt-in update mode, existing destinations that differ from the file are
 * shown field by field and replaced with `PUT`.
 */
export function ImportPage() {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [issues, setIssues] = useState<BundleIssue[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<"checking" | "importing" | null>(null);
  const [checkError, setCheckError] = useState<unknown>(null);
  const [states, setStates] = useState<StepState[] | null>(null);
  const [runError, setRunError] = useState<unknown>(null);

  const reset = () => {
    setIssues([]);
    setPlan(null);
    setCheckError(null);
    setStates(null);
    setRunError(null);
  };

  const check = async (event: SyntheticEvent) => {
    event.preventDefault();
    reset();
    const parsed = parseBundle(text);
    if (!parsed.bundle) {
      setIssues(parsed.issues);
      return;
    }
    setBusy("checking");
    try {
      const existing = await loadExisting(adminApi);
      const current = updateExisting ? await loadCurrentDestinations(adminApi, parsed.bundle, existing) : undefined;
      const planned = planImport(parsed.bundle, existing, current);
      if (planned.issues.length > 0) {
        setIssues(planned.issues);
      } else {
        setPlan({ bundle: parsed.bundle, existing, steps: planned.steps });
      }
    } catch (error) {
      setCheckError(error);
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    if (!plan) return;
    setBusy("importing");
    setRunError(null);
    const outcome = await runImport(adminApi, plan.bundle, plan.steps, plan.existing, setStates);
    setRunError(outcome.error);
    setBusy(null);
  };

  const label = (step: PlanStep) => `${t(`pages.${step.kind}`)}: ${step.slug}`;
  const toWrite = plan?.steps.filter((step) => step.action === "create" || step.action === "update").length ?? 0;
  const updates = plan?.steps.flatMap((step) => (step.action === "update" ? [step] : [])) ?? [];
  const processed = states?.filter((state) => state !== "pending").length ?? 0;
  const failedIndex = states?.indexOf("failed") ?? -1;
  const failedStep = plan && failedIndex >= 0 ? plan.steps[failedIndex] : undefined;
  const finished = states !== null && busy === null;

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h1 id={`${id}-heading`}>{t("pages.import")}</h1>
      <p>{t("import.intro")}</p>
      <form className="editor" onSubmit={(event) => void check(event)}>
        <div className="field">
          <label htmlFor={`${id}-file`}>{t("import.file")}</label>
          <input
            id={`${id}-file`}
            type="file"
            accept="application/json,.json"
            disabled={busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void file.text().then((content) => {
                  reset();
                  setText(content);
                });
              }
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-text`}>{t("import.text")}</label>
          <textarea
            id={`${id}-text`}
            rows={12}
            spellCheck={false}
            value={text}
            disabled={busy !== null}
            onChange={(event) => {
              reset();
              setText(event.target.value);
            }}
          />
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={updateExisting}
              disabled={busy !== null}
              onChange={(event) => {
                reset();
                setUpdateExisting(event.target.checked);
              }}
            />{" "}
            {t("import.updateExisting")}
          </label>
        </div>
        <div className="actions">
          <button type="submit" disabled={busy !== null || text.trim() === ""}>
            {busy === "checking" ? t("import.checking") : t("import.check")}
          </button>
        </div>
      </form>

      {issues.length > 0 && (
        <div className="error-banner" role="alert">
          <p>
            <strong>{t("import.issuesTitle")}</strong>
          </p>
          <ul>
            {issues.map((issue) => (
              <li key={`${issue.path}:${issue.code}`}>
                <code>{issue.path || "—"}</code>: {t(`import.issues.${issue.code}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ErrorBanner error={checkError} />

      {plan && (
        <>
          <h2>{t("import.summary")}</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("import.kind")}</th>
                <th scope="col">{t("import.create")}</th>
                <th scope="col">{t("import.update")}</th>
                <th scope="col">{t("import.unchanged")}</th>
                <th scope="col">{t("import.skip")}</th>
              </tr>
            </thead>
            <tbody>
              {IMPORT_KINDS.map((kind) => {
                const steps = plan.steps.filter((step) => step.kind === kind);
                const slugs = (action: PlanStep["action"]) =>
                  steps.filter((step) => step.action === action).map((step) => step.slug).join(", ") || "0";
                return (
                  <tr key={kind}>
                    <th scope="row">{t(`pages.${kind}`)}</th>
                    <td>{steps.filter((step) => step.action === "create").length}</td>
                    <td>{slugs("update")}</td>
                    <td>{slugs("unchanged")}</td>
                    <td>{slugs("skip")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {updates.length > 0 && (
            <>
              <h3>{t("import.changes")}</h3>
              {updates.map((step) => (
                <details key={step.slug}>
                  <summary>
                    {t("import.changesOf", { item: label(step), count: step.changes.length })}
                    {step.changes.some((change) => change.path === "status") && (
                      <>
                        {" "}
                        <strong>{t("import.statusChange")}</strong>
                      </>
                    )}
                  </summary>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{t("import.field")}</th>
                        <th scope="col">{t("import.before")}</th>
                        <th scope="col">{t("import.after")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {step.changes.map((change) => (
                        <tr key={change.path}>
                          <th scope="row">
                            <code>{change.path}</code>
                          </th>
                          <td>{formatValue(change.before, t("import.noValue"))}</td>
                          <td>{formatValue(change.after, t("import.noValue"))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </>
          )}
          {toWrite === 0 ? (
            <p role="status">{t("import.nothingToDo")}</p>
          ) : (
            <div className="actions">
              <button type="button" disabled={busy !== null || states !== null} onClick={() => void run()}>
                {busy === "importing" ? t("import.running") : t("import.run")}
              </button>
            </div>
          )}
        </>
      )}

      {plan && states && (
        <>
          <p role="status" aria-live="polite">
            {finished && !runError
              ? t("import.done")
              : t("import.progress", { done: processed, total: plan.steps.length })}
          </p>
          {failedStep && (
            <>
              <p>{t("import.stopped", { item: label(failedStep) })}</p>
              {runError instanceof ImportConflictError ? (
                <p role="alert">{t("import.changedSinceCheck")}</p>
              ) : (
                <ErrorBanner error={runError} />
              )}
            </>
          )}
          <ol>
            {plan.steps.map((step, index) => (
              <li key={`${step.kind}:${step.slug}`}>
                {label(step)} — {t(`import.states.${states[index] ?? "pending"}`)}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
