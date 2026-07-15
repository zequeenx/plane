# Custom Field Grouping UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give project and module single-select/single-member custom fields consistent spreadsheet separators and complete list/kanban grouping behavior, including source labels, drag and drop, and in-group creation.

**Architecture:** Add one frontend custom-field grouping adapter that owns key parsing, option/column construction, local value projection, request sanitization, and multi-request orchestration. Existing menu, grouping store, drag, and creation components call this adapter while project and module values continue to use their current persistence APIs.

Custom fields are added only to the primary `Group by` menu. `Sub-group by` remains unchanged.

**Tech Stack:** TypeScript, React, MobX, Vitest, React Router, Plane UI, Plane project/module issue field stores.

---

## Reference Documents

- Design: `docs/superpowers/specs/2026-07-13-custom-field-grouping-ui-design.md`
- Project field design: `docs/superpowers/specs/2026-07-07-project-issue-fields-design.md`
- Module field design: `docs/superpowers/specs/2026-07-09-module-custom-fields-design.md`

## File Structure

New files:

- `apps/web/vitest.config.ts`: isolated web unit-test configuration using the existing workspace Vitest catalog entry.
- `apps/web/core/components/issues/issue-layouts/custom-field-grouping.ts`: deep frontend adapter for custom group keys, menu options, columns, issue projections, request sanitization, and async operation sequencing.
- `apps/web/core/components/issues/issue-layouts/custom-field-grouping.test.ts`: adapter unit tests.
- `apps/web/core/hooks/use-custom-field-group-context.ts`: resolve project and current/source module context without duplicating route/view logic.
- `apps/web/core/hooks/use-custom-field-grouping.ts`: load eligible field definitions and module metadata for menus and layout columns.
- `apps/web/core/hooks/use-custom-field-group-operations.ts`: connect the pure adapter to project/module field stores, issue stores, toasts, and refetch behavior.
- `apps/web/core/components/issues/issue-layouts/spreadsheet/custom-field-cell.tsx`: shared row-separator wrapper for project and module custom columns.
- `apps/web/core/components/issues/issue-layouts/spreadsheet/custom-field-cell.test.tsx`: server-rendered class regression test.

Existing files changed by responsibility:

- `apps/web/package.json`, `pnpm-lock.yaml`: expose the web Vitest test command.
- `packages/types/src/issues/issue.ts`, `packages/types/src/issues.ts`, `packages/types/src/view-props.ts`: type dynamic group annotations and both custom group key forms.
- `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/group-by.tsx`: merge static and dynamic group menu options.
- `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-filters-selection.tsx`: pass explicit source-module context to the menu.
- `apps/web/ce/components/issues/issue-layouts/utils.tsx`: keep static group option resolution typed separately from dynamic titles.
- `apps/web/core/components/issues/issue-layouts/utils.tsx`: build custom group columns and produce group-aware modal payloads.
- `apps/web/core/store/issue/helpers/issue-filter-helper.store.ts`: pass both custom key prefixes to the backend unchanged.
- `apps/web/core/store/issue/helpers/base-issues.store.ts`, `apps/web/core/store/issue/helpers/base-issues-utils.ts`: read dynamic group values and update grouped IDs/counts locally.
- `apps/web/core/store/issue/issue_kanban_view.store.ts`: allow dragging for eligible custom group keys.
- `apps/web/core/hooks/use-group-dragndrop.ts`: persist project/module custom group drops and reconcile partial failures.
- `apps/web/core/components/issues/issue-layouts/list/default.tsx`, `apps/web/core/components/issues/issue-layouts/list/list-group.tsx`: provide field-backed columns and group-aware creation.
- `apps/web/core/components/issues/issue-layouts/kanban/default.tsx`, `apps/web/core/components/issues/issue-layouts/kanban/swimlanes.tsx`, `apps/web/core/components/issues/issue-layouts/kanban/kanban-group.tsx`: provide field-backed columns and group-aware creation.
- `apps/web/core/components/issues/issue-layouts/list/headers/group-by-card.tsx`, `apps/web/core/components/issues/issue-layouts/kanban/headers/group-by-card.tsx`: finish module custom field persistence after modal creation.
- `apps/web/core/components/issues/issue-layouts/spreadsheet/issue-column.tsx`: use the shared bordered custom cell wrapper.

---

### Task 1: Add Web Tests And Foundational Grouping Types

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/vitest.config.ts`
- Modify: `packages/types/src/view-props.ts`
- Modify: `packages/types/src/issues.ts`
- Modify: `packages/types/src/issues/issue.ts`
- Create: `apps/web/core/components/issues/issue-layouts/custom-field-grouping.ts`
- Create: `apps/web/core/components/issues/issue-layouts/custom-field-grouping.test.ts`

- [ ] **Step 1: Add the web Vitest runner**

Add this script and development dependency to `apps/web/package.json`:

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "catalog:"
  }
}
```

Create `apps/web/vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths({ projects: [path.resolve(__dirname, "tsconfig.json")] })],
  test: {
    environment: "node",
    include: ["core/**/*.test.{ts,tsx}"],
  },
});
```

Run:

```bash
pnpm install --lockfile-only
```

Expected: `apps/web` gains a Vitest importer entry in `pnpm-lock.yaml` without unrelated dependency upgrades.

- [ ] **Step 2: Write failing adapter tests**

Create `apps/web/core/components/issues/issue-layouts/custom-field-grouping.test.ts` with fixtures for an enabled select field, enabled member field, disabled field, and unsupported text field. Add these tests:

