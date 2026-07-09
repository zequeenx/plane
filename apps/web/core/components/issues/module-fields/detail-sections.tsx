/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueFieldValue } from "@plane/types";
import { Collapsible, CollapsibleButton } from "@plane/ui";
// components
import { ProjectFieldValueEditors } from "@/components/project-fields/value-editors/root";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useModule } from "@/hooks/store/use-module";
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";

type TWorkItemModuleFieldsProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

type TModuleFieldSectionProps = TWorkItemModuleFieldsProps & {
  moduleId: string;
};

const WorkItemModuleFieldSection = observer(function WorkItemModuleFieldSection(props: TModuleFieldSectionProps) {
  const { disabled, issueId, moduleId, projectId, workspaceSlug } = props;
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const [hasModuleLoadFailed, setHasModuleLoadFailed] = useState(false);
  const [hasFieldLoadFailed, setHasFieldLoadFailed] = useState(false);
  const { fetchModuleDetails, getModuleById } = useModule();
  const { fieldsLoader, getFields, getFieldsByModuleId, updateIssueValues } = useModuleIssueFields();
  const {
    issue: { getIssueById },
  } = useIssueDetail();

  const issue = getIssueById(issueId);
  const moduleDetails = getModuleById(moduleId);
  const fields = getFieldsByModuleId(moduleId);
  const isLoading = !!fieldsLoader[moduleId] || typeof fields === "undefined";
  const visibleFields = fields?.filter((field) => !field.is_disabled) ?? [];

  useEffect(() => {
    if (!workspaceSlug || !projectId || moduleDetails || hasModuleLoadFailed) return;

    fetchModuleDetails(workspaceSlug, projectId, moduleId).catch(() => setHasModuleLoadFailed(true));
  }, [fetchModuleDetails, hasModuleLoadFailed, moduleDetails, moduleId, projectId, workspaceSlug]);

  useEffect(() => {
    if (!workspaceSlug || !projectId || fields || fieldsLoader[moduleId] || hasFieldLoadFailed) return;

    getFields(workspaceSlug, projectId, moduleId).catch(() => setHasFieldLoadFailed(true));
  }, [fields, fieldsLoader, getFields, hasFieldLoadFailed, moduleId, projectId, workspaceSlug]);

  const handleChange = async (fieldId: string, value: TIssueFieldValue) => {
    try {
      await updateIssueValues(workspaceSlug, projectId, moduleId, issueId, {
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

  if (!issue || hasModuleLoadFailed || hasFieldLoadFailed || isLoading || !moduleDetails || visibleFields.length === 0)
    return null;

  return (
    <Collapsible
      isOpen={isOpen}
      onToggle={() => setIsOpen((current) => !current)}
      title={<CollapsibleButton isOpen={isOpen} title={`${moduleDetails.name} fields`} className="h-10 px-0 py-2" />}
      buttonClassName="w-full"
      className="border-b border-subtle last:border-b-0"
    >
      <div className="pb-3">
        <ProjectFieldValueEditors
          fields={visibleFields}
          values={issue.module_field_values?.[moduleId]}
          disabled={disabled}
          commitPlainTextOnBlur
          onChange={handleChange}
          projectId={projectId}
          workspaceSlug={workspaceSlug}
        />
      </div>
    </Collapsible>
  );
});

export const WorkItemModuleFields = observer(function WorkItemModuleFields(props: TWorkItemModuleFieldsProps) {
  const { issueId } = props;
  const {
    issue: { getIssueById },
  } = useIssueDetail();

  const issue = getIssueById(issueId);
  const moduleIds = issue?.module_ids?.filter((moduleId) => moduleId !== "None") ?? [];

  if (!issue || moduleIds.length === 0) return null;

  return (
    <div className="divide-y-0">
      {moduleIds.map((moduleId) => (
        <WorkItemModuleFieldSection key={moduleId} {...props} moduleId={moduleId} />
      ))}
    </div>
  );
});
