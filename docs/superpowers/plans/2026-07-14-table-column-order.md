# Table Column Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users reorder checked and unchecked display-property chips in Table layout, preview the order immediately, and persist it through existing preferences and view save/update flows.

**Architecture:** Persist the complete reorderable column sequence in `display_filters.spreadsheet.column_order`. Normalize that JSON in `@plane/utils`, resolve saved order against currently available system and custom fields, extend `@plane/ui/Sortable` for horizontal wrapping and a dedicated handle, then feed one resolved visible-column array to both Table headers and rows. Extend Save as view eligibility with the same additional-change mechanism already used by Update view.

**Tech Stack:** TypeScript, React, MobX, Vitest, Storybook, Atlaskit Pragmatic Drag and Drop, Django REST Framework, pytest.

---

## File Map

- `packages/types/src/view-props.ts`: public type for persisted Table column order.
- `packages/utils/src/work-item/base.ts`: preserve the nested Table configuration while normalizing display filters.
- `packages/utils/src/work-item/spreadsheet-column-order.ts`: pure order reconciliation, keyboard movement, and dirty-state helpers.
- `packages/utils/src/work-item/spreadsheet-column-order.test.ts`: exhaustive order and dirty-state tests.
- `packages/utils/src/work-item/index.ts`: export the new helpers.
- `packages/ui/src/sortable/sortable-utils.ts`: pure before/after array movement for vertical and horizontal edges.
- `packages/ui/src/sortable/sortable-utils.test.ts`: shared Sortable movement tests.
- `packages/ui/src/sortable/sortable.tsx`: orientation and render-helper API.
- `packages/ui/src/sortable/draggable.tsx`: dedicated handle registration and orientation-aware hitboxes.
- `packages/ui/src/drop-indicator.tsx`: vertical indicator support without changing the default horizontal line.
- `packages/ui/src/sortable/sortable.stories.tsx`: wrapping-chip Storybook scenario.
- `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-property-chip.tsx`: accessible chip with separate drag and toggle controls.
- `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx`: build property metadata, resolve order, and emit updates.
- `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-filters-selection.tsx`: pass layout filters and their update callback to the property control.
- `apps/web/core/components/issues/issue-layouts/spreadsheet/column-order.ts`: build the Table-specific list of currently available columns.
- `apps/web/core/components/issues/issue-layouts/spreadsheet/column-order.test.ts`: capability and custom-field ordering tests.
- `apps/web/core/components/issues/issue-layouts/spreadsheet/spreadsheet-view.tsx`: resolve and filter the one column array consumed by header and rows.
- `packages/constants/src/rich-filters/option.ts`: optional Save as view additional-change flag.
- `packages/shared-state/src/store/rich-filters/filter.ts`: allow Save as view for additional changes without a rich filter.
- `packages/shared-state/src/store/rich-filters/filter-helpers.ts`: reveal the filter row when an additional change enables a view action.
- `packages/shared-state/src/store/rich-filters/filter.test.ts`: Save as view eligibility regression tests.
- `apps/web/core/components/work-item-filters/filters-hoc/project-level.tsx`: detect project-view and ordinary-page column-order changes.
- `apps/web/core/components/work-item-filters/filters-hoc/workspace-level.tsx`: detect workspace-view and ordinary-page column-order changes.
- `apps/api/plane/tests/contract/app/test_project_view_app.py`: prove nested display-filter JSON survives create and update.

## Task 1: Persist And Normalize Table Column Order

**Files:**

- Modify: `packages/types/src/view-props.ts`
- Modify: `packages/utils/src/work-item/base.ts`
- Modify: `packages/utils/src/work-item/base.test.ts`

- [ ] **Step 1: Write the failing display-filter normalization test**

Add the type import and test beside the existing display-property test:

```ts
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";

import { getComputedDisplayFilters, getComputedDisplayProperties } from "./base";

describe("getComputedDisplayFilters", () => {
  it("preserves a spreadsheet column order", () => {
    const filters: IIssueDisplayFilterOptions = {
      layout: "spreadsheet",
      spreadsheet: {
        column_order: ["priority", "customproperty_customer-tier", "assignee"],
      },
    };

    expect(getComputedDisplayFilters(filters).spreadsheet).toEqual({
      column_order: ["priority", "customproperty_customer-tier", "assignee"],
    });
  });

  it("drops a malformed spreadsheet column order", () => {
    const filters = {
      layout: "spreadsheet",
      spreadsheet: { column_order: "priority" },
    } as unknown as IIssueDisplayFilterOptions;

    expect(getComputedDisplayFilters(filters).spreadsheet).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @plane/utils exec vitest run src/work-item/base.test.ts`

Expected: FAIL because `IIssueDisplayFilterOptions` has no `spreadsheet` member or because normalization drops it.

- [ ] **Step 3: Add the type and preserve validated JSON**

Add this member to `IIssueDisplayFilterOptions`:

```ts
spreadsheet?: {
  column_order?: (keyof IIssueDisplayProperties)[];
};
```

At the start of `getComputedDisplayFilters`, validate the nested array and conditionally spread it into the return value:

