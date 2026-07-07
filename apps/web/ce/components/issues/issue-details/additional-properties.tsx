/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
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
  const { t } = useTranslation();
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
    if (fields || fieldsLoader[projectId]) return;

    getFields(workspaceSlug, projectId);
  }, [fields, fieldsLoader, getFields, projectId, workspaceSlug]);

  const handleChange = async (fieldId: string, value: TIssueFieldValue) => {
    try {
      await updateIssueValues(workspaceSlug, projectId, workItemId, {
        field_values: {
          [fieldId]: Array.isArray(value) && value.length === 0 ? null : value,
        },
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error"),
        message: t("project_settings.fields.toasts.updated.error.message"),
      });
    }
  };

  if (!issue || isLoading || !fields || fields.length === 0) return null;

  return (
    <ProjectFieldValueEditors
      fields={fields}
      values={issue.field_values}
      disabled={!isEditable}
      commitPlainTextOnBlur
      onChange={handleChange}
      projectId={projectId}
      workspaceSlug={workspaceSlug}
    />
  );
});
