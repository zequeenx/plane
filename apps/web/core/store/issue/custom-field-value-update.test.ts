import type { TIssue, TIssueCustomFieldLocalUpdater, TIssueGroupByOptions } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { describe, expect, it, vi } from "vitest";

import type { IIssueRootStore } from "@/store/issue/root.store";
import { BaseIssuesStore } from "@/store/issue/helpers/base-issues.store";
import type { IBaseIssueFilterStore } from "@/store/issue/helpers/issue-filter-helper.store";
import { ModuleIssueFieldStore } from "@/store/module/module-issue-field.store";
import { ProjectIssueFieldStore } from "@/store/project/project-issue-field.store";

vi.mock("@/lib/store-context", () => ({ store: {} }));

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

const createGroupedIssueHarness = ({
  groupBy,
  initialIssue,
  sourceModuleId = "module-1",
}: {
  groupBy: TIssueGroupByOptions;
  initialIssue: TIssue;
  sourceModuleId?: string;
}) => {
  const issueMap: Record<string, TIssue> = { [initialIssue.id]: initialIssue };
  const rootIssueStore = {
    issues: {
      addIssue: (newIssues: TIssue[]) => {
        newIssues.forEach((newIssue) => {
          issueMap[newIssue.id] = newIssue;
        });
      },
      getIssueById: (issueId: string) => issueMap[issueId],
      getIssuesByIds: (issueIds: string[]) => issueIds.flatMap((issueId) => issueMap[issueId] ?? []),
      issuesMap: issueMap,
      removeIssue: (issueId: string) => {
        delete issueMap[issueId];
      },
      updateIssue: (issueId: string, data: Partial<TIssue>) => {
        const currentIssue = issueMap[issueId];
        if (currentIssue) issueMap[issueId] = { ...currentIssue, ...data };
      },
    },
    moduleId: "module-1",
    rootStore: {
      projectView: {
        getViewById: () => ({ source_module: sourceModuleId }),
      },
    },
    viewId: "view-1",
  } as unknown as IIssueRootStore;
  const filterStore = {
    issueFilters: {
      displayFilters: {
        group_by: groupBy,
        layout: EIssueLayoutTypes.KANBAN,
        sub_issue: true,
      },
    },
  } as unknown as IBaseIssueFilterStore;

  return {
    issueMap,
    issues: rootIssueStore.issues,
    groupedIssues: new TestIssuesStore(rootIssueStore, filterStore),
  };
};

