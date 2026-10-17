import { describe, expect, it } from "vitest";
import { drawSeed, INITIAL_SESSION, sessionReducer, type SessionState } from "./session";

const a = { question: "a", options: ["x"] };
const b = { question: "b", options: ["y"] };
const c = { question: "c", options: [] };

function withAnswers(...answers: { question: string; options: string[] }[]): SessionState {
  return { ...INITIAL_SESSION, seed: 1, answers };
}

describe("sessionReducer", () => {
  it("starts with AI off, no seed, and no answers", () => {
    expect(INITIAL_SESSION).toEqual({ constraints: {}, aiAssist: false, seed: null, answers: [], previousAnswer: null });
  });

  it("appends answers, including skipped ones", () => {
    let state = sessionReducer({ ...INITIAL_SESSION, seed: 1 }, { type: "answer", answer: a });
    state = sessionReducer(state, { type: "answer", answer: c });
    expect(state.answers).toEqual([a, c]);
  });

  it("re-answering an earlier question discards the later answers", () => {
    const state = sessionReducer(withAnswers(a, b, c), { type: "answer", answer: { question: "b", options: ["z"] } });
    expect(state.answers).toEqual([a, { question: "b", options: ["z"] }]);
  });

  it("goes back one question and remembers the removed answer for prefilling", () => {
    const state = sessionReducer(withAnswers(a, b), { type: "back" });
    expect(state.answers).toEqual([a]);
    expect(state.previousAnswer).toEqual(b);
    expect(sessionReducer(withAnswers(), { type: "back" })).toEqual(withAnswers());
  });

  it("edits a specific answer by truncating from it", () => {
    const state = sessionReducer(withAnswers(a, b, c), { type: "editAnswer", question: "b" });
    expect(state.answers).toEqual([a]);
    expect(state.previousAnswer).toEqual(b);
    expect(sessionReducer(withAnswers(a), { type: "editAnswer", question: "missing" }).answers).toEqual([a]);
  });

  it("restarts with a new seed, keeping constraints and the AI choice", () => {
    const before: SessionState = { ...withAnswers(a, b), constraints: { days: 4 }, aiAssist: true };
    const state = sessionReducer(before, { type: "start", seed: 99 });
    expect(state).toEqual({ constraints: { days: 4 }, aiAssist: true, seed: 99, answers: [], previousAnswer: null });
    expect(sessionReducer(state, { type: "reset" })).toEqual(INITIAL_SESSION);
  });

  it("draws a 32-bit seed from the platform CSPRNG", () => {
    const fake = {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        if (array instanceof Uint32Array) array[0] = 0xdeadbeef;
        return array;
      },
    };
    expect(drawSeed(fake)).toBe(0xdeadbeef);
    const seed = drawSeed();
    expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true);
  });
});
