/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// ui
import { Input } from "@plane/ui";
// local imports
import type { TProjectFieldEditorProps } from "./types";

export const ProjectFieldPlainTextEditor = observer(function ProjectFieldPlainTextEditor(
  props: TProjectFieldEditorProps
) {
  const { commitPlainTextOnBlur = false, disabled = false, field, onChange, value } = props;
  const textValue = typeof value === "string" ? value : "";
  const [draftValue, setDraftValue] = useState(textValue);
  const lastAttemptedValueRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    setDraftValue(textValue);
    lastAttemptedValueRef.current = undefined;
  }, [textValue]);

  const commitDraftValue = () => {
    const currentValue = textValue.trim() ? textValue : null;
    const nextValue = draftValue.trim() ? draftValue : null;
    if (currentValue === nextValue || lastAttemptedValueRef.current === nextValue) return;

    lastAttemptedValueRef.current = nextValue;
    onChange(field.id, nextValue);
    setDraftValue(textValue);
  };

  if (commitPlainTextOnBlur) {
    return (
      <Input
        value={draftValue}
        onChange={(event) => {
          lastAttemptedValueRef.current = undefined;
          setDraftValue(event.target.value);
        }}
        onBlur={commitDraftValue}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;

          event.preventDefault();
          commitDraftValue();
          event.currentTarget.blur();
        }}
        disabled={disabled}
        placeholder={field.name}
        mode="true-transparent"
        inputSize="xs"
        className="h-7.5 w-full grow px-2 text-body-xs-regular text-primary placeholder:text-placeholder"
      />
    );
  }

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
