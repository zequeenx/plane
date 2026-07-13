/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue, TIssueFieldValuesUpdatePayload, TModuleIssueFieldValuesUpdatePayload } from "@plane/types";
import type { TCustomFieldGroupKey } from "@/components/issues/issue-layouts/custom-field-grouping";
import {
  applyCustomFieldGroupValue,
  CustomFieldGroupPartialCreateError,
  executeCustomFieldGroupDrop,
  executeCustomFieldGroupQuickCreate,
  getCanonicalCustomFieldGroupValue,
  getCustomFieldGroupValue,
  isCustomFieldGroupKey,
  normalizeCustomFieldGroupId,
  parseCustomFieldGroupKey,
} from "@/components/issues/issue-layouts/custom-field-grouping";
import type { IssueActions } from "@/hooks/use-issues-actions";

export type TOperations = {
  applyOptimisticValue: (issue: TIssue, groupKey: TCustomFieldGroupKey, groupId: string) => TIssue;
  handleCreatedIssue: (
    issue: TIssue,
    groupKey: TCustomFieldGroupKey,
    groupId: string,
    requiredSourceModuleId?: string | null
  ) => Promise<void>;
  persistDrop: (
    issueId: string,
    groupKey: TCustomFieldGroupKey,
    groupId: string,
    options?: TCustomFieldGroupDropPersistenceOptions
  ) => Promise<void>;
  refetchCurrentGrouping: () => Promise<void>;
  wrapQuickCreate: (
    groupId: string,
    createIssue: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>,
    expectedGroupKey?: TCustomFieldGroupKey
  ) => (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>;
};

export type TCustomFieldGroupCreationOperations = Pick<TOperations, "handleCreatedIssue" | "wrapQuickCreate">;

export type TCustomFieldGroupDropPersistenceOptions = {
  additionalPersistenceOperations?: (() => Promise<unknown> | unknown)[];
  prepare?: (issue: TIssue) => Promise<boolean> | boolean;
  sortOrder?: number;
};

type TUpdateProjectIssueValues = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  data: TIssueFieldValuesUpdatePayload
) => Promise<unknown>;

type TUpdateModuleIssueValues = (
  workspaceSlug: string,
  projectId: string,
  moduleId: string,
  issueId: string,
  data: TModuleIssueFieldValuesUpdatePayload
) => Promise<unknown>;

export type TCustomFieldGroupOperationDependencies = {
  currentViewId?: string;
  fetchIssues: IssueActions["fetchIssues"];
  getIssueById: (issueId: string) => TIssue | undefined;
  projectId?: string;
  reportPartialCreateError?: (error: CustomFieldGroupPartialCreateError) => void;
  reportReconciliationError: (error: unknown) => void;
  sourceModuleId?: string | null;
  updateIssue: IssueActions["updateIssue"];
  updateIssueLocalState?: (issueId: string, data: Partial<TIssue>) => void;
  updateModuleIssueValues: TUpdateModuleIssueValues;
  updateProjectIssueValues: TUpdateProjectIssueValues;
  workspaceSlug?: string;
};

const customFieldGroupDropQueues = new Map<string, Promise<void>>();

const enqueueCustomFieldGroupDrop = (issueId: string, operation: () => Promise<void>): Promise<void> => {
  const previousOperation = customFieldGroupDropQueues.get(issueId) ?? Promise.resolve();
  const currentOperation = previousOperation.then(operation);
  const queueTail = currentOperation.then(
    () => undefined,
    () => undefined
  );
  customFieldGroupDropQueues.set(issueId, queueTail);

  return currentOperation.finally(() => {
    if (customFieldGroupDropQueues.get(issueId) === queueTail) customFieldGroupDropQueues.delete(issueId);
  });
};

const getUnavailableContextError = (context: "group" | "issue" | "module" | "project" | "sort") =>
  new Error(`Custom field ${context} context is unavailable`);

