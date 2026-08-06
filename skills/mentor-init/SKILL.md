---
name: mentor-init
description: Enable Mentor Mode on this repository. Use when the user runs /mentor-init, asks to set up mentor mode, enable learning mode, or initialize the guided learning workflow on a project.
---

# Mentor Init

Turn this repository into a Mentor Mode learning environment.

## Preconditions

1. Verify the pack is installed: `.claude/hooks/mentor-guard.mjs` exists and `.claude/settings.json` has the PreToolUse entry that runs it. If not, stop and tell the user to run the pack installer first (`node scripts/install.mjs <this repo>` from the pack repo).
2. If `mentor/curriculum.md` already contains real objectives instead of the template placeholder, the repo is initialized: report current state and suggest /mentor instead.

## Find The Spec

Before asking anything, look for a spec in this order: `mentor/SPEC.md`, then `SPEC.md` at the repo root, then any document the user points at. If found, read it - it is the primary statement of what we are building and it overrides guesswork.

## Interview

Ask only for what the spec did not answer, briefly and conversationally (one message, not a form):

1. What are we building, and does code already exist here? (Skip if the spec covers it.)
2. What is your background, and what feels rusty?
3. Time budget per week and preferred session length?
4. Anything you explicitly want covered or skipped?

With a good spec this collapses to a two-line confirmation. Do not re-ask what is already written down.

## Build The Curriculum

Spawn the curriculum-planner agent with the spec (if found), the interview answers, an instruction to explore the repo layout first if code exists, and the field format from `mentor/curriculum.md`. It returns full curriculum content: phases and objectives with ids, levels, protectedPaths globs, specs, checkpoints.

Write the result to `mentor/curriculum.md`, then present it for approval - and present it well:

- Show the curriculum in normal chat output as readable markdown: one line per phase, then each objective as a short bullet - title, level, protected paths, checkpoint. Blank lines between phases. This is a document the learner is about to live inside; make it scannable.
- Never put the curriculum itself inside a question or approval dialog. If your harness has an approval widget, the widget carries only the short question ("Approve and activate Objective 0.1?" plus an adjust option); the content stays in chat above it.
- Mention that the full version is in `mentor/curriculum.md` for reading in the editor.

Adjust on feedback before activating anything.

## Activate

1. Fill `mentor/config.json`: learner, background, cadence from the interview. Keep defaults for the rest.
2. Copy the first objective's id, title, and protectedPaths into `mentor/guard.json` activeObjective, set mode to "on", mark the objective in-progress in the curriculum, and update its "Active objective:" line.
3. Confirm `mentor/ledger.md` and `mentor/sessions/` exist.
4. Verify the guard bites (Claude Code only): attempt a trivial Write to a path inside the first protected glob and confirm the hook blocks it. If the first objective has empty protectedPaths, skip this check and note why. In tools without hook support, skip the check and state plainly that enforcement here is the AGENTS.md contract, not a mechanical block.
5. Tell the learner: mode is on, the first objective, the cadence, and that every session starts with /mentor. If a `scratch/` directory exists, mention it: the shared lab bench for experiments, unprotected by design.

## Rules

- Never invent protected paths the curriculum does not define.
- The learner approves the curriculum before activation.
- This skill sets up state; it does not start teaching. That is /mentor.

## Harness Note

In Claude Code, spawn pack agents by name from `.claude/agents/`. In Codex or any tool without subagent spawning, read `.agents/agents/<name>.md` and follow it inline as a focused sub-task, then continue this skill.
