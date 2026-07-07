/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// types
import { EProjectIssueFieldType } from "@plane/types";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// local imports
import type { TProjectFieldEditorProps } from "./types";

export const ProjectFieldMemberSelectEditor = observer(function ProjectFieldMemberSelectEditor(
  props: TProjectFieldEditorProps
) {
  const { disabled = false, field, onChange, projectId, value } = props;
  const isMultiple = field.field_type === EProjectIssueFieldType.MULTI_MEMBER;

  if (isMultiple) {
    const memberIds = Array.isArray(value) ? value : [];

    return (
      <MemberDropdown
        value={memberIds}
        onChange={(nextValue) => onChange(field.id, nextValue)}
        disabled={disabled}
        projectId={projectId}
        placeholder={field.name}
        multiple
        buttonVariant={memberIds.length > 1 ? "transparent-without-text" : "transparent-with-text"}
        className="group w-full grow"
        buttonContainerClassName="w-full text-left h-7.5"
        buttonClassName={`text-body-xs-regular justify-between ${memberIds.length > 0 ? "" : "text-placeholder"}`}
        hideIcon={memberIds.length === 0}
        dropdownArrow
        dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
      />
    );
  }

  const memberId = typeof value === "string" ? value : null;

  return (
    <MemberDropdown
      value={memberId}
      onChange={(nextValue) => onChange(field.id, nextValue || null)}
      disabled={disabled}
      projectId={projectId}
      placeholder={field.name}
      multiple={false}
      buttonVariant="transparent-with-text"
      className="group w-full grow"
      buttonContainerClassName="w-full text-left h-7.5"
      buttonClassName={`text-body-xs-regular justify-between ${memberId ? "" : "text-placeholder"}`}
      hideIcon={!memberId}
      showUserDetails
      dropdownArrow
      dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
    />
  );
});
