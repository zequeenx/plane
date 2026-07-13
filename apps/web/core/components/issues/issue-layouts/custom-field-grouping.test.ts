import type { TIssue, TModuleIssueField, TProjectIssueField } from "@plane/types";
import { EProjectIssueFieldType } from "@plane/types";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { TIssueApiPayload } from "./custom-field-grouping";

import {
  applyCustomFieldGroupValue,
  buildCustomFieldGroupColumns,
  buildCustomFieldGroupOptions,
  executeCustomFieldGroupDrop,
  getCustomFieldGroupValue,
  getCustomFieldGroupColumns,
  isGroupableCustomField,
  isIssueGroupDragAllowed,
  normalizeCustomFieldGroupId,
  parseCustomFieldGroupKey,
  resolveCustomFieldGroupField,
  stripCustomFieldGroupAnnotations,
} from "./custom-field-grouping";

const issueFixture = (overrides: Partial<TIssue> = {}): TIssue => ({
  archived_at: null,
  assignee_ids: [],
  attachment_count: 0,
  completed_at: null,
  created_at: "2026-07-13T00:00:00Z",
  created_by: "member-1",
  cycle_id: null,
  estimate_point: null,
  field_values: {},
  id: "issue-1",
  is_draft: false,
  label_ids: [],
  link_count: 0,
  module_ids: ["module-1"],
  name: "Grouped work item",
  parent_id: null,
  priority: "none",
  project_id: "project-1",
  sequence_id: 1,
  sort_order: 100,
  start_date: null,
  state_id: "state-1",
  sub_issues_count: 0,
  sub_state_id: null,
  target_date: null,
  type_id: null,
  updated_at: "2026-07-13T00:00:00Z",
  updated_by: "member-1",
  ...overrides,
});

const projectFieldBase: TProjectIssueField = {
  created_at: "2026-07-13T00:00:00Z",
  description: "",
  disabled_at: null,
  field_type: EProjectIssueFieldType.SINGLE_SELECT,
  id: "select-field",
  is_disabled: false,
  name: "Special label",
  options: [
    {
      created_at: "2026-07-13T00:00:00Z",
      field: "select-field",
      id: "option-1",
      project: "project-1",
      sort_order: 100,
      updated_at: "2026-07-13T00:00:00Z",
      value: "Urgent",
      workspace: "workspace-1",
    },
  ],
  project: "project-1",
  sort_order: 100,
  updated_at: "2026-07-13T00:00:00Z",
  workspace: "workspace-1",
};

const memberField: TProjectIssueField = {
  ...projectFieldBase,
  field_type: EProjectIssueFieldType.SINGLE_MEMBER,
  id: "member-field",
  name: "Current owner",
  options: [],
};

const disabledField: TProjectIssueField = {
  ...projectFieldBase,
  is_disabled: true,
};

const unsupportedField: TProjectIssueField = {
  ...projectFieldBase,
  field_type: EProjectIssueFieldType.PLAIN_TEXT,
};

const moduleField: TModuleIssueField = {
  ...projectFieldBase,
  id: "select-field",
  module: "module-1",
  name: "Special label",
  options: projectFieldBase.options.map((option) => ({ ...option, module: "module-1" })),
};

describe("parseCustomFieldGroupKey", () => {
  it("parses project custom field group keys", () => {
    expect(parseCustomFieldGroupKey("customproperty_select-field")).toEqual({
      fieldId: "select-field",
      scope: "project",
    });
  });

  it("parses module custom field group keys", () => {
    expect(parseCustomFieldGroupKey("modulecustomproperty_member-field")).toEqual({
      fieldId: "member-field",
      scope: "module",
    });
  });

  it("ignores system group keys", () => {
    expect(parseCustomFieldGroupKey("priority")).toBeUndefined();
  });
});

