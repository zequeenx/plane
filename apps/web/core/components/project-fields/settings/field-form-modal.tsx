/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import {
  EProjectIssueFieldType,
  type TProjectIssueField,
  type TProjectIssueFieldPayload,
  type TProjectIssueFieldUpdatePayload,
} from "@plane/types";
import { CustomSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

type Props = {
  workspaceSlug: string;
  projectId: string;
  field: TProjectIssueField | null;
  isOpen: boolean;
  handleClose: () => void;
};

type TFieldForm = {
  name: string;
  description: string;
  field_type: EProjectIssueFieldType;
  sort_order: string;
};

const FIELD_TYPE_OPTIONS: { i18nKey: string; value: EProjectIssueFieldType }[] = [
  { i18nKey: "project_settings.fields.field_types.single_select", value: EProjectIssueFieldType.SINGLE_SELECT },
  { i18nKey: "project_settings.fields.field_types.multi_select", value: EProjectIssueFieldType.MULTI_SELECT },
  { i18nKey: "project_settings.fields.field_types.single_member", value: EProjectIssueFieldType.SINGLE_MEMBER },
  { i18nKey: "project_settings.fields.field_types.multi_member", value: EProjectIssueFieldType.MULTI_MEMBER },
  { i18nKey: "project_settings.fields.field_types.date", value: EProjectIssueFieldType.DATE },
  { i18nKey: "project_settings.fields.field_types.date_range", value: EProjectIssueFieldType.DATE_RANGE },
  { i18nKey: "project_settings.fields.field_types.plain_text", value: EProjectIssueFieldType.PLAIN_TEXT },
];

const DEFAULT_FORM_VALUES: TFieldForm = {
  name: "",
  description: "",
  field_type: EProjectIssueFieldType.PLAIN_TEXT,
  sort_order: "",
};

export const ProjectFieldFormModal = observer(function ProjectFieldFormModal(props: Props) {
  const { workspaceSlug, projectId, field, isOpen, handleClose } = props;
  // states
  const [formData, setFormData] = useState<TFieldForm>(DEFAULT_FORM_VALUES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // translation
  const { t } = useTranslation();
  // store hooks
  const { createField, updateField } = useProjectIssueFields();

  const selectedFieldType = useMemo(
    () => FIELD_TYPE_OPTIONS.find((option) => option.value === formData.field_type) ?? FIELD_TYPE_OPTIONS[0],
    [formData.field_type]
  );
  const sortOrderValue = formData.sort_order.trim();
  const sortOrderNumber = sortOrderValue === "" ? undefined : Number(sortOrderValue);
  const hasSortOrderError =
    typeof sortOrderNumber === "number" && (!Number.isInteger(sortOrderNumber) || sortOrderNumber < 0);

  useEffect(() => {
    if (!isOpen) return;

    setFormData(
      field
        ? {
            name: field.name,
            description: field.description ?? "",
            field_type: field.field_type,
            sort_order: String(field.sort_order ?? ""),
          }
        : DEFAULT_FORM_VALUES
    );
    setIsSubmitting(false);
  }, [field, isOpen]);

  const handleFormClose = () => {
    if (isSubmitting) return;
    handleClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = formData.name.trim();
    if (!name) return;

    if (hasSortOrderError) return;

    const sortOrder = sortOrderNumber;
    const basePayload = {
      name,
      description: formData.description.trim(),
      ...(typeof sortOrder === "number" && Number.isFinite(sortOrder) ? { sort_order: sortOrder } : {}),
    };

    try {
      setIsSubmitting(true);
      if (field) {
        const payload: TProjectIssueFieldUpdatePayload = basePayload;
        await updateField(workspaceSlug, projectId, field.id, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_settings.fields.toasts.updated.success.title"),
          message: t("project_settings.fields.toasts.updated.success.message"),
        });
      } else {
        const payload: TProjectIssueFieldPayload = {
          ...basePayload,
          field_type: formData.field_type,
        };
        await createField(workspaceSlug, projectId, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_settings.fields.toasts.created.success.title"),
          message: t("project_settings.fields.toasts.created.success.message"),
        });
      }
      handleClose();
    } catch (error) {
      const fallback = field
        ? t("project_settings.fields.toasts.updated.error.message")
        : t("project_settings.fields.toasts.created.error.message");
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error"),
        message: typeof error === "object" && error && "error" in error ? String(error.error) : fallback,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleFormClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <form onSubmit={handleSubmit} className="relative space-y-6 py-5">
        <div className="px-5">
          <h3 className="text-18 font-medium text-primary">
            {field ? t("project_settings.fields.modal.edit_title") : t("project_settings.fields.modal.add_title")}
          </h3>
        </div>
        <div className="space-y-4 px-5">
          <div className="space-y-1.5">
            <label htmlFor="project-field-name" className="text-body-xs-medium text-secondary">
              {t("common.name")}
            </label>
            <Input
              id="project-field-name"
              value={formData.name}
              onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
              placeholder={t("project_settings.fields.modal.name_placeholder")}
              inputSize="md"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="project-field-description" className="text-body-xs-medium text-secondary">
              {t("common.description")}
            </label>
            <TextArea
              id="project-field-description"
              value={formData.description}
              onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
              placeholder={t("project_settings.fields.modal.description_placeholder")}
              textAreaSize="md"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-body-xs-medium text-secondary">{t("project_settings.fields.modal.type")}</div>
              <CustomSelect
                value={formData.field_type}
                onChange={(value: EProjectIssueFieldType) =>
                  setFormData((current) => ({ ...current, field_type: value }))
                }
                label={t(selectedFieldType.i18nKey)}
                ariaLabel={t("project_settings.fields.modal.type_aria_label")}
                input
                disabled={!!field}
                className="w-full"
                buttonClassName="h-10"
              >
                {FIELD_TYPE_OPTIONS.map((option) => (
                  <CustomSelect.Option key={option.value} value={option.value}>
                    {t(option.i18nKey)}
                  </CustomSelect.Option>
                ))}
              </CustomSelect>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="project-field-sort-order" className="text-body-xs-medium text-secondary">
                {t("project_settings.fields.modal.sort_order")}
              </label>
              <Input
                id="project-field-sort-order"
                type="number"
                min={0}
                step={1}
                value={formData.sort_order}
                onChange={(event) => setFormData((current) => ({ ...current, sort_order: event.target.value }))}
                placeholder={t("project_settings.fields.modal.sort_order_placeholder")}
                inputSize="md"
                hasError={hasSortOrderError}
              />
              {hasSortOrderError && (
                <p className="text-caption-md-regular text-danger-primary">
                  {t("project_settings.fields.validation.sort_order")}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="relative flex items-center justify-end gap-3 border-t border-subtle px-5 pt-5">
          <Button variant="secondary" size="lg" onClick={handleFormClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="submit"
            loading={isSubmitting}
            disabled={!formData.name.trim() || hasSortOrderError}
          >
            {field ? t("common.save_changes") : t("project_settings.fields.actions.create_field")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
