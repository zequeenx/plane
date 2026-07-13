/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useFormContext } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue, TIssueFieldValue, TIssueFieldValues } from "@plane/types";
// components
import { ProjectFieldValueEditors } from "@/components/project-fields/value-editors/root";
// hooks
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
import { useCustomFieldValueLocalUpdate } from "@/hooks/use-custom-field-value-local-update";

const isEmptyFieldValue = (value: TIssueFieldValue | undefined) => {
  if (value === null || typeof value === "undefined") return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;

  return !value.start && !value.end;
};

const getSparseFieldValues = (values: TIssueFieldValues, fieldId: string, value: TIssueFieldValue) => {
  const nextFieldValues: TIssueFieldValues = { ...values };

  if (isEmptyFieldValue(value)) delete nextFieldValues[fieldId];
  else nextFieldValues[fieldId] = value;

  return nextFieldValues;
};

const getPersistedFieldValue = (value: TIssueFieldValue) => {
  if (Array.isArray(value) && value.length === 0) return null;

  return value;
};

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
  const { t } = useTranslation();
  // form info
  const { setValue, watch } = useFormContext<TIssue>();
  // store hooks
  const { fieldsLoader, getFields, getFieldsByProjectId, updateIssueValues } = useProjectIssueFields();
  const updateCustomFieldValueLocalState = useCustomFieldValueLocalUpdate();

  const fieldValues = watch("field_values") ?? {};
  const fields = projectId ? getFieldsByProjectId(projectId) : undefined;
  const isLoading = projectId ? !!fieldsLoader[projectId] || typeof fields === "undefined" : false;

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (fields || fieldsLoader[projectId]) return;

    getFields(workspaceSlug, projectId);
  }, [fields, fieldsLoader, getFields, projectId, workspaceSlug]);

  const handleChange = async (fieldId: string, value: TIssueFieldValue) => {
    const shouldPersistImmediately = !!workItemId && !isDraft;
    const previousFieldValues = fieldValues;
    const nextFieldValues = shouldPersistImmediately
      ? { ...fieldValues, [fieldId]: value }
      : getSparseFieldValues(fieldValues, fieldId, value);

    setValue("field_values", nextFieldValues, { shouldDirty: !shouldPersistImmediately, shouldValidate: true });
    if (!shouldPersistImmediately) onFormChange?.();

    if (!shouldPersistImmediately || !projectId) return;

    try {
      await updateIssueValues(
        workspaceSlug,
        projectId,
        workItemId,
        {
          field_values: {
            [fieldId]: getPersistedFieldValue(value),
          },
        },
        updateCustomFieldValueLocalState
      );
    } catch {
      setValue("field_values", previousFieldValues, { shouldDirty: false, shouldValidate: true });
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error"),
        message: t("project_settings.fields.toasts.updated.error.message"),
      });
    }
  };

  if (!projectId || isLoading || !fields || fields.length === 0) return null;

  return (
    <div className="space-y-2.5 px-5">
      <ProjectFieldValueEditors
        fields={fields}
        values={fieldValues}
        disabled={false}
        commitPlainTextOnBlur={!!workItemId && !isDraft}
        onChange={handleChange}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
});