describe("custom field group values", () => {
  it("projects project custom field groups into the field map and flattened annotation", () => {
    const result = applyCustomFieldGroupValue(issueFixture(), "customproperty_select-field", "option-a");

    expect(result.field_values["select-field"]).toBe("option-a");
    expect(result["customproperty_select-field"]).toBe("option-a");
  });

  it("projects module custom field groups into the source module map and flattened annotation", () => {
    const result = applyCustomFieldGroupValue(
      issueFixture({ module_field_values: { "module-1": {} } }),
      "modulecustomproperty_member-field",
      "member-1",
      "module-1"
    );

    expect(result.module_field_values?.["module-1"]?.["member-field"]).toBe("member-1");
    expect(result["modulecustomproperty_member-field"]).toBe("member-1");
  });

  it("falls back to project and source module field maps", () => {
    const issue = issueFixture({
      field_values: { "select-field": "option-a" },
      module_field_values: { "module-1": { "member-field": "member-1" } },
    });

    expect(getCustomFieldGroupValue(issue, "customproperty_select-field")).toBe("option-a");
    expect(getCustomFieldGroupValue(issue, "modulecustomproperty_member-field", "module-1")).toBe("member-1");
  });

  it("normalizes the unassigned group to a null field value", () => {
    expect(normalizeCustomFieldGroupId("None")).toBeNull();
  });
});

describe("stripCustomFieldGroupAnnotations", () => {
  it("removes project and module annotations while preserving issue fields and field maps", () => {
    const data: Partial<TIssue> = {
      "customproperty_select-field": "option-a",
      field_values: { "select-field": "option-a" },
      module_field_values: { "module-1": { "member-field": "member-1" } },
      "modulecustomproperty_member-field": "member-1",
      name: "Grouped work item",
    };

    expect(stripCustomFieldGroupAnnotations(data)).toEqual({
      field_values: { "select-field": "option-a" },
      module_field_values: { "module-1": { "member-field": "member-1" } },
      name: "Grouped work item",
    });
    expectTypeOf(stripCustomFieldGroupAnnotations(data)).toEqualTypeOf<TIssueApiPayload>();
  });
});

describe("isGroupableCustomField", () => {
  it("allows enabled single select and single member fields", () => {
    expect(isGroupableCustomField(projectFieldBase)).toBe(true);
    expect(isGroupableCustomField(memberField)).toBe(true);
  });

  it("rejects disabled and unsupported fields", () => {
    expect(isGroupableCustomField(disabledField)).toBe(false);
    expect(isGroupableCustomField(unsupportedField)).toBe(false);
  });
});

