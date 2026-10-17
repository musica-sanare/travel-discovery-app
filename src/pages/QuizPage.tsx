import { useId, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import type { DiagnosisContentQuestion } from "../../shared/diagnosis-content";
import { plannedQuestionCount } from "../../domain/diagnosis";
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
    <form onSubmit={submit}>
      <fieldset aria-describedby={multiple ? `${id}-hint` : undefined}>
        <LocalizedText as="legend" locale={question.locale}>
          {question.prompt}
        </LocalizedText>
        {question.description && <p>{question.description}</p>}
        {multiple && <p id={`${id}-hint`}>{t("quiz.multipleHint")}</p>}
        {question.options.map((option) => (
          <label key={option.value} className="choice">
            <input
              type={multiple ? "checkbox" : "radio"}
              name={`${id}-option`}
              value={option.value}
              checked={selected.includes(option.value)}
              onChange={(event) => {
                if (!multiple) {
                  setSelected([option.value]);
                } else {
                  setSelected(
                    event.target.checked ? [...selected, option.value] : selected.filter((value) => value !== option.value),
                  );
                }
              }}
            />
            <LocalizedText locale={option.locale}>{option.label}</LocalizedText>
          </label>
        ))}
      </fieldset>
      <div className="actions">
        <button type="submit" disabled={selected.length === 0}>
          {t("quiz.next")}
        </button>
        <button
          type="button"
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
  const navigate = useNavigate();
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

  return (
    <section aria-labelledby="quiz-progress">
      <h1 id="quiz-progress">
        {t("quiz.progress", {
          current: session.answers.length + 1,
          total: Math.max(plannedQuestionCount(engine, snapshot.settings), session.answers.length + 1),
        })}
      </h1>
      <progress
        value={session.answers.length}
        max={Math.max(plannedQuestionCount(engine, snapshot.settings), session.answers.length + 1)}
        aria-labelledby="quiz-progress"
      />
      <QuestionForm
        key={question.slug}
        question={question}
        initial={previous}
        onAnswer={(options) => {
          dispatch({ type: "answer", answer: { question: question.slug, options } });
        }}
      />
      <div className="actions">
        <button
          type="button"
          disabled={session.answers.length === 0}
          onClick={() => {
            dispatch({ type: "back" });
          }}
        >
          {t("quiz.back")}
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "start", seed: drawSeed() });
            reloadContent();
            void navigate("/quiz");
          }}
        >
          {t("quiz.restart")}
        </button>
      </div>
    </section>
  );
}