```ts
const spreadsheetColumnOrder = Array.isArray(filters?.spreadsheet?.column_order)
  ? filters.spreadsheet.column_order.filter(
      (property): property is keyof IIssueDisplayProperties => typeof property === "string"
    )
  : undefined;

return {
  calendar: {
    show_weekends: filters?.calendar?.show_weekends || false,
    layout: filters?.calendar?.layout || "month",
  },
  layout: filters?.layout || EIssueLayoutTypes.LIST,
  order_by: filters?.order_by || "sort_order",
  group_by: filters?.group_by || null,
  sub_group_by: filters?.sub_group_by || null,
  sub_issue: filters?.sub_issue || false,
  show_empty_groups: filters?.show_empty_groups || false,
  ...(spreadsheetColumnOrder !== undefined ? { spreadsheet: { column_order: spreadsheetColumnOrder } } : {}),
};
```

- [ ] **Step 4: Run the unit test and type check**

Run: `pnpm --filter @plane/utils exec vitest run src/work-item/base.test.ts`

Expected: PASS.

Run: `pnpm --filter @plane/utils check:types`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/view-props.ts packages/utils/src/work-item/base.ts packages/utils/src/work-item/base.test.ts
git commit -m "feat: persist table column order"
```

## Task 2: Add Pure Column-Order Rules

**Files:**

- Create: `packages/utils/src/work-item/spreadsheet-column-order.ts`
- Create: `packages/utils/src/work-item/spreadsheet-column-order.test.ts`
- Modify: `packages/utils/src/work-item/index.ts`

- [ ] **Step 1: Write failing resolver and dirty-state tests**

Create `spreadsheet-column-order.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import {
  hasExplicitSpreadsheetColumnOrder,
  hasSpreadsheetColumnOrderChanged,
  moveSpreadsheetColumn,
  resolveSpreadsheetColumnOrder,
} from "./spreadsheet-column-order";

const available: (keyof IIssueDisplayProperties)[] = [
  "state",
  "priority",
  "assignee",
  "customproperty_customer-tier",
  "modulecustomproperty_release-train",
];

describe("resolveSpreadsheetColumnOrder", () => {
  it("uses the available order when no saved order exists", () => {
    expect(resolveSpreadsheetColumnOrder(undefined, available)).toEqual(available);
  });

  it("deduplicates, removes unavailable fields, excludes key, and appends new fields", () => {
    expect(
      resolveSpreadsheetColumnOrder(
        ["priority", "key", "deleted_field" as keyof IIssueDisplayProperties, "priority", "state"],
        available
      )
    ).toEqual(["priority", "state", "assignee", "customproperty_customer-tier", "modulecustomproperty_release-train"]);
  });
});

describe("moveSpreadsheetColumn", () => {
  it("moves a hidden or visible property by logical array position", () => {
    expect(moveSpreadsheetColumn(available, "assignee", -1)).toEqual([
      "state",
      "assignee",
      "priority",
      "customproperty_customer-tier",
      "modulecustomproperty_release-train",
    ]);
  });

  it("does nothing at an array boundary", () => {
    expect(moveSpreadsheetColumn(available, "state", -1)).toEqual(available);
  });
});

