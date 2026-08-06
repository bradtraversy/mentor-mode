---
name: mentor-wrap
description: End a Mentor Mode session with the explain-back gate, ledger and curriculum updates, a session log, and a next-session preview. Use when the user runs /mentor-wrap, says wrap up, end session, or done for today in a Mentor Mode repo.
---

# Mentor Wrap

## Explain-Back Gate

Ask the learner to explain today's work: what they built, why it is shaped the way it is, and one "what would break if" question. Probe once on the weakest part. This is the completion gate for the objective.

Two exceptions:

- Already done: if a graded explain-back happened during the session (the learner volunteered one and you probed it), carry that result - do not re-quiz.
- Early exit: if the session is ending with no checkpoint at stake (fatigue, time, a deliberate mid-objective stop), skip the gate entirely. Log honestly, put the session's concepts in the ledger at their earned confidence, and let them come due at the next warmup. A tired explain-back produces garbage data; do not collect it.

## Update State

1. Ledger: add rows for concepts genuinely applied today (status applied, confidence from the explain-back, interval at the first reviewIntervalsDays value, last reviewed today, next review today plus that interval). Update existing rows that were exercised. Before adding a row, check for overlap with existing rows: if a new concept is mostly a facet of an existing one, extend that row's concept text and notes instead of adding a near-duplicate - warmups should not drill the same territory twice under two names.
2. Curriculum: if the checkpoint is met and the explain-back held, mark the objective complete, mark the next objective in-progress, and update the "Active objective:" line. Otherwise it stays in-progress; say exactly what remains.
3. `mentor/guard.json`: copy the new active objective's id, title, and protectedPaths in; ensure reveal.active is false. At a phase boundary, spawn curriculum-planner to check the next phase's protectedPaths against the repo as it now exists and apply its corrections before activating.
4. Session log: write `mentor/sessions/YYYY-MM-DD.md` from `mentor/sessions/_template.md` with the real date and honest content (hints used, reveals, explain-back result). Fill the Learning observations line with what landed and what bounced this session; promote patterns that have held across sessions into `mentor/config.json` background. For a second session on the same date, suffix -2.

## Close

Summarize in chat: what completed, ledger changes, what comes due at the next warmup including pending re-derivations, and the next objective. If cadence has slipped or an objective has dragged across 3 or more sessions, say so plainly and propose a scope or level adjustment.

## Level Promotion

If the last two objectives at the current support level passed explain-back without reveals, recommend promoting the next objective one level (L1 to L2, L2 to L3). The learner decides.

## Harness Note

In Claude Code, spawn pack agents by name from `.claude/agents/`. In Codex or any tool without subagent spawning, read `.agents/agents/<name>.md` and follow it inline as a focused sub-task, then continue this skill.