describe("buildCustomFieldGroupOptions", () => {
  it("returns project options before source-aware module options", () => {
    expect(
      buildCustomFieldGroupOptions({
        moduleFields: [moduleField],
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
});

describe("buildCustomFieldGroupColumns", () => {
  it("builds select option columns and appends the None column", () => {
    expect(buildCustomFieldGroupColumns(projectFieldBase, [])).toEqual([
      { id: "option-1", kind: "option", name: "Urgent" },
      { id: "None", kind: "none", name: "None" },
    ]);
  });

  it("builds member columns and appends the None column", () => {
    expect(
      buildCustomFieldGroupColumns(memberField, [
        { avatarUrl: "avatar.png", displayName: "Ada Lovelace", id: "member-1" },
      ])
    ).toEqual([
      { avatarUrl: "avatar.png", id: "member-1", kind: "member", name: "Ada Lovelace" },
      { id: "None", kind: "none", name: "None" },
    ]);
  });
});

describe("resolveCustomFieldGroupField", () => {
  it("does not resolve a project group key from the module field store", () => {
    expect(
      resolveCustomFieldGroupField({
        customGroup: { fieldId: "select-field", scope: "project" },
        getModuleField: () => moduleField,
        getProjectField: () => projectFieldBase,
        sourceModuleId: "module-1",
      })
    ).toBeUndefined();
  });

  it("does not resolve a module group key from the project field store", () => {
    expect(
      resolveCustomFieldGroupField({
        customGroup: { fieldId: "select-field", scope: "module" },
        getModuleField: () => moduleField,
        getProjectField: () => projectFieldBase,
        projectId: "project-1",
      })
    ).toBeUndefined();
  });

  it("resolves a module group key from its source module field store", () => {
    expect(
      resolveCustomFieldGroupField({
        customGroup: { fieldId: "select-field", scope: "module" },
        getModuleField: () => moduleField,
        getProjectField: () => projectFieldBase,
        projectId: "project-1",
        sourceModuleId: "module-1",
      })
    ).toBe(moduleField);
  });
});

describe("getCustomFieldGroupColumns", () => {
  it("waits for an active custom field definition request", () => {
    expect(
      getCustomFieldGroupColumns({
        field: undefined,
        isEpic: false,
        isLoading: true,
        members: [],
      })
    ).toBeUndefined();
  });

  it("returns the ungrouped column when a saved custom field is unavailable", () => {
    expect(
      getCustomFieldGroupColumns({
        field: undefined,
        isEpic: false,
        isLoading: false,
        members: [],
      })
    ).toEqual([{ id: "All Issues", kind: "all", name: "All work items" }]);
  });

  it("returns the ungrouped column when a saved custom field is disabled", () => {
    expect(
      getCustomFieldGroupColumns({
        field: disabledField,
        isEpic: true,
        isLoading: false,
        members: [],
      })
    ).toEqual([{ id: "All Issues", kind: "all", name: "All Epics" }]);
  });

  it("returns field-backed columns when the saved custom field is eligible", () => {
    expect(
      getCustomFieldGroupColumns({
        field: projectFieldBase,
        isEpic: false,
        isLoading: false,
        members: [],
      })
    ).toEqual([
      { id: "option-1", kind: "option", name: "Urgent" },
      { id: "None", kind: "none", name: "None" },
    ]);
  });
});

describe("executeCustomFieldGroupDrop", () => {
  it("persists the field value and optional sort order without reconciliation when both succeed", async () => {
    const onPartialFailure = vi.fn<() => Promise<void>>().mockResolvedValue();
    const onReconciliationError = vi.fn<(error: unknown) => void>();
    const onRollback = vi.fn<() => void>();
    const persistFieldValue = vi.fn<() => Promise<void>>().mockResolvedValue();
    const persistSortOrder = vi.fn<() => Promise<void>>().mockResolvedValue();

    await expect(
      executeCustomFieldGroupDrop({
        onPartialFailure,
        onReconciliationError,
        onRollback,
        persistFieldValue,
        persistSortOrder,
      })
    ).resolves.toBeUndefined();

    expect(persistFieldValue).toHaveBeenCalledTimes(1);
    expect(persistSortOrder).toHaveBeenCalledTimes(1);
    expect(onPartialFailure).not.toHaveBeenCalled();
    expect(onReconciliationError).not.toHaveBeenCalled();
    expect(onRollback).not.toHaveBeenCalled();
  });

  it("rolls back and rejects the original error when the only persistence request fails", async () => {
    const fieldError = new Error("field request failed");
    const onPartialFailure = vi.fn<() => Promise<void>>().mockResolvedValue();
    const onReconciliationError = vi.fn<(error: unknown) => void>();
    const onRollback = vi.fn<() => void>();
    const persistFieldValue = vi.fn<() => Promise<void>>().mockRejectedValue(fieldError);

    await expect(
      executeCustomFieldGroupDrop({ onPartialFailure, onReconciliationError, onRollback, persistFieldValue })
    ).rejects.toBe(fieldError);

    expect(persistFieldValue).toHaveBeenCalledTimes(1);
    expect(onRollback).toHaveBeenCalledTimes(1);
    expect(onPartialFailure).not.toHaveBeenCalled();
  });

  it("rolls back when both persistence requests fail", async () => {
    const fieldError = new Error("field request failed");
    const sortError = new Error("sort request failed");
    const onPartialFailure = vi.fn<() => Promise<void>>().mockResolvedValue();
    const onReconciliationError = vi.fn<(error: unknown) => void>();
    const onRollback = vi.fn<() => void>();
    const persistFieldValue = vi.fn<() => Promise<void>>().mockRejectedValue(fieldError);
    const persistSortOrder = vi.fn<() => Promise<void>>().mockRejectedValue(sortError);

    await expect(
      executeCustomFieldGroupDrop({
        onPartialFailure,
        onReconciliationError,
        onRollback,
        persistFieldValue,
        persistSortOrder,
      })
    ).rejects.toBe(fieldError);

    expect(persistFieldValue).toHaveBeenCalledTimes(1);
    expect(persistSortOrder).toHaveBeenCalledTimes(1);
    expect(onRollback).toHaveBeenCalledTimes(1);
    expect(onPartialFailure).not.toHaveBeenCalled();
  });

  it("refetches instead of rolling back when only sort persistence fails", async () => {
    const sortError = new Error("sort request failed");
    const onPartialFailure = vi.fn<() => Promise<void>>().mockResolvedValue();
    const onReconciliationError = vi.fn<(error: unknown) => void>();
    const onRollback = vi.fn<() => void>();
    const persistFieldValue = vi.fn<() => Promise<void>>().mockResolvedValue();
    const persistSortOrder = vi.fn<() => Promise<void>>().mockRejectedValue(sortError);

    await expect(
      executeCustomFieldGroupDrop({
        onPartialFailure,
        onReconciliationError,
        onRollback,
        persistFieldValue,
        persistSortOrder,
      })
    ).rejects.toBe(sortError);

    expect(onPartialFailure).toHaveBeenCalledTimes(1);
    expect(onRollback).not.toHaveBeenCalled();
  });

  it("refetches instead of rolling back when only field persistence fails", async () => {
    const fieldError = new Error("field request failed");
    const onPartialFailure = vi.fn<() => Promise<void>>().mockResolvedValue();
    const onReconciliationError = vi.fn<(error: unknown) => void>();
    const onRollback = vi.fn<() => void>();
    const persistFieldValue = vi.fn<() => Promise<void>>().mockRejectedValue(fieldError);
    const persistSortOrder = vi.fn<() => Promise<void>>().mockResolvedValue();

    await expect(
      executeCustomFieldGroupDrop({
        onPartialFailure,
        onReconciliationError,
        onRollback,
        persistFieldValue,
        persistSortOrder,
      })
    ).rejects.toBe(fieldError);

    expect(onPartialFailure).toHaveBeenCalledTimes(1);
    expect(onRollback).not.toHaveBeenCalled();
  });

  it("preserves the persistence error when rollback fails and reports the rollback error", async () => {
    const fieldError = new Error("field request failed");
    const rollbackError = new Error("rollback failed");
    const onPartialFailure = vi.fn<() => Promise<void>>().mockResolvedValue();
    const onReconciliationError = vi.fn<(error: unknown) => void>();
    const onRollback = vi.fn<() => Promise<void>>().mockRejectedValue(rollbackError);
    const persistFieldValue = vi.fn<() => Promise<void>>().mockRejectedValue(fieldError);

    await expect(
      executeCustomFieldGroupDrop({
        onPartialFailure,
        onReconciliationError,
        onRollback,
        persistFieldValue,
      })
    ).rejects.toBe(fieldError);

    expect(onReconciliationError).toHaveBeenCalledWith(rollbackError);
  });

  it("preserves the persistence error when partial-failure refetch fails and reports the refetch error", async () => {
    const sortError = new Error("sort request failed");
    const refetchError = new Error("refetch failed");
    const onPartialFailure = vi.fn<() => Promise<void>>().mockRejectedValue(refetchError);
    const onReconciliationError = vi.fn<(error: unknown) => void>();
    const onRollback = vi.fn<() => void>();
    const persistFieldValue = vi.fn<() => Promise<void>>().mockResolvedValue();
    const persistSortOrder = vi.fn<() => Promise<void>>().mockRejectedValue(sortError);

    await expect(
      executeCustomFieldGroupDrop({
        onPartialFailure,
        onReconciliationError,
        onRollback,
        persistFieldValue,
        persistSortOrder,
      })
    ).rejects.toBe(sortError);

    expect(onReconciliationError).toHaveBeenCalledWith(refetchError);
  });
});

describe("isIssueGroupDragAllowed", () => {
  it("allows static and custom field groupings", () => {
    expect(isIssueGroupDragAllowed("state")).toBe(true);
    expect(isIssueGroupDragAllowed("customproperty_select-field")).toBe(true);
    expect(isIssueGroupDragAllowed("modulecustomproperty_member-field")).toBe(true);
  });

  it("rejects missing and unsupported groupings", () => {
    expect(isIssueGroupDragAllowed(undefined)).toBe(false);
    expect(isIssueGroupDragAllowed("created_by")).toBe(false);
  });
});
