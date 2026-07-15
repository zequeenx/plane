# Table Column Chip Interaction Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the stuck reorder-tooltip and stale enabled-color regressions in Table Layout display-property chips.

**Architecture:** `Draggable` will expose its authoritative drag state through the existing Sortable render-helper contract, and the chip will disable its Tooltip while that state is active. `FilterDisplayProperties` will snapshot each field's enabled boolean while its MobX observer is rendering, so nested observable changes invalidate the parent before the value crosses into Sortable's unobserved render callback.

**Tech Stack:** React, TypeScript, MobX, Atlaskit Pragmatic Drag and Drop, Vitest, React server rendering.

---

## File Map

- `packages/ui/src/sortable/sortable.tsx`: add `isDragging` to the public Sortable render-helper type.
- `packages/ui/src/sortable/draggable.tsx`: pass the current drag state to the render callback.
- `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-property-chip.tsx`: disable the reorder Tooltip while dragging.
- `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx`: snapshot `isEnabled` in observed option data and forward drag state.
- `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx`: cover both regressions and toggle directions.

## Task 1: Add Red Regression Coverage

**Files:**

- Modify: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx`

- [ ] **Step 1: Extend the test harness with drag state and enabled-state metadata**

Update the local option and helper types:

```ts
type TDisplayPropertyOption = {
  key: keyof IIssueDisplayProperties;
  label: string;
  isEnabled: boolean;
};

type TSortableRenderHelpers = {
  dragHandleRef: React.RefCallback<HTMLButtonElement>;
  isDragging: boolean;
};
```

Add `isDragging: false` to the hoisted mocks, pass it from the mocked Sortable to `props.render`, and expose Tooltip's disabled state in its test markup:

```tsx
const element = props.render(item, index, {
  dragHandleRef: vi.fn(),
  isDragging: mocks.isDragging,
});

Tooltip: ({ children, disabled, tooltipContent }) => (
  <span data-tooltip-content={tooltipContent} data-tooltip-disabled={disabled ? "true" : "false"}>
    {children}
  </span>
),
```

Reset `mocks.isDragging = false` in `beforeEach`.

- [ ] **Step 2: Add focused assertions for both reported symptoms**

Add tests that require parent-observed enabled snapshots and drag-aware Tooltip behavior:

```ts
it("snapshots enabled state in sortable option data", () => {
  renderProperties("spreadsheet");

  expect(mocks.sortableProps[0].data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: "state", isEnabled: true }),
      expect.objectContaining({ key: "priority", isEnabled: false }),
    ])
  );
});

it("disables reorder tooltips while a chip is dragging", () => {
  mocks.isDragging = true;

  const { markup } = renderProperties("spreadsheet");

  expect(markup).toContain('data-tooltip-disabled="true"');
});
```

Extend the toggle test so the enabled `state` label requests `{ state: false }` and the disabled `priority` label requests `{ priority: true }`.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
pnpm --filter web exec vitest run core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx
```

Expected: FAIL because Sortable data has no `isEnabled` and `DisplayPropertyChip` does not disable its Tooltip while dragging.

## Task 2: Propagate Drag State And Observe Enabled State

**Files:**

- Modify: `packages/ui/src/sortable/sortable.tsx`
- Modify: `packages/ui/src/sortable/draggable.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-property-chip.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx`

- [ ] **Step 1: Extend the Sortable render-helper contract**

Change the helper type and `Draggable` callback:

```ts
export type TSortableRenderHelpers = {
  dragHandleRef: React.RefCallback<HTMLButtonElement>;
  isDragging: boolean;
};
```

```tsx
{
  typeof children === "function"
    ? children({ dragHandleRef: dragHandleCallbackRef.current, isDragging: dragging })
    : children;
}
```

- [ ] **Step 2: Disable the Tooltip from authoritative drag state**

Add `isDragging?: boolean` to `DisplayPropertyChip`, default it to `false`, and pass it to Tooltip:

```tsx
<Tooltip disabled={isDragging} tooltipContent={reorderLabel}>
```

Do not change tooltip content, placement, delay, keyboard controls, or non-sortable rendering.

- [ ] **Step 3: Snapshot display-property state inside the MobX observer**

Extend `TDisplayPropertyOption`:

```ts
type TDisplayPropertyOption = {
  key: keyof IIssueDisplayProperties;
  label: string;
  isEnabled: boolean;
};
```

When building each system, project custom, and module custom option, read the boolean immediately:

```ts
{
  key: property.key,
  label: t(property.titleTranslationKey),
  isEnabled: !!displayProperties[property.key],
}
```

Render and toggle from the snapshot:

```tsx
<DisplayPropertyChip
  isEnabled={property.isEnabled}
  isDragging={isDragging}
  onToggle={() => handleUpdate({ [property.key]: !property.isEnabled })}
  // existing props remain unchanged
/>
```

Update the Sortable render callback to forward both helpers:

```tsx
render={(property, _index, { dragHandleRef, isDragging }) =>
  renderPropertyChip(property, dragHandleRef, isDragging)
}
```

- [ ] **Step 4: Run focused tests and type checks**

Run:

```bash
pnpm --filter web exec vitest run core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx
pnpm --filter @plane/ui exec vitest run src/sortable/sortable-utils.test.ts src/sortable/draggable-registration.test.ts src/sortable/sortable.test.tsx
pnpm --filter @plane/ui check:types
pnpm --filter web check:types
```

Expected: all tests pass and both type checks exit 0.

- [ ] **Step 5: Run targeted quality checks**

Run oxfmt and oxlint against the five changed files, then run:

```bash
npx react-doctor@latest --verbose --scope changed --base 7a6b4d6863f4c78fc450d2e820eb911402b7d642
```

Expected: no feature-related errors or warnings.

- [ ] **Step 6: Build runtime packages and verify the local page**

Run:

```bash
pnpm --filter @plane/ui build
pnpm --filter web exec vitest run core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx
```

Restart the Web dev server if Vite still serves the previous `@plane/ui/dist/index.js`. Verify `http://localhost:3000/bbbb/workspace-views/all-issues/` returns 200 and the fresh server log contains no route-loading or runtime errors.

- [ ] **Step 7: Commit**

```bash
git add \
  packages/ui/src/sortable/sortable.tsx \
  packages/ui/src/sortable/draggable.tsx \
  apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-property-chip.tsx \
  apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx \
  apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx
git commit -m "fix: restore table display property interactions"
```
