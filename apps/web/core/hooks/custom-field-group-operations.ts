/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue, TIssueFieldValuesUpdatePayload, TModuleIssueFieldValuesUpdatePayload } from "@plane/types";
import type { TCustomFieldGroupKey } from "@/components/issues/issue-layouts/custom-field-grouping";
import {
  applyCustomFieldGroupValue,
  executeCustomFieldGroupDrop,
  isCustomFieldGroupKey,
  normalizeCustomFieldGroupId,
  parseCustomFieldGroupKey,
} from "@/components/issues/issue-layouts/custom-field-grouping";
import type { IssueActions } from "@/hooks/use-issues-actions";

export type TOperations = {
  applyOptimisticValue: (issue: TIssue, groupKey: TCustomFieldGroupKey, groupId: string) => TIssue;
  persistDrop: (
    issueId: string,
    groupKey: TCustomFieldGroupKey,
    groupId: string,
    options?: TCustomFieldGroupDropPersistenceOptions
  ) => Promise<void>;
  refetchCurrentGrouping: () => Promise<void>;
};

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
        onRollback: () => updateIssueLocalState(issue.id, issueBeforeDrop),
        persistAdditionalOperations: additionalPersistenceOperations,
        persistFieldValue,
        persistSortOrder,
      });
    });
  };

  return { applyOptimisticValue, persistDrop, refetchCurrentGrouping };
};
