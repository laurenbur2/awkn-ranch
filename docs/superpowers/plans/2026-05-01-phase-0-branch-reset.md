# Phase 0 — Branch Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-reset `miceli` to `origin/main` while preserving and restoring 6 valuable doc files (STATUS.md, TODO.md, AWKN-customized CLAUDE.md, docs/ECOSYSTEM-MAP.md, the program-level spec, and this plan), so the branch matches `main` plus a clean single commit restoring those docs.

**Architecture:** Save → reset → restore → commit. No code, no tests — pure git + file operations. Verification is via git state checks and file comparisons. Reversible via `git reflog` for ~30 days if anything goes wrong.

**Tech Stack:** git, bash. Save location: `/Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/` (sibling directory outside the repo).

---

## File Structure

**Files preserved across reset (the "save list"):**
- `/Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/STATUS.md`
- `/Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/TODO.md`
- `/Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/CLAUDE.md`
- `/Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/ECOSYSTEM-MAP.md`
- `/Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`
- `/Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/plans/2026-05-01-phase-0-branch-reset.md` (this plan itself)

**Save destination structure:**
```
/Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/
├── STATUS.md
├── TODO.md
├── CLAUDE.md
├── ECOSYSTEM-MAP.md
└── superpowers/
    ├── specs/
    │   └── 2026-05-01-cleanup-and-nextjs-refactor-design.md
    └── plans/
        └── 2026-05-01-phase-0-branch-reset.md
```

---

## Task 1: Verify pre-reset state

**Files:**
- (read-only)

- [ ] **Step 1: Confirm current branch is `miceli`**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN branch --show-current
```

Expected output: `miceli`

If different: `STOP`. Switch with `git checkout miceli` only after user confirms.

- [ ] **Step 2: Confirm working tree is clean (no uncommitted changes)**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN status --short
```

Expected output: empty (no modified or untracked files **except** the new plan file `docs/superpowers/plans/2026-05-01-phase-0-branch-reset.md` which is currently untracked).

If anything else is modified or untracked: `STOP` and ask user before proceeding.

- [ ] **Step 3: Confirm `miceli` is exactly 4 commits ahead of `origin/main`**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN fetch origin
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log --oneline origin/main..miceli
```

Expected output (4 commits, in this order from newest):
```
55f060d docs: program-level spec for cleanup + Next.js refactor (8 phases)
456c0de docs: add STATUS.md and TODO.md, capture session handoff state
5791071 docs: customize CLAUDE.md for AWKN, mark alpaca residue as vestigial
bdf5ed2 docs: AWKN ecosystem map — surface inventory, Next.js fit, phased roadmap
```

If different commit count or hashes: `STOP` and reassess. New commits may have landed on origin/main since the spec was written.

- [ ] **Step 4: Capture the pre-reset commit SHA for reflog reference**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN rev-parse miceli
```

Record the output (40-char SHA). This is the recovery anchor if reset goes wrong — `git reset --hard <SHA>` reverts everything.

---

## Task 2: Save preservation files to sibling directory

**Files:**
- Create: `/Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/` and contents

- [ ] **Step 1: Create the save directory**

```bash
mkdir -p /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/superpowers/specs
mkdir -p /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/superpowers/plans
```

Verify:
```bash
ls -la /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/
```

Expected: directory exists with `superpowers/` subdir.

- [ ] **Step 2: Copy the 4 root-level docs**

```bash
cp /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/STATUS.md /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/STATUS.md
cp /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/TODO.md /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/TODO.md
cp /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/CLAUDE.md /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/CLAUDE.md
cp /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/ECOSYSTEM-MAP.md /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/ECOSYSTEM-MAP.md
```

- [ ] **Step 3: Copy the spec and the plan**

```bash
cp /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md
cp /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/plans/2026-05-01-phase-0-branch-reset.md /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/superpowers/plans/2026-05-01-phase-0-branch-reset.md
```

- [ ] **Step 4: Verify all 6 files saved with correct sizes**

```bash
ls -la /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/ /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/superpowers/specs/ /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/superpowers/plans/
```

Expected: all 6 files present, non-zero sizes.

- [ ] **Step 5: Compute checksums for post-reset comparison**

