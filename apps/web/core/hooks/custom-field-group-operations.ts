/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TIssue,
  TIssueFieldValuesUpdatePayload,
  TIssueGroupByOptions,
  TModuleIssueFieldValuesUpdatePayload,
} from "@plane/types";
import {
  applyCustomFieldGroupValue,
  executeCustomFieldGroupDrop,
  isCustomFieldGroupKey,
  normalizeCustomFieldGroupId,
  parseCustomFieldGroupKey,
} from "@/components/issues/issue-layouts/custom-field-grouping";
import type { IssueActions } from "@/hooks/use-issues-actions";

export type TOperations = {
  applyOptimisticValue: (issue: TIssue, groupId: string) => TIssue;
  persistDrop: (issue: TIssue, groupId: string, sortOrder?: number) => Promise<void>;
  refetchCurrentGrouping: () => Promise<void>;
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
  groupBy: TIssueGroupByOptions | undefined;
  projectId?: string;
  sourceModuleId?: string | null;
  updateIssue: IssueActions["updateIssue"];
  updateIssueLocalState?: (issueId: string, data: Partial<TIssue>) => void;
  updateModuleIssueValues: TUpdateModuleIssueValues;
  updateProjectIssueValues: TUpdateProjectIssueValues;
  workspaceSlug?: string;
};

const getUnavailableContextError = (context: "group" | "module" | "project" | "sort") =>
  new Error(`Custom field ${context} context is unavailable`);

export const createCustomFieldGroupOperations = ({
  currentViewId,
  fetchIssues,
  groupBy,
  projectId,
  sourceModuleId,
  updateIssue,
  updateIssueLocalState,
  updateModuleIssueValues,
  updateProjectIssueValues,
  workspaceSlug,
}: TCustomFieldGroupOperationDependencies): TOperations => {
  const customGroup = parseCustomFieldGroupKey(groupBy);
  const customGroupKey = isCustomFieldGroupKey(groupBy) ? groupBy : undefined;

  const hasRequiredContext =
    !!customGroup &&
    !!customGroupKey &&
    !!workspaceSlug &&
    !!projectId &&
    !!updateIssueLocalState &&
    (customGroup.scope === "project" || !!sourceModuleId);

  const applyOptimisticValue = (issue: TIssue, groupId: string): TIssue => {
    if (!hasRequiredContext || !customGroupKey) return issue;
    return applyCustomFieldGroupValue(issue, customGroupKey, groupId, sourceModuleId);
  };

  const refetchCurrentGrouping = async () => {
    await fetchIssues("mutation", { canGroup: true, perPageCount: 50 }, currentViewId);
  };

  const persistDrop = async (issue: TIssue, groupId: string, sortOrder?: number) => {
    if (!customGroup || !customGroupKey) throw getUnavailableContextError("group");
    if (!workspaceSlug || !projectId || !updateIssueLocalState) throw getUnavailableContextError("project");

    const issueBeforeDrop = { ...issue };
    const nextIssue = applyCustomFieldGroupValue(issue, customGroupKey, groupId, sourceModuleId);
    const normalizedValue = normalizeCustomFieldGroupId(groupId);
    const fieldValuePayload = { field_values: { [customGroup.fieldId]: normalizedValue } };
    let persistFieldValue: () => Promise<unknown>;
    if (customGroup.scope === "project") {
      persistFieldValue = () => updateProjectIssueValues(workspaceSlug, projectId, issue.id, fieldValuePayload);
    } else {
      if (!sourceModuleId) throw getUnavailableContextError("module");
      persistFieldValue = () =>
        updateModuleIssueValues(workspaceSlug, projectId, sourceModuleId, issue.id, fieldValuePayload);
    }

    let persistSortOrder: (() => Promise<unknown>) | undefined;
    if (sortOrder !== undefined) {
      if (!updateIssue) throw getUnavailableContextError("sort");
      persistSortOrder = () => updateIssue(projectId, issue.id, { sort_order: sortOrder });
    }

    updateIssueLocalState(issue.id, nextIssue);

    await executeCustomFieldGroupDrop({
      onPartialFailure: refetchCurrentGrouping,
      onRollback: () => updateIssueLocalState(issue.id, issueBeforeDrop),
      persistFieldValue,
      persistSortOrder,
    });
  };

  return { applyOptimisticValue, persistDrop, refetchCurrentGrouping };
};
