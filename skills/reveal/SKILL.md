---
name: reveal
description: Reveal the solution for the active Mentor Mode objective after the learner explicitly asks. Use only when the user runs /reveal or explicitly asks to be shown the solution code.
---

# Reveal

## Confirm Intent

Reveals are for genuine walls, not friction. Confirm once, briefly: this goes on the re-derive queue and comes back in a future warmup. If the learner has not yet made a real attempt and walked the hint ladder, offer the next hint level first - but an explicit "reveal it" wins. Never nag twice.

## Unlock And Log

1. In `mentor/guard.json`: set reveal.active true, reveal.objectiveId to the active objective id, grantedAt to the current ISO timestamp.
2. Append to revealQueue: objectiveId, a short concept label, revealedAt date, status "pending".
3. Add or update the ledger row for the revealed concept now: status explained, confidence fail, interval at the first reviewIntervalsDays value, last reviewed today, next review tomorrow, with a note that it was revealed. The warmup re-derivation later upgrades it to re-derived.

## Provide The Solution

Write or show the solution for the specific thing the learner is stuck on - the objective's scope, nothing extra. Explain it line by line at the learner's level: what each part does and why this shape rather than the obvious alternative. If writing into protected files, keep it minimal and idiomatic.

## Re-lock

Immediately after delivering the solution: set reveal.active false and reveal.objectiveId null in `mentor/guard.json`. Reveals are one-shot. As a backstop, the hook ignores any reveal whose grantedAt is older than 2 hours.

## After

The objective stays in-progress until the learner can explain the revealed code back. Do that explain-back now. The code returns in a future warmup for re-derivation from memory.
