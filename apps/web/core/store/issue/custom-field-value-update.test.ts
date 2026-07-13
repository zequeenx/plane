import type { TIssue, TIssueCustomFieldLocalUpdater } from "@plane/types";
import { describe, expect, it, vi } from "vitest";

import { ModuleIssueFieldStore } from "@/store/module/module-issue-field.store";
import { ProjectIssueFieldStore } from "@/store/project/project-issue-field.store";

const issue = {
  "customproperty_select-field": "stale-option",
  "modulecustomproperty_member-field": "stale-member",
  field_values: { "select-field": "option-a" },
  id: "issue-1",
  module_field_values: { "module-1": { "member-field": "member-1" } },
} as unknown as TIssue;

const issueStore = () => ({
  getIssueById: vi.fn(() => issue),
  updateIssue: vi.fn(),
});

describe("ordinary custom field value transactions", () => {
  it("optimistically updates and rolls back project field state using the canonical prior value", async () => {
    const issues = issueStore();
    const store = new ProjectIssueFieldStore({ rootStore: { issue: { issues } } } as never);
    const endpointError = new Error("project field failed");
    vi.spyOn(store.projectIssueFieldService, "updateIssueValues").mockRejectedValue(endpointError);
    const updateLocalState = vi.fn<TIssueCustomFieldLocalUpdater>();

    await expect(
      store.updateIssueValues(
        "workspace-1",
        "project-1",
        issue.id,
        { field_values: { "select-field": "option-b" } },
        updateLocalState
      )
    ).rejects.toBe(endpointError);

    expect(updateLocalState).toHaveBeenNthCalledWith(1, issue.id, {
      fieldValues: { "select-field": "option-b" },
      scope: "project",
    });
    expect(updateLocalState).toHaveBeenNthCalledWith(2, issue.id, {
      fieldValues: { "select-field": "option-a" },
      scope: "project",
    });
    expect(issues.updateIssue).not.toHaveBeenCalled();
  });

  it("rolls back a module field from its exact module map and leaves other contexts out", async () => {
    const issues = issueStore();
    const store = new ModuleIssueFieldStore({ issue: { issues } } as never);
    const endpointError = new Error("module field failed");
    vi.spyOn(store.moduleIssueFieldService, "updateIssueValues").mockRejectedValue(endpointError);
    const updateLocalState = vi.fn<TIssueCustomFieldLocalUpdater>();

    await expect(
      store.updateIssueValues(
        "workspace-1",
        "project-1",
        "module-1",
        issue.id,
        { field_values: { "member-field": "member-2" } },
        updateLocalState
      )
    ).rejects.toBe(endpointError);

    expect(updateLocalState).toHaveBeenNthCalledWith(1, issue.id, {
      fieldValues: { "member-field": "member-2" },
      moduleId: "module-1",
      scope: "module",
    });
    expect(updateLocalState).toHaveBeenNthCalledWith(2, issue.id, {
      fieldValues: { "member-field": "member-1" },
      moduleId: "module-1",
      scope: "module",
    });
    expect(issues.updateIssue).not.toHaveBeenCalled();
  });

  it("does not reconcile a successful field transaction twice", async () => {
    const issues = issueStore();
    const store = new ProjectIssueFieldStore({ rootStore: { issue: { issues } } } as never);
    vi.spyOn(store.projectIssueFieldService, "updateIssueValues").mockResolvedValue({
      field_values: { "select-field": "option-b" },
    });
    const updateLocalState = vi.fn<TIssueCustomFieldLocalUpdater>();

    await store.updateIssueValues(
      "workspace-1",
      "project-1",
      issue.id,
      { field_values: { "select-field": "option-b" } },
      updateLocalState
    );

    expect(updateLocalState).toHaveBeenCalledOnce();
    expect(issues.updateIssue).toHaveBeenCalledOnce();
  });
});