```ts
import { describe, expect, it } from "vitest";
import { EProjectIssueFieldType, type TModuleIssueField, type TProjectIssueField } from "@plane/types";
import {
  buildCustomFieldGroupColumns,
  buildCustomFieldGroupOptions,
  isGroupableCustomField,
  parseCustomFieldGroupKey,
} from "./custom-field-grouping";

const selectField: TProjectIssueField = {
  id: "select-field",
  name: "Special label",
  description: "",
  field_type: EProjectIssueFieldType.SINGLE_SELECT,
  sort_order: 10,
  is_disabled: false,
  disabled_at: null,
  options: [
    {
      id: "option-a",
      value: "Alpha",
      sort_order: 10,
      field: "select-field",
      project: "project-1",
      workspace: "workspace-1",
      created_at: "2026-07-13T00:00:00Z",
      updated_at: "2026-07-13T00:00:00Z",
    },
  ],
  project: "project-1",
  workspace: "workspace-1",
  created_at: "2026-07-13T00:00:00Z",
  updated_at: "2026-07-13T00:00:00Z",
};

const memberField: TProjectIssueField = {
  ...selectField,
  id: "member-field",
  name: "Current owner",
  field_type: EProjectIssueFieldType.SINGLE_MEMBER,
  options: [],
};

const moduleSelectField: TModuleIssueField = {
  ...selectField,
  module: "module-1",
  options: selectField.options.map((option) => ({ ...option, module: "module-1" })),
};

describe("custom field grouping", () => {
  it("parses project and module group keys", () => {
    expect(parseCustomFieldGroupKey("customproperty_select-field")).toEqual({
      fieldId: "select-field",
      scope: "project",
    });
    expect(parseCustomFieldGroupKey("modulecustomproperty_member-field")).toEqual({
      fieldId: "member-field",
      scope: "module",
    });
    expect(parseCustomFieldGroupKey("priority")).toBeUndefined();
  });

  it("accepts only enabled single select and single member fields", () => {
    expect(isGroupableCustomField(selectField)).toBe(true);
    expect(isGroupableCustomField(memberField)).toBe(true);
    expect(isGroupableCustomField({ ...selectField, is_disabled: true })).toBe(false);
    expect(isGroupableCustomField({ ...selectField, field_type: EProjectIssueFieldType.PLAIN_TEXT })).toBe(false);
  });

  it("builds source-aware menu labels", () => {
    expect(
      buildCustomFieldGroupOptions({
        moduleFields: [moduleSelectField],
        moduleLabel: "Module",
        moduleName: "ABC",
        projectFields: [memberField],
        projectLabel: "Project",
      })
    ).toEqual([
      { key: "customproperty_member-field", title: "Current owner (Project)" },
      { key: "modulecustomproperty_select-field", title: "Special label (Module ABC)" },
    ]);
  });

  it("builds select, member, and None columns", () => {
    expect(buildCustomFieldGroupColumns(selectField, [])).toEqual([
      { id: "option-a", kind: "option", name: "Alpha" },
      { id: "None", kind: "none", name: "None" },
    ]);
    expect(
      buildCustomFieldGroupColumns(memberField, [
        { avatarUrl: "avatar.png", displayName: "Ada Lovelace", id: "member-1" },
      ])
    ).toEqual([
      {
        avatarUrl: "avatar.png",
        id: "member-1",
        kind: "member",
        name: "Ada Lovelace",
      },
      { id: "None", kind: "none", name: "None" },
    ]);
  });
});
```

- [ ] **Step 3: Run the test to verify RED**

Run:

```bash
pnpm --filter=web exec vitest run core/components/issues/issue-layouts/custom-field-grouping.test.ts
```

Expected: FAIL because `custom-field-grouping.ts` and its exports do not exist.

- [ ] **Step 4: Extend shared group types**

In `packages/types/src/view-props.ts`, include both dynamic key types:

```ts
export type TIssueGroupByOptions = TSystemIssueGroupByOptions | TCustomPropertyKey | TModuleCustomPropertyKey;
```

In `packages/types/src/issues.ts`, replace the enumerated `GroupByColumnTypes` with:

```ts
export type GroupByColumnTypes = Exclude<TIssueGroupByOptions, null | "target_date">;
```

In `packages/types/src/issues/issue.ts`, import both custom key types, rename the existing object type to `TIssueCore`, and export the intersection:

```ts
import type {
  TCustomPropertyKey,
  TIssueFieldValues,
  TIssueModuleFieldValues,
  TModuleCustomPropertyKey,
} from "./issue-fields";
```

Change the existing declaration line from `export type TBaseIssue = {` to:

```ts
type TIssueCore = {
```

Immediately after the unchanged closing `};` for that object, add:

```ts
export type TBaseIssue = TIssueCore & Partial<Record<TCustomPropertyKey | TModuleCustomPropertyKey, string | null>>;
```

- [ ] **Step 5: Implement the foundational adapter**

Create `custom-field-grouping.ts` with these exported contracts and implementations:

