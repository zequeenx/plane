/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// helpers
import { renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
// local imports
import type { TProjectFieldEditorProps } from "./types";

export const ProjectFieldDateEditor = observer(function ProjectFieldDateEditor(props: TProjectFieldEditorProps) {
  const { disabled = false, field, onChange, value } = props;
  const dateValue = typeof value === "string" ? value : null;

  return (
    <DateDropdown
      value={dateValue}
      onChange={(date) => onChange(field.id, date ? (renderFormattedPayloadDate(date) ?? null) : null)}
      disabled={disabled}
      buttonVariant="transparent-with-text"
      className="group w-full grow"
      buttonContainerClassName="w-full text-left h-7.5"
      buttonClassName={`text-body-xs-regular ${dateValue ? "" : "text-placeholder"}`}
      placeholder={field.name}
      hideIcon
      clearIconClassName="h-3 w-3 hidden group-hover:inline"
    />
  );
});
