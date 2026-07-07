/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import type {
  TFilterConditionNodeForDisplay,
  TFilterProperty,
  TNoValueFilterFieldConfig,
  TTextFilterFieldConfig,
} from "@plane/types";
import { cn } from "@plane/utils";
// local imports
import { COMMON_FILTER_ITEM_BORDER_CLASSNAME, EMPTY_FILTER_PLACEHOLDER_TEXT } from "../shared";

type TTextFilterValueInputProps<P extends TFilterProperty> = {
  config: TTextFilterFieldConfig<string>;
  condition: TFilterConditionNodeForDisplay<P, string>;
  isDisabled?: boolean;
  onChange: (value: string | null) => void;
};

export const TextFilterValueInput = observer(function TextFilterValueInput<P extends TFilterProperty>(
  props: TTextFilterValueInputProps<P>
) {
  const { config, condition, isDisabled, onChange } = props;
  const conditionValue = typeof condition.value === "string" ? condition.value : "";

  return (
    <input
      className={cn(
        "h-full min-w-32 bg-transparent px-2 py-[5px] text-13 text-primary outline-none placeholder:text-placeholder",
        !isDisabled && COMMON_FILTER_ITEM_BORDER_CLASSNAME
      )}
      disabled={isDisabled}
      onChange={(event) => onChange(event.target.value || null)}
      placeholder={config.placeholder ?? EMPTY_FILTER_PLACEHOLDER_TEXT}
      value={conditionValue}
    />
  );
});

type TNoValueFilterValueInputProps<P extends TFilterProperty> = {
  config: TNoValueFilterFieldConfig;
  condition: TFilterConditionNodeForDisplay<P, boolean>;
  isDisabled?: boolean;
  onChange: (value: boolean) => void;
};

export const NoValueFilterValueInput = observer(function NoValueFilterValueInput<P extends TFilterProperty>(
  props: TNoValueFilterValueInputProps<P>
) {
  const { config, condition, isDisabled, onChange } = props;

  useEffect(() => {
    if (!isDisabled && condition.value !== true) onChange(config.defaultValue ?? true);
  }, [condition.value, config.defaultValue, isDisabled, onChange]);

  return null;
});
