# Curriculum - <project name>

> Maintained by /mentor-init and the curriculum-planner agent. Each objective's `protectedPaths` and `status` drive `mentor/guard.json`: when an objective becomes active, its id, title, and protectedPaths are copied into `guard.json` by /mentor or /mentor-wrap. Humans may edit this file; keep the field lines intact.

Active objective: none

## Phase 0 - <phase name>

Status: not-started

### Objective 0.1 - <objective title>

- id: 0.1-<slug>
- level: L2
- protectedPaths: []
- status: not-started
- spec: <what the learner will build, concretely>
- checkpoint: <observable result that proves it works>

<!--
Field notes:
- level: L1 (dictate) | L2 (spec and attempt) | L3 (solo build). L2 is the default.
- protectedPaths: repo-root-relative globs the AI must not write while this objective is active. Empty list means nothing is protected (scaffold or walkthrough objectives). Dialect: * ** ? and literals only - no braces, no character classes. A bare directory path, or one ending in /, protects everything under it.
- status: not-started | in-progress | complete
-->
