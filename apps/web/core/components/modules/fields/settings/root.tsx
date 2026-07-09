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
import type { TModuleIssueField } from "@plane/types";
import { Loader } from "@plane/ui";
// hooks
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";
// local imports
import { DisabledModuleFields } from "./disabled-fields";
import { ModuleFieldFormModal } from "./field-form-modal";
import { ModuleFieldRow } from "./field-row";

type Props = {
  workspaceSlug: string;
  projectId: string;
  moduleId: string;
  readOnly?: boolean;
};

export const ModuleFieldsSettingsRoot = observer(function ModuleFieldsSettingsRoot(props: Props) {
  const { workspaceSlug, projectId, moduleId, readOnly = false } = props;
  // states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<TModuleIssueField | null>(null);
  // translation
  const { t } = useTranslation();
  // store hooks
  const {
    fieldsLoader,
    disabledFieldsLoader,
    getFields,
    getDisabledFields,
    getFieldsByModuleId,
    getDisabledFieldsByModuleId,
  } = useModuleIssueFields();

  const fields = getFieldsByModuleId(moduleId);
  const disabledFields = getDisabledFieldsByModuleId(moduleId);
  const enabledFields = fields ?? [];
  const isLoading = !!fieldsLoader[moduleId] || typeof fields === "undefined";
  const isDisabledLoading = !!disabledFieldsLoader[moduleId] || typeof disabledFields === "undefined";

  useEffect(() => {
    if (!workspaceSlug || !projectId || !moduleId) return;

    getFields(workspaceSlug, projectId, moduleId);
    getDisabledFields(workspaceSlug, projectId, moduleId);
  }, [getDisabledFields, getFields, moduleId, projectId, workspaceSlug]);

  const handleCreate = () => {
    setSelectedField(null);
    setIsFormOpen(true);
  };

  const handleEdit = (field: TModuleIssueField) => {
    setSelectedField(field);
    setIsFormOpen(true);
  };

  return (
    <>
      {!readOnly && (
        <ModuleFieldFormModal
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          moduleId={moduleId}
          field={selectedField}
          isOpen={isFormOpen}
          handleClose={() => {
            setIsFormOpen(false);
            setSelectedField(null);
          }}
        />
      )}
      <section className="border-t border-subtle pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-body-sm-medium text-primary">{t("project_module.fields.heading")}</h4>
            <p className="mt-1 text-body-xs-regular text-tertiary">{t("project_module.fields.description")}</p>
          </div>
          {!readOnly && (
            <Button type="button" variant="primary" size="sm" onClick={handleCreate}>
              {t("project_module.fields.actions.add_field")}
            </Button>
          )}
        </div>
        <div className="mt-4 overflow-hidden rounded-sm border border-subtle">
          <div
            className={
              readOnly
                ? "grid grid-cols-[minmax(0,1fr)_8rem] gap-4 border-b border-subtle bg-surface-2 px-4 py-2 text-caption-md-medium text-tertiary"
                : "grid grid-cols-[minmax(0,1fr)_8rem_6rem] gap-4 border-b border-subtle bg-surface-2 px-4 py-2 text-caption-md-medium text-tertiary"
            }
          >
            <div>{t("project_module.fields.table.field")}</div>
            <div>{t("project_module.fields.table.type")}</div>
            {!readOnly && <div className="text-right">{t("project_module.fields.table.actions")}</div>}
          </div>
          {isLoading ? (
            <Loader className="space-y-0">
              <Loader.Item height="56px" />
              <Loader.Item height="56px" />
            </Loader>
          ) : enabledFields.length === 0 ? (
            <EmptyStateCompact
              assetKey="settings"
              assetClassName="size-16"
              title={t("project_module.fields.empty_state.title")}
              description={t("project_module.fields.empty_state.description")}
              actions={
                readOnly
                  ? undefined
                  : [
                      {
                        label: t("project_module.fields.actions.add_field"),
                        onClick: handleCreate,
                      },
                    ]
              }
              align="start"
              rootClassName="py-10"
            />
          ) : (
            <div className="divide-y divide-subtle">
              {enabledFields.map((field) => (
                <ModuleFieldRow
                  key={field.id}
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  moduleId={moduleId}
                  field={field}
                  onEdit={() => handleEdit(field)}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}
        </div>
        <DisabledModuleFields
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          moduleId={moduleId}
          fields={disabledFields ?? []}
          isLoading={isDisabledLoading}
          readOnly={readOnly}
        />
      </section>
    </>
  );
});