```ts
import type {
  TCustomPropertyKey,
  TIssueGroupByOptions,
  TModuleCustomPropertyKey,
  TModuleIssueField,
  TProjectIssueField,
} from "@plane/types";
import { EProjectIssueFieldType } from "@plane/types";

export const CUSTOM_PROPERTY_PREFIX = "customproperty_";
export const MODULE_CUSTOM_PROPERTY_PREFIX = "modulecustomproperty_";

export type TCustomFieldGroupKey = TCustomPropertyKey | TModuleCustomPropertyKey;
export type TCustomFieldGroupScope = "project" | "module";

export type TCustomFieldGroupColumn = {
  avatarUrl?: string;
  id: string;
  kind: "member" | "none" | "option";
  name: string;
};

type TMemberColumnInput = {
  avatarUrl?: string;
  displayName: string;
  id: string;
};

export const parseCustomFieldGroupKey = (
  key: TIssueGroupByOptions | string | null | undefined
): { fieldId: string; scope: TCustomFieldGroupScope } | undefined => {
  if (!key) return undefined;
  if (key.startsWith(MODULE_CUSTOM_PROPERTY_PREFIX)) {
    const fieldId = key.slice(MODULE_CUSTOM_PROPERTY_PREFIX.length);
    return fieldId ? { fieldId, scope: "module" } : undefined;
  }
  if (key.startsWith(CUSTOM_PROPERTY_PREFIX)) {
    const fieldId = key.slice(CUSTOM_PROPERTY_PREFIX.length);
    return fieldId ? { fieldId, scope: "project" } : undefined;
  }
  return undefined;
};

export const isCustomFieldGroupKey = (
  key: TIssueGroupByOptions | string | null | undefined
): key is TCustomFieldGroupKey => !!parseCustomFieldGroupKey(key);

export const isGroupableCustomField = (field: TProjectIssueField | TModuleIssueField) =>
  !field.is_disabled &&
  (field.field_type === EProjectIssueFieldType.SINGLE_SELECT ||
    field.field_type === EProjectIssueFieldType.SINGLE_MEMBER);

export const buildCustomFieldGroupOptions = ({
  moduleFields = [],
  moduleLabel,
  moduleName,
  projectFields = [],
  projectLabel,
}: {
  moduleFields?: TModuleIssueField[];
  moduleLabel: string;
  moduleName?: string;
  projectFields?: TProjectIssueField[];
  projectLabel: string;
}): { key: TCustomFieldGroupKey; title: string }[] => {
  const projectOptions = projectFields.filter(isGroupableCustomField).map((field) => ({
    key: `${CUSTOM_PROPERTY_PREFIX}${field.id}` as TCustomPropertyKey,
    title: `${field.name} (${projectLabel})`,
  }));
  const moduleOptions = moduleName
    ? moduleFields.filter(isGroupableCustomField).map((field) => ({
        key: `${MODULE_CUSTOM_PROPERTY_PREFIX}${field.id}` as TModuleCustomPropertyKey,
        title: `${field.name} (${moduleLabel} ${moduleName})`,
      }))
    : [];
  return [...projectOptions, ...moduleOptions];
};

export const buildCustomFieldGroupColumns = (
  field: TProjectIssueField | TModuleIssueField,
  members: TMemberColumnInput[]
): TCustomFieldGroupColumn[] => {
  const columns =
    field.field_type === EProjectIssueFieldType.SINGLE_SELECT
      ? field.options.map((option) => ({ id: option.id, kind: "option" as const, name: option.value }))
      : members.map((member) => ({
          avatarUrl: member.avatarUrl,
          id: member.id,
          kind: "member" as const,
          name: member.displayName,
        }));
  return [...columns, { id: "None", kind: "none", name: "None" }];
};
```

- [ ] **Step 6: Run GREEN checks**

Run:

```bash
pnpm --filter=web exec vitest run core/components/issues/issue-layouts/custom-field-grouping.test.ts
pnpm --filter=@plane/types check:types
pnpm --filter=web check:types
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit foundational types and tests**

```bash
git add apps/web/package.json apps/web/vitest.config.ts pnpm-lock.yaml packages/types/src/view-props.ts packages/types/src/issues.ts packages/types/src/issues/issue.ts apps/web/core/components/issues/issue-layouts/custom-field-grouping.ts apps/web/core/components/issues/issue-layouts/custom-field-grouping.test.ts
git commit -m "feat: add custom field grouping adapter"
```

---

### Task 2: Add Dynamic Menu Options And Group Columns

**Files:**

- Create: `apps/web/core/hooks/use-custom-field-group-context.ts`
- Create: `apps/web/core/hooks/use-custom-field-grouping.ts`
- Modify: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/group-by.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-filters-selection.tsx`
- Modify: `apps/web/ce/components/issues/issue-layouts/utils.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/utils.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/list/default.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/kanban/default.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/kanban/swimlanes.tsx`

- [ ] **Step 1: Create a single route/view context resolver**

Create `use-custom-field-group-context.ts`:

```ts
import { useParams } from "next/navigation";
import { useModule } from "@/hooks/store/use-module";
import { useProjectView } from "@/hooks/store/use-project-view";

export const useCustomFieldGroupContext = (sourceModuleIdOverride?: string | null) => {
  const { moduleId, projectId, viewId, workspaceSlug } = useParams();
  const { getModuleById } = useModule();
  const { getViewById } = useProjectView();
  const projectView = viewId ? getViewById(viewId.toString()) : undefined;
  const sourceModuleId = sourceModuleIdOverride ?? moduleId?.toString() ?? projectView?.source_module ?? null;
  const sourceModule = sourceModuleId ? getModuleById(sourceModuleId) : null;

  return {
    moduleName: sourceModule?.name,
    projectId: projectId?.toString(),
    sourceModuleId,
    workspaceSlug: workspaceSlug?.toString(),
  };
};
```

- [ ] **Step 2: Load definitions for menus and layouts**

Create `use-custom-field-grouping.ts`. It must call the context resolver, project/module field stores, and module store. Use effects with existing loader maps to fetch each resource once. Return:

```ts
return {
  moduleFields,
  moduleName,
  projectFields,
  projectId,
  sourceModuleId,
};
```

Use these guards exactly:

```ts
if (workspaceSlug && projectId && !projectFields && !projectFieldsLoader[projectId]) {
  void getProjectFields(workspaceSlug, projectId).catch((error) =>
    console.error("Failed to load project issue fields:", error)
  );
}

if (workspaceSlug && projectId && sourceModuleId && !moduleFields && !moduleFieldsLoader[sourceModuleId]) {
  void getModuleFields(workspaceSlug, projectId, sourceModuleId).catch((error) =>
    console.error("Failed to load module issue fields:", error)
  );
}

if (workspaceSlug && projectId && sourceModuleId && !moduleName) {
  void fetchModuleDetails(workspaceSlug, projectId, sourceModuleId).catch((error) =>
    console.error("Failed to load source module:", error)
  );
}
```

- [ ] **Step 3: Merge custom fields into the primary group menu**

Add `sourceModuleId?: string | null` to `FilterGroupBy` props. Use `useCustomFieldGrouping(sourceModuleId)`, `buildCustomFieldGroupOptions`, and existing translation keys:

```ts
const customOptions = buildCustomFieldGroupOptions({
  moduleFields,
  moduleLabel: t("common.module"),
  moduleName,
  projectFields,
  projectLabel: t("common.project"),
});
const options = [
  ...useGroupByOptions(groupByOptions).map((option) => ({
    key: option.key,
    title: t(option.titleTranslationKey),
  })),
  ...customOptions,
];
```

Render `title={groupBy.title}` and pass `sourceModuleId` from `DisplayFiltersSelection`. Do not modify `FilterSubGroupBy`.

