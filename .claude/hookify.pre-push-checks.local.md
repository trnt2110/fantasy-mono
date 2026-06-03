---
name: pre-push-quality-gate
enabled: true
event: bash
pattern: git\s+push
action: warn
---

## Pre-Push Quality Gate

Before this `git push` runs, you MUST complete all four checks below. Do not proceed with the push until every check passes.

**Working directory:** `/Users/trung/fantasy/.worktrees/fantasy-game/apps/api`

### Step 1: Linter
```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm lint 2>/dev/null || echo "No lint script — skipping"
```
Block the push if lint errors are found and fix them first.

### Step 2: TypeScript check
```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit
```
Block the push if there are TypeScript errors and fix them first.

### Step 3: Security review
Use the Agent tool to launch the `pr-review-toolkit:silent-failure-hunter` agent on the files changed in the last commit:
```bash
git diff HEAD~1 --name-only
```
Pass those file paths to the agent. Fix any CRITICAL or HIGH findings before pushing.

### Step 4: Code review
Use the Agent tool to launch the `pr-review-toolkit:code-reviewer` agent on the same changed files. Fix any high-confidence bugs or violations before pushing.

---

**Only proceed with `git push` after all four steps pass.**
If you already completed all checks in this session and they passed, you may proceed.
