/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Tooltip } from "@plane/propel/tooltip";
import {
  EProjectIssueFieldType,
  type IIssueDisplayProperties,
  type TIssue,
  type TIssueFieldDateRangeValue,
  type TIssueFieldValue,
  type TModuleIssueField,
  type TProjectIssueField,
} from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
import { useProjectView } from "@/hooks/store/use-project-view";

export type TWorkItemLayoutAdditionalProperties = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
};

const CUSTOM_PROPERTY_PREFIX = "customproperty_";
const MODULE_CUSTOM_PROPERTY_PREFIX = "modulecustomproperty_";

const getCustomPropertyKey = (fieldId: string) => `${CUSTOM_PROPERTY_PREFIX}${fieldId}` as const;
const getModuleCustomPropertyKey = (fieldId: string) => `${MODULE_CUSTOM_PROPERTY_PREFIX}${fieldId}` as const;

const getDateRangeLabel = (value: TIssueFieldDateRangeValue) => {
  if (value.start && value.end) return `${renderFormattedDate(value.start)} - ${renderFormattedDate(value.end)}`;
  if (value.start) return renderFormattedDate(value.start);
  if (value.end) return renderFormattedDate(value.end);

  return null;
};

type TCustomFieldValueLabelProps = {
  field: TProjectIssueField | TModuleIssueField;
  value: TIssueFieldValue | undefined;
};

const CustomFieldValueLabel = observer(function CustomFieldValueLabel(props: TCustomFieldValueLabelProps) {
  const { field, value } = props;
  const { getUserDetails } = useMember();

  const label = React.useMemo(() => {
    if (value === null || typeof value === "undefined") return null;

    switch (field.field_type) {
      case EProjectIssueFieldType.SINGLE_SELECT:
        return typeof value === "string" ? (field.options.find((option) => option.id === value)?.value ?? null) : null;
      case EProjectIssueFieldType.MULTI_SELECT: {
        if (!Array.isArray(value) || value.length === 0) return null;
        const optionNames = value
          .map((optionId) => field.options.find((option) => option.id === optionId)?.value)
          .filter((optionName): optionName is string => !!optionName);

        return optionNames.length > 0 ? optionNames.join(", ") : null;
      }
      case EProjectIssueFieldType.SINGLE_MEMBER:
        return typeof value === "string" ? (getUserDetails(value)?.display_name ?? null) : null;
      case EProjectIssueFieldType.MULTI_MEMBER: {
        if (!Array.isArray(value) || value.length === 0) return null;
        const memberNames = value
          .map((memberId) => getUserDetails(memberId)?.display_name)
          .filter((memberName): memberName is string => !!memberName);

        return memberNames.length > 0 ? memberNames.join(", ") : null;
      }
      case EProjectIssueFieldType.DATE:
        return typeof value === "string" ? renderFormattedDate(value) : null;
      case EProjectIssueFieldType.DATE_RANGE:
        return typeof value === "object" && !Array.isArray(value) ? getDateRangeLabel(value) : null;
      case EProjectIssueFieldType.PLAIN_TEXT:
        return typeof value === "string" && value.trim() ? value : null;
      default:
        return null;
    }
  }, [field, getUserDetails, value]);

  if (!label) return null;

  return (
    <Tooltip tooltipHeading={field.name} tooltipContent={label} renderByDefault={false}>
      <div
        className={cn(
          "flex h-5 max-w-40 flex-shrink-0 items-center gap-1 overflow-hidden rounded-sm border-[0.5px] border-strong px-2 py-1",
          "text-caption-sm-regular text-tertiary"
        )}
      >
        <span className="truncate">{label}</span>
      </div>
    </Tooltip>
  );
});

export const WorkItemLayoutAdditionalProperties = observer(function WorkItemLayoutAdditionalProperties(
  props: TWorkItemLayoutAdditionalProperties
) {
  const { displayProperties, issue } = props;
  const { workspaceSlug, projectId: routeProjectId, moduleId: routeModuleId, viewId: routeViewId } = useParams();
  const { fieldsLoader: moduleFieldsLoader, getFields: getModuleFields, getFieldsByModuleId } = useModuleIssueFields();
  const { fieldsLoader, getFields, getFieldsByProjectId } = useProjectIssueFields();
  const { getViewById } = useProjectView();

  const projectId = routeProjectId?.toString() === issue.project_id ? issue.project_id : undefined;
  const fields = projectId ? getFieldsByProjectId(projectId) : undefined;
  const projectView = routeViewId ? getViewById(routeViewId.toString()) : undefined;
  const sourceModuleId = routeModuleId?.toString() ?? projectView?.source_module ?? null;
  const moduleFields = sourceModuleId ? getFieldsByModuleId(sourceModuleId) : undefined;

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (fields || fieldsLoader[projectId]) return;

    getFields(workspaceSlug.toString(), projectId).catch((error) => {
      console.error("Failed to load project issue fields:", error);
    });
  }, [fields, fieldsLoader, getFields, projectId, workspaceSlug]);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !sourceModuleId) return;
    if (moduleFields || moduleFieldsLoader[sourceModuleId]) return;

    getModuleFields(workspaceSlug.toString(), projectId, sourceModuleId).catch((error) => {
      console.error("Failed to load module issue fields:", error);
    });
  }, [getModuleFields, moduleFields, moduleFieldsLoader, projectId, sourceModuleId, workspaceSlug]);

  if (!projectId) return null;

  const visibleFields = fields?.filter((field) => displayProperties[getCustomPropertyKey(field.id)]) ?? [];
  const visibleModuleFields =
    sourceModuleId && moduleFields
      ? moduleFields.filter((field) => displayProperties[getModuleCustomPropertyKey(field.id)])
      : [];

  if (visibleFields.length === 0 && visibleModuleFields.length === 0) return null;

  return (
    <>
      {visibleFields.map((field) => (
        <CustomFieldValueLabel key={field.id} field={field} value={issue.field_values?.[field.id]} />
      ))}
      {sourceModuleId &&
        visibleModuleFields.map((field) => (
          <CustomFieldValueLabel
            key={`module-${field.id}`}
            field={field}
            value={issue.module_field_values?.[sourceModuleId]?.[field.id]}
          />
        ))}
    </>
  );
});
