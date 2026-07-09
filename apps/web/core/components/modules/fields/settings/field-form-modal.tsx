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
  type TModuleIssueField,
  type TModuleIssueFieldPayload,
  type TModuleIssueFieldUpdatePayload,
} from "@plane/types";
import { CustomSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";

type Props = {
  workspaceSlug: string;
  projectId: string;
  moduleId: string;
  field: TModuleIssueField | null;
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

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return fallback;

  const errorRecord = error as Record<string, unknown>;
  const directMessage = errorRecord.error ?? errorRecord.detail;
  if (typeof directMessage === "string") return directMessage;

  for (const value of Object.values(errorRecord)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const message = value.find((item) => typeof item === "string");
      if (message) return message;
    }
  }

  return fallback;
};

export const ModuleFieldFormModal = observer(function ModuleFieldFormModal(props: Props) {
  const { workspaceSlug, projectId, moduleId, field, isOpen, handleClose } = props;
  // states
  const [formData, setFormData] = useState<TFieldForm>(DEFAULT_FORM_VALUES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // translation
  const { t } = useTranslation();
  // store hooks
  const { createField, updateField } = useModuleIssueFields();

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

  const handleSubmit = async () => {
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
        const payload: TModuleIssueFieldUpdatePayload = basePayload;
        await updateField(workspaceSlug, projectId, moduleId, field.id, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_module.fields.toasts.updated.success.title"),
          message: t("project_module.fields.toasts.updated.success.message"),
        });
      } else {
        const payload: TModuleIssueFieldPayload = {
          ...basePayload,
          field_type: formData.field_type,
        };
        await createField(workspaceSlug, projectId, moduleId, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_module.fields.toasts.created.success.title"),
          message: t("project_module.fields.toasts.created.success.message"),
        });
      }
      handleClose();
    } catch (error) {
      const fallback = field
        ? t("project_module.fields.toasts.updated.error.message")
        : t("project_module.fields.toasts.created.error.message");
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: getErrorMessage(error, fallback),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    if (isSubmitting) return;

    event.preventDefault();
    void handleSubmit();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleFormClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="relative space-y-6 py-5">
        <div className="px-5">
          <h3 className="text-18 font-medium text-primary">
            {field ? t("project_module.fields.modal.edit_title") : t("project_module.fields.modal.add_title")}
          </h3>
        </div>
        <div className="space-y-4 px-5">
          <div className="space-y-1.5">
            <label htmlFor="module-field-name" className="text-body-xs-medium text-secondary">
              {t("common.name")}
            </label>
            <Input
              id="module-field-name"
              value={formData.name}
              onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
              onKeyDown={handleInputKeyDown}
              placeholder={t("project_module.fields.modal.name_placeholder")}
              inputSize="md"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="module-field-description" className="text-body-xs-medium text-secondary">
              {t("common.description")}
            </label>
            <TextArea
              id="module-field-description"
              value={formData.description}
              onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
              placeholder={t("project_module.fields.modal.description_placeholder")}
              textAreaSize="md"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-body-xs-medium text-secondary">{t("project_module.fields.modal.type")}</div>
              <CustomSelect
                value={formData.field_type}
                onChange={(value: EProjectIssueFieldType) =>
                  setFormData((current) => ({ ...current, field_type: value }))
                }
                label={t(selectedFieldType.i18nKey)}
                ariaLabel={t("project_module.fields.modal.type_aria_label")}
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
              <label htmlFor="module-field-sort-order" className="text-body-xs-medium text-secondary">
                {t("project_module.fields.modal.sort_order")}
              </label>
              <Input
                id="module-field-sort-order"
                type="number"
                min={0}
                step={1}
                value={formData.sort_order}
                onChange={(event) => setFormData((current) => ({ ...current, sort_order: event.target.value }))}
                onKeyDown={handleInputKeyDown}
                placeholder={t("project_module.fields.modal.sort_order_placeholder")}
                inputSize="md"
                hasError={hasSortOrderError}
              />
              {hasSortOrderError && (
                <p className="text-caption-md-regular text-danger-primary">
                  {t("project_module.fields.validation.sort_order")}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="relative flex items-center justify-end gap-3 border-t border-subtle px-5 pt-5">
          <Button type="button" variant="secondary" size="lg" onClick={handleFormClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={!formData.name.trim() || hasSortOrderError}
          >
            {field ? t("common.save_changes") : t("project_module.fields.actions.create_field")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
