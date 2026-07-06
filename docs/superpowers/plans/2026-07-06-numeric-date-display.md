# Numeric Date Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update frontend date display helpers to render numeric year-month-day dates such as `2026.6.1`.

**Architecture:** Keep the change centralized in shared date helpers, with small companion updates for Space and timezone rendering defaults. Machine-readable formats remain unchanged.

**Tech Stack:** TypeScript, date-fns, pnpm workspace checks.

---

### Task 1: Shared Date Display Helpers

**Files:**

- Create: `packages/utils/src/datetime.test.ts`
- Modify: `packages/utils/src/datetime.ts`
- Modify: `packages/utils/package.json`

- [x] **Step 1: Write the failing test**

Add tests that expect `renderFormattedDate("2026-06-01")` to return `2026.6.1`, `renderFormattedDateWithoutYear("2026-06-01")` to return `6.1`, `formatDateRange(new Date(2025, 0, 24), new Date(2025, 1, 6))` to return `2025.1.24 - 2025.2.6`, and `renderFormattedPayloadDate("2026-06-01")` to remain `2026-06-01`.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=@plane/utils test -- datetime.test.ts`
Expected: FAIL because the current helpers still return month-name formats.

- [x] **Step 3: Write minimal implementation**

Change default display tokens in `packages/utils/src/datetime.ts` from `MMM dd, yyyy` to `yyyy.M.d`, change the no-year token from `MMM dd` to `M.d`, and simplify `formatDateRange` to display full numeric endpoints.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter=@plane/utils test -- datetime.test.ts`
Expected: PASS.

### Task 2: App-Specific Frontend Defaults

**Files:**

- Modify: `apps/space/helpers/date-time.helper.ts`
- Modify: `apps/web/core/hooks/use-timezone-converter.tsx`

- [x] **Step 1: Update Space local helper**

Change the display token in `apps/space/helpers/date-time.helper.ts` to `yyyy.M.d` and update examples/comments.

- [x] **Step 2: Update Web timezone helper default**

Change the default token in `apps/web/core/hooks/use-timezone-converter.tsx` to `yyyy.M.d`.

- [x] **Step 3: Run targeted checks**

Run: `pnpm --filter=@plane/utils test -- datetime.test.ts` and `pnpm --filter=@plane/utils check:types`.
Expected: PASS.
