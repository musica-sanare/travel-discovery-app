import { useMemo } from "react";
import type { DiagnosisContentResponse } from "../../shared/diagnosis-content";
import { toEngineContent } from "../../shared/engine-content";
import { useQuizSession } from "./quizSessionContext";
import { currentStep } from "./session";

/** Derives engine input and the current quiz step from the loaded snapshot. */
export function useDiagnosis() {
  const quiz = useQuizSession();
  const { content, session } = quiz;

  const snapshot: DiagnosisContentResponse | null = content.status === "ready" ? content.content : null;
  const engine = useMemo(() => (snapshot ? toEngineContent(snapshot) : null), [snapshot]);
  const step = useMemo(
    () => (snapshot && engine ? currentStep(engine, snapshot.settings, session) : null),
    [snapshot, engine, session],
  );
  return { ...quiz, snapshot, engine, step };
}
