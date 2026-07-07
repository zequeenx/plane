/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// ui
import { Input } from "@plane/ui";
// local imports
import type { TProjectFieldEditorProps } from "./types";

export const ProjectFieldPlainTextEditor = observer(function ProjectFieldPlainTextEditor(
  props: TProjectFieldEditorProps
) {
  const { disabled = false, field, onChange, value } = props;
  const textValue = typeof value === "string" ? value : "";

  return (
    <Input
      value={textValue}
      onChange={(event) => onChange(field.id, event.target.value.trim() ? event.target.value : null)}
      disabled={disabled}
      placeholder={field.name}
      mode="true-transparent"
      inputSize="xs"
      className="h-7.5 w-full grow px-2 text-body-xs-regular text-primary placeholder:text-placeholder"
    />
  );
});
