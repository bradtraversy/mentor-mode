<h1 align="center">Mentor Mode</h1>

<p align="center"><strong>A per-repo AI workflow pack that teaches you to build your project instead of building it for you.</strong></p>

> Working title, v0.1, personal use. Final name, installer, and public distribution come after the pack survives real curriculum use.

You write a one-page spec of what you want to build. The AI turns it into a
curriculum, then takes you on the journey of building it with your own hands -
which file to create, what to write, and what is actually happening - while a
hook physically prevents it from writing the code you are supposed to learn.

Install it into any Git repository:

```bash
node scripts/install.mjs /path/to/your-repo
```

## What this is

AI-assisted development quietly turns developers into reviewers. You ship
constantly, but the code stops going through your fingers, and reviewing AI
output is recognition, not recall. Skills decay while velocity goes up. The
usual fixes fail: tutorials are passive, courses are generic, and "just turn
the AI off" throws away a workflow that is legitimately better for shipping.

Mentor Mode flips the relationship inside a real project:

1. **Spec in, journey out.** One page at `mentor/SPEC.md` becomes a curriculum
   of phases and objectives that you approve before anything activates.
2. **You write the code that matters.** The learning-critical code is typed by
   you. The AI scaffolds plumbing, config, boilerplate, and repetitive tests
   freely - then explains what it created and why.
3. **The contract is enforced, not aspirational.** A PreToolUse hook blocks AI
   writes to the active objective's protected paths, including honest shell
   writes. Asking nicely at 9pm does not work.
4. **Attempt before answer.** Stuck means a hint ladder - nudge, concept,
   pseudocode. A full solution appears only after you explicitly ask via
   `/reveal`, and everything revealed comes back in a later session to be
   rewritten from memory.
5. **Progress is a file, not a feeling.** A ledger tracks what you can explain
   and produce, with spaced review dates. Warmup drills at the start of every
   session are generated from it.

The point is not to type more. It is to finish a real project and end up
knowing how it works.

## At a glance

| Principle | What it means |
| ---- | ---- |
| Spec first | `mentor/SPEC.md` says what to build; `/mentor-init` turns it into an approved curriculum. |
| Objective-scoped protection | Only the current learning objective's paths are guarded; everything else stays AI-writable. |
| Hint ladder | Nudge, then concept, then pseudocode. Solutions only through `/reveal`, one-shot, logged. |
| Explain-back gate | An objective completes when your explanation survives probing, not when the code runs. |
| Spaced recall | Ledger items return at 1, 3, 7, 21 days; revealed code returns as re-derivation from memory. |
| Fading support | L1 guided walkthrough early, L2 spec-and-attempt, L3 solo build - per objective, promoted with your consent. |
| File-backed state | Curriculum, ledger, guard, and session logs are files in `mentor/`; clearing context costs nothing. |
| Local only | No cloud, no telemetry, no accounts. Uninstall removes the pack and leaves your repo untouched. |

## Contents