```bash
shasum -a 256 \
  /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/STATUS.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/TODO.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/CLAUDE.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/ECOSYSTEM-MAP.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/superpowers/plans/2026-05-01-phase-0-branch-reset.md
```

Record all 6 hashes. They'll be used in Task 4 to verify the restore is byte-identical.

---

## Task 3: Hard-reset `miceli` to `origin/main` and force-push

**Files:**
- Modify: `miceli` branch state (local + remote)

- [ ] **Step 1: Hard-reset local `miceli` to `origin/main`**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN reset --hard origin/main
```

Expected output: `HEAD is now at <sha> <commit message of origin/main HEAD>`

- [ ] **Step 2: Verify local `miceli` now matches `origin/main`**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log --oneline origin/main..miceli
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log --oneline miceli..origin/main
```

Expected: both commands return empty output (zero divergence).

- [ ] **Step 3: Verify the 6 docs are gone from the working tree**

```bash
ls -la /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/STATUS.md /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/TODO.md /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/ECOSYSTEM-MAP.md 2>&1 | head -10
```

Expected: 3 `No such file or directory` errors (STATUS, TODO, ECOSYSTEM-MAP did not exist on `main`). `CLAUDE.md` does still exist but is the pre-AWKN version.

```bash
ls -la /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/ 2>&1
```

Expected: `No such file or directory` (the entire superpowers dir is gone).

- [ ] **Step 4: Force-push the reset to `origin/miceli`**

⚠️ Destructive operation. This rewrites `origin/miceli`. The user has explicitly approved this.

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN push --force-with-lease origin miceli
```

Expected output: `+ <old-sha>...<new-sha> miceli -> miceli (forced update)`.

`--force-with-lease` (not bare `--force`) protects against overwriting unexpected upstream changes — it fails if origin/miceli has new commits we haven't fetched.

- [ ] **Step 5: Verify origin/miceli now matches origin/main**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN fetch origin
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log --oneline origin/main..origin/miceli
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log --oneline origin/miceli..origin/main
```

Expected: both commands return empty output.

---

## Task 4: Restore preserved docs to working tree

**Files:**
- Restore: STATUS.md, TODO.md, CLAUDE.md, docs/ECOSYSTEM-MAP.md, docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md, docs/superpowers/plans/2026-05-01-phase-0-branch-reset.md

- [ ] **Step 1: Recreate the superpowers subdirectories in the repo**

```bash
mkdir -p /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/specs
mkdir -p /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/plans
```

- [ ] **Step 2: Copy the 4 root-level docs back**

```bash
cp /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/STATUS.md /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/STATUS.md
cp /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/TODO.md /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/TODO.md
cp /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/CLAUDE.md /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/CLAUDE.md
cp /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/ECOSYSTEM-MAP.md /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/ECOSYSTEM-MAP.md
```

- [ ] **Step 3: Copy the spec and plan back**

```bash
cp /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md
cp /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/superpowers/plans/2026-05-01-phase-0-branch-reset.md /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/plans/2026-05-01-phase-0-branch-reset.md
```

- [ ] **Step 4: Verify byte-identity via SHA-256 (uses the hashes captured in Task 2 Step 5)**

```bash
shasum -a 256 \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/STATUS.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/TODO.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/CLAUDE.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/ECOSYSTEM-MAP.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/plans/2026-05-01-phase-0-branch-reset.md
```

Compare each hash to the corresponding value recorded in Task 2 Step 5. They must match exactly. If any mismatch: `STOP`, investigate.

- [ ] **Step 5: Confirm git sees the restore as new files / modifications**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN status --short
```

Expected output:
```
 M CLAUDE.md
?? STATUS.md
?? TODO.md
?? docs/ECOSYSTEM-MAP.md
?? docs/superpowers/
```

`CLAUDE.md` shows as modified (was on main, AWKN-customized version replaces it). Others are untracked (didn't exist on main).

---

## Task 5: Commit the restored docs

**Files:**
- Modify: `miceli` branch (single new commit)

- [ ] **Step 1: Stage all 6 restored files explicitly**

Avoid `git add .` or `-A` to prevent staging anything unintended.

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN add \
  STATUS.md \
  TODO.md \
  CLAUDE.md \
  docs/ECOSYSTEM-MAP.md \
  docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md \
  docs/superpowers/plans/2026-05-01-phase-0-branch-reset.md
```

