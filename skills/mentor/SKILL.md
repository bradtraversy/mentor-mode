---
name: mentor
description: Start a Mentor Mode learning session. Use when the user runs /mentor, says start a session, begin today's lesson, or let's learn in a Mentor Mode repo.
---

# Mentor Session Start

## Load State

Read `mentor/config.json`, `mentor/curriculum.md`, `mentor/ledger.md`, `mentor/guard.json`, and the most recent file in `mentor/sessions/`. If `guard.json` has reveal.active true, set it false now: reveals are one-shot and must not leak across sessions.

## Warmup (Recall First, Always)

1. Collect ledger rows with next review on or before today, plus revealQueue entries with status pending.
2. Spawn the quizmaster agent with those items to generate 2-5 questions. Re-derivations come first: the learner rewrites revealed code from memory in their editor before anything else.
3. Run the warmup conversationally, one question at a time. Grade honestly against the quizmaster's pass bars.
4. Update every drilled ledger row: confidence, interval (advance to the next reviewIntervalsDays value on pass, staying at the last value past the end; reset to the first on fail), last reviewed today, next review today plus the new interval. Mark completed re-derivations done in revealQueue and set their ledger status to re-derived.
5. Nothing due: say so and move on. Keep the whole warmup under 10 minutes.

## Objective

1. Determine the active objective from the curriculum: first in-progress, else first not-started. If guard.json disagrees, update guard.json to match (id, title, protectedPaths).
2. Announce objective, support level, spec, and checkpoint. Give the concept brief: 3-6 sentences on why this exists and where it fits the project. No code yet.
3. Hand over. The learner writes. Follow the repo's Mentor Mode rules: attempt first, hint ladder, debug solo window, explain-back before completion.

## During The Session

- L1: walk the learner through the build step by step. Name the exact file to create or open, provide the next small chunk of code in chat for them to type, and explain what it does and why it is shaped that way before moving on. Never write it to their files yourself. Check understanding with a quick question at natural seams, not a full explain-back per chunk.
- L2: spec the behavior and shapes; the learner implements; review via /mentor-review.
- L3: state the objective only; review via /mentor-review.
- Track hints used and reveals as the session runs; /mentor-wrap needs them.
- The learner runs their own code. Resist running it for them unless they ask.

## Harness Note

In Claude Code, spawn pack agents by name from `.claude/agents/`. In Codex or any tool without subagent spawning, read `.agents/agents/<name>.md` and follow it inline as a focused sub-task, then continue this skill.
