import type { TIssue, TIssueGroupByOptions } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { describe, expect, it, vi } from "vitest";

import { IssuePostCreateError } from "@/lib/issue-create";
import type { IIssueRootStore } from "../root.store";
import { createCustomFieldGroupOperations } from "@/hooks/custom-field-group-operations";
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

const createDeferred = <T>() => {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
};

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
      addIssue: (newIssues: TIssue[]) => {
        newIssues.forEach((issue) => {
          issueMap[issue.id] = issue;
        });
      },
      getIssueById: (issueId: string) => issueMap[issueId],
      getIssuesByIds: (issueIds: string[]) => issueIds.flatMap((issueId) => issueMap[issueId] ?? []),
      issuesMap: issueMap,
      removeIssue: (issueId: string) => {
        delete issueMap[issueId];
      },
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
  it("moves a newly created issue from None to its persisted module custom group exactly once", async () => {
    const issue = issueFixture({ module_field_values: { "module-1": {} } });
    const { issueMap, store } = createStore({
      groupBy: "modulecustomproperty_member-field",
      issues: [issue],
      sourceModuleId: "module-1",
    });
    store.groupedIssueIds = { None: [issue.id], "member-2": [] };
    store.groupedIssueCount = { None: 1, "member-2": 0 };
    const fetchIssues = vi.fn(async () => undefined);
    const updateModuleIssueValues = vi.fn(async () => {
      expect(store.groupedIssueIds).toEqual({ None: [], "member-2": [issue.id] });
      expect(store.groupedIssueCount).toEqual({ None: 0, "member-2": 1 });
      return {};
    });
    const operations = createCustomFieldGroupOperations({
      fetchIssues,
      getIssueById: (issueId) => issueMap[issueId],
      projectId: "project-1",
      reportReconciliationError: vi.fn(),
      sourceModuleId: "module-1",
      updateIssue: vi.fn(async () => undefined),
      updateIssueLocalState: store.updateIssueLocalState,
      updateModuleIssueValues,
      updateProjectIssueValues: vi.fn(async () => ({})),
      workspaceSlug: "workspace-1",
    });

    await operations.handleCreatedIssue(issue, "modulecustomproperty_member-field", "member-2");

    expect(store.groupedIssueIds).toEqual({ None: [], "member-2": [issue.id] });
    expect(store.groupedIssueCount).toEqual({ None: 0, "member-2": 1 });
    expect(issueMap[issue.id]?.module_field_values?.["module-1"]?.["member-field"]).toBe("member-2");
    expect(updateModuleIssueValues).toHaveBeenCalledTimes(1);
    expect(fetchIssues).not.toHaveBeenCalled();
  });

  it("removes a failed module custom projection before refetching the created issue", async () => {
    const issue = issueFixture({ module_field_values: { "module-1": {} } });
    const { issueMap, store } = createStore({
      groupBy: "modulecustomproperty_member-field",
      issues: [issue],
      sourceModuleId: "module-1",
    });
    store.groupedIssueIds = { None: [issue.id], "member-2": [] };
    store.groupedIssueCount = { None: 1, "member-2": 0 };
    const fieldError = new Error("field failed");
    const fetchIssues = vi.fn(async () => {
      expect(store.groupedIssueIds).toEqual({ None: [issue.id], "member-2": [] });
      return undefined;
    });
    const operations = createCustomFieldGroupOperations({
      fetchIssues,
      getIssueById: (issueId) => issueMap[issueId],
      projectId: "project-1",
      reportReconciliationError: vi.fn(),
      sourceModuleId: "module-1",
      updateIssue: vi.fn(async () => undefined),
      updateIssueLocalState: store.updateIssueLocalState,
      updateModuleIssueValues: vi.fn(async () => {
        throw fieldError;
      }),
      updateProjectIssueValues: vi.fn(async () => ({})),
      workspaceSlug: "workspace-1",
    });

    await expect(
      operations.handleCreatedIssue(issue, "modulecustomproperty_member-field", "member-2")
    ).rejects.toMatchObject({ cause: fieldError });

    expect(store.groupedIssueIds).toEqual({ None: [issue.id], "member-2": [] });
    expect(store.groupedIssueCount).toEqual({ None: 1, "member-2": 0 });
    expect(issueMap[issue.id]?.["modulecustomproperty_member-field"]).toBeNull();
    expect(issueMap[issue.id]?.module_field_values?.["module-1"]?.["member-field"]).toBeNull();
    expect(fetchIssues).toHaveBeenCalledTimes(1);
  });

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

