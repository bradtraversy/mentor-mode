# Mentor Mode

> Working title, v0.1, personal use. Final name and public distribution come after the pack survives real use.

A per-repo AI workflow pack that flips AI-assisted development: the learner writes the learning-critical code, and the AI scaffolds the periphery, teaches, reviews, quizzes, and tracks progress. Built for developers whose hands-on skill faded while they shipped with AI agents - reviewing code is recognition, and skill only rebuilds through recall.

## How It Works

Three layers, installed into any repository:

1. **Guardrails.** A PreToolUse hook plus `mentor/guard.json` protect only the current learning objective's paths. The AI writes scaffolding, config, boilerplate, styles, and repetitive tests freely; it cannot write protected code, including through honest shell commands. Solutions unlock only through an explicit `/reveal`, which queues the item for later re-derivation from memory.
2. **Session workflow.** Seven skills: `/mentor-init` (interview, curriculum, activation), `/mentor` (session start with spaced recall warmup), `/mentor-review` (teaching review of the learner's diff), `/reveal`, `/mentor-quiz`, `/explain`, `/mentor-wrap` (explain-back gate, state updates, session log).
3. **Subagents.** mentor-reviewer (reviews, never patches), quizmaster (recall drills with pass bars), curriculum-planner (owns objectives and protected globs), concept-explainer (level-matched deep dives grounded in the learner's code).

All state is human-readable files in the target repo's `mentor/` folder: `curriculum.md`, `ledger.md`, `guard.json`, `config.json`, `sessions/`. No cloud, no telemetry, no accounts.

## Install

```bash
node scripts/install.mjs /path/to/target-repo
```

Copies skills, agents, and the hook into the target's `.claude/`, merges the hook entry into `.claude/settings.json` (existing settings preserved), seeds `mentor/` from templates without overwriting existing state, and appends the Mentor Mode block to the target's `CLAUDE.md`. Idempotent.

Then drop a spec for what you want to build at `mentor/SPEC.md` (or `SPEC.md` at the repo root) - one page is plenty: what it is, the stack, a rough feature list. In a Claude Code session inside the target repo, run `/mentor-init`; it reads the spec automatically, fills the gaps with a short interview, and drafts the curriculum for your approval. No spec works too - the interview just gets longer.

## Uninstall

```bash
node scripts/uninstall.mjs /path/to/target-repo          # keeps mentor/ learning state
node scripts/uninstall.mjs /path/to/target-repo --purge  # removes mentor/ too
```

## A Session

1. `/mentor` - warmup drills whatever recall is due (revealed code gets re-derived from memory first), then announces the day's objective, its support level, and a short concept brief.
2. The learner writes. Stuck means the hint ladder: nudge, concept, pseudocode. Broken code means a solo debug window before hints. Solutions only via `/reveal`.
3. `/mentor-review` - teaching review with probing questions.
4. `/mentor-wrap` - explain-back gate, ledger and curriculum updates, session log, next-session preview.

Support levels fade as skill returns: L1 (dictate) to L2 (spec and attempt) to L3 (solo build with review).

## Known Limitations (v0.1)

- The guard depends on Claude Code hook execution; other harnesses need their own adapters.
- Bash blocking is heuristic (write indicator plus protected path match). Determined circumvention can evade it; the CLAUDE.md block forbids circumvention as policy and the hook catches the honest cases.
- Spaced repetition is simple due dates (1, 3, 7, 21), not a full SRS.
- Path matching is case-sensitive; on case-insensitive filesystems a differently cased path can slip past. This is honest-mistake protection, not a security boundary.
- Protected globs support `*`, `**`, `?`, and literals only. Braces and character classes are rejected as config errors; bare directory paths protect everything beneath them.
- Install is by local script; no npx installer yet.

## Repo Layout

- `skills/` - the seven session skills (source; installed to `.claude/skills/`)
- `agents/` - the four subagents (installed to `.claude/agents/`)
- `hooks/` - the guardrail hook and its tests
- `templates/` - `mentor/` state seeds and the CLAUDE.md block
- `scripts/` - install and uninstall

Test the hook:

```bash
npm test
```
