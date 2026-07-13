import type { TModuleIssueField, TProjectIssueField } from "@plane/types";
import { EProjectIssueFieldType } from "@plane/types";
import { describe, expect, it } from "vitest";

import {
  buildCustomFieldGroupColumns,
  buildCustomFieldGroupOptions,
  isGroupableCustomField,
  parseCustomFieldGroupKey,
} from "./custom-field-grouping";

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
