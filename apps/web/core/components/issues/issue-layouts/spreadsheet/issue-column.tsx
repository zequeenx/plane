/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// types
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IIssueDisplayProperties, TIssue, TIssueFieldValue } from "@plane/types";
// components
import { useTranslation } from "@plane/i18n";
import { ProjectFieldValueEditor } from "@/components/project-fields/value-editors/root";
import { SPREADSHEET_COLUMNS } from "@/plane-web/components/issues/issue-layouts/utils";
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";
import { SpreadsheetCustomFieldCell } from "./custom-field-cell";

type Props = {
  displayProperties: IIssueDisplayProperties;
  issueDetail: TIssue;
  disableUserActions: boolean;
  property: keyof IIssueDisplayProperties;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  isEstimateEnabled: boolean;
  sourceModuleId?: string | null;
};

export const IssueColumn = observer(function IssueColumn(props: Props) {
  const { displayProperties, issueDetail, disableUserActions, property, updateIssue, sourceModuleId } = props;
  // router
  const tableCellRef = useRef<HTMLTableCellElement | null>(null);
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getFieldById, updateIssueValues } = useProjectIssueFields();
  const { getFieldById: getModuleFieldById, updateIssueValues: updateModuleIssueValues } = useModuleIssueFields();

  const shouldRenderProperty = shouldRenderColumn(property);
  const issueProjectId = issueDetail.project_id;
  const customFieldId = property.startsWith("customproperty_") ? property.replace("customproperty_", "") : null;
  const moduleCustomFieldId = property.startsWith("modulecustomproperty_")
    ? property.replace("modulecustomproperty_", "")
    : null;
  const customField = issueProjectId && customFieldId ? getFieldById(issueProjectId, customFieldId) : undefined;
  const moduleCustomField =
    sourceModuleId && moduleCustomFieldId ? getModuleFieldById(sourceModuleId, moduleCustomFieldId) : undefined;

  const Column = SPREADSHEET_COLUMNS[property];

  if (!Column && !customField && !moduleCustomField) return null;

  const handleUpdateIssue = async (issue: TIssue, data: Partial<TIssue>) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, data);
  };

  const handleUpdateCustomField = async (fieldId: string, value: TIssueFieldValue) => {
    if (!workspaceSlug || !issueProjectId) return;

    try {
      await updateIssueValues(workspaceSlug.toString(), issueProjectId, issueDetail.id, {
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

  const handleUpdateModuleCustomField = async (fieldId: string, value: TIssueFieldValue) => {
    if (!workspaceSlug || !issueProjectId || !sourceModuleId) return;

    try {
      await updateModuleIssueValues(workspaceSlug.toString(), issueProjectId, sourceModuleId, issueDetail.id, {
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

  return (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey={property}
      shouldRenderProperty={() => shouldRenderProperty}
    >
      <td
        tabIndex={0}
        className="h-11 min-w-36 border-r-[1px] border-subtle text-13 after:absolute after:bottom-[-1px] after:w-full after:border after:border-subtle"
        ref={tableCellRef}
      >
        {customField ? (
          <SpreadsheetCustomFieldCell>
            <ProjectFieldValueEditor
              commitPlainTextOnBlur
              disabled={disableUserActions}
              field={customField}
              onChange={handleUpdateCustomField}
              projectId={customField.project}
              value={issueDetail.field_values?.[customField.id]}
              workspaceSlug={workspaceSlug?.toString() ?? ""}
            />
          </SpreadsheetCustomFieldCell>
        ) : moduleCustomField && sourceModuleId ? (
          <SpreadsheetCustomFieldCell>
            <ProjectFieldValueEditor
              commitPlainTextOnBlur
              disabled={disableUserActions}
              field={moduleCustomField}
              onChange={handleUpdateModuleCustomField}
              projectId={moduleCustomField.project}
              value={issueDetail.module_field_values?.[sourceModuleId]?.[moduleCustomField.id]}
              workspaceSlug={workspaceSlug?.toString() ?? ""}
            />
          </SpreadsheetCustomFieldCell>
        ) : Column ? (
          <Column
            issue={issueDetail}
            onChange={handleUpdateIssue}
            disabled={disableUserActions}
            onClose={() => tableCellRef?.current?.focus()}
          />
        ) : null}
      </td>
    </WithDisplayPropertiesHOC>
  );
});