describe("spreadsheet column-order change detection", () => {
  const filters = (columnOrder?: (keyof IIssueDisplayProperties)[]): IIssueDisplayFilterOptions => ({
    spreadsheet: columnOrder === undefined ? undefined : { column_order: columnOrder },
  });

  it("recognizes an explicit order", () => {
    expect(hasExplicitSpreadsheetColumnOrder(filters(["priority", "state"]))).toBe(true);
    expect(hasExplicitSpreadsheetColumnOrder(filters())).toBe(false);
  });

  it("compares only the persisted column arrays", () => {
    expect(hasSpreadsheetColumnOrderChanged(filters(["priority", "state"]), filters(["state", "priority"]))).toBe(true);
    expect(hasSpreadsheetColumnOrderChanged(filters(["priority", "state"]), filters(["priority", "state"]))).toBe(
      false
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @plane/utils exec vitest run src/work-item/spreadsheet-column-order.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure rules**

Create `spreadsheet-column-order.ts`:

```ts
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";

type TColumnKey = keyof IIssueDisplayProperties;

export const resolveSpreadsheetColumnOrder = (
  savedOrder: readonly TColumnKey[] | undefined,
  availableOrder: readonly TColumnKey[]
): TColumnKey[] => {
  const validAvailableOrder = availableOrder.filter((property) => property !== "key");
  const availableSet = new Set(validAvailableOrder);
  const seen = new Set<TColumnKey>();
  const resolved: TColumnKey[] = [];

  for (const property of savedOrder ?? []) {
    if (property === "key" || !availableSet.has(property) || seen.has(property)) continue;
    seen.add(property);
    resolved.push(property);
  }

  for (const property of validAvailableOrder) {
    if (seen.has(property)) continue;
    seen.add(property);
    resolved.push(property);
  }

  return resolved;
};

export const moveSpreadsheetColumn = (
  order: readonly TColumnKey[],
  property: TColumnKey,
  offset: -1 | 1
): TColumnKey[] => {
  const sourceIndex = order.indexOf(property);
  const destinationIndex = sourceIndex + offset;
  if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= order.length) return [...order];

  const nextOrder = [...order];
  const [movedProperty] = nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(destinationIndex, 0, movedProperty);
  return nextOrder;
};

export const hasExplicitSpreadsheetColumnOrder = (displayFilters: IIssueDisplayFilterOptions | undefined): boolean =>
  (displayFilters?.spreadsheet?.column_order?.length ?? 0) > 0;

export const hasSpreadsheetColumnOrderChanged = (
  current: IIssueDisplayFilterOptions | undefined,
  saved: IIssueDisplayFilterOptions | undefined
): boolean => {
  const currentOrder = current?.spreadsheet?.column_order ?? [];
  const savedOrder = saved?.spreadsheet?.column_order ?? [];
  return (
    currentOrder.length !== savedOrder.length || currentOrder.some((property, index) => property !== savedOrder[index])
  );
};
```

Export it from `packages/utils/src/work-item/index.ts`:

```ts
export * from "./spreadsheet-column-order";
```

- [ ] **Step 4: Run tests and type check**

Run: `pnpm --filter @plane/utils exec vitest run src/work-item/spreadsheet-column-order.test.ts`

Expected: PASS.

Run: `pnpm --filter @plane/utils check:types`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/work-item/spreadsheet-column-order.ts packages/utils/src/work-item/spreadsheet-column-order.test.ts packages/utils/src/work-item/index.ts
git commit -m "feat: resolve table column order"
```

## Task 3: Extend The Shared Sortable Primitive

**Files:**

- Modify: `packages/ui/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/ui/src/sortable/sortable-utils.ts`
- Create: `packages/ui/src/sortable/sortable-utils.test.ts`
- Modify: `packages/ui/src/sortable/sortable.tsx`
- Modify: `packages/ui/src/sortable/draggable.tsx`
- Modify: `packages/ui/src/drop-indicator.tsx`
- Modify: `packages/ui/src/sortable/sortable.stories.tsx`

- [ ] **Step 1: Add the UI package test command and failing movement tests**

Add `"test": "vitest run"` to `packages/ui/package.json` scripts and `"vitest": "catalog:"` to dev dependencies. Run `pnpm install --lockfile-only` so the UI importer in `pnpm-lock.yaml` records Vitest.

Create `sortable-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { moveSortableItem } from "./sortable-utils";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
const keyExtractor = (item: { id: string }) => item.id;

describe("moveSortableItem", () => {
  it.each(["top", "left"] as const)("inserts before for the %s edge", (edge) => {
    expect(moveSortableItem(items, items[2], items[0], edge, keyExtractor).data).toEqual([
      { id: "c" },
      { id: "a" },
      { id: "b" },
    ]);
  });

  it.each(["bottom", "right"] as const)("inserts after for the %s edge", (edge) => {
    expect(moveSortableItem(items, items[0], items[2], edge, keyExtractor).data).toEqual([
      { id: "b" },
      { id: "c" },
      { id: "a" },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @plane/ui exec vitest run src/sortable/sortable-utils.test.ts`

Expected: FAIL because `sortable-utils.ts` does not exist.

- [ ] **Step 3: Implement edge-based movement**

Create `sortable-utils.ts`:

```ts
export type TSortableEdge = "top" | "bottom" | "left" | "right";
export type TSortableOrientation = "vertical" | "horizontal";

export const getSortableEdges = (orientation: TSortableOrientation): TSortableEdge[] =>
  orientation === "horizontal" ? ["left", "right"] : ["top", "bottom"];

export const moveSortableItem = <T>(
  data: readonly T[],
  source: T,
  destination: T,
  edge: TSortableEdge,
  keyExtractor: (item: T, index: number) => string
): { data: T[]; movedItem: T | undefined } => {
  const sourceKey = keyExtractor(source, 0);
  const destinationKey = keyExtractor(destination, 0);
  const sourceIndex = data.findIndex((item, index) => keyExtractor(item, index) === sourceKey);
  const destinationIndex = data.findIndex((item, index) => keyExtractor(item, index) === destinationKey);
  if (sourceIndex < 0 || destinationIndex < 0) return { data: [...data], movedItem: undefined };

  const insertAfter = edge === "bottom" || edge === "right";
  const rawDestinationIndex = destinationIndex + (insertAfter ? 1 : 0);
  const adjustedDestinationIndex = rawDestinationIndex > sourceIndex ? rawDestinationIndex - 1 : rawDestinationIndex;
  const nextData = [...data];
  const [movedItem] = nextData.splice(sourceIndex, 1);
  nextData.splice(adjustedDestinationIndex, 0, movedItem);
  return { data: nextData, movedItem };
};
```

- [ ] **Step 4: Add orientation and dedicated-handle APIs**

Use these public shapes in `sortable.tsx`:

```ts
export type TSortableRenderHelpers = {
  dragHandleRef: React.RefObject<HTMLButtonElement | null>;
};

type Props<T> = {
  data: TEnhancedData<T>[];
  render: (item: T, index: number, helpers: TSortableRenderHelpers) => React.ReactNode;
  onChange: (data: T[], movedItem?: T) => void;
  keyExtractor: (item: T, index: number) => string;
  containerClassName?: string;
  id?: string;
  orientation?: TSortableOrientation;
};
```

Default `orientation` to `"vertical"`. In the monitor, read the attached edge with `extractClosestEdge(destination.data)`, return when it is null, then call `moveSortableItem(data, source.data, destination.data, edge, keyExtractor)`.

Change `Draggable` to accept `orientation` and a render callback:

```ts
type Props = {
  children: (helpers: TSortableRenderHelpers) => React.ReactNode;
  data: unknown;
  className?: string;
  orientation: TSortableOrientation;
};
```

Create `const dragHandleRef = useRef<HTMLButtonElement>(null)`, pass `dragHandle: dragHandleRef.current ?? undefined` to Atlaskit's `draggable`, and pass `getSortableEdges(orientation)` to `attachClosestEdge`. Render `children({ dragHandleRef })` between the before and after indicators.

Extend `DropIndicator` with an optional `orientation?: "horizontal" | "vertical"` prop. Keep `horizontal` as the default and use these base classes:

```ts
const orientationClassName =
  orientation === "vertical"
    ? "relative block h-full min-h-6 w-[2px] before:absolute before:top-0 before:left-[-2px] before:size-[6px] before:rounded-sm after:absolute after:bottom-0 after:left-[-2px] after:size-[6px] after:rounded-sm"
    : "relative block h-[2px] w-full before:relative before:top-[-2px] before:left-0 before:block before:size-[6px] before:rounded-sm after:relative after:top-[-8px] after:left-[calc(100%-6px)] after:block after:size-[6px] after:rounded-sm";
```

For horizontal Sortable items, render vertical indicators on the left and right with absolute positioning; preserve the existing top and bottom rendering for vertical items.

Use this render structure in `Draggable`:

```tsx
const beforeEdge = orientation === "horizontal" ? "left" : "top";
const afterEdge = orientation === "horizontal" ? "right" : "bottom";
const indicatorOrientation = orientation === "horizontal" ? "vertical" : "horizontal";

return (
  <div ref={ref} className={cn("relative", dragging && "opacity-25", className)}>
    <DropIndicator
      isVisible={isDraggedOver && closestEdge === beforeEdge}
      orientation={indicatorOrientation}
      classNames={cn(orientation === "horizontal" && "absolute top-0 bottom-0 left-[-1px]")}
    />
    {children({ dragHandleRef })}
    <DropIndicator
      isVisible={isDraggedOver && closestEdge === afterEdge}
      orientation={indicatorOrientation}
      classNames={cn(orientation === "horizontal" && "absolute top-0 right-[-1px] bottom-0")}
    />
  </div>
);
```

- [ ] **Step 5: Add the wrapping-chip Storybook story**

Add a stateful story whose render function uses the dedicated ref:

```tsx
export const HorizontalWrapping: Story = {
  render: () => {
    const [items, setItems] = React.useState([
      { id: "state", name: "State" },
      { id: "priority", name: "Priority" },
      { id: "assignee", name: "Assignee" },
      { id: "customer-tier", name: "Customer tier" },
    ]);

    return (
      <div className="flex w-72 flex-wrap gap-2">
        <Sortable
          data={items}
          id="horizontal-wrapping"
          orientation="horizontal"
          keyExtractor={(item) => item.id}
          onChange={setItems}
          containerClassName="relative"
          render={(item, _index, { dragHandleRef }) => (
            <div className="flex items-center rounded-sm border border-subtle px-2 py-1 text-11">
              <button ref={dragHandleRef} type="button" aria-label={`Reorder ${item.name}`} className="cursor-grab">
                ::
              </button>
              <span className="ml-1">{item.name}</span>
            </div>
          )}
        />
      </div>
    );
  },
};
```

- [ ] **Step 6: Run tests, types, and Storybook build**

Run: `pnpm --filter @plane/ui exec vitest run src/sortable/sortable-utils.test.ts`

Expected: PASS.

Run: `pnpm --filter @plane/ui check:types`

Expected: exit code 0.

Run: `pnpm --filter @plane/ui build-storybook`

Expected: Storybook finishes with a successful build.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/package.json pnpm-lock.yaml packages/ui/src/sortable packages/ui/src/drop-indicator.tsx
git commit -m "feat(ui): support horizontal sortable items"
```

## Task 4: Make Display-Property Chips Sortable In Table Layout

**Files:**

- Modify: `packages/constants/src/issue/common.ts`
- Create: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-property-chip.tsx`
- Create: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-filters-selection.tsx`

- [ ] **Step 1: Add a failing static-render test for Table-only handles**

Create `display-properties.test.tsx`:

```tsx
import type { IIssueDisplayFilterOptions } from "@plane/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FilterDisplayProperties } from "./display-properties";

vi.mock("mobx-react", () => ({ observer: (component: unknown) => component }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceSlug: undefined, projectId: undefined, moduleId: undefined }),
}));
vi.mock("@plane/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/store/use-project-issue-fields", () => ({
  useProjectIssueFields: () => ({ fieldsLoader: {}, getFields: vi.fn(), getFieldsByProjectId: vi.fn() }),
}));
vi.mock("@/hooks/store/use-module-issue-fields", () => ({
  useModuleIssueFields: () => ({ fieldsLoader: {}, getFields: vi.fn(), getFieldsByModuleId: vi.fn() }),
}));
vi.mock("@plane/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@plane/ui")>();
  return {
    ...original,
    Sortable: ({
      data,
      render,
    }: {
      data: { key: string }[];
      render: (
        item: { key: string },
        index: number,
        helpers: { dragHandleRef: { current: HTMLButtonElement | null } }
      ) => React.ReactNode;
    }) => <>{data.map((item, index) => render(item, index, { dragHandleRef: { current: null } }))}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => children,
  };
});

const renderProperties = (displayFilters: IIssueDisplayFilterOptions) =>
  renderToStaticMarkup(
    <FilterDisplayProperties
      displayFilters={displayFilters}
      displayProperties={{ key: true, state: true, priority: false }}
      displayPropertiesToRender={["key", "state", "priority"]}
      handleDisplayFiltersUpdate={vi.fn()}
      handleUpdate={vi.fn()}
    />
  );

describe("FilterDisplayProperties", () => {
  it("renders drag handles for Table properties but not ID", () => {
    const markup = renderProperties({ layout: "spreadsheet" });
    expect(markup).toContain("common.drag_to_rearrange:common.priority");
    expect(markup).toContain("issue.display.properties.id");
    expect(markup).not.toContain("common.drag_to_rearrange:issue.display.properties.id");
  });

  it("does not render drag handles outside Table layout", () => {
    expect(renderProperties({ layout: "list" })).not.toContain("common.drag_to_rearrange");
  });
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `pnpm --filter web exec vitest run core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx`

Expected: FAIL because the new props and drag handles do not exist.

- [ ] **Step 3: Add missing Table property metadata**

Add these entries to `ISSUE_DISPLAY_PROPERTIES` so every existing Table system column has a label in the menu:

```ts
{ key: "created_on", titleTranslationKey: "common.created_on" },
{ key: "updated_on", titleTranslationKey: "common.updated_on" },
```

Do not add `issue_type`, because it is not in `SPREADSHEET_PROPERTY_LIST`.

- [ ] **Step 4: Create the accessible split-control chip**

Create `display-property-chip.tsx` with this API and structure:

```tsx
import type { KeyboardEvent, RefObject } from "react";
import { GripVertical } from "lucide-react";
import { Tooltip, cn } from "@plane/ui";

type Props = {
  dragHandleRef?: RefObject<HTMLButtonElement | null>;
  isEnabled: boolean;
  isSortable: boolean;
  label: string;
  onMove: (offset: -1 | 1) => void;
  onToggle: () => void;
  reorderLabel: string;
};

export function DisplayPropertyChip(props: Props) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    props.onMove(event.key === "ArrowLeft" ? -1 : 1);
  };

  return (
    <div
      className={cn("flex items-center rounded-sm border text-11 transition-all", {
        "border-accent-strong bg-accent-primary text-on-color": props.isEnabled,
        "border-subtle hover:bg-layer-1": !props.isEnabled,
      })}
    >
      {props.isSortable && (
        <Tooltip tooltipContent={props.reorderLabel}>
          <button
            ref={props.dragHandleRef}
            type="button"
            aria-label={`${props.reorderLabel}:${props.label}`}
            className="grid size-5 cursor-grab place-items-center active:cursor-grabbing"
            onKeyDown={handleKeyDown}
          >
            <GripVertical className="size-3" />
          </button>
        </Tooltip>
      )}
      <button type="button" className="px-2 py-0.5" onClick={props.onToggle}>
        {props.label}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Resolve and emit the ordered chip list**

Extend `FilterDisplayProperties` props with `displayFilters` and `handleDisplayFiltersUpdate`. Translate system metadata into `{ key, label }`, concatenate project and module metadata, and keep ID separate.

Define the option shape in `display-properties.tsx`:

```ts
type TDisplayPropertyOption = {
  key: keyof IIssueDisplayProperties;
  label: string;
};
```

When `displayFilters.layout === EIssueLayoutTypes.SPREADSHEET`, build the available reorderable keys in this order:

```ts
const optionByKey = new Map(allDisplayProperties.map((property) => [property.key, property]));
const availableOrder = [
  ...SPREADSHEET_PROPERTY_LIST.filter((property) => optionByKey.has(property)),
  ...customDisplayProperties.map((property) => property.key),
  ...moduleCustomDisplayProperties.map((property) => property.key),
];
const resolvedOrder = resolveSpreadsheetColumnOrder(displayFilters?.spreadsheet?.column_order, availableOrder);
const orderedProperties = resolvedOrder.flatMap((property) => {
  const option = optionByKey.get(property);
  return option ? [option] : [];
});
```

Render the fixed ID chip first. Render `orderedProperties` with horizontal `Sortable`. Emit a complete array after drop:

```ts
const handleOrderChange = (properties: TDisplayPropertyOption[]) =>
  handleDisplayFiltersUpdate({
    spreadsheet: {
      ...displayFilters?.spreadsheet,
      column_order: properties.map((property) => property.key),
    },
  });
```

For keyboard movement, call `moveSpreadsheetColumn(resolvedOrder, property.key, offset)` and emit the resulting key array through the same nested update shape.

Use one render branch so non-Table layouts keep their existing non-sortable behavior:

```tsx
const renderPropertyChip = (
  property: TDisplayPropertyOption,
  dragHandleRef?: React.RefObject<HTMLButtonElement | null>
) => (
  <DisplayPropertyChip
    key={property.key}
    dragHandleRef={dragHandleRef}
    isEnabled={!!displayProperties[property.key]}
    isSortable={isSpreadsheetLayout && property.key !== "key"}
    label={property.label}
    reorderLabel={t("common.drag_to_rearrange")}
    onMove={(offset) => handleKeyboardMove(property.key, offset)}
    onToggle={() => handleUpdate({ [property.key]: !displayProperties[property.key] })}
  />
);

{
  fixedIdProperty && renderPropertyChip(fixedIdProperty);
}
{
  isSpreadsheetLayout ? (
    <Sortable
      data={orderedProperties}
      id="table-display-properties"
      orientation="horizontal"
      keyExtractor={(property) => property.key}
      onChange={handleOrderChange}
      containerClassName="relative"
      render={(property, _index, { dragHandleRef }) => renderPropertyChip(property, dragHandleRef)}
    />
  ) : (
    nonIdDisplayProperties.map((property) => renderPropertyChip(property))
  );
}
```

In `DisplayFiltersSelection`, pass `displayFilters` and `handleDisplayFiltersUpdate` into `FilterDisplayProperties`. This automatically covers ordinary headers and project-view forms because they already use `DisplayFiltersSelection`.

- [ ] **Step 6: Run the component test, web types, and lint**

Run: `pnpm --filter web exec vitest run core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx`

Expected: PASS.

Run: `pnpm --filter web check:types`

Expected: exit code 0.

Run: `pnpm --filter web check:lint`

Expected: exit code 0 with no new warnings beyond the configured baseline.

- [ ] **Step 7: Commit**

```bash
git add packages/constants/src/issue/common.ts apps/web/core/components/issues/issue-layouts/filters/header/display-filters
git commit -m "feat: reorder table display properties"
```

## Task 5: Apply The Resolved Order To Table Columns

**Files:**

- Create: `apps/web/core/components/issues/issue-layouts/spreadsheet/column-order.ts`
- Create: `apps/web/core/components/issues/issue-layouts/spreadsheet/column-order.test.ts`
- Modify: `apps/web/core/components/issues/issue-layouts/spreadsheet/spreadsheet-view.tsx`

- [ ] **Step 1: Write failing available-column tests**

Create `column-order.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getAvailableSpreadsheetColumns } from "./column-order";

describe("getAvailableSpreadsheetColumns", () => {
  it("filters disabled capabilities and appends project and module fields", () => {
    const result = getAvailableSpreadsheetColumns({
      cycleViewEnabled: false,
      estimateEnabled: false,
      moduleViewEnabled: true,
      projectFieldIds: ["customer-tier"],
      moduleFieldIds: ["release-train"],
      workspaceLevel: false,
    });

    expect(result).not.toContain("cycle");
    expect(result).not.toContain("estimate");
    expect(result).toContain("modules");
    expect(result.slice(-2)).toEqual(["customproperty_customer-tier", "modulecustomproperty_release-train"]);
  });

  it("uses system columns only at workspace level", () => {
    const result = getAvailableSpreadsheetColumns({
      cycleViewEnabled: true,
      estimateEnabled: true,
      moduleViewEnabled: true,
      projectFieldIds: ["ignored"],
      moduleFieldIds: ["ignored"],
      workspaceLevel: true,
    });

    expect(result).not.toContain("customproperty_ignored");
    expect(result).not.toContain("modulecustomproperty_ignored");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web exec vitest run core/components/issues/issue-layouts/spreadsheet/column-order.test.ts`

Expected: FAIL because `column-order.ts` does not exist.

- [ ] **Step 3: Implement available-column construction**

Create `column-order.ts`:

```ts
import { SPREADSHEET_PROPERTY_LIST } from "@plane/constants";
import type { IIssueDisplayProperties } from "@plane/types";

type TOptions = {
  cycleViewEnabled: boolean;
  estimateEnabled: boolean;
  moduleViewEnabled: boolean;
  projectFieldIds: string[];
  moduleFieldIds: string[];
  workspaceLevel: boolean;
};

export const getAvailableSpreadsheetColumns = (options: TOptions): (keyof IIssueDisplayProperties)[] => {
  const systemColumns = SPREADSHEET_PROPERTY_LIST.filter((property) => {
    if (property === "cycle" && !options.cycleViewEnabled) return false;
    if (property === "modules" && !options.moduleViewEnabled) return false;
    if (property === "estimate" && !options.estimateEnabled) return false;
    return true;
  });
  if (options.workspaceLevel) return systemColumns;

  return [
    ...systemColumns,
    ...options.projectFieldIds.map((fieldId) => `customproperty_${fieldId}` as keyof IIssueDisplayProperties),
    ...options.moduleFieldIds.map((fieldId) => `modulecustomproperty_${fieldId}` as keyof IIssueDisplayProperties),
  ];
};
```

- [ ] **Step 4: Use one resolved visible array in SpreadsheetView**

Replace the existing `spreadsheetColumnsList` memo with:

```ts
const spreadsheetColumnsList = useMemo(() => {
  const availableColumns = getAvailableSpreadsheetColumns({
    cycleViewEnabled: isWorkspaceLevel || !!currentProjectDetails?.cycle_view,
    estimateEnabled: isEstimateEnabled,
    moduleViewEnabled: isWorkspaceLevel || !!currentProjectDetails?.module_view,
    projectFieldIds: projectIssueFields?.map((field) => field.id) ?? [],
    moduleFieldIds: moduleIssueFields?.map((field) => field.id) ?? [],
    workspaceLevel: isWorkspaceLevel,
  });
  const resolvedColumns = resolveSpreadsheetColumnOrder(displayFilters.spreadsheet?.column_order, availableColumns);
  return resolvedColumns.filter((property) => !!displayProperties[property]);
}, [
  currentProjectDetails?.cycle_view,
  currentProjectDetails?.module_view,
  displayFilters.spreadsheet?.column_order,
  displayProperties,
  isEstimateEnabled,
  isWorkspaceLevel,
  moduleIssueFields,
  projectIssueFields,
]);
```

Import `resolveSpreadsheetColumnOrder` from `@plane/utils` and `getAvailableSpreadsheetColumns` from the new local module. Remove the direct `SPREADSHEET_PROPERTY_LIST` import. `SpreadsheetTable` already passes this same array to `SpreadsheetHeader` and every `SpreadsheetIssueRow`; keep that contract unchanged.

- [ ] **Step 5: Run focused tests and existing custom-field regression**

Run: `pnpm --filter web exec vitest run core/components/issues/issue-layouts/spreadsheet/column-order.test.ts core/components/issues/issue-layouts/spreadsheet/custom-field-cell.test.tsx`

Expected: PASS.

Run: `pnpm --filter web check:types`

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/core/components/issues/issue-layouts/spreadsheet/column-order.ts apps/web/core/components/issues/issue-layouts/spreadsheet/column-order.test.ts apps/web/core/components/issues/issue-layouts/spreadsheet/spreadsheet-view.tsx
git commit -m "feat: render saved table column order"
```

## Task 6: Surface Save As View For Column-Order Changes

**Files:**

- Modify: `packages/constants/src/rich-filters/option.ts`
- Modify: `packages/shared-state/src/store/rich-filters/filter.ts`
- Modify: `packages/shared-state/src/store/rich-filters/filter-helpers.ts`
- Create: `packages/shared-state/src/store/rich-filters/filter.test.ts`
- Modify: `apps/web/core/components/work-item-filters/filters-hoc/project-level.tsx`
- Modify: `apps/web/core/components/work-item-filters/filters-hoc/workspace-level.tsx`

- [ ] **Step 1: Write failing shared-state eligibility tests**

Create `filter.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { TWorkItemFilterExpression, TWorkItemFilterProperty } from "@plane/types";
import { workItemFiltersAdapter } from "../work-item-filters/adapter";
import { FilterInstance } from "./filter";

const createFilter = (hasAdditionalChanges?: boolean) =>
  new FilterInstance<TWorkItemFilterProperty, TWorkItemFilterExpression>({
    adapter: workItemFiltersAdapter,
    initialExpression: {},
    options: {
      expression: {
        saveViewOptions: {
          hasAdditionalChanges,
          isDisabled: false,
          onViewSave: vi.fn(),
        },
      },
    },
  });

describe("FilterInstance.canSaveView", () => {
  it("allows an additional display change without an active rich filter", () => {
    const filter = createFilter(true);
    expect(filter.hasActiveFilters).toBe(false);
    expect(filter.canSaveView).toBe(true);
    expect(filter.isVisible).toBe(true);
  });

  it("keeps the old behavior when the additional flag is absent", () => {
    expect(createFilter().canSaveView).toBe(false);
  });

  it("reveals an existing hidden row when an additional change appears", () => {
    const filter = createFilter(false);
    expect(filter.isVisible).toBe(false);

    filter.updateExpressionOptions({
      saveViewOptions: {
        hasAdditionalChanges: true,
        isDisabled: false,
        onViewSave: vi.fn(),
      },
    });

    expect(filter.canSaveView).toBe(true);
    expect(filter.isVisible).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @plane/shared-state exec vitest run src/store/rich-filters/filter.test.ts`

Expected: FAIL because `TSaveViewOptions` does not accept or consume `hasAdditionalChanges`.

- [ ] **Step 3: Extend Save as view options and eligibility**

Add the optional flag:

```ts
export type TSaveViewOptions<E extends TExternalFilter> = {
  label?: string;
  hasAdditionalChanges?: boolean;
  onViewSave: (expression: E) => void | Promise<void>;
  isDisabled?: boolean;
};
```

Change the getter to:

```ts
get canSaveView(): IFilterInstance<P, E>["canSaveView"] {
  return (
    (this.hasActiveFilters || !!this.saveViewOptions?.hasAdditionalChanges) &&
    !!this.saveViewOptions &&
    !this.saveViewOptions.isDisabled
  );
}
```

In `FilterInstanceHelper.setInitialVisibility`, replace the active-filter-only branch with:

```ts
if (this._filterInstance.hasActiveFilters || this._filterInstance.canSaveView || this._filterInstance.canUpdateView) {
  this.isVisible = true;
  return;
}
```

After merging options in `FilterInstance.updateExpressionOptions`, reveal a hidden row when a view action becomes available:

```ts
this.expressionOptions = {
  ...this.expressionOptions,
  ...newOptions,
};
if (!this.isVisible && (this.canSaveView || this.canUpdateView)) {
  this.helper.toggleVisibility(true);
}
```

- [ ] **Step 4: Set the flag in project and workspace HOCs**

In both HOCs, compute:

```ts
const hasSaveViewAdditionalChanges = useMemo(
  () =>
    viewDetails
      ? hasSpreadsheetColumnOrderChanged(initialWorkItemFilters?.displayFilters, viewDetails.display_filters)
      : hasExplicitSpreadsheetColumnOrder(initialWorkItemFilters?.displayFilters),
  [initialWorkItemFilters?.displayFilters, viewDetails]
);
```

Import both helpers from `@plane/utils`, add `hasAdditionalChanges: hasSaveViewAdditionalChanges` to `saveViewOptions`, and include the value in the memo dependencies. Leave Update view's broader `hasAdditionalChanges` comparison unchanged.

- [ ] **Step 5: Run shared tests and web types**

Run: `pnpm --filter @plane/shared-state exec vitest run src/store/rich-filters/filter.test.ts`

Expected: PASS.

Run: `pnpm --filter @plane/shared-state check:types`

Expected: exit code 0.

Run: `pnpm --filter web check:types`

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/constants/src/rich-filters/option.ts packages/shared-state/src/store/rich-filters/filter.ts packages/shared-state/src/store/rich-filters/filter-helpers.ts packages/shared-state/src/store/rich-filters/filter.test.ts apps/web/core/components/work-item-filters/filters-hoc/project-level.tsx apps/web/core/components/work-item-filters/filters-hoc/workspace-level.tsx
git commit -m "feat: save views with table column changes"
```

## Task 7: Prove Backend JSON Round Trips

**Files:**

- Modify: `apps/api/plane/tests/contract/app/test_project_view_app.py`

- [ ] **Step 1: Add the contract test**

Add this test to `TestProjectViewAPI`:

```py
@pytest.mark.django_db
def test_project_view_round_trips_spreadsheet_column_order(self, session_client, workspace, create_user):
    project = self.create_project(workspace, create_user)
    payload = self.payload()
    payload["display_filters"] = {
        "layout": "spreadsheet",
        "group_by": None,
        "order_by": "-created_at",
        "spreadsheet": {
            "column_order": ["priority", "customproperty_customer-tier", "assignee"]
        },
    }

    create_response = session_client.post(
        self.get_project_view_url(workspace.slug, project.id), payload, format="json"
    )

    assert create_response.status_code == status.HTTP_201_CREATED
    view_id = create_response.json()["id"]
    assert create_response.json()["display_filters"]["spreadsheet"]["column_order"] == [
        "priority",
        "customproperty_customer-tier",
        "assignee",
    ]

    updated_order = ["assignee", "priority", "customproperty_customer-tier"]
    update_response = session_client.patch(
        self.get_project_view_url(workspace.slug, project.id, view_id),
        {"display_filters": {**payload["display_filters"], "spreadsheet": {"column_order": updated_order}}},
        format="json",
    )

    assert update_response.status_code == status.HTTP_200_OK
    assert update_response.json()["display_filters"]["spreadsheet"]["column_order"] == updated_order
    assert IssueView.objects.get(id=view_id).display_filters["spreadsheet"]["column_order"] == updated_order
```

- [ ] **Step 2: Run the focused contract test**

Prerequisite if `apps/api/.env` does not exist: `./setup.sh`

Run: `docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_project_view_app.py -k spreadsheet_column_order -vv`

Expected: PASS.

- [ ] **Step 3: Tear down the isolated test stack**

Run: `docker compose -f docker-compose-test.yml down -v`

Expected: containers, network, and test volumes are removed.

- [ ] **Step 4: Commit**

```bash
git add apps/api/plane/tests/contract/app/test_project_view_app.py
git commit -m "test: cover table column order persistence"
```

## Task 8: Final Regression And Visual Verification

**Files:**

- Verify all files changed in Tasks 1-7.

- [ ] **Step 1: Run the focused frontend tests together**

```bash
pnpm --filter @plane/utils exec vitest run src/work-item/base.test.ts src/work-item/spreadsheet-column-order.test.ts
pnpm --filter @plane/ui exec vitest run src/sortable/sortable-utils.test.ts
pnpm --filter @plane/shared-state exec vitest run src/store/rich-filters/filter.test.ts
pnpm --filter web exec vitest run core/components/issues/issue-layouts/filters/header/display-filters/display-properties.test.tsx core/components/issues/issue-layouts/spreadsheet/column-order.test.ts core/components/issues/issue-layouts/spreadsheet/custom-field-cell.test.tsx
```

Expected: all test files pass.

- [ ] **Step 2: Run affected package quality checks**

```bash
pnpm --filter @plane/utils check:types
pnpm --filter @plane/utils check:lint
pnpm --filter @plane/ui check:types
pnpm --filter @plane/ui check:lint
pnpm --filter @plane/shared-state check:types
pnpm --filter @plane/shared-state check:lint
pnpm --filter web check:types
pnpm --filter web check:lint
```

Expected: every command exits 0 and introduces no new warning beyond each package's configured baseline.

- [ ] **Step 3: Run React diagnostics**

Invoke the repository's `react-doctor` skill against the changed React files. Resolve feature-related accessibility, rendering, or architecture findings, rerun the focused tests, and commit only fixes caused by this feature.

- [ ] **Step 4: Start the app and verify the workflow**

Run: `pnpm dev`

Open the web app at `http://localhost:3000` and verify:

1. Project, cycle, module, workspace/global, project-view, and workspace-view Table layouts show draggable checked and unchecked chips.
2. List and Kanban chips have no drag handles.
3. ID remains fixed with Work item and has no handle.
4. Pointer drag and keyboard arrow movement reorder headers and row cells immediately.
5. Toggling a hidden field restores it at its ordered position.
6. Save as view appears after a reorder with no rich filter.
7. Update view appears after changing a saved view and disappears after saving.
8. Reloading restores the saved sequence.
9. A newly added custom field appears last and a deleted custom field is ignored.
10. Chip labels wrap without overlap at desktop and narrow widths.

- [ ] **Step 5: Build Storybook and run the backend contract once more**

```bash
pnpm --filter @plane/ui build-storybook
docker compose -f docker-compose-test.yml run --rm api-tests pytest plane/tests/contract/app/test_project_view_app.py -k spreadsheet_column_order -vv
docker compose -f docker-compose-test.yml down -v
```

Expected: Storybook builds, the contract test passes, and the test stack is removed.

- [ ] **Step 6: Inspect the final diff and commit verification fixes**

Run: `git diff --check && git status --short && git log --oneline -8`

Expected: no whitespace errors; only intended feature files are changed; Tasks 1-7 appear as separate commits. If Step 3 or Step 4 required a code fix, stage only the files changed by that fix, inspect `git diff --cached`, and commit them with `git commit -m "fix: close table column order regressions"`. If no verification fix was needed, do not create an empty commit.