- [ ] **Step 4: Build field-backed group columns**

Extend `TGetGroupByColumns` in `apps/web/core/components/issues/issue-layouts/utils.tsx` with `sourceModuleId?: string | null`. Before the static map, parse the selected key. Resolve the field from `store.projectRoot.projectIssueFields` or `store.moduleIssueFields`, then map `buildCustomFieldGroupColumns` into `IGroupByColumn` values:

```tsx
const customGroup = parseCustomFieldGroupKey(groupBy);
if (customGroup) {
  const field =
    customGroup.scope === "project" && projectId
      ? store.projectRoot.projectIssueFields.getFieldById(projectId, customGroup.fieldId)
      : sourceModuleId
        ? store.moduleIssueFields.getFieldById(sourceModuleId, customGroup.fieldId)
        : undefined;
  if (!field || !isGroupableCustomField(field)) return undefined;

  const memberIds = projectId ? (store.memberRoot.project.getProjectMemberIds(projectId, false) ?? []) : [];
  const members = memberIds.flatMap((memberId) => {
    const member = store.memberRoot.getUserDetails(memberId);
    return member
      ? [{ avatarUrl: member.avatar_url ?? undefined, displayName: member.display_name, id: memberId }]
      : [];
  });

  return buildCustomFieldGroupColumns(field, members).map((column) => ({
    id: column.id,
    name: column.name,
    icon:
      column.kind === "member" ? (
        <Avatar name={column.name} src={getFileURL(column.avatarUrl ?? "")} size="md" />
      ) : undefined,
    payload: {},
  }));
}
```

Task 5 replaces this empty payload after the quick-create payload helper exists.

- [ ] **Step 5: Supply grouping context in list and kanban**

Call `useCustomFieldGrouping()` in `List`, `KanBan`, and `KanBanSwimLanes`, then pass `projectId` and `sourceModuleId` into every `getGroupByColumns` call. This ensures a saved view with a custom `group_by` loads definitions even when the display dropdown was never opened.

- [ ] **Step 6: Run focused tests and type checks**

```bash
pnpm --filter=web exec vitest run core/components/issues/issue-layouts/custom-field-grouping.test.ts
pnpm --filter=web check:types
pnpm --filter=web check:lint
```

Expected: all commands exit 0 and the menu/column code has no unchecked custom-key casts beyond the adapter boundary.

- [ ] **Step 7: Commit menu and columns**

```bash
git add apps/web/core/hooks/use-custom-field-group-context.ts apps/web/core/hooks/use-custom-field-grouping.ts apps/web/core/components/issues/issue-layouts/filters/header/display-filters/group-by.tsx apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-filters-selection.tsx apps/web/ce/components/issues/issue-layouts/utils.tsx apps/web/core/components/issues/issue-layouts/utils.tsx apps/web/core/components/issues/issue-layouts/list/default.tsx apps/web/core/components/issues/issue-layouts/kanban/default.tsx apps/web/core/components/issues/issue-layouts/kanban/swimlanes.tsx
git commit -m "feat: show custom fields in group options"
```

---

### Task 3: Teach Local Grouping And Requests About Dynamic Keys

**Files:**

- Modify: `apps/web/core/components/issues/issue-layouts/custom-field-grouping.test.ts`
- Modify: `apps/web/core/components/issues/issue-layouts/custom-field-grouping.ts`
- Modify: `apps/web/core/store/issue/helpers/issue-filter-helper.store.ts`
- Modify: `apps/web/core/store/issue/helpers/base-issues.store.ts`
- Modify: `apps/web/core/store/issue/helpers/base-issues-utils.ts`
- Modify: `apps/web/core/components/issues/issue-layouts/utils.tsx`

- [ ] **Step 1: Add failing value projection and sanitization tests**

Add `type TIssue` to the existing `@plane/types` import, then append tests that prove project/module values can be read, projected, cleared, and stripped from API payloads:

```ts
it("projects project and module group values onto an issue", () => {
  const issue = {
    id: "issue-1",
    field_values: {},
    module_field_values: {},
  } as TIssue;

  const projectIssue = applyCustomFieldGroupValue(issue, "customproperty_select-field", "option-a");
  expect(projectIssue.field_values).toEqual({ "select-field": "option-a" });
  expect(projectIssue["customproperty_select-field"]).toBe("option-a");

  const moduleIssue = applyCustomFieldGroupValue(issue, "modulecustomproperty_member-field", "member-1", "module-1");
  expect(moduleIssue.module_field_values).toEqual({
    "module-1": { "member-field": "member-1" },
  });
  expect(moduleIssue["modulecustomproperty_member-field"]).toBe("member-1");
});

it("reads fallback field maps and clears None values", () => {
  const issue = {
    field_values: { "select-field": "option-a" },
    module_field_values: { "module-1": { "member-field": "member-1" } },
  } as TIssue;
  expect(getCustomFieldGroupValue(issue, "customproperty_select-field")).toBe("option-a");
  expect(getCustomFieldGroupValue(issue, "modulecustomproperty_member-field", "module-1")).toBe("member-1");
  expect(normalizeCustomFieldGroupId("None")).toBeNull();
});

it("removes dynamic group annotations before issue API writes", () => {
  expect(
    stripCustomFieldGroupAnnotations({
      "customproperty_select-field": "option-a",
      field_values: { "select-field": "option-a" },
      name: "Created in group",
    })
  ).toEqual({
    field_values: { "select-field": "option-a" },
    name: "Created in group",
  });
});
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter=web exec vitest run core/components/issues/issue-layouts/custom-field-grouping.test.ts
```

Expected: FAIL because the projection and sanitization exports do not exist.

- [ ] **Step 3: Implement projection helpers**

Add these exports to the adapter:

