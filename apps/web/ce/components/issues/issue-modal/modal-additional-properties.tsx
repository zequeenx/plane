/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useFormContext } from "react-hook-form";
// plane imports
import type { TIssue, TIssueFieldValue, TIssueFieldValues } from "@plane/types";
// components
import { ProjectFieldValueEditors } from "@/components/project-fields/value-editors/root";
// hooks
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

export type TWorkItemModalAdditionalPropertiesProps = {
  isDraft?: boolean;
  onFormChange?: () => void;
  projectId: string | null;
  workItemId: string | undefined;
  workspaceSlug: string;
};

export const WorkItemModalAdditionalProperties = observer(function WorkItemModalAdditionalProperties(
  props: TWorkItemModalAdditionalPropertiesProps
) {
  const { isDraft = false, onFormChange, projectId, workItemId, workspaceSlug } = props;
  // form info
  const { setValue, watch } = useFormContext<TIssue>();
  // store hooks
  const { fieldsLoader, getFields, getFieldsByProjectId, updateIssueValues } = useProjectIssueFields();

  const fieldValues = watch("field_values") ?? {};
  const fields = projectId ? getFieldsByProjectId(projectId) : undefined;
  const isLoading = projectId ? !!fieldsLoader[projectId] || typeof fields === "undefined" : false;

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;

    getFields(workspaceSlug, projectId);
  }, [getFields, projectId, workspaceSlug]);

  const handleChange = async (fieldId: string, value: TIssueFieldValue) => {
    const shouldPersistImmediately = !!workItemId && !isDraft;
    const nextFieldValues: TIssueFieldValues = {
      ...fieldValues,
      [fieldId]: value,
    };

    setValue("field_values", nextFieldValues, { shouldDirty: !shouldPersistImmediately, shouldValidate: true });
    if (!shouldPersistImmediately) onFormChange?.();

    if (!shouldPersistImmediately || !projectId) return;

    await updateIssueValues(workspaceSlug, projectId, workItemId, {
      field_values: {
        [fieldId]: value,
      },
    });
  };

  if (!projectId || isLoading || !fields || fields.length === 0) return null;

  return (
    <div className="space-y-2.5 px-5">
      <ProjectFieldValueEditors
        fields={fields}
        values={fieldValues}
        disabled={false}
        onChange={handleChange}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
});
