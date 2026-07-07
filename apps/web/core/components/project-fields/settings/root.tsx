/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import type { TProjectIssueField } from "@plane/types";
import { Loader } from "@plane/ui";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
// local imports
import { DisabledProjectFields } from "./disabled-fields";
import { ProjectFieldFormModal } from "./field-form-modal";
import { ProjectFieldRow } from "./field-row";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const ProjectFieldsSettingsRoot = observer(function ProjectFieldsSettingsRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  // states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<TProjectIssueField | null>(null);
  // translation
  const { t } = useTranslation();
  // store hooks
  const {
    fieldsLoader,
    disabledFieldsLoader,
    getFields,
    getDisabledFields,
    getFieldsByProjectId,
    getDisabledFieldsByProjectId,
  } = useProjectIssueFields();

  const fields = getFieldsByProjectId(projectId);
  const disabledFields = getDisabledFieldsByProjectId(projectId);
  const enabledFields = fields ?? [];
  const isLoading = !!fieldsLoader[projectId] || typeof fields === "undefined";
  const isDisabledLoading = !!disabledFieldsLoader[projectId] || typeof disabledFields === "undefined";

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;

    getFields(workspaceSlug, projectId);
    getDisabledFields(workspaceSlug, projectId);
  }, [getDisabledFields, getFields, projectId, workspaceSlug]);

  const handleCreate = () => {
    setSelectedField(null);
    setIsFormOpen(true);
  };

  const handleEdit = (field: TProjectIssueField) => {
    setSelectedField(field);
    setIsFormOpen(true);
  };

  return (
    <>
      <ProjectFieldFormModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        field={selectedField}
        isOpen={isFormOpen}
        handleClose={() => {
          setIsFormOpen(false);
          setSelectedField(null);
        }}
      />
      <div className="w-full">
        <SettingsHeading
          title={t("project_settings.fields.heading")}
          description={t("project_settings.fields.description")}
          control={
            <Button variant="primary" size="lg" onClick={handleCreate}>
              {t("project_settings.fields.actions.add_field")}
            </Button>
          }
        />
        <div className="mt-6 overflow-hidden rounded-sm border border-subtle">
          <div className="grid grid-cols-[minmax(0,1fr)_9rem_7rem] gap-4 border-b border-subtle bg-surface-2 px-4 py-2 text-caption-md-medium text-tertiary">
            <div>{t("project_settings.fields.table.field")}</div>
            <div>{t("project_settings.fields.table.type")}</div>
            <div className="text-right">{t("project_settings.fields.table.actions")}</div>
          </div>
          {isLoading ? (
            <Loader className="space-y-0">
              <Loader.Item height="56px" />
              <Loader.Item height="56px" />
              <Loader.Item height="56px" />
            </Loader>
          ) : enabledFields.length === 0 ? (
            <EmptyStateCompact
              assetKey="settings"
              assetClassName="size-20"
              title={t("project_settings.fields.empty_state.title")}
              description={t("project_settings.fields.empty_state.description")}
              actions={[
                {
                  label: t("project_settings.fields.actions.add_field"),
                  onClick: handleCreate,
                },
              ]}
              align="start"
              rootClassName="py-16"
            />
          ) : (
            <div className="divide-y divide-subtle">
              {enabledFields.map((field) => (
                <ProjectFieldRow
                  key={field.id}
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  field={field}
                  onEdit={() => handleEdit(field)}
                />
              ))}
            </div>
          )}
        </div>
        <DisabledProjectFields
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          fields={disabledFields ?? []}
          isLoading={isDisabledLoading}
        />
      </div>
    </>
  );
});