```ts
export const normalizeCustomFieldGroupId = (groupId: string) => (groupId === "None" ? null : groupId);

export const getCustomFieldGroupValue = (
  issue: Partial<TIssue> | undefined,
  key: TCustomFieldGroupKey,
  moduleId?: string | null
): string | null => {
  if (!issue) return null;
  const annotation = issue[key];
  if (typeof annotation === "string" || annotation === null) return annotation;
  const parsed = parseCustomFieldGroupKey(key);
  if (!parsed) return null;
  const fallback =
    parsed.scope === "project"
      ? issue.field_values?.[parsed.fieldId]
      : moduleId
        ? issue.module_field_values?.[moduleId]?.[parsed.fieldId]
        : undefined;
  return typeof fallback === "string" ? fallback : null;
};

export const applyCustomFieldGroupValue = (
  issue: TIssue,
  key: TCustomFieldGroupKey,
  groupId: string,
  moduleId?: string | null
): TIssue => {
  const value = normalizeCustomFieldGroupId(groupId);
  const parsed = parseCustomFieldGroupKey(key);
  if (!parsed) return issue;
  if (parsed.scope === "project") {
    return {
      ...issue,
      [key]: value,
      field_values: { ...issue.field_values, [parsed.fieldId]: value },
    };
  }
  if (!moduleId) return issue;
  return {
    ...issue,
    [key]: value,
    module_field_values: {
      ...issue.module_field_values,
      [moduleId]: {
        ...issue.module_field_values?.[moduleId],
        [parsed.fieldId]: value,
      },
    },
  };
};

export const stripCustomFieldGroupAnnotations = <T extends Partial<TIssue>>(data: T): T =>
  Object.fromEntries(Object.entries(data).filter(([key]) => !isCustomFieldGroupKey(key))) as T;
```

- [ ] **Step 4: Pass both key prefixes through request mapping**

In `issue-filter-helper.store.ts`, replace module-only prefix checks with `isCustomFieldGroupKey` in both `getServerGroupBy` and `getServerGroupFilter`:

```ts
const getServerGroupBy = (groupBy: TIssueGroupByOptions | undefined) => {
  if (!groupBy) return undefined;
  if (isCustomFieldGroupKey(groupBy)) return groupBy;
  return EIssueGroupByToServerOptions[groupBy as keyof typeof EIssueGroupByToServerOptions];
};

const getServerGroupFilter = (groupBy: string) => {
  if (isCustomFieldGroupKey(groupBy)) return `${groupBy}__exact`;
  return EServerGroupByToFilterOptions[groupBy as EIssueGroupByToServerOptions];
};
```

- [ ] **Step 5: Resolve group values instead of assuming static issue properties**

In `BaseIssuesStore`, add a source-module getter:

```ts
get sourceModuleId() {
  if (this.moduleId) return this.moduleId;
  const viewId = this.rootIssueStore.viewId;
  return viewId ? this.rootIssueStore.rootStore.projectView.getViewById(viewId)?.source_module : undefined;
}
```

Add a local update action and expose it on `IBaseIssuesStore`:

```ts
updateIssueLocalState(issueId: string, data: Partial<TIssue>) {
  const issueBeforeUpdate = clone(this.rootIssueStore.issues.getIssueById(issueId));
  if (!issueBeforeUpdate) return;
  const nextIssue = { ...issueBeforeUpdate, ...data } as TIssue;
  this.rootIssueStore.issues.updateIssue(issueId, data);
  this.updateIssueList(nextIssue, issueBeforeUpdate);
}
```

Refactor `getUpdateDetails` and `getOrderByUpdateDetails` to obtain dynamic values through:

```ts
private getGroupValue = (issue: Partial<TIssue> | undefined, groupBy: TIssueGroupByOptions | undefined) => {
  if (!issue || !groupBy) return null;
  if (isCustomFieldGroupKey(groupBy)) return getCustomFieldGroupValue(issue, groupBy, this.sourceModuleId);
  const issueKey = ISSUE_GROUP_BY_KEY[groupBy];
  return issueKey ? issue[issueKey] : null;
};
```

Use `this.groupBy`/`this.subGroupBy` presence instead of `issueGroupKey`/`issueSubGroupKey` presence when deciding whether the store is grouped.

- [ ] **Step 6: Make drag payload construction dynamic-key aware**

Extract the existing scalar/array update logic into this helper above `handleGroupDragDrop`:

```ts
const getUpdatedStaticGroupValue = (
  currentValue: TIssue[keyof TIssue],
  sourceGroupId: string,
  destinationGroupId: string
) => {
  if (Array.isArray(currentValue)) {
    const nextValue = currentValue.filter((value) => value !== sourceGroupId);
    return destinationGroupId === "None" ? nextValue : uniq([...nextValue, destinationGroupId]);
  }
  return destinationGroupId === "None" ? null : destinationGroupId;
};
```

Then select the group property like this:

```ts
const groupKey = isCustomFieldGroupKey(groupBy) ? groupBy : ISSUE_FILTER_DEFAULT_DATA[groupBy];
const groupValue = isCustomFieldGroupKey(groupBy)
  ? normalizeCustomFieldGroupId(destination.groupId)
  : getUpdatedStaticGroupValue(sourceIssue[groupKey], source.groupId, destination.groupId);
```

Store the dynamic key and value in `updatedIssue`; it will be sanitized before the standard issue endpoint in Task 4.

Update `getGroupedWorkItemIds` in `base-issues-utils.ts` to call `getCustomFieldGroupValue` when its key is dynamic.

- [ ] **Step 7: Sanitize create requests**

In `BaseIssuesStore.createIssue`, preserve the optimistic `data` object but send a sanitized payload:

```ts
const response = await this.issueService.createIssue(workspaceSlug, projectId, stripCustomFieldGroupAnnotations(data));
```

- [ ] **Step 8: Run GREEN checks and commit**

```bash
pnpm --filter=web exec vitest run core/components/issues/issue-layouts/custom-field-grouping.test.ts
pnpm --filter=web check:types
pnpm --filter=web check:lint
git add apps/web/core/components/issues/issue-layouts/custom-field-grouping.ts apps/web/core/components/issues/issue-layouts/custom-field-grouping.test.ts apps/web/core/store/issue/helpers/issue-filter-helper.store.ts apps/web/core/store/issue/helpers/base-issues.store.ts apps/web/core/store/issue/helpers/base-issues-utils.ts apps/web/core/components/issues/issue-layouts/utils.tsx
git commit -m "feat: support dynamic custom field groups"
```

