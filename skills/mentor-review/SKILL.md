---
name: mentor-review
description: Teaching review of code the learner just wrote in a Mentor Mode repo. Use when the user runs /mentor-review, asks to review what I wrote, or finishes an attempt on the active objective.
---

# Mentor Review

## Collect The Changes

Use git to get the learner's changes: `git diff`, plus untracked files under the objective's paths. If the repo has no commits yet, read the relevant files directly. Scope to the active objective unless the learner names other files.

## Spawn The Reviewer

Spawn the mentor-reviewer agent with: the diff or file contents, the active objective (id, spec, checkpoint, level) from `mentor/curriculum.md`, and the learner background from `mentor/config.json`.

## Deliver

Relay the review in this order:

1. Strengths: specific and real, no cheerleading.
2. Issues, ranked: for each, teach the why - what breaks, when, and the concept underneath.
3. The probing questions, one at a time, waiting for each answer. A wrong or shaky answer becomes a hint, not a lecture: point at the code line, ask again.

## Rules

- Never patch protected code. If the learner wants the fix written for them, that is /reveal.
- If the review passes and the answers hold, tell the learner to run the checkpoint proof from the curriculum, then /mentor-wrap.
- Do not update ledger or curriculum here; /mentor-wrap owns state. Carry the findings forward in the session.
