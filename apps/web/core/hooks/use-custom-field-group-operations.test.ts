import type { TIssue } from "@plane/types";
import { describe, expect, it, vi } from "vitest";
import type { TCustomFieldGroupKey } from "@/components/issues/issue-layouts/custom-field-grouping";

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
  getIssueById: vi.fn(() => issueFixture()),
  projectId: "project-1",
  reportReconciliationError: vi.fn(),
  sourceModuleId: "module-1",
  updateIssue: vi.fn(async () => undefined),
  updateIssueLocalState: vi.fn(),
  updateModuleIssueValues: vi.fn(async () => ({})),
  updateProjectIssueValues: vi.fn(async () => ({ field_values: {} })),
  workspaceSlug: "workspace-1",
  ...overrides,
});

const createDeferred = <T = void>() => {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
};

const statefulDependencyFixture = (
  issues: Record<string, TIssue>,
  updateProjectIssueValues: TCustomFieldGroupOperationDependencies["updateProjectIssueValues"],
  overrides: Partial<TCustomFieldGroupOperationDependencies> = {}
) =>
  dependencyFixture({
    getIssueById: vi.fn((issueId: string) => issues[issueId]),
    updateIssueLocalState: vi.fn((issueId: string, data: Partial<TIssue>) => {
      const issue = issues[issueId];
      if (issue) issues[issueId] = { ...issue, ...data };
    }),
    updateProjectIssueValues,
    ...overrides,
  });

const missingContextCases = [
  ["workspace", { workspaceSlug: undefined }],
  ["project", { projectId: undefined }],
] satisfies [string, Partial<TCustomFieldGroupOperationDependencies>][];

