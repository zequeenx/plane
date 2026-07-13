import type { TIssue } from "@plane/types";
import { describe, expect, it, vi } from "vitest";

import type { TCustomFieldGroupOperationDependencies } from "./custom-field-group-operations";
import { createCustomFieldGroupOperations } from "./custom-field-group-operations";

const issueFixture = (overrides: Partial<TIssue> = {}): TIssue => ({
  archived_at: null,
  assignee_ids: [],
  attachment_count: 0,
  completed_at: null,
  created_at: "2026-07-13T00:00:00Z",
  created_by: "member-1",
  cycle_id: null,
  estimate_point: null,
  field_values: { "select-field": "option-a" },
  id: "issue-1",
  is_draft: false,
  label_ids: [],
  link_count: 0,
  module_field_values: { "module-1": { "member-field": "member-1" } },
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

const dependencyFixture = (
  overrides: Partial<TCustomFieldGroupOperationDependencies> = {}
): TCustomFieldGroupOperationDependencies => ({
  currentViewId: "view-1",
  fetchIssues: vi.fn(async () => undefined),
  groupBy: "customproperty_select-field",
  projectId: "project-1",
  sourceModuleId: "module-1",
  updateIssue: vi.fn(async () => undefined),
  updateIssueLocalState: vi.fn(),
  updateModuleIssueValues: vi.fn(async () => ({})),
  updateProjectIssueValues: vi.fn(async () => ({ field_values: {} })),
  workspaceSlug: "workspace-1",
  ...overrides,
});

const missingContextCases = [
  ["group", { groupBy: "priority" }],
  ["workspace", { workspaceSlug: undefined }],
  ["project", { projectId: undefined }],
] satisfies [string, Partial<TCustomFieldGroupOperationDependencies>][];

describe("createCustomFieldGroupOperations", () => {
  it("persists project field and sort values through separate endpoints", async () => {
    const dependencies = dependencyFixture();
    const operations = createCustomFieldGroupOperations(dependencies);
    const issue = issueFixture();

    await operations.persistDrop(issue, "option-b", 200);

    expect(dependencies.updateIssueLocalState).toHaveBeenCalledTimes(1);
    expect(dependencies.updateIssueLocalState).toHaveBeenCalledWith(
      issue.id,
      expect.objectContaining({
        "customproperty_select-field": "option-b",
        field_values: { "select-field": "option-b" },
        sort_order: 100,
      })
    );
    expect(dependencies.updateProjectIssueValues).toHaveBeenCalledWith("workspace-1", "project-1", issue.id, {
      field_values: { "select-field": "option-b" },
    });
    expect(dependencies.updateModuleIssueValues).not.toHaveBeenCalled();
    expect(dependencies.updateIssue).toHaveBeenCalledWith("project-1", issue.id, { sort_order: 200 });
    expect(dependencies.fetchIssues).not.toHaveBeenCalled();
  });

  it("persists module field values against the resolved source module", async () => {
    const dependencies = dependencyFixture({ groupBy: "modulecustomproperty_member-field" });
    const operations = createCustomFieldGroupOperations(dependencies);
    const issue = issueFixture();

    await operations.persistDrop(issue, "None");

    expect(dependencies.updateModuleIssueValues).toHaveBeenCalledWith(
      "workspace-1",
      "project-1",
      "module-1",
      issue.id,
      { field_values: { "member-field": null } }
    );
    expect(dependencies.updateProjectIssueValues).not.toHaveBeenCalled();
    expect(dependencies.updateIssueLocalState).toHaveBeenCalledWith(
      issue.id,
      expect.objectContaining({
        "modulecustomproperty_member-field": null,
        module_field_values: { "module-1": { "member-field": null } },
      })
    );
  });

  it("restores the complete pre-drop issue when every persistence request fails", async () => {
    const fieldError = new Error("field request failed");
    const dependencies = dependencyFixture({
      updateIssue: vi.fn(async () => {
        throw new Error("sort request failed");
      }),
      updateProjectIssueValues: vi.fn(async () => {
        throw fieldError;
      }),
    });
    const operations = createCustomFieldGroupOperations(dependencies);
    const issue = issueFixture();

    await expect(operations.persistDrop(issue, "option-b", 200)).rejects.toBe(fieldError);

    expect(dependencies.updateIssueLocalState).toHaveBeenCalledTimes(2);
    expect(dependencies.updateIssueLocalState).toHaveBeenNthCalledWith(2, issue.id, issue);
    expect(dependencies.fetchIssues).not.toHaveBeenCalled();
  });

  it("refetches the current grouping after a partial persistence failure", async () => {
    const sortError = new Error("sort request failed");
    const dependencies = dependencyFixture({
      updateIssue: vi.fn(async () => {
        throw sortError;
      }),
    });
    const operations = createCustomFieldGroupOperations(dependencies);

    await expect(operations.persistDrop(issueFixture(), "option-b", 200)).rejects.toBe(sortError);

    expect(dependencies.fetchIssues).toHaveBeenCalledWith("mutation", { canGroup: true, perPageCount: 50 }, "view-1");
    expect(dependencies.updateIssueLocalState).toHaveBeenCalledTimes(1);
  });

  it("fails before optimistic mutation when required module context is missing", async () => {
    const dependencies = dependencyFixture({
      groupBy: "modulecustomproperty_member-field",
      sourceModuleId: null,
    });
    const operations = createCustomFieldGroupOperations(dependencies);
    const issue = issueFixture();

    expect(operations.applyOptimisticValue(issue, "member-2")).toBe(issue);
    await expect(operations.persistDrop(issue, "member-2")).rejects.toThrow("module context");

    expect(dependencies.updateIssueLocalState).not.toHaveBeenCalled();
    expect(dependencies.updateModuleIssueValues).not.toHaveBeenCalled();
    expect(dependencies.updateProjectIssueValues).not.toHaveBeenCalled();
  });

  it.each(missingContextCases)(
    "fails before optimistic mutation when required %s context is missing",
    async (_, overrides) => {
      const dependencies = dependencyFixture(overrides);
      const operations = createCustomFieldGroupOperations(dependencies);
      const issue = issueFixture();

      expect(operations.applyOptimisticValue(issue, "option-b")).toBe(issue);
      await expect(operations.persistDrop(issue, "option-b")).rejects.toThrow("context");

      expect(dependencies.updateIssueLocalState).not.toHaveBeenCalled();
      expect(dependencies.updateModuleIssueValues).not.toHaveBeenCalled();
      expect(dependencies.updateProjectIssueValues).not.toHaveBeenCalled();
    }
  );
});
