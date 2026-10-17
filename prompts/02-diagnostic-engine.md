# Prompt 02 — Deterministic adaptive quiz and ranking engine

Read the product and data-model docs before implementation.

Implement the quiz and ranking domain as pure TypeScript modules independent of React, D1, Cloudflare bindings, and AI.

## Requirements
- Target 10 questions; default configurable minimum 6 and maximum 12.
- Use published questions only.
- Avoid repeats within a session.
- Vary combinations between sessions with injectable/seedable randomness.
- Balance categories and prioritize questions that add useful preference information.
- Adapt next question based on previous answers using a small, documented rule set.
- Stop after minimum when the stopping rule is satisfied; always stop at maximum.
- Gracefully handle too few active questions, missing answers, inactive options, incomplete attribute coverage, and tied destination scores.
- Treat hard trip constraints separately from soft preference scores.
- Rank city/region destinations based on answer effects and destination attribute scores.
- Produce 3–5 recommendations when enough eligible content exists.
- Ensure deterministic ranking for the same submitted answers and content data.
- Provide a fallback explanation for each destination from authored content.
- AI must not be imported or used in this phase.

## Before coding
Write down the exact scoring formula, normalization, question-selection heuristic, stopping rule, and tie-breaking rule in `docs/DECISIONS.md` or a dedicated `docs/DIAGNOSTIC_ALGORITHM.md`. Keep the formula understandable; avoid premature ML or complex statistical methods.

## Tests
Include tests for:
- repeat avoidance
- min/max bounds
- category balancing
- seeded randomness
- partial/empty answers
- hard filters
- tie-breaking
- missing attribute values
- inactive content
- same input/data producing the same ranking
- no dependency on AI or network calls

## Acceptance
The domain module is pure and independently testable. Tests and all project checks pass. Report the formula and limitations plainly. Do not build the public UI in this phase.