describe("createCustomFieldGroupOperations", () => {
  it("persists project field and sort values through separate endpoints", async () => {
    const dependencies = dependencyFixture();
    const operations = createCustomFieldGroupOperations(dependencies);
    const issue = issueFixture();

    await operations.persistDrop(issue.id, "customproperty_select-field", "option-b", { sortOrder: 200 });

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
    const dependencies = dependencyFixture();
    const operations = createCustomFieldGroupOperations(dependencies);
    const issue = issueFixture();

    await operations.persistDrop(issue.id, "modulecustomproperty_member-field", "None");

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

  it("uses the passed drop key for persistence and projection", async () => {
    const issue = issueFixture({ field_values: { "stale-field": "stale-option" } });
    const dependencies = dependencyFixture({ getIssueById: vi.fn(() => issue) });
    const operations = createCustomFieldGroupOperations(dependencies);

    await operations.persistDrop(issue.id, "modulecustomproperty_member-field", "member-2");

    expect(dependencies.updateModuleIssueValues).toHaveBeenCalledWith(
      "workspace-1",
      "project-1",
      "module-1",
      issue.id,
      { field_values: { "member-field": "member-2" } }
    );
    expect(dependencies.updateProjectIssueValues).not.toHaveBeenCalled();
    expect(dependencies.updateIssueLocalState).toHaveBeenCalledWith(
      issue.id,
      expect.objectContaining({
        "modulecustomproperty_member-field": "member-2",
        field_values: { "stale-field": "stale-option" },
        module_field_values: { "module-1": { "member-field": "member-2" } },
      })
    );
    expect(dependencies.updateIssueLocalState).not.toHaveBeenCalledWith(
      issue.id,
      expect.objectContaining({ "customproperty_stale-field": expect.anything() })
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

    await expect(
      operations.persistDrop(issue.id, "customproperty_select-field", "option-b", { sortOrder: 200 })
    ).rejects.toBe(fieldError);

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

    await expect(
      operations.persistDrop("issue-1", "customproperty_select-field", "option-b", { sortOrder: 200 })
    ).rejects.toBe(sortError);

    expect(dependencies.fetchIssues).toHaveBeenCalledWith("mutation", { canGroup: true, perPageCount: 50 }, "view-1");
    expect(dependencies.updateIssueLocalState).toHaveBeenCalledTimes(1);
  });

  it("fails before optimistic mutation when required module context is missing", async () => {
    const dependencies = dependencyFixture({
      sourceModuleId: null,
    });
    const operations = createCustomFieldGroupOperations(dependencies);
    const issue = issueFixture();

    expect(operations.applyOptimisticValue(issue, "modulecustomproperty_member-field", "member-2")).toBe(issue);
    await expect(operations.persistDrop(issue.id, "modulecustomproperty_member-field", "member-2")).rejects.toThrow(
      "module context"
    );

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

      expect(operations.applyOptimisticValue(issue, "customproperty_select-field", "option-b")).toBe(issue);
      await expect(operations.persistDrop(issue.id, "customproperty_select-field", "option-b")).rejects.toThrow(
        "context"
      );

      expect(dependencies.updateIssueLocalState).not.toHaveBeenCalled();
      expect(dependencies.updateModuleIssueValues).not.toHaveBeenCalled();
      expect(dependencies.updateProjectIssueValues).not.toHaveBeenCalled();
    }
  );

  it("rejects an invalid passed custom key before optimistic mutation", async () => {
    const dependencies = dependencyFixture();
    const operations = createCustomFieldGroupOperations(dependencies);
    const issue = issueFixture();
    const invalidGroupKey: TCustomFieldGroupKey = "customproperty_";

    expect(operations.applyOptimisticValue(issue, invalidGroupKey, "option-b")).toBe(issue);
    await expect(operations.persistDrop(issue.id, invalidGroupKey, "option-b")).rejects.toThrow("group context");

    expect(dependencies.updateIssueLocalState).not.toHaveBeenCalled();
    expect(dependencies.updateProjectIssueValues).not.toHaveBeenCalled();
  });

  it("classifies a static subgroup failure as partial after custom field persistence succeeds", async () => {
    const issue = issueFixture();
    const issues = { [issue.id]: issue };
    const staticError = new Error("static update failed");
    const persistStaticUpdate = vi.fn(async () => {
      throw staticError;
    });
    const updateProjectIssueValues = vi.fn(async () => ({ field_values: {} }));
    const dependencies = statefulDependencyFixture(issues, updateProjectIssueValues);
    const operations = createCustomFieldGroupOperations(dependencies);

    await expect(
      operations.persistDrop(issue.id, "customproperty_select-field", "option-b", {
        additionalPersistenceOperations: [persistStaticUpdate],
      })
    ).rejects.toBe(staticError);

    expect(updateProjectIssueValues).toHaveBeenCalledTimes(1);
    expect(persistStaticUpdate).toHaveBeenCalledTimes(1);
    expect(dependencies.fetchIssues).toHaveBeenCalledTimes(1);
    expect(dependencies.updateIssueLocalState).toHaveBeenCalledTimes(1);
  });

  it("does not apply any part of the drop when module-removal preparation is cancelled", async () => {
    const issue = issueFixture();
    const issues = { [issue.id]: issue };
    const persistModuleUpdate = vi.fn(async () => undefined);
    const updateProjectIssueValues = vi.fn(async () => ({ field_values: {} }));
    const dependencies = statefulDependencyFixture(issues, updateProjectIssueValues);
    const operations = createCustomFieldGroupOperations(dependencies);

    await operations.persistDrop(issue.id, "customproperty_select-field", "option-b", {
      additionalPersistenceOperations: [persistModuleUpdate],
      prepare: () => false,
    });

    expect(updateProjectIssueValues).not.toHaveBeenCalled();
    expect(persistModuleUpdate).not.toHaveBeenCalled();
    expect(dependencies.updateIssueLocalState).not.toHaveBeenCalled();
    expect(issues[issue.id].field_values["select-field"]).toBe("option-a");
  });

  it("serializes a newer successful drop behind an older failed drop across operation instances", async () => {
    const issue = issueFixture();
    const issues = { [issue.id]: issue };
    const firstRequest = createDeferred();
    const secondRequest = createDeferred();
    const updateProjectIssueValues = vi
      .fn<TCustomFieldGroupOperationDependencies["updateProjectIssueValues"]>()
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);
    const dependencies = statefulDependencyFixture(issues, updateProjectIssueValues);
    const firstOperations = createCustomFieldGroupOperations(dependencies);
    const secondOperations = createCustomFieldGroupOperations(dependencies);

    const olderDrop = firstOperations.persistDrop(issue.id, "customproperty_select-field", "option-b");
    await vi.waitFor(() => expect(updateProjectIssueValues).toHaveBeenCalledTimes(1));
    const newerDrop = secondOperations.persistDrop(issue.id, "customproperty_select-field", "option-c");
    await Promise.resolve();
    expect(updateProjectIssueValues).toHaveBeenCalledTimes(1);

    const olderAssertion = expect(olderDrop).rejects.toThrow("older drop failed");
    firstRequest.reject(new Error("older drop failed"));
    await olderAssertion;
    await vi.waitFor(() => expect(updateProjectIssueValues).toHaveBeenCalledTimes(2));
    expect(issues[issue.id].field_values["select-field"]).toBe("option-c");

    secondRequest.resolve();
    await newerDrop;
    expect(issues[issue.id].field_values["select-field"]).toBe("option-c");
  });

  it("does not start a second successful field request until the first settles", async () => {
    const issue = issueFixture();
    const issues = { [issue.id]: issue };
    const firstRequest = createDeferred();
    const secondRequest = createDeferred();
    const updateProjectIssueValues = vi
      .fn<TCustomFieldGroupOperationDependencies["updateProjectIssueValues"]>()
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);
    const dependencies = statefulDependencyFixture(issues, updateProjectIssueValues);
    const operations = createCustomFieldGroupOperations(dependencies);

    const firstDrop = operations.persistDrop(issue.id, "customproperty_select-field", "option-b");
    const secondDrop = operations.persistDrop(issue.id, "customproperty_select-field", "option-c");
    await vi.waitFor(() => expect(updateProjectIssueValues).toHaveBeenCalledTimes(1));

    firstRequest.resolve();
    await firstDrop;
    await vi.waitFor(() => expect(updateProjectIssueValues).toHaveBeenCalledTimes(2));

    secondRequest.resolve();
    await secondDrop;
  });

  it("allows drops for different issue IDs to persist concurrently", async () => {
    const firstIssue = issueFixture({ id: "issue-1" });
    const secondIssue = issueFixture({ id: "issue-2" });
    const issues = { [firstIssue.id]: firstIssue, [secondIssue.id]: secondIssue };
    const firstRequest = createDeferred();
    const secondRequest = createDeferred();
    const updateProjectIssueValues = vi.fn(
      async (_workspaceSlug: string, _projectId: string, issueId: string) =>
        await (issueId === firstIssue.id ? firstRequest.promise : secondRequest.promise)
    );
    const dependencies = statefulDependencyFixture(issues, updateProjectIssueValues);
    const operations = createCustomFieldGroupOperations(dependencies);

    const firstDrop = operations.persistDrop(firstIssue.id, "customproperty_select-field", "option-b");
    const secondDrop = operations.persistDrop(secondIssue.id, "customproperty_select-field", "option-c");
    await vi.waitFor(() => expect(updateProjectIssueValues).toHaveBeenCalledTimes(2));

    firstRequest.resolve();
    secondRequest.resolve();
    await Promise.all([firstDrop, secondDrop]);
  });

  it("waits for partial-failure refetch before advancing the same-issue queue", async () => {
    const issue = issueFixture();
    const issues = { [issue.id]: issue };
    const refetchRequest = createDeferred<undefined>();
    const secondFieldRequest = createDeferred();
    const staticError = new Error("static update failed");
    const updateProjectIssueValues = vi
      .fn<TCustomFieldGroupOperationDependencies["updateProjectIssueValues"]>()
      .mockResolvedValueOnce({ field_values: {} })
      .mockImplementationOnce(() => secondFieldRequest.promise);
    const dependencies = statefulDependencyFixture(issues, updateProjectIssueValues, {
      fetchIssues: vi.fn(() => refetchRequest.promise),
    });
    const operations = createCustomFieldGroupOperations(dependencies);

    const firstDrop = operations.persistDrop(issue.id, "customproperty_select-field", "option-b", {
      additionalPersistenceOperations: [
        async () => {
          throw staticError;
        },
      ],
    });
    await vi.waitFor(() => expect(dependencies.fetchIssues).toHaveBeenCalledTimes(1));
    const secondDrop = operations.persistDrop(issue.id, "customproperty_select-field", "option-c");
    await Promise.resolve();
    expect(updateProjectIssueValues).toHaveBeenCalledTimes(1);

    const firstAssertion = expect(firstDrop).rejects.toBe(staticError);
    refetchRequest.resolve(undefined);
    await firstAssertion;
    await vi.waitFor(() => expect(updateProjectIssueValues).toHaveBeenCalledTimes(2));

    secondFieldRequest.resolve();
    await secondDrop;
  });
});