- [ ] **Step 2: Verify staging is exactly the 6 files**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN diff --cached --name-only
```

Expected output (exactly 6 lines, in any order):
```
CLAUDE.md
STATUS.md
TODO.md
docs/ECOSYSTEM-MAP.md
docs/superpowers/plans/2026-05-01-phase-0-branch-reset.md
docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md
```

- [ ] **Step 3: Create the restore commit**

```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN && git commit -m "$(cat <<'EOF'
docs: restore AWKN project docs + cleanup/refactor spec after miceli reset

Re-applies the 4 docs (STATUS.md, TODO.md, AWKN-customized CLAUDE.md,
docs/ECOSYSTEM-MAP.md) plus the program-level cleanup spec and Phase 0
plan after hard-resetting miceli to origin/main. The original commits
on miceli (456c0de, 5791071, bdf5ed2, 55f060d) are recoverable via
git reflog if needed; this commit consolidates them into a single
restore checkpoint on a clean miceli.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verify the commit landed**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log --oneline -2
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log --stat -1
```

Expected: top commit shows the restore message and lists exactly 6 files changed (`CLAUDE.md` modified; the other 5 created).

---

## Task 6: Push restored `miceli` to origin

**Files:**
- Modify: `origin/miceli` (one new commit)

- [ ] **Step 1: Push without force (this is a fast-forward over the just-reset origin/miceli)**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN push origin miceli
```

Expected output: `<old-sha>..<new-sha>  miceli -> miceli` (fast-forward, no `(forced update)`).

- [ ] **Step 2: Verify origin state**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN fetch origin
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log --oneline origin/main..origin/miceli
```

Expected output: exactly 1 line — the restore commit.

---

## Task 7: Final validation + cleanup

**Files:**
- Read-only checks; optional cleanup of save directory

- [ ] **Step 1: Confirm all 6 files exist in their final paths**

```bash
ls -la \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/STATUS.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/TODO.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/CLAUDE.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/ECOSYSTEM-MAP.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/superpowers/plans/2026-05-01-phase-0-branch-reset.md
```

Expected: all 6 listed, no errors.

- [ ] **Step 2: Confirm `miceli` is exactly 1 commit ahead of `main`**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log --oneline origin/main..miceli
```

Expected output: exactly 1 line (the restore commit).

- [ ] **Step 3: Confirm working tree is clean**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN status
```

Expected: `nothing to commit, working tree clean` and `Your branch is up to date with 'origin/miceli'.`

- [ ] **Step 4: Decide on save directory cleanup**

The save directory is no longer needed but leaving it for ~1 sprint is a cheap insurance policy in case any of the docs need to be re-checked against their pre-reset versions.

**Default:** leave the save directory in place. Note its existence in the Phase 0 handoff. Delete it at the start of Phase 2 (or any later time).

To delete now (only if user explicitly requests):
```bash
rm -rf /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/
```

- [ ] **Step 5: Phase 0 complete — handoff**

Phase 0 is done. Recommended next steps for the user:
- Run `/handoff` to update STATUS.md / TODO.md to reflect post-Phase-0 state.
- Either continue in this session into Phase 1 brainstorm, or `/smart-compact` and start Phase 1 in a fresh session.

---

## Self-Review Notes

**Spec coverage check:** Phase 0 in the spec (section 6) lists 6 sub-steps. This plan implements all 6 across Tasks 1-7 (validation tasks added: Task 1 pre-flight check, Task 7 post-flight validation).

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "similar to" placeholders. All commands and expected outputs are explicit.

**Risk recap:**
- The pre-reset SHA captured in Task 1 Step 4 (`55f060d` is the current HEAD) is the recovery anchor.
- `--force-with-lease` (not `--force`) prevents stomping on anyone else's work.
- The save directory survives even if every git operation fails.
- Worst case: `git reset --hard <pre-reset-sha>` and `git push --force-with-lease origin miceli` undoes everything.