Expected: tests and checks pass; project custom group pagination now uses `customproperty_<id>__exact` rather than an undefined server mapping.

---

### Task 4: Implement Cross-Group Drag Persistence

**Files:**

- Modify: `apps/web/core/components/issues/issue-layouts/custom-field-grouping.test.ts`
- Modify: `apps/web/core/components/issues/issue-layouts/custom-field-grouping.ts`
- Create: `apps/web/core/hooks/use-custom-field-group-operations.ts`
- Modify: `apps/web/core/hooks/use-group-dragndrop.ts`
- Modify: `apps/web/core/store/issue/issue_kanban_view.store.ts`
- Modify: `apps/web/core/components/issues/issue-layouts/list/list-group.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/kanban/kanban-group.tsx`

- [ ] **Step 1: Write failing async reconciliation tests**

Add tests for all-success, all-failure rollback, and partial-failure refetch:

```ts
it("rolls back a drop when its only persistence request fails", async () => {
  const calls: string[] = [];
  await expect(
    executeCustomFieldGroupDrop({
      onPartialFailure: async () => calls.push("refetch"),
      onRollback: async () => calls.push("rollback"),
      persistFieldValue: async () => {
        calls.push("field");
        throw new Error("field failed");
      },
    })
  ).rejects.toThrow("field failed");
  expect(calls).toEqual(["field", "rollback"]);
});

it("refetches a drop after a partial persistence failure", async () => {
  const calls: string[] = [];
  await expect(
    executeCustomFieldGroupDrop({
      onPartialFailure: async () => calls.push("refetch"),
      onRollback: async () => calls.push("rollback"),
      persistFieldValue: async () => calls.push("field"),
      persistSortOrder: async () => {
        calls.push("sort");
        throw new Error("sort failed");
      },
    })
  ).rejects.toThrow("sort failed");
  expect(calls).toEqual(["field", "sort", "refetch"]);
});
```

- [ ] **Step 2: Run RED, then add the executor**

Run the focused test and confirm it fails for the missing export. Add:

```ts
export const executeCustomFieldGroupDrop = async ({
  onPartialFailure,
  onRollback,
  persistFieldValue,
  persistSortOrder,
}: {
  onPartialFailure: () => Promise<void>;
  onRollback: () => Promise<void> | void;
  persistFieldValue: () => Promise<unknown>;
  persistSortOrder?: () => Promise<unknown>;
}) => {
  const operations = [persistFieldValue(), ...(persistSortOrder ? [persistSortOrder()] : [])];
  const results = await Promise.allSettled(operations);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (!rejected) return;
  const fulfilledCount = results.filter((result) => result.status === "fulfilled").length;
  if (fulfilledCount > 0) await onPartialFailure();
  else await onRollback();
  throw rejected.reason;
};
```

Run the test again and confirm it passes.

- [ ] **Step 3: Add a store-connected operations hook**

Create `use-custom-field-group-operations.ts`. It must expose:

```ts
type TOperations = {
  applyOptimisticValue: (issue: TIssue, groupId: string) => TIssue;
  persistDrop: (issue: TIssue, groupId: string, sortOrder?: number) => Promise<void>;
  refetchCurrentGrouping: () => Promise<void>;
};
```

Implementation requirements:

- Resolve the group key with `parseCustomFieldGroupKey`.
- Use `useCustomFieldGroupContext` for `workspaceSlug`, `projectId`, and `sourceModuleId`.
- Use `useProjectIssueFields().updateIssueValues` for project scope.
- Use `useModuleIssueFields().updateIssueValues` for module scope.
- Call `issues.updateIssueLocalState` before persistence.
- Project payload: `{ field_values: { [fieldId]: value } }`.
- Module payload: `{ field_values: { [fieldId]: value } }` with the resolved module ID in the endpoint arguments.
- Optional sort persistence calls the existing `updateIssue(projectId, issue.id, { sort_order })` action.
- Refetch with `fetchIssues("mutation", { canGroup: true, perPageCount: 50 }, viewId)`.
- On an all-failure result, restore the complete pre-drop issue through `updateIssueLocalState`.
- On partial failure, refetch and let the existing drag error toast report the error.

- [ ] **Step 4: Route dynamic drops through the operations hook**

In `use-group-dragndrop.ts`, detect a dynamic key in `data` inside `updateIssueOnDrop`. Remove the dynamic annotation and `sort_order` from the standard issue patch. For a custom group call `persistDrop`; for static groups retain the existing cycle/module/issue flow.

The custom path must `await` `persistDrop` so the existing catch attached to `handleGroupDragDrop` displays failures.

- [ ] **Step 5: Enable drag affordances for custom groups**

Add and use this adapter helper:

```ts
import { DRAG_ALLOWED_GROUPS } from "@plane/constants";

export const isIssueGroupDragAllowed = (groupBy: TIssueGroupByOptions | undefined) =>
  !!groupBy && (isCustomFieldGroupKey(groupBy) || DRAG_ALLOWED_GROUPS.includes(groupBy));
```

Use it in:

- `IssueKanbanViewStore.getCanUserDragDrop`
- `ListGroup` instead of `DRAG_ALLOWED_GROUPS.includes(group_by)`
- `KanbanGroup` for `canDragIssuesInCurrentGrouping`

- [ ] **Step 6: Verify and commit drag behavior**

```bash
pnpm --filter=web exec vitest run core/components/issues/issue-layouts/custom-field-grouping.test.ts
pnpm --filter=web check:types
pnpm --filter=web check:lint
git add apps/web/core/components/issues/issue-layouts/custom-field-grouping.ts apps/web/core/components/issues/issue-layouts/custom-field-grouping.test.ts apps/web/core/hooks/use-custom-field-group-operations.ts apps/web/core/hooks/use-group-dragndrop.ts apps/web/core/store/issue/issue_kanban_view.store.ts apps/web/core/components/issues/issue-layouts/list/list-group.tsx apps/web/core/components/issues/issue-layouts/kanban/kanban-group.tsx
git commit -m "feat: update custom fields on group drag"
```

