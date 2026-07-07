/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// types
import type { TIssueFieldDateRangeValue } from "@plane/types";
// helpers
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
// local imports
import type { TProjectFieldEditorProps } from "./types";

const getDateRangeValue = (value: TProjectFieldEditorProps["value"]): TIssueFieldDateRangeValue => {
  if (!value || typeof value === "string" || Array.isArray(value)) return { start: null, end: null };

  return {
    start: value.start ?? null,
    end: value.end ?? null,
  };
};

export const ProjectFieldDateRangeEditor = observer(function ProjectFieldDateRangeEditor(
  props: TProjectFieldEditorProps
) {
  const { disabled = false, field, onChange, value } = props;
  const dateRangeValue = getDateRangeValue(value);

  return (
    <DateRangeDropdown
      value={{
        from: getDate(dateRangeValue.start) ?? undefined,
        to: getDate(dateRangeValue.end) ?? undefined,
      }}
      onSelect={(range) => {
        const nextValue = {
          start: range?.from ? (renderFormattedPayloadDate(range.from) ?? null) : null,
          end: range?.to ? (renderFormattedPayloadDate(range.to) ?? null) : null,
        };

        onChange(field.id, nextValue.start || nextValue.end ? nextValue : null);
      }}
      disabled={disabled}
      buttonVariant="transparent-with-text"
      className="group w-full grow"
      buttonContainerClassName="w-full text-left h-7.5"
      buttonClassName={`text-body-xs-regular justify-start ${
        dateRangeValue.start || dateRangeValue.end ? "" : "text-placeholder"
      }`}
      placeholder={{ from: field.name, to: "" }}
      hideIcon={{ from: true, to: true }}
      isClearable
      mergeDates
      clearIconClassName="h-3 w-3 hidden group-hover:inline"
      renderInPortal
    />
  );
});
