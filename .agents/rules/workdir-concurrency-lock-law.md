<!-- coalmine: verified 2026-08-08 · exemplar: flock(1)/lockfile advisory-locking pattern (mtime-as-heartbeat, stale-timeout reclaim) — no equivalent existed in this repo's rule set before a live collision forced it · revalidate 90d -->

# Working-Directory Concurrency Lock Law

> **Scope**: binding for every agent (human or AI) operating in **this one checked-out working directory** — `C:\Users\zxc59\source\repos\LegendofSoulTH` on HetCreep's machine. Distinct from `multi-dev-task-queue-law.md`, which prevents two devs claiming the same _logical task_; this law prevents two agents mutating the same _physical working tree_ (branch checkout, commit, stage/unstage) at the same instant.

## Why (real incident, not hypothetical)

2026-08-08: a Claude Code session was mid-review of uncommitted changes on `feat/currency-system-tests` (`src/data/accountRepository.ts`/`.test.ts`, staged but not committed) while an Antigravity session, running concurrently in the **same** working directory, committed that exact work (`18f05fe`), checked out `master`, then checked out a new branch `feat/hero-collection-tests` and committed again (`b4c5edf`) — all invisible to the Claude session until its next tool call. No data was lost this time (the content matched what Claude had already staged), but a `git checkout` mid-review can silently discard another agent's uncommitted edits any time the branches disagree on a tracked file. This is a working-tree race, not a task-claim race — `multi-dev-task-queue-law.md`'s row-locking does nothing to prevent it, since both agents can hold _different, correctly-claimed_ rows and still collide in the shared directory.

## The rule

Before any working-tree-mutating action (branch checkout/switch, `git add`/commit, `git stash`, `git reset`) in this directory, check the lock:

1. **Lock file**: `.agents/workdir.lock` (gitignored, machine-local, never committed). JSON: `{"agent": "<name>", "pid": "<best-effort>", "branch": "<branch at acquire time>", "since": "<ISO8601>"}`.
2. **Acquire**: no lock file, or its `since` is older than **`staleAfterMinutes` (default 20)** → write your own lock before mutating the tree.
3. **Contend**: a fresh lock (`since` within `staleAfterMinutes`) held by a **different** `agent` → **delay**: wait and re-check (short backoff, e.g. 30–60s, a few retries) rather than mutating immediately. Still contended after retries → tell the human directly ("Antigravity/Claude appears active in this directory right now — pausing writes until it clears") instead of proceeding blind. Read-only work (grep/read/plan) never needs the lock.
4. **Refresh**: update `since` on every mutating action while your session continues working, so a long session doesn't look stale to the other agent.
5. **Release**: delete `.agents/workdir.lock` when your working-tree work in this session is done. A crash/interrupt leaving it behind is fine — the staleness timeout (step 2) reclaims it; never treat an old lock as a permanent block.

## Honest limits

This is **advisory, not OS-enforced** — it only works if every agent's own rule-loading (AGENTS.md → `.agents/rules/**`) actually reads and honors it before mutating the tree, the same trust basis `multi-dev-task-queue-law.md` already runs on for row-claiming. It does not prevent a collision from a tool that never reads `AGENTS.md` at all. For a stronger guarantee, isolate each agent into its **own** working directory (`git worktree add`) instead of sharing one — this law is the cheap first line, not a replacement for that if collisions keep recurring.