---

### Task 5: Implement Group-Aware Quick And Modal Creation

**Files:**

- Modify: `apps/web/core/components/issues/issue-layouts/custom-field-grouping.test.ts`
- Modify: `apps/web/core/components/issues/issue-layouts/custom-field-grouping.ts`
- Modify: `apps/web/core/hooks/use-custom-field-group-operations.ts`
- Modify: `apps/web/core/components/issues/issue-layouts/utils.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/list/list-group.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/kanban/kanban-group.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/list/headers/group-by-card.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/kanban/headers/group-by-card.tsx`

- [ ] **Step 1: Write failing quick-create payload tests**

```ts
it("builds project and module quick-create data", () => {
  expect(getCustomFieldGroupQuickAddData("customproperty_select-field", "option-a", null)).toEqual({
    "customproperty_select-field": "option-a",
    field_values: { "select-field": "option-a" },
  });
  expect(getCustomFieldGroupQuickAddData("modulecustomproperty_member-field", "member-1", "module-1")).toEqual({
    module_ids: ["module-1"],
    "modulecustomproperty_member-field": "member-1",
  });
  expect(getCustomFieldGroupQuickAddData("modulecustomproperty_member-field", "None", "module-1")).toEqual({
    module_ids: ["module-1"],
    "modulecustomproperty_member-field": null,
  });
});
```

- [ ] **Step 2: Write failing module post-create sequencing tests**

```ts
it("persists a populated module group after create completes", async () => {
  const calls: string[] = [];
  const issue = { id: "issue-1", project_id: "project-1" } as TIssue;
  const result = await executeCustomFieldGroupQuickCreate({
    createIssue: async () => {
      calls.push("create-and-attach");
      return issue;
    },
    groupId: "member-1",
    groupKey: "modulecustomproperty_member-field",
    onPartialFailure: async () => calls.push("refetch"),
    persistModuleFieldValue: async () => calls.push("field"),
  });
  expect(result).toBe(issue);
  expect(calls).toEqual(["create-and-attach", "field"]);
});

it("retains a created issue and refetches when module field persistence fails", async () => {
  const calls: string[] = [];
  await expect(
    executeCustomFieldGroupQuickCreate({
      createIssue: async () => {
        calls.push("create-and-attach");
        return { id: "issue-1", project_id: "project-1" } as TIssue;
      },
      groupId: "member-1",
      groupKey: "modulecustomproperty_member-field",
      onPartialFailure: async () => calls.push("refetch"),
      persistModuleFieldValue: async () => {
        calls.push("field");
        throw new Error("field failed");
      },
    })
  ).rejects.toThrow("created, but its grouping field could not be set");
  expect(calls).toEqual(["create-and-attach", "field", "refetch"]);
});
```

- [ ] **Step 3: Run RED and implement quick-create helpers**

Add:

```ts
export const getCustomFieldGroupQuickAddData = (
  key: TCustomFieldGroupKey,
  groupId: string,
  moduleId?: string | null
): Partial<TIssue> => {
  const parsed = parseCustomFieldGroupKey(key);
  const value = normalizeCustomFieldGroupId(groupId);
  if (!parsed) return {};
  if (parsed.scope === "project") {
    return {
      [key]: value,
      field_values: value === null ? {} : { [parsed.fieldId]: value },
    };
  }
  return {
    [key]: value,
    ...(moduleId ? { module_ids: [moduleId] } : {}),
  };
};

export const executeCustomFieldGroupQuickCreate = async ({
  createIssue,
  groupId,
  groupKey,
  onPartialFailure,
  persistModuleFieldValue,
}: {
  createIssue: () => Promise<TIssue | undefined>;
  groupId: string;
  groupKey: TCustomFieldGroupKey;
  onPartialFailure: () => Promise<void>;
  persistModuleFieldValue: (issue: TIssue, value: string) => Promise<unknown>;
}) => {
  const issue = await createIssue();
  if (!issue) return undefined;
  const parsed = parseCustomFieldGroupKey(groupKey);
  const value = normalizeCustomFieldGroupId(groupId);
  if (parsed?.scope !== "module" || value === null) return issue;
  try {
    await persistModuleFieldValue(issue, value);
    return issue;
  } catch (cause) {
    await onPartialFailure();
    throw new Error("Work item was created, but its grouping field could not be set.", { cause });
  }
};
```

Run the focused test and confirm it passes.

- [ ] **Step 4: Use group payloads for both creation surfaces**

Replace Task 2's temporary `payload: {}` in `getGroupByColumns` with:

```ts
payload: getCustomFieldGroupQuickAddData(groupBy, column.id, sourceModuleId),
```

Update list and kanban `prePopulateQuickAddData` helpers so their first branch is:

```ts
if (isCustomFieldGroupKey(groupByKey)) {
  return {
    ...preloadedData,
    ...getCustomFieldGroupQuickAddData(groupByKey, groupValue, sourceModuleId),
  };
}
```

Obtain `sourceModuleId` from `useCustomFieldGroupContext`.

- [ ] **Step 5: Wrap bottom quick-create callbacks**

Extend `useCustomFieldGroupOperations` with:

```ts
wrapQuickCreate: (
    groupId: string,
    createIssue: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>
  ) =>
  (projectId: string | null | undefined, data: TIssue) =>
    Promise<TIssue | undefined>;
```

The wrapper finds the dynamic key in `data`, calls `executeCustomFieldGroupQuickCreate`, and persists module values after the existing quick-create function returns. Because `module_ids` is already in the payload, both the module store and base project/view store finish module attachment before returning.

Use the wrapper in `ListGroup` and `KanbanGroup` before passing `quickAddCallback` to `QuickAddIssueRoot`.

- [ ] **Step 6: Finish modal creation**

Extend both group header components to call `useCustomFieldGroupOperations`. Pass this callback to `CreateUpdateIssueModal`:

```tsx
onSubmit={(issue) => handleCreatedIssue(issue, columnId)}
```

