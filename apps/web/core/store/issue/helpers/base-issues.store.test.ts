import type { TIssue, TIssueGroupByOptions } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { describe, expect, it, vi } from "vitest";

import type { IIssueRootStore } from "../root.store";
import { BaseIssuesStore, EIssueGroupedAction } from "./base-issues.store";
import type { IBaseIssueFilterStore } from "./issue-filter-helper.store";

vi.mock("@/lib/store-context", () => ({ store: {} }));

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

class TestIssuesStore extends BaseIssuesStore {
  fetchParentStats = vi.fn((_workspaceSlug: string, _projectId?: string, _id?: string) => undefined);
  updateParentStats = vi.fn((_prevIssue?: TIssue, _nextIssue?: TIssue, _id?: string) => undefined);
}

const createStore = ({
  groupBy,
  issues,
  moduleId = "module-1",
  sourceModuleId = "view-module-1",
  subGroupBy,
}: {
  groupBy?: TIssueGroupByOptions;
  issues: TIssue[];
  moduleId?: string;
  sourceModuleId?: string;
  subGroupBy?: TIssueGroupByOptions;
}) => {
  const issueMap = Object.fromEntries(issues.map((issue) => [issue.id, issue]));
  const updateIssue = (issueId: string, data: Partial<TIssue>) => {
    const issue = issueMap[issueId];
    if (issue) issueMap[issueId] = { ...issue, ...data };
  };
  const rootIssueStore = {
    issues: {
      getIssueById: (issueId: string) => issueMap[issueId],
      getIssuesByIds: (issueIds: string[]) => issueIds.flatMap((issueId) => issueMap[issueId] ?? []),
      updateIssue,
    },
    moduleId,
    rootStore: {
      projectView: {
        getViewById: () => ({ source_module: sourceModuleId }),
      },
    },
    viewId: "view-1",
  } as unknown as IIssueRootStore;
  const issueFilterStore = {
    issueFilters: {
      displayFilters: {
        group_by: groupBy,
        layout: EIssueLayoutTypes.KANBAN,
        sub_group_by: subGroupBy,
        sub_issue: true,
      },
    },
  } as unknown as IBaseIssueFilterStore;

  return {
    issueMap,
    store: new TestIssuesStore(rootIssueStore, issueFilterStore),
  };
};

describe("BaseIssuesStore dynamic custom field grouping", () => {
  it("moves a locally updated issue between custom groups and updates each count once", () => {
    const issue = issueFixture({
      "customproperty_select-field": "option-a",
      field_values: { "select-field": "option-a" },
    });
    const { issueMap, store } = createStore({
      groupBy: "customproperty_select-field",
      issues: [issue],
    });
    store.groupedIssueIds = { "option-a": [issue.id], "option-b": [] };
    store.groupedIssueCount = { "option-a": 1, "option-b": 0 };

    store.updateIssueLocalState(issue.id, { "customproperty_select-field": "option-b" });

    expect(store.groupedIssueIds).toEqual({ "option-a": [], "option-b": [issue.id] });
    expect(store.groupedIssueCount).toEqual({ "option-a": 0, "option-b": 1 });
    expect(issueMap[issue.id]?.["customproperty_select-field"]).toBe("option-b");
  });

  it("uses None paths for empty project groups and source-module subgroups", () => {
    const before = issueFixture({
      field_values: { "select-field": "option-a" },
      module_field_values: { "module-1": { "member-field": "member-1" } },
    });
    const after = issueFixture({
      field_values: { "select-field": null },
      module_field_values: { "module-1": { "member-field": null } },
    });
    const { store } = createStore({
      groupBy: "customproperty_select-field",
      issues: [before],
      subGroupBy: "modulecustomproperty_member-field",
    });

    expect(store.getUpdateDetails(after, before)).toEqual([
      { action: EIssueGroupedAction.ADD, path: ["None", "None"] },
      { action: EIssueGroupedAction.DELETE, path: ["option-a", "member-1"] },
    ]);
  });

  it("keeps custom annotations locally but strips them from the standard patch payload", async () => {
    const issue = issueFixture({
      "customproperty_select-field": "option-a",
      field_values: { "select-field": "option-a" },
    });
    const { issueMap, store } = createStore({
      groupBy: "customproperty_select-field",
      issues: [issue],
    });
    store.groupedIssueIds = { "option-a": [issue.id], "option-b": [] };
    store.groupedIssueCount = { "option-a": 1, "option-b": 0 };
    const patchIssue = vi.spyOn(store.issueService, "patchIssue").mockImplementation(async () => {
      expect(issueMap[issue.id]?.["customproperty_select-field"]).toBe("option-b");
      return {};
    });

    await store.issueUpdate("workspace-1", "project-1", issue.id, {
      "customproperty_select-field": "option-b",
      name: "Updated locally",
    });

    expect(patchIssue).toHaveBeenCalledWith("workspace-1", "project-1", issue.id, {
      name: "Updated locally",
    });
    expect(issueMap[issue.id]?.["customproperty_select-field"]).toBe("option-b");
  });
});