describe("BaseIssuesStore quick create lifecycle", () => {
  it("marks local post-response failures as post-create failures", async () => {
    const createdIssue = issueFixture({ id: "created-issue" });
    const parentStatsError = new Error("parent stats failed");
    const { store } = createStore({ issues: [] });
    vi.spyOn(store.issueService, "createIssue").mockResolvedValue(createdIssue);
    store.fetchParentStats.mockRejectedValue(parentStatsError);

    const result = store.createIssue("workspace-1", "project-1", { name: "Created issue" });

    await expect(result).rejects.toMatchObject({ cause: parentStatsError, createdIssue });
    await expect(result).rejects.toBeInstanceOf(IssuePostCreateError);
  });

  it("retains the created issue and cleans the temporary issue when module attachment fails", async () => {
    const temporaryIssue = issueFixture({ id: "temporary-issue", module_ids: ["module-2"] });
    const createdIssue = issueFixture({ id: "created-issue", module_ids: [] });
    const attachmentError = new Error("module attachment failed");
    const { issueMap, store } = createStore({ issues: [] });
    store.groupedIssueIds = { "All Issues": [] };
    store.groupedIssueCount = { "All Issues": 0 };
    vi.spyOn(store, "createIssue").mockImplementation(async () => {
      store.addIssue(createdIssue);
      return createdIssue;
    });
    vi.spyOn(store.moduleService, "addModulesToIssue").mockRejectedValue(attachmentError);

    const result = store.issueQuickAdd("workspace-1", "project-1", temporaryIssue);

    await expect(result).rejects.toMatchObject({ cause: attachmentError, createdIssue });
    await expect(result).rejects.toBeInstanceOf(IssuePostCreateError);
    expect(issueMap[temporaryIssue.id]).toBeUndefined();
    expect(issueMap[createdIssue.id]).toMatchObject(createdIssue);
  });

  it("waits for every attachment attempt before reporting a partial create", async () => {
    const temporaryIssue = issueFixture({
      cycle_id: "cycle-2",
      id: "temporary-issue",
      module_ids: ["module-2"],
    });
    const createdIssue = issueFixture({ cycle_id: null, id: "created-issue", module_ids: [] });
    const moduleError = new Error("module attachment failed");
    const cycleRequest = createDeferred<unknown>();
    const { store } = createStore({ issues: [] });
    store.groupedIssueIds = { "All Issues": [] };
    store.groupedIssueCount = { "All Issues": 0 };
    vi.spyOn(store, "createIssue").mockImplementation(async () => {
      store.addIssue(createdIssue);
      return createdIssue;
    });
    vi.spyOn(store.issueService, "addIssueToCycle").mockReturnValue(cycleRequest.promise);
    const moduleRequest = vi.spyOn(store.moduleService, "addModulesToIssue").mockRejectedValue(moduleError);
    let isSettled = false;

    const result = store.issueQuickAdd("workspace-1", "project-1", temporaryIssue);
    void result.catch(() => {
      isSettled = true;
    });
    await vi.waitFor(() => expect(moduleRequest).toHaveBeenCalledTimes(1));

    expect(isSettled).toBe(false);

    cycleRequest.resolve({});
    await expect(result).rejects.toMatchObject({ cause: moduleError, createdIssue });
  });
});
