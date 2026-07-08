/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Globe2, LockKeyhole } from "lucide-react";
// plane imports
import { MODULE_VISIBILITY_OPTIONS } from "@plane/constants";
import { Tooltip } from "@plane/propel/tooltip";
import type { TModuleVisibility } from "@plane/types";
import { cn } from "@plane/utils";

type ModuleVisibilityControlProps = {
  value?: TModuleVisibility;
  onChange: (value: TModuleVisibility) => void;
  disabled?: boolean;
  className?: string;
};

export function ModuleVisibilityControl(props: ModuleVisibilityControlProps) {
  const { value = "public", onChange, disabled = false, className } = props;

  return (
    <div
      className={cn(
        "flex h-7 items-center gap-0.5 rounded-sm border-[0.5px] border-strong bg-surface-1 p-0.5",
        disabled && "cursor-not-allowed opacity-70",
        className
      )}
    >
      {MODULE_VISIBILITY_OPTIONS.map((option) => {
        const isSelected = value === option.key;
        const Icon = option.key === "private" ? LockKeyhole : Globe2;

        return (
          <Tooltip key={option.key} tooltipContent={option.description}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.key)}
              className={cn(
                "flex h-6 min-w-16 items-center justify-center gap-1 rounded-xs px-2 text-11 font-medium transition-colors",
                isSelected ? "bg-layer-3 text-primary" : "text-tertiary hover:bg-layer-2 hover:text-secondary",
                disabled && "cursor-not-allowed hover:bg-transparent"
              )}
            >
              <Icon className="h-3 w-3" />
              <span>{option.label}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

type ModuleVisibilityBadgeProps = {
  visibility?: TModuleVisibility;
  className?: string;
};

export function ModuleVisibilityBadge(props: ModuleVisibilityBadgeProps) {
  const { visibility, className } = props;

  if (visibility !== "private") return null;

  return (
    <Tooltip tooltipContent="Private module">
      <span
        aria-label="Private module"
        className={cn("inline-flex flex-shrink-0 items-center justify-center text-tertiary", className)}
      >
        <LockKeyhole className="h-3.5 w-3.5" />
      </span>
    </Tooltip>
  );
}
