/**
 * In-memory quiz session state (docs/DECISIONS.md ADR-022). Pure reducer and
 * selectors; nothing here touches storage or the network.
 */
import {
  nextQuestion,
  rankDestinations,
  type Answer,
  type DiagnosisContent,
  type NextStep,
  type QuizLimits,
  type RankingResult,
  type TripConstraints,
} from "../../domain/diagnosis";

export interface SessionState {
  constraints: TripConstraints;
  /** AI assistance toggle; default OFF. */
  aiAssist: boolean;
  /** Set when a quiz is running; a new seed is drawn for every start/restart. */
  seed: number | null;
  answers: readonly Answer[];
  /** Answer removed by "back", used to prefill the question shown again. */
  previousAnswer: Answer | null;
}

export type SessionAction =
  | { type: "setConstraints"; constraints: TripConstraints }
  | { type: "setAiAssist"; enabled: boolean }
  | { type: "start"; seed: number }
  | { type: "answer"; answer: Answer }
  | { type: "back" }
  | { type: "editAnswer"; question: string }
  | { type: "reset" };

export const INITIAL_SESSION: SessionState = {
  constraints: {},
  aiAssist: false,
  seed: null,
  answers: [],
  previousAnswer: null,
};

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "setConstraints":
      return { ...state, constraints: action.constraints };
    case "setAiAssist":
      return { ...state, aiAssist: action.enabled };
    case "start":
      return { ...state, seed: action.seed, answers: [], previousAnswer: null };
    case "answer": {
      // Answering a question already in the list replaces it and discards later answers.
      const index = state.answers.findIndex((answer) => answer.question === action.answer.question);
      const kept = index === -1 ? state.answers : state.answers.slice(0, index);
      return { ...state, answers: [...kept, action.answer], previousAnswer: null };
    }
    case "back": {
      const last = state.answers.at(-1);
      return last ? { ...state, answers: state.answers.slice(0, -1), previousAnswer: last } : state;
    }
    case "editAnswer": {
      const index = state.answers.findIndex((answer) => answer.question === action.question);
      if (index === -1) {
        return state;
      }
      return { ...state, answers: state.answers.slice(0, index), previousAnswer: state.answers[index] ?? null };
    }
    case "reset":
      return INITIAL_SESSION;
  }
}

/** Unsigned 32-bit seed from the platform CSPRNG. */
export function drawSeed(random: Pick<Crypto, "getRandomValues"> = crypto): number {
  const value = new Uint32Array(1);
  random.getRandomValues(value);
  return value[0] ?? 0;
}

export function currentStep(content: DiagnosisContent, limits: QuizLimits, state: SessionState): NextStep | null {
  return state.seed === null ? null : nextQuestion(content, state.answers, limits, state.seed);
}

export function results(content: DiagnosisContent, limits: QuizLimits, state: SessionState): RankingResult {
  return rankDestinations(content, state.answers, state.constraints, limits);
}
