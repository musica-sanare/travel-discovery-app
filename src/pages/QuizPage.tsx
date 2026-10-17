import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import type { DiagnosisContentQuestion } from "../../shared/diagnosis-content";
import { plannedQuestionCount } from "../../domain/diagnosis";
import { buttonClass, cardClass, choiceClass } from "../components/classes";
import { ContentStatus } from "../components/ContentStatus";
import { LocalizedText } from "../components/LocalizedText";
import { drawSeed } from "../diagnosis/session";
import { useDiagnosis } from "../diagnosis/useDiagnosis";

function QuestionForm({
  question,
  initial,
  onAnswer,
}: {
  question: DiagnosisContentQuestion;
  initial: readonly string[];
  onAnswer: (options: string[]) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const multiple = question.type === "multiple_choice";
  const [selected, setSelected] = useState<string[]>([...initial]);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    onAnswer(selected);
  };

  return (
    <form onSubmit={submit} className={`${cardClass} motion-safe:animate-enter`}>
      <fieldset aria-describedby={multiple ? `${id}-hint` : undefined}>
        <LocalizedText as="legend" locale={question.locale} className="text-xl font-bold">
          {question.prompt}
        </LocalizedText>
        {question.description && <p className="mt-2 text-muted">{question.description}</p>}
        {multiple && (
          <p id={`${id}-hint`} className="mt-2 text-sm text-muted">
            {t("quiz.multipleHint")}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {question.options.map((option) => (
            <label key={option.value} htmlFor={`${id}-${option.value}`} className={choiceClass}>
              <input
                id={`${id}-${option.value}`}
                type={multiple ? "checkbox" : "radio"}
                name={`${id}-option`}
                value={option.value}
                checked={selected.includes(option.value)}
                onChange={(event) => {
                  if (!multiple) {
                    setSelected([option.value]);
                  } else {
                    setSelected(
                      event.target.checked
                        ? [...selected, option.value]
                        : selected.filter((value) => value !== option.value),
                    );
                  }
                }}
                className="size-5 shrink-0"
              />
              <LocalizedText locale={option.locale}>{option.label}</LocalizedText>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={selected.length === 0} className={buttonClass.primary}>
          {t("quiz.next")}
        </button>
        <button
          type="button"
          className={buttonClass.secondary}
          onClick={() => {
            onAnswer([]);
          }}
        >
          {t("quiz.skip")}
        </button>
      </div>
    </form>
  );
}

export function QuizPage() {
  const { t } = useTranslation();
  const { session, dispatch, content, reloadContent, snapshot, engine, step } = useDiagnosis();

  if (session.seed === null) {
    return <Navigate to="/plan" replace />;
  }
  if (!snapshot || !engine || !step) {
    return <ContentStatus content={content} onRetry={reloadContent} />;
  }
  if (step.done) {
    return <Navigate to="/results" replace />;
  }
  const question = snapshot.questions.find((item) => item.slug === step.question);
  if (!question) {
    return <Navigate to="/results" replace />;
  }
  const previous = session.previousAnswer?.question === question.slug ? session.previousAnswer.options : [];
  const current = session.answers.length + 1;
  const total = Math.max(plannedQuestionCount(engine, snapshot.settings), current);

  return (
    <section aria-labelledby="quiz-progress" className="flex flex-col gap-5">
      <div>
        <h1 id="quiz-progress" className="text-sm font-semibold text-muted">
          {t("quiz.progress", { current, total })}
        </h1>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${String(Math.round(((current - 1) / total) * 100))}%` }}
          />
        </div>
      </div>
      <QuestionForm
        key={question.slug}
        question={question}
        initial={previous}
        onAnswer={(options) => {
          dispatch({ type: "answer", answer: { question: question.slug, options } });
        }}
      />
      <div className="flex flex-wrap justify-between gap-3">
        <button
          type="button"
          disabled={session.answers.length === 0}
          className={buttonClass.quiet}
          onClick={() => {
            dispatch({ type: "back" });
          }}
        >
          {t("quiz.back")}
        </button>
        <button
          type="button"
          className={buttonClass.quiet}
          onClick={() => {
            dispatch({ type: "start", seed: drawSeed() });
            reloadContent();
          }}
        >
          {t("quiz.restart")}
        </button>
      </div>
    </section>
  );
}
