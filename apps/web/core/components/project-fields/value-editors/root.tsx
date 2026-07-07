/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { CalendarDays, CalendarRange, ListChecks, TextCursorInput, User, Users, type LucideIcon } from "lucide-react";
// plane imports
import { EProjectIssueFieldType } from "@plane/types";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// local imports
import { ProjectFieldDateEditor } from "./date";
import { ProjectFieldDateRangeEditor } from "./date-range";
import { ProjectFieldMemberSelectEditor } from "./member-select";
import { ProjectFieldPlainTextEditor } from "./plain-text";
import { ProjectFieldTextSelectEditor } from "./text-select";
import type { TProjectFieldEditorProps, TProjectFieldValueEditorsProps } from "./types";

const FIELD_ICON: Record<EProjectIssueFieldType, LucideIcon> = {
  [EProjectIssueFieldType.SINGLE_SELECT]: ListChecks,
  [EProjectIssueFieldType.MULTI_SELECT]: ListChecks,
  [EProjectIssueFieldType.SINGLE_MEMBER]: User,
  [EProjectIssueFieldType.MULTI_MEMBER]: Users,
  [EProjectIssueFieldType.DATE]: CalendarDays,
  [EProjectIssueFieldType.DATE_RANGE]: CalendarRange,
  [EProjectIssueFieldType.PLAIN_TEXT]: TextCursorInput,
};

const FieldEditor = observer(function FieldEditor(props: TProjectFieldEditorProps) {
  switch (props.field.field_type) {
    case EProjectIssueFieldType.SINGLE_SELECT:
    case EProjectIssueFieldType.MULTI_SELECT:
      return <ProjectFieldTextSelectEditor {...props} />;
    case EProjectIssueFieldType.SINGLE_MEMBER:
    case EProjectIssueFieldType.MULTI_MEMBER:
      return <ProjectFieldMemberSelectEditor {...props} />;
    case EProjectIssueFieldType.DATE:
      return <ProjectFieldDateEditor {...props} />;
    case EProjectIssueFieldType.DATE_RANGE:
      return <ProjectFieldDateRangeEditor {...props} />;
    case EProjectIssueFieldType.PLAIN_TEXT:
      return <ProjectFieldPlainTextEditor {...props} />;
    default:
      return null;
  }
});

export const ProjectFieldValueEditors = observer(function ProjectFieldValueEditors(
  props: TProjectFieldValueEditorsProps
) {
  const { commitPlainTextOnBlur = false, disabled = false, fields, onChange, projectId, values, workspaceSlug } = props;
  const enabledFields = fields.filter((field) => !field.is_disabled);

  if (enabledFields.length === 0) return null;

  return (
    <>
      {enabledFields.map((field) => {
        const Icon = FIELD_ICON[field.field_type];

        return (
          <SidebarPropertyListItem key={field.id} icon={Icon} label={field.name}>
            <FieldEditor
              commitPlainTextOnBlur={commitPlainTextOnBlur}
              disabled={disabled}
              field={field}
              onChange={onChange}
              projectId={projectId}
              value={values?.[field.id]}
              workspaceSlug={workspaceSlug}
            />
          </SidebarPropertyListItem>
        );
      })}
    </>
  );
});
