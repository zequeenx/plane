/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TIssueFieldValue } from "@plane/types";
// components
import { ProjectFieldValueEditors } from "@/components/project-fields/value-editors/root";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

export type TWorkItemAdditionalSidebarProperties = {
  workItemId: string;
  workItemTypeId: string | null;
  projectId: string;
  workspaceSlug: string;
  isEditable: boolean;
  isPeekView?: boolean;
};

export const WorkItemAdditionalSidebarProperties = observer(function WorkItemAdditionalSidebarProperties(
  props: TWorkItemAdditionalSidebarProperties
) {
  const { isEditable, projectId, workItemId, workspaceSlug } = props;
  // store hooks
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { fieldsLoader, getFields, getFieldsByProjectId, updateIssueValues } = useProjectIssueFields();

  const issue = getIssueById(workItemId);
  const fields = getFieldsByProjectId(projectId);
  const isLoading = !!fieldsLoader[projectId] || typeof fields === "undefined";

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;

    getFields(workspaceSlug, projectId);
  }, [getFields, projectId, workspaceSlug]);

  const handleChange = async (fieldId: string, value: TIssueFieldValue) => {
    await updateIssueValues(workspaceSlug, projectId, workItemId, {
      field_values: {
        [fieldId]: value,
      },
    });
  };

  if (!issue || isLoading || !fields || fields.length === 0) return null;

  return (
    <ProjectFieldValueEditors
      fields={fields}
      values={issue.field_values}
      disabled={!isEditable}
      onChange={handleChange}
      projectId={projectId}
      workspaceSlug={workspaceSlug}
    />
  );
});
