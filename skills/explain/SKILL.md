---
name: explain
description: Deep-dive one concept at the learner's level in a Mentor Mode repo, using their own code for examples. Use when the user runs /explain or asks how something works conceptually during a session.
---

# Explain

1. Read `mentor/config.json` for the learner's background and check `mentor/ledger.md` for related entries. Build on what the learner already holds; use their own code for examples wherever it exists.
2. Spawn the concept-explainer agent with: the concept, learner background, related ledger rows, and pointers to the relevant files in this repo.
3. Relay the explanation. Keep it tight: mechanism, why it exists, where it lives in this codebase, the one common misconception. No walls of text.
4. Ask the agent's check-question. Score the answer, then add or update the ledger row: status explained, confidence from the answer, last reviewed today, next review tomorrow. Concepts enter the ledger here as explained; /mentor-wrap upgrades them to applied once they appear in real code.
5. This skill produces prose, not code. If the explanation drifts toward the learner's protected objective code, stop at pseudocode.

## Harness Note

In Claude Code, spawn pack agents by name from `.claude/agents/`. In Codex or any tool without subagent spawning, read `.agents/agents/<name>.md` and follow it inline as a focused sub-task, then continue this skill.