const groupedIssue = (overrides: Partial<TIssue> = {}) =>
  ({
    "customproperty_select-field": "option-a",
    "modulecustomproperty_member-field": "member-1",
    field_values: { "other-field": "other-a", "select-field": "option-a" },
    id: "queued-issue",
    module_field_values: {
      "module-1": { "member-field": "member-1" },
      "module-2": { "member-field": "member-other" },
    },
    project_id: "project-1",
    ...overrides,
  }) as unknown as TIssue;

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

  it("serializes same-field project edits through failure and leaves the newer value grouped", async () => {
    const initialIssue = groupedIssue();
    const { groupedIssues, issueMap, issues } = createGroupedIssueHarness({
      groupBy: "customproperty_select-field",
      initialIssue,
    });
    groupedIssues.groupedIssueIds = { "option-a": [initialIssue.id], "option-b": [], "option-c": [] };
    groupedIssues.groupedIssueCount = { "option-a": 1, "option-b": 0, "option-c": 0 };
    const store = new ProjectIssueFieldStore({ rootStore: { issue: { issues } } } as never);
    const firstRequest = createDeferred<{ field_values: { "select-field": string } }>();
    const firstError = new Error("older edit failed");
    const endpoint = vi
      .spyOn(store.projectIssueFieldService, "updateIssueValues")
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValueOnce({ field_values: { "select-field": "option-c" } });
    const updateLocalState = vi.fn(groupedIssues.updateCustomFieldValueLocalState);

    const firstMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      initialIssue.id,
      { field_values: { "select-field": "option-b" } },
      updateLocalState
    );
    const secondMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      initialIssue.id,
      { field_values: { "select-field": "option-c" } },
      updateLocalState
    );

    expect(endpoint).toHaveBeenCalledOnce();
    expect(updateLocalState).toHaveBeenCalledOnce();
    expect(groupedIssues.groupedIssueIds).toEqual({
      "option-a": [],
      "option-b": [initialIssue.id],
      "option-c": [],
    });

    firstRequest.reject(firstError);
    await expect(firstMutation).rejects.toBe(firstError);
    await vi.waitFor(() => expect(endpoint).toHaveBeenCalledTimes(2));
    await secondMutation;

    expect(updateLocalState).toHaveBeenCalledTimes(3);
    expect(issueMap[initialIssue.id]?.field_values["select-field"]).toBe("option-c");
    expect(issueMap[initialIssue.id]?.["customproperty_select-field"]).toBe("option-c");
    expect(groupedIssues.groupedIssueIds).toEqual({
      "option-a": [],
      "option-b": [],
      "option-c": [initialIssue.id],
    });
    expect(groupedIssues.groupedIssueCount).toEqual({ "option-a": 0, "option-b": 0, "option-c": 1 });
  });

  it("runs two successful same-field edits in request order", async () => {
    const initialIssue = groupedIssue();
    const { groupedIssues, issueMap, issues } = createGroupedIssueHarness({
      groupBy: "customproperty_select-field",
      initialIssue,
    });
    groupedIssues.groupedIssueIds = { "option-a": [initialIssue.id], "option-b": [], "option-c": [] };
    groupedIssues.groupedIssueCount = { "option-a": 1, "option-b": 0, "option-c": 0 };
    const store = new ProjectIssueFieldStore({ rootStore: { issue: { issues } } } as never);
    const firstRequest = createDeferred<{ field_values: { "select-field": string } }>();
    const endpoint = vi
      .spyOn(store.projectIssueFieldService, "updateIssueValues")
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValueOnce({ field_values: { "select-field": "option-c" } });

    const firstMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      initialIssue.id,
      { field_values: { "select-field": "option-b" } },
      groupedIssues.updateCustomFieldValueLocalState
    );
    const secondMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      initialIssue.id,
      { field_values: { "select-field": "option-c" } },
      groupedIssues.updateCustomFieldValueLocalState
    );

    expect(endpoint).toHaveBeenCalledOnce();
    firstRequest.resolve({ field_values: { "select-field": "option-b" } });
    await firstMutation;
    await vi.waitFor(() => expect(endpoint).toHaveBeenCalledTimes(2));
    await secondMutation;

    expect(endpoint.mock.calls.map((call) => call[3].field_values["select-field"])).toEqual(["option-b", "option-c"]);
    expect(issueMap[initialIssue.id]?.field_values["select-field"]).toBe("option-c");
    expect(groupedIssues.groupedIssueIds).toEqual({
      "option-a": [],
      "option-b": [],
      "option-c": [initialIssue.id],
    });
    expect(groupedIssues.groupedIssueCount).toEqual({ "option-a": 0, "option-b": 0, "option-c": 1 });
  });

  it("snapshots the current value when a queued project edit begins", async () => {
    const initialIssue = groupedIssue();
    const { groupedIssues, issueMap, issues } = createGroupedIssueHarness({
      groupBy: "customproperty_select-field",
      initialIssue,
    });
    groupedIssues.groupedIssueIds = { "option-a": [initialIssue.id], "option-b": [], "option-c": [] };
    groupedIssues.groupedIssueCount = { "option-a": 1, "option-b": 0, "option-c": 0 };
    const store = new ProjectIssueFieldStore({ rootStore: { issue: { issues } } } as never);
    const firstRequest = createDeferred<{ field_values: { "select-field": string } }>();
    const secondError = new Error("newer edit failed");
    const endpoint = vi
      .spyOn(store.projectIssueFieldService, "updateIssueValues")
      .mockImplementationOnce(() => firstRequest.promise)
      .mockRejectedValueOnce(secondError);

    const firstMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      initialIssue.id,
      { field_values: { "select-field": "option-b" } },
      groupedIssues.updateCustomFieldValueLocalState
    );
    const secondMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      initialIssue.id,
      { field_values: { "select-field": "option-c" } },
      groupedIssues.updateCustomFieldValueLocalState
    );

    firstRequest.resolve({ field_values: { "select-field": "option-b" } });
    await firstMutation;
    await vi.waitFor(() => expect(endpoint).toHaveBeenCalledTimes(2));
    await expect(secondMutation).rejects.toBe(secondError);

    expect(issueMap[initialIssue.id]?.field_values["select-field"]).toBe("option-b");
    expect(issueMap[initialIssue.id]?.["customproperty_select-field"]).toBe("option-b");
    expect(groupedIssues.groupedIssueIds).toEqual({
      "option-a": [],
      "option-b": [initialIssue.id],
      "option-c": [],
    });
    expect(groupedIssues.groupedIssueCount).toEqual({ "option-a": 0, "option-b": 1, "option-c": 0 });
  });

  it("serializes the same project field across store instances", async () => {
    const issues = issueStore();
    const firstStore = new ProjectIssueFieldStore({ rootStore: { issue: { issues } } } as never);
    const secondStore = new ProjectIssueFieldStore({ rootStore: { issue: { issues } } } as never);
    const firstRequest = createDeferred<{ field_values: { "select-field": string } }>();
    const firstEndpoint = vi
      .spyOn(firstStore.projectIssueFieldService, "updateIssueValues")
      .mockImplementation(() => firstRequest.promise);
    const secondEndpoint = vi.spyOn(secondStore.projectIssueFieldService, "updateIssueValues").mockResolvedValue({
      field_values: { "select-field": "option-c" },
    });

    const firstMutation = firstStore.updateIssueValues("workspace-1", "project-1", issue.id, {
      field_values: { "select-field": "option-b" },
    });
    const secondMutation = secondStore.updateIssueValues("workspace-1", "project-1", issue.id, {
      field_values: { "select-field": "option-c" },
    });

    expect(firstEndpoint).toHaveBeenCalledOnce();
    expect(secondEndpoint).not.toHaveBeenCalled();

    firstRequest.resolve({ field_values: { "select-field": "option-b" } });
    await firstMutation;
    await vi.waitFor(() => expect(secondEndpoint).toHaveBeenCalledOnce());
    await secondMutation;
  });

  it("keeps different project field keys concurrent", async () => {
    const initialIssue = groupedIssue();
    const { groupedIssues, issueMap, issues } = createGroupedIssueHarness({
      groupBy: "customproperty_select-field",
      initialIssue,
    });
    groupedIssues.groupedIssueIds = { "option-a": [initialIssue.id], "option-b": [] };
    groupedIssues.groupedIssueCount = { "option-a": 1, "option-b": 0 };
    const store = new ProjectIssueFieldStore({ rootStore: { issue: { issues } } } as never);
    const selectRequest = createDeferred<{
      field_values: { "other-field": string; "select-field": string };
    }>();
    const otherRequest = createDeferred<{
      field_values: { "other-field": string; "select-field": string };
    }>();
    const endpoint = vi
      .spyOn(store.projectIssueFieldService, "updateIssueValues")
      .mockImplementationOnce(() => selectRequest.promise)
      .mockImplementationOnce(() => otherRequest.promise);

    const selectMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      initialIssue.id,
      { field_values: { "select-field": "option-b" } },
      groupedIssues.updateCustomFieldValueLocalState
    );
    const otherMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      initialIssue.id,
      { field_values: { "other-field": "other-b" } },
      groupedIssues.updateCustomFieldValueLocalState
    );

    expect(endpoint).toHaveBeenCalledTimes(2);
    otherRequest.resolve({ field_values: { "other-field": "other-b", "select-field": "option-b" } });
    await otherMutation;
    selectRequest.resolve({ field_values: { "other-field": "other-a", "select-field": "option-b" } });
    await selectMutation;

    expect(issueMap[initialIssue.id]?.field_values).toMatchObject({
      "other-field": "other-b",
      "select-field": "option-b",
    });
  });

  it("keeps different module field keys concurrent when responses arrive out of order", async () => {
    const initialIssue = groupedIssue({
      module_field_values: {
        "module-1": { "member-field": "member-1", "other-field": "other-a" },
        "module-2": { "member-field": "member-other" },
      },
    });
    const { groupedIssues, issueMap, issues } = createGroupedIssueHarness({
      groupBy: "modulecustomproperty_member-field",
      initialIssue,
    });
    groupedIssues.groupedIssueIds = { "member-1": [initialIssue.id], "member-2": [] };
    groupedIssues.groupedIssueCount = { "member-1": 1, "member-2": 0 };
    const store = new ModuleIssueFieldStore({ issue: { issues } } as never);
    const memberRequest = createDeferred<{
      module_field_values: { "module-1": { "member-field": string; "other-field": string } };
    }>();
    const otherRequest = createDeferred<{
      module_field_values: { "module-1": { "member-field": string; "other-field": string } };
    }>();
    const endpoint = vi
      .spyOn(store.moduleIssueFieldService, "updateIssueValues")
      .mockImplementationOnce(() => memberRequest.promise)
      .mockImplementationOnce(() => otherRequest.promise);

    const memberMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      "module-1",
      initialIssue.id,
      { field_values: { "member-field": "member-2" } },
      groupedIssues.updateCustomFieldValueLocalState
    );
    const otherMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      "module-1",
      initialIssue.id,
      { field_values: { "other-field": "other-b" } },
      groupedIssues.updateCustomFieldValueLocalState
    );

    expect(endpoint).toHaveBeenCalledTimes(2);
    otherRequest.resolve({
      module_field_values: { "module-1": { "member-field": "member-2", "other-field": "other-b" } },
    });
    await otherMutation;
    memberRequest.resolve({
      module_field_values: { "module-1": { "member-field": "member-2", "other-field": "other-a" } },
    });
    await memberMutation;

    expect(issueMap[initialIssue.id]?.module_field_values?.["module-1"]).toMatchObject({
      "member-field": "member-2",
      "other-field": "other-b",
    });
    expect(groupedIssues.groupedIssueIds).toEqual({ "member-1": [], "member-2": [initialIssue.id] });
  });

  it("keeps the same module field in different modules concurrent and isolated", async () => {
    const initialIssue = groupedIssue();
    const { groupedIssues, issueMap, issues } = createGroupedIssueHarness({
      groupBy: "modulecustomproperty_member-field",
      initialIssue,
    });
    groupedIssues.groupedIssueIds = { "member-1": [initialIssue.id], "member-2": [] };
    groupedIssues.groupedIssueCount = { "member-1": 1, "member-2": 0 };
    const store = new ModuleIssueFieldStore({ issue: { issues } } as never);
    const moduleOneRequest = createDeferred<{
      module_field_values: { "module-1": { "member-field": string } };
    }>();
    const moduleTwoRequest = createDeferred<{
      module_field_values: { "module-2": { "member-field": string } };
    }>();
    const endpoint = vi
      .spyOn(store.moduleIssueFieldService, "updateIssueValues")
      .mockImplementationOnce(() => moduleOneRequest.promise)
      .mockImplementationOnce(() => moduleTwoRequest.promise);

    const moduleOneMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      "module-1",
      initialIssue.id,
      { field_values: { "member-field": "member-2" } },
      groupedIssues.updateCustomFieldValueLocalState
    );
    const moduleTwoMutation = store.updateIssueValues(
      "workspace-1",
      "project-1",
      "module-2",
      initialIssue.id,
      { field_values: { "member-field": "member-elsewhere" } },
      groupedIssues.updateCustomFieldValueLocalState
    );

    expect(endpoint).toHaveBeenCalledTimes(2);
    moduleOneRequest.resolve({ module_field_values: { "module-1": { "member-field": "member-2" } } });
    moduleTwoRequest.resolve({
      module_field_values: { "module-2": { "member-field": "member-elsewhere" } },
    });
    await Promise.all([moduleOneMutation, moduleTwoMutation]);

    expect(issueMap[initialIssue.id]?.module_field_values?.["module-1"]?.["member-field"]).toBe("member-2");
    expect(issueMap[initialIssue.id]?.module_field_values?.["module-2"]?.["member-field"]).toBe("member-elsewhere");
    expect(groupedIssues.groupedIssueIds).toEqual({ "member-1": [], "member-2": [initialIssue.id] });
    expect(groupedIssues.groupedIssueCount).toEqual({ "member-1": 0, "member-2": 1 });
  });
});
