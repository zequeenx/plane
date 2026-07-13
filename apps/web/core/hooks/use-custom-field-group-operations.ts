/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { useParams } from "next/navigation";
import type { EIssuesStoreType, TIssueGroupByOptions } from "@plane/types";
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
import { useIssues } from "@/hooks/store/use-issues";
import { useCustomFieldGroupContext } from "@/hooks/use-custom-field-group-context";
import type { IssueActions } from "@/hooks/use-issues-actions";
import { createCustomFieldGroupOperations } from "@/hooks/custom-field-group-operations";
import type { TOperations } from "@/hooks/custom-field-group-operations";

export type { TOperations } from "@/hooks/custom-field-group-operations";

const reportCustomFieldGroupReconciliationError = (error: unknown) => {
  console.error("Failed to reconcile custom field group drop", error);
};

export const useCustomFieldGroupOperations = ({
  fetchIssues,
  groupBy,
  storeType,
  updateIssue,
}: {
  fetchIssues: IssueActions["fetchIssues"];
  groupBy: TIssueGroupByOptions | undefined;
  storeType: EIssuesStoreType;
  updateIssue: IssueActions["updateIssue"];
}): TOperations => {
  const { cycleId, moduleId, profileViewId, viewId } = useParams();
  const { projectId, sourceModuleId, workspaceSlug } = useCustomFieldGroupContext();
  const { updateIssueValues: updateModuleIssueValues } = useModuleIssueFields();
  const { updateIssueValues: updateProjectIssueValues } = useProjectIssueFields();
  const { issues } = useIssues(storeType);

  const updateIssueLocalState =
    "updateIssueLocalState" in issues && typeof issues.updateIssueLocalState === "function"
      ? issues.updateIssueLocalState
      : undefined;
  const currentViewId = viewId?.toString() ?? cycleId?.toString() ?? moduleId?.toString() ?? profileViewId?.toString();

  return useMemo(
    () =>
      createCustomFieldGroupOperations({
        currentViewId,
        fetchIssues,
        groupBy,
        projectId,
        reportReconciliationError: reportCustomFieldGroupReconciliationError,
        sourceModuleId,
        updateIssue,
        updateIssueLocalState,
        updateModuleIssueValues,
        updateProjectIssueValues,
        workspaceSlug,
      }),
    [
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
    ]
  );
};
