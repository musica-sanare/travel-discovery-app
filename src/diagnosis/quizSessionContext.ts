import { createContext, use } from "react";
import type { DiagnosisContentResponse } from "../../shared/diagnosis-content";
import type { Locale } from "../../shared/locales";
import type { ContentLoadError } from "./contentClient";
import type { SessionAction, SessionState } from "./session";

export type ContentState =
  | { status: "idle" }
  | { status: "loading"; locale: Locale }
  | { status: "ready"; locale: Locale; content: DiagnosisContentResponse }
  | { status: "error"; locale: Locale; error: ContentLoadError };

export interface QuizSessionValue {
  session: SessionState;
  dispatch: (action: SessionAction) => void;
  /** Snapshot for the current locale; loaded only while a quiz is running. */
  content: ContentState;
  /** Fetches the snapshot again (retry, new quiz), honouring the in-memory cache age. */
  reloadContent: () => void;
}

export const QuizSessionContext = createContext<QuizSessionValue | null>(null);

export function useQuizSession(): QuizSessionValue {
  const value = use(QuizSessionContext);
  if (!value) {
    throw new Error("useQuizSession must be used inside QuizSessionProvider");
  }
  return value;
}
