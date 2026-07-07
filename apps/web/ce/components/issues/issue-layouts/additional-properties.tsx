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
  type TProjectIssueField,
} from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

export type TWorkItemLayoutAdditionalProperties = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
};

const CUSTOM_PROPERTY_PREFIX = "customproperty_";

const getCustomPropertyKey = (fieldId: string) => `${CUSTOM_PROPERTY_PREFIX}${fieldId}` as const;

const getDateRangeLabel = (value: TIssueFieldDateRangeValue) => {
  if (value.start && value.end) return `${renderFormattedDate(value.start)} - ${renderFormattedDate(value.end)}`;
  if (value.start) return renderFormattedDate(value.start);
  if (value.end) return renderFormattedDate(value.end);

  return null;
};

type TCustomFieldValueLabelProps = {
  field: TProjectIssueField;
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
  const { workspaceSlug } = useParams();
  const { fieldsLoader, getFields, getFieldsByProjectId } = useProjectIssueFields();

  const projectId = issue.project_id;
  const fields = projectId ? getFieldsByProjectId(projectId) : undefined;

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (fields || fieldsLoader[projectId]) return;

    getFields(workspaceSlug.toString(), projectId).catch((error) => {
      console.error("Failed to load project issue fields:", error);
    });
  }, [fields, fieldsLoader, getFields, projectId, workspaceSlug]);

  if (!projectId || !fields || fields.length === 0) return null;

  const visibleFields = fields.filter((field) => displayProperties[getCustomPropertyKey(field.id)]);

  if (visibleFields.length === 0) return null;

  return (
    <>
      {visibleFields.map((field) => (
        <CustomFieldValueLabel key={field.id} field={field} value={issue.field_values?.[field.id]} />
      ))}
    </>
  );
});