Use `groupID` for the list header and `column_id` for the kanban header. For project groups the callback resolves immediately because `field_values` was in the create payload. For populated module groups it writes the module field; for `None` it performs no field write.

The operation hook should catch the adapter's partial-create error, show a toast whose message combines the existing issue-created success text with the existing project field update error text, refetch, and rethrow so the modal/quick-create caller does not report a false full success.

- [ ] **Step 7: Verify and commit creation behavior**

```bash
pnpm --filter=web exec vitest run core/components/issues/issue-layouts/custom-field-grouping.test.ts
pnpm --filter=web check:types
pnpm --filter=web check:lint
git add apps/web/core/components/issues/issue-layouts/custom-field-grouping.ts apps/web/core/components/issues/issue-layouts/custom-field-grouping.test.ts apps/web/core/hooks/use-custom-field-group-operations.ts apps/web/core/components/issues/issue-layouts/utils.tsx apps/web/core/components/issues/issue-layouts/list/list-group.tsx apps/web/core/components/issues/issue-layouts/kanban/kanban-group.tsx apps/web/core/components/issues/issue-layouts/list/headers/group-by-card.tsx apps/web/core/components/issues/issue-layouts/kanban/headers/group-by-card.tsx
git commit -m "feat: create work items in custom groups"
```

---

### Task 6: Fix Spreadsheet Row Separators

**Files:**

- Create: `apps/web/core/components/issues/issue-layouts/spreadsheet/custom-field-cell.tsx`
- Create: `apps/web/core/components/issues/issue-layouts/spreadsheet/custom-field-cell.test.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/spreadsheet/issue-column.tsx`

- [ ] **Step 1: Write the failing rendered-class test**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpreadsheetCustomFieldCell } from "./custom-field-cell";

describe("SpreadsheetCustomFieldCell", () => {
  it("uses the same horizontal separator as built-in spreadsheet columns", () => {
    const html = renderToStaticMarkup(
      <SpreadsheetCustomFieldCell>
        <span>value</span>
      </SpreadsheetCustomFieldCell>
    );
    expect(html).toContain("border-b-[0.5px]");
    expect(html).toContain("border-subtle");
  });
});
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter=web exec vitest run core/components/issues/issue-layouts/spreadsheet/custom-field-cell.test.tsx
```

Expected: FAIL because the wrapper component does not exist.

- [ ] **Step 3: Implement and use the shared wrapper**

Create:

```tsx
import type { PropsWithChildren } from "react";

export function SpreadsheetCustomFieldCell(props: PropsWithChildren) {
  return <div className="flex h-full w-full items-center border-b-[0.5px] border-subtle px-2">{props.children}</div>;
}
```

Replace both duplicated custom field wrapper `<div>` elements in `issue-column.tsx` with `SpreadsheetCustomFieldCell`. Do not modify the editors or the built-in column branch.

- [ ] **Step 4: Run GREEN and commit**

```bash
pnpm --filter=web exec vitest run core/components/issues/issue-layouts/spreadsheet/custom-field-cell.test.tsx
pnpm --filter=web check:types
pnpm --filter=web check:lint
git add apps/web/core/components/issues/issue-layouts/spreadsheet/custom-field-cell.tsx apps/web/core/components/issues/issue-layouts/spreadsheet/custom-field-cell.test.tsx apps/web/core/components/issues/issue-layouts/spreadsheet/issue-column.tsx
git commit -m "fix: align custom field spreadsheet cells"
```

---

### Task 7: Full Verification And Browser QA

**Files:**

- Modify only files required to fix issues found by verification.

- [ ] **Step 1: Run all new unit tests**

```bash
pnpm --filter=web test
```

Expected: all web tests pass with zero failures.

- [ ] **Step 2: Run focused package checks**

```bash
pnpm --filter=@plane/types check:types
pnpm --filter=web check:types
pnpm --filter=web check:lint
pnpm --filter=web check:format
```

Expected: all commands exit 0.

- [ ] **Step 3: Run existing backend grouping contract tests**

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/unit/filters/test_project_issue_field_filters.py apps/api/plane/tests/unit/filters/test_module_issue_field_filters.py -q
```

Expected: both files pass. If Docker prerequisites are unavailable, report that explicitly rather than claiming backend verification.

- [ ] **Step 4: Run React Doctor**

Invoke the repository `react-doctor` skill and follow its regression and local-triage workflow for the changed React files. Apply only findings caused by this work, then rerun the focused tests and checks.

- [ ] **Step 5: Start the web app and run browser QA**

Start the web server:

```bash
pnpm --filter=web dev
```

Use the in-app browser control skill against the reported local URL. Verify:

1. Project list and kanban menus show `Current owner (Project)` style labels only for eligible fields.
2. A module page shows both project fields and `Special label (Module ABC)` style labels.
3. A source-module project view shows fields only from its source module.
4. Single-select and single-member group columns show values, avatars, counts, and `None`.
5. Dragging populated-to-populated, populated-to-`None`, and `None`-to-populated persists after refresh.
6. Bottom quick creation and header modal creation land in the selected project/module group after refresh.
7. Project and module custom spreadsheet cells have continuous horizontal separators at desktop and mobile widths.
8. No menu, header, cell, or dropdown content overlaps at desktop and mobile widths.

Capture screenshots for list, kanban, and spreadsheet evidence.

- [ ] **Step 6: Run final fresh verification**

After any QA fixes, rerun:

```bash
pnpm --filter=web test
pnpm --filter=@plane/types check:types
pnpm --filter=web check:types
pnpm --filter=web check:lint
pnpm --filter=web check:format
git diff --check
git status --short
```

Expected: tests/checks exit 0; `git diff --check` is clean; status contains only intentional work plus the pre-existing untracked `docs/superpowers/plans/2026-07-09-module-custom-fields.md`.

- [ ] **Step 7: Commit verification fixes if any**

```bash
git diff --name-only --diff-filter=ACM -z | xargs -0 git add --
git commit -m "fix: address custom grouping verification"
```

Skip this commit when verification required no code changes.