- [What this is](#what-this-is)
- [Quick start](#quick-start)
- [The spec you own](#the-spec-you-own)
- [What gets generated](#what-gets-generated)
- [A session, step by step](#a-session-step-by-step)
- [Support levels and the fade](#support-levels-and-the-fade)
- [The guardrail](#the-guardrail)
- [Reveals and re-derivation](#reveals-and-re-derivation)
- [Spaced recall and the ledger](#spaced-recall-and-the-ledger)
- [Command reference](#command-reference)
- [The subagents](#the-subagents)
- [Picking up where you left off](#picking-up-where-you-left-off)
- [Uninstall](#uninstall)
- [File map](#file-map)
- [Known limitations](#known-limitations)
- [Notes](#notes)

## Quick start

Prerequisites:

- Node.js 18 or newer
- Claude Code
- a Git repository to learn in - fresh and empty works, an existing codebase works too

**1. Install the pack** from a clone of this repo:

```bash
node scripts/install.mjs /path/to/your-repo
```

This copies the skills, subagents, and guard hook into the target's `.claude/`,
registers the hook in `.claude/settings.json` (existing settings are preserved
and the merge is idempotent), seeds `mentor/` from templates without touching
any existing state, and appends the Mentor Mode rules block to the target's
`CLAUDE.md`.

**2. Write the spec.** Create `mentor/SPEC.md` (or `SPEC.md` at the repo root)
in the target repo. One page is plenty; see [The spec you own](#the-spec-you-own).

**3. Initialize.** Open a Claude Code session in the target repo (restart it if
it was already open, so the new skills load) and run:

```text
/mentor-init
```

It reads your spec automatically, asks a short interview for whatever the spec
did not answer, spawns the curriculum planner, and shows you the phases and
first objectives. Nothing activates until you approve. On approval it points
the guard at the first objective and confirms the hook actually blocks.

**4. Run sessions.** Each working session is one loop:

```text
/mentor          start: recall warmup, then today's objective
                 ... you build, with walkthrough or hints per the level ...
/mentor-review   teaching review of what you wrote
/mentor-wrap     end: explain-back gate, state updates, session log
```

**5. Between sessions**, optionally:

```text
/mentor-quiz     on-demand recall drill
/explain <x>     concept deep-dive grounded in your own code
```

> [!IMPORTANT]
> `/mentor-init` runs once per project. `/mentor` starts every session and
> `/mentor-wrap` ends it. Wrap before clearing context - it is the save-game
> step that writes the session into `mentor/`.

## The spec you own

`mentor/SPEC.md` is the only document you have to write. It is a statement of
intent, not a design document. Cover, roughly:

- **What it is** - the thing you want to exist, in a few sentences.
- **Stack** - what you want to build it with (and learn).
- **Features** - a rough list, ordered if you care about order.
- **Learning intent** - what feels rusty, what to go deep on, what to skip.

Example:

```markdown
# Spec - Repo Command Center

A local web tool that scans ~/Code and shows every repo's state at a glance:
branch, dirty/clean, ahead/behind, last commit, stale branches, CI status.

Stack: pnpm workspaces + Turborepo, TypeScript, Node API, React + Vite,
SQLite. I want to understand the monorepo plumbing, not just use it.

Features: scanner CLI first, then a JSON API with caching, then the dashboard
with filters, then GitHub CI status, then per-repo notes with persistence.

Learning: rusty on modern TS, async patterns, React beyond recognition, and
testing by hand. Go deep on Node fundamentals. Skip deployment for now.
```

The curriculum planner reads this plus your interview answers, explores the
repo if code already exists, and drafts `mentor/curriculum.md`. You approve or
adjust it before the guard turns on. The curriculum is yours to edit by hand at
any time; the field format is documented inside the file.

## What gets generated

Everything lives in `mentor/` in the target repo, human-readable and
git-trackable:

| File | What it is |
| ---- | ---- |
| `mentor/SPEC.md` | Yours. What to build and what to learn. The only file you must write. |
| `mentor/curriculum.md` | Phases and objectives: id, support level, protected paths, spec, checkpoint, status. Drafted by the planner, approved and editable by you. |
| `mentor/guard.json` | The live protection state: active objective, protected globs, reveal flag, re-derive queue. Read by the hook on every AI write. |
| `mentor/ledger.md` | What you can explain and produce: status, confidence, review interval, next review date. Feeds every warmup. |
| `mentor/config.json` | Learner profile, cadence, debug solo window, hint ladder, support level definitions, review intervals. |
| `mentor/sessions/` | One log per session: what you built, hints used, reveals, explain-back result, what is next. |

## A session, step by step

**Warmup.** `/mentor` collects every ledger item due for review plus any
pending re-derivations, and the quizmaster generates 2-5 questions. Revealed
code always comes first: you rewrite it from memory in your editor. Grading is
honest - shaky is shaky - and each drilled item gets a new review date. Under
ten minutes, always.

**Objective.** The skill announces the active objective, its support level, its
spec, and its checkpoint, plus a short concept brief: why this thing exists and
where it fits. No code yet.

**The build.** You write, in your editor, at the current support level (see
below). When you are stuck, the hint ladder starts at a nudge and only reaches
pseudocode. When your code breaks, you get a solo debugging window (default 15
minutes, configurable) before the mentor says anything - debugging is the
fastest-atrophying skill, so broken states are treated as curriculum, not
obstacles.

**Review.** `/mentor-review` diffs your work and spawns the reviewer, which
teaches rather than patches: what is genuinely good, what is wrong and what
breaks because of it, and two or three probing questions answered one at a
time. It never fixes protected code - if you want the fix written, that is a
reveal.

**Wrap.** `/mentor-wrap` runs the explain-back gate: you explain what you
built, why it is shaped that way, and what would break if. Pass it and the
objective completes, the guard moves to the next objective, the ledger gains
rows, and a session log is written. Fail it and the objective stays open, with
exactly what remains stated plainly.

## Support levels and the fade

Every objective has a support level, assigned by the planner and adjustable by
you:

| Level | Name | What it looks like |
| ---- | ---- | ---- |
| L1 | Guided walkthrough | The mentor names the exact file to create or open, dictates the next small chunk for you to type, and narrates what it does and why before moving on. The default for early phases. |
| L2 | Spec and attempt | The mentor specs the behavior and shapes; you implement; review comes after. The middle of the curriculum. |
| L3 | Solo build | You get the objective and nothing else; the review is the teaching. Where the curriculum ends up. |

The fade is the point. If the whole curriculum stays L1, it is a tutorial with
extra steps. When two consecutive objectives at a level pass explain-back
without reveals, the wrap recommends promotion - and you decide.

## The guardrail

The hook is a PreToolUse hook registered against Edit, Write, MultiEdit,
NotebookEdit, and Bash. On every AI write it reads `mentor/guard.json` and
decides:

- **No guard file** - the repo is not in Mentor Mode; everything is allowed
  (fail open).
- **Unreadable or malformed guard file** - every guarded evaluation is blocked
  until the file is fixed (fail closed). A crash can never silently disable
  protection.
- **Protected path, no valid reveal** - blocked, with a teaching message that
  names the objective and points at the hint ladder.
- **Anything else** - allowed. Scaffolding, config, styles, fixtures, tests,
  unrelated packages: all fair game.

Shell writes are covered by an operand-aware heuristic: redirect targets and
the arguments of write commands (`tee`, `mv`, `cp`, `rm`, `sed -i`, and
friends) are checked against the protected globs. Reading protected files is
never blocked - `grep`, `cat`, and `git log` on protected paths pass.

Protected paths use a deliberately small glob dialect: `*`, `**`, `?`, and
literals. A bare directory path (or one ending in `/`) protects everything
under it. Braces and character classes are rejected as configuration errors -
loudly, fail closed - rather than silently protecting nothing.

## Reveals and re-derivation

`/reveal` is the only sanctioned way to get a solution written for you:

1. It confirms once (a reveal goes on the re-derive queue), flips the unlock in
   `guard.json`, and logs the item.
2. The solution is written or shown, scoped to what you are stuck on, and
   explained line by line.
3. The unlock is re-locked immediately after. Reveals are one-shot, and the
   hook additionally expires any reveal older than two hours as a backstop.
4. The revealed concept enters the ledger and returns in a future warmup as
   question one: rewrite it from memory. Revealed means re-derived, or it does
   not count.

## Spaced recall and the ledger

`mentor/ledger.md` is a table of concepts with a status
(`explained` - covered but not yet used, `applied` - used in real code,
`re-derived` - reproduced from memory after a reveal), a confidence
(`pass`, `shaky`, `fail`), and a review interval.

Intervals come from `config.json` (`reviewIntervalsDays`, default 1, 3, 7, 21):
pass a drill and the interval advances to the next value (staying at the last
one from then on); fail and it resets to the first. Warmups and `/mentor-quiz`
both drill whatever is due and update the dates. Nothing about this is a
sophisticated SRS - it is due dates in a markdown table you can read and edit.

## Command reference

| Skill | Run it | Does |
| ----- | ------ | ---- |
| **/mentor-init** | once per project | Finds and reads your spec, interviews for the gaps, spawns the curriculum planner, gets your approval, activates the first objective, and proves the guard blocks. |
| **/mentor** | every session start | Clears any stale reveal, runs the recall warmup from the ledger and re-derive queue, announces the objective with a concept brief, and syncs the guard. |
| **/mentor-review** | after an attempt | Diffs your work and relays a teaching review: strengths, ranked issues with the concept underneath, probing questions one at a time. Never patches protected code. |
| **/reveal** | only when you explicitly ask | One-shot unlock: logs the item to the re-derive queue, writes the solution with a line-by-line explanation, re-locks immediately. |
| **/mentor-quiz** | any time between sessions | On-demand drill from the ledger - due items first, then weakest - with honest grading and updated review dates. |
| **/explain** | any time | Concept deep-dive at your level using your own codebase for examples. Adds the concept to the ledger as explained. |
| **/mentor-wrap** | every session end | Explain-back gate, ledger and curriculum updates, guard advance, session log, next-session preview, and promotion recommendations. |

These are the structured path, not a cage. You can talk to the session
normally at any time - the CLAUDE.md rules block keeps even freeform chat
inside the teaching contract.

## The subagents

Installed as project agents in `.claude/agents/`, spawned by the skills:

| Agent | Job |
| ----- | ---- |
| **mentor-reviewer** | Teaching-first review of your diff: correctness, understanding signals, idiom. Produces probing questions. Never edits files. |
| **quizmaster** | Turns ledger rows and re-derive items into recall questions with expected answer cores and pass bars. Never multiple choice. |
| **curriculum-planner** | Drafts and maintains the curriculum: one-session objectives, observable checkpoints, narrow protected globs, fading levels. Re-checks globs against the real repo at phase boundaries. |
| **concept-explainer** | Level-matched deep dives grounded in your real files: mechanism, why it exists, where it lives in your code, the one misconception. |

## Picking up where you left off

The chat is disposable; `mentor/` is the memory. The rhythm across context
clears:

1. `/mentor-wrap` - writes the session into the state files.
2. Clear context, close the laptop, come back Thursday.
3. `/mentor` - reads the state files and resumes exactly: drills what is due,
   opens the next objective.

Forgot to wrap? Not fatal. The guard keeps protecting and the curriculum still
shows the objective in progress; the next `/mentor` finds your code in the diff
and reconstructs. You lose that session's ledger updates and log. Build the
wrap-then-clear habit anyway - same muscle as commit-before-switching-branches.

## Uninstall

```bash
node scripts/uninstall.mjs /path/to/your-repo          # keeps mentor/ state
node scripts/uninstall.mjs /path/to/your-repo --purge  # removes mentor/ too
```

Removal is manifest-scoped: only what the installer created is touched. Your
own skills, agents, settings, and CLAUDE.md content survive, even on name
collisions - the installer refuses to overwrite anything it does not own and
warns instead.

## File map

The pack repo (this repository):

```text
mentor-mode/
  skills/            seven session skills (source)
  agents/            four subagents (source)
  hooks/
    mentor-guard.mjs the guardrail hook
    guard.test.mjs   its test suite (npm test)
  templates/
    mentor/          state files seeded into a target repo
    CLAUDE-block.md  the rules block appended to a target's CLAUDE.md
  scripts/
    install.mjs      idempotent installer
    uninstall.mjs    manifest-scoped uninstaller
```

A target repo after install and init:

```text
your-repo/
  .claude/
    skills/          mentor-init, mentor, mentor-review, reveal,
                     mentor-quiz, explain, mentor-wrap
    agents/          mentor-reviewer, quizmaster, curriculum-planner,
                     concept-explainer
    hooks/mentor-guard.mjs
    settings.json    hook registered (your settings preserved)
    mentor-manifest.json
  mentor/
    SPEC.md          yours
    curriculum.md    approved plan
    guard.json       live protection state
    ledger.md        what you can explain, with review dates
    config.json      learner profile and knobs
    sessions/        one log per session
  CLAUDE.md          your content plus the Mentor Mode rules block
```

## Known limitations

- The guard depends on Claude Code hook execution; other harnesses need their
  own adapters.
- Bash blocking is an operand-aware heuristic, not shell parsing. Determined
  circumvention can evade it; the CLAUDE.md block forbids circumvention as
  policy and the hook catches the honest cases. This is a practice-contract
  enforcer, not a security boundary.
- Path matching is case-sensitive; on case-insensitive filesystems a
  differently cased path can slip past.
- Protected globs support `*`, `**`, `?`, and literals only, by design.
- Spaced repetition is simple due dates, not a full SRS.
- Install is by local script; no npx installer yet.

## Notes

### This is not AI Blueprint

[AI Blueprint](https://github.com/bradtraversy/ai-blueprint) controls
AI-written production code: spec first, small reviewed diffs, findings with
teeth. Mentor Mode is the same instinct pointed the other way - here the AI is
not the one writing the code that matters, so the control apparatus becomes a
teaching apparatus. The curriculum is the plan, explain-back is the
verification gate, the ledger is the findings history.

A repo is one or the other. Shipping repo: Blueprint owns the loop and the AI
writes the code. Learning repo: Mentor Mode owns the loop and you write the
code. If a learning project grows into a real product, graduating it to
Blueprint is a decision, not a default.

### This is not a course platform

There is no canned content. Curricula are generated from your spec, your repo,
and your gaps, then approved by you. Two people using Mentor Mode on the same
stack get different journeys.

### The state is yours

Everything in `mentor/` is plain markdown and JSON, committed with your repo if
you want. Read it, edit it, grep it. If you stop using the pack tomorrow, your
learning history is still just files.