export const createCustomFieldGroupOperations = ({
  currentViewId,
  fetchIssues,
  getIssueById,
  projectId,
  reportPartialCreateError,
  reportReconciliationError,
  sourceModuleId,
  updateIssue,
  updateIssueLocalState,
  updateModuleIssueValues,
  updateProjectIssueValues,
  workspaceSlug,
}: TCustomFieldGroupOperationDependencies): TOperations => {
  const applyOptimisticValue = (issue: TIssue, groupKey: TCustomFieldGroupKey, groupId: string): TIssue => {
    const customGroup = parseCustomFieldGroupKey(groupKey);
    const hasRequiredContext =
      !!customGroup &&
      isCustomFieldGroupKey(groupKey) &&
      !!workspaceSlug &&
      !!projectId &&
      !!updateIssueLocalState &&
      (customGroup.scope === "project" || !!sourceModuleId);
    if (!hasRequiredContext) return issue;
    return applyCustomFieldGroupValue(issue, groupKey, groupId, sourceModuleId);
  };

  const refetchCurrentGrouping = async () => {
    await fetchIssues("mutation", { canGroup: true, perPageCount: 50 }, currentViewId);
  };

  const persistCreatedModuleFieldValue = async (
    issue: TIssue,
    groupKey: TCustomFieldGroupKey,
    groupId: string,
    operationSourceModuleId = sourceModuleId
  ): Promise<void> => {
    const customGroup = parseCustomFieldGroupKey(groupKey);
    const createdIssueProjectId = issue.project_id ?? projectId;
    if (!customGroup || customGroup.scope !== "module") throw getUnavailableContextError("group");
    if (!workspaceSlug || !createdIssueProjectId) throw getUnavailableContextError("project");
    if (!operationSourceModuleId) throw getUnavailableContextError("module");

    const activeIssue = getIssueById(issue.id);
    const canReconcileLocally = !!activeIssue && !!updateIssueLocalState;
    const activeGroupId = activeIssue
      ? (getCustomFieldGroupValue(activeIssue, groupKey, operationSourceModuleId) ?? "None")
      : "None";
    if (activeIssue && updateIssueLocalState) {
      updateIssueLocalState(
        issue.id,
        applyCustomFieldGroupValue(activeIssue, groupKey, groupId, operationSourceModuleId)
      );
    }

    try {
      await updateModuleIssueValues(workspaceSlug, createdIssueProjectId, operationSourceModuleId, issue.id, {
        field_values: { [customGroup.fieldId]: normalizeCustomFieldGroupId(groupId) },
      });
    } catch (error) {
      if (activeIssue && updateIssueLocalState) {
        updateIssueLocalState(
          issue.id,
          applyCustomFieldGroupValue(activeIssue, groupKey, activeGroupId, operationSourceModuleId)
        );
      }
      throw error;
    }
    if (!canReconcileLocally) {
      try {
        await refetchCurrentGrouping();
      } catch (reconciliationError) {
        try {
          reportReconciliationError(reconciliationError);
        } catch {
          // Reporting must not turn successful field persistence into a partial create.
        }
      }
    }
  };

  const persistCreatedModuleField = async (
    issue: TIssue,
    groupKey: TCustomFieldGroupKey,
    groupId: string,
    operationSourceModuleId?: string | null
  ): Promise<TIssue | undefined> =>
    await executeCustomFieldGroupQuickCreate({
      createIssue: async () => issue,
      groupId,
      groupKey,
      onPartialFailure: refetchCurrentGrouping,
      onReconciliationError: reportReconciliationError,
      persistModuleFieldValue: (createdIssue) =>
        persistCreatedModuleFieldValue(createdIssue, groupKey, groupId, operationSourceModuleId ?? sourceModuleId),
    });

  const handleCreatedIssue = async (
    issue: TIssue,
    groupKey: TCustomFieldGroupKey,
    groupId: string,
    requiredSourceModuleId?: string | null
  ): Promise<void> => {
    try {
      await persistCreatedModuleField(issue, groupKey, groupId, requiredSourceModuleId);
    } catch (error) {
      if (error instanceof CustomFieldGroupPartialCreateError) reportPartialCreateError?.(error);
      throw error;
    }
  };

  const wrapQuickCreate =
    (
      groupId: string,
      createIssue: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>,
      expectedGroupKey?: TCustomFieldGroupKey
    ) =>
    async (quickCreateProjectId: string | null | undefined, data: TIssue): Promise<TIssue | undefined> => {
      const groupKey = Object.keys(data).find(isCustomFieldGroupKey);
      if (!groupKey) {
        const expectedGroup = parseCustomFieldGroupKey(expectedGroupKey);
        if (expectedGroup?.scope === "module" && !sourceModuleId) throw getUnavailableContextError("module");
        if (expectedGroup) throw getUnavailableContextError("group");
        return await createIssue(quickCreateProjectId, data);
      }

      const customGroup = parseCustomFieldGroupKey(groupKey);
      if (customGroup?.scope === "module" && !sourceModuleId) throw getUnavailableContextError("module");
      const submittedGroupValue = data[groupKey];
      const authoritativeGroupId =
        submittedGroupValue === null ? "None" : typeof submittedGroupValue === "string" ? submittedGroupValue : groupId;

      return await executeCustomFieldGroupQuickCreate({
        createIssue: () => createIssue(quickCreateProjectId, data),
        groupId: authoritativeGroupId,
        groupKey,
        onPartialFailure: refetchCurrentGrouping,
        onReconciliationError: reportReconciliationError,
        persistModuleFieldValue: (createdIssue, value) => persistCreatedModuleFieldValue(createdIssue, groupKey, value),
      });
    };

  const persistDrop = async (
    issueId: string,
    groupKey: TCustomFieldGroupKey,
    groupId: string,
    { additionalPersistenceOperations = [], prepare, sortOrder }: TCustomFieldGroupDropPersistenceOptions = {}
  ) => {
    const customGroup = parseCustomFieldGroupKey(groupKey);
    if (!customGroup || !isCustomFieldGroupKey(groupKey)) throw getUnavailableContextError("group");
    if (!workspaceSlug || !projectId || !updateIssueLocalState) throw getUnavailableContextError("project");
    if (customGroup.scope === "module" && !sourceModuleId) throw getUnavailableContextError("module");
    if (sortOrder !== undefined && !updateIssue) throw getUnavailableContextError("sort");

    return await enqueueCustomFieldGroupDrop(issueId, async () => {
      const issue = getIssueById(issueId);
      if (!issue) throw getUnavailableContextError("issue");
      if (prepare && !(await Promise.resolve().then(() => prepare(issue)))) return;

      const issueBeforeDrop = { ...issue };
      const previousGroupId = getCanonicalCustomFieldGroupValue(issueBeforeDrop, groupKey, sourceModuleId) ?? "None";
      const rollbackIssue = applyCustomFieldGroupValue(issueBeforeDrop, groupKey, previousGroupId, sourceModuleId);
      const nextIssue = applyCustomFieldGroupValue(issue, groupKey, groupId, sourceModuleId);
      const normalizedValue = normalizeCustomFieldGroupId(groupId);
      const fieldValuePayload = { field_values: { [customGroup.fieldId]: normalizedValue } };
      let persistFieldValue: () => Promise<unknown>;
      if (customGroup.scope === "project") {
        persistFieldValue = () => updateProjectIssueValues(workspaceSlug, projectId, issue.id, fieldValuePayload);
      } else {
        if (!sourceModuleId) throw getUnavailableContextError("module");
        const moduleId = sourceModuleId;
        persistFieldValue = () =>
          updateModuleIssueValues(workspaceSlug, projectId, moduleId, issue.id, fieldValuePayload);
      }

      let persistSortOrder: (() => Promise<unknown>) | undefined;
      if (sortOrder !== undefined) {
        if (!updateIssue) throw getUnavailableContextError("sort");
        const updateIssueAction = updateIssue;
        persistSortOrder = () => updateIssueAction(projectId, issue.id, { sort_order: sortOrder });
      }

      updateIssueLocalState(issue.id, nextIssue);

      await executeCustomFieldGroupDrop({
        onPartialFailure: refetchCurrentGrouping,
        onReconciliationError: reportReconciliationError,
        onRollback: () => updateIssueLocalState(issue.id, rollbackIssue),
        persistAdditionalOperations: additionalPersistenceOperations,
        persistFieldValue,
        persistSortOrder,
      });
    });
  };

  return { applyOptimisticValue, handleCreatedIssue, persistDrop, refetchCurrentGrouping, wrapQuickCreate };
};
