---
name: mentor-quiz
description: On-demand recall drill from the Mentor Mode ledger. Use when the user runs /mentor-quiz, asks to be quizzed, wants a drill, or wants to test recall between sessions.
---

# Mentor Quiz

1. Read `mentor/ledger.md` and `mentor/config.json`. Select items: due first (next review on or before today), then weakest confidence, newest first. Default 5 questions; the learner may ask for more or narrow to a topic.
2. Spawn the quizmaster agent with the selected rows, any pending revealQueue items from `mentor/guard.json`, and recent session logs for context.
3. Ask one question at a time. Answer forms vary by question: explain in chat, predict output, spot the bug, or write a small thing from memory in the editor.
4. Grade honestly against the quizmaster's pass bars - shaky is shaky. Update each drilled ledger row exactly as /mentor does: confidence, interval (advance on pass, stay at the last value past the end, reset to the first on fail), last reviewed today, next review today plus the new interval.
5. End with a one-line summary: what is solid, what is shaky, when the next items come due.

## Harness Note

In Claude Code, spawn pack agents by name from `.claude/agents/`. In Codex or any tool without subagent spawning, read `.agents/agents/<name>.md` and follow it inline as a focused sub-task, then continue this skill.
