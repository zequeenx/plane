/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
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
          title="Fields"
          description="Manage the custom fields available on this project's work items."
          control={
            <Button variant="primary" size="lg" onClick={handleCreate}>
              Add field
            </Button>
          }
        />
        <div className="mt-6 overflow-hidden rounded-sm border border-subtle">
          <div className="grid grid-cols-[minmax(0,1fr)_9rem_7rem] gap-4 border-b border-subtle bg-surface-2 px-4 py-2 text-caption-md-medium text-tertiary">
            <div>Field</div>
            <div>Type</div>
            <div className="text-right">Actions</div>
          </div>
          {isLoading ? (
            <Loader className="space-y-0">
              <Loader.Item height="56px" />
              <Loader.Item height="56px" />
              <Loader.Item height="56px" />
            </Loader>
          ) : enabledFields.length === 0 ? (
            <EmptyStateCompact
              assetKey="label"
              assetClassName="size-20"
              title="No fields yet"
              description="Create a field to capture project-specific work item details."
              actions={[
                {
                  label: "Add field",
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
