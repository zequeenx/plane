/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { cn } from "./utils";

type Props = {
  isVisible: boolean;
  classNames?: string;
  orientation?: "horizontal" | "vertical";
};

export function DropIndicator(props: Props) {
  const { isVisible, classNames = "", orientation = "horizontal" } = props;
  const orientationClassName =
    orientation === "vertical"
      ? "relative block h-full min-h-6 w-[2px] before:absolute before:top-0 before:left-[-2px] before:size-[6px] before:rounded-sm after:absolute after:bottom-0 after:left-[-2px] after:size-[6px] after:rounded-sm"
      : "relative block h-[2px] w-full before:relative before:top-[-2px] before:left-0 before:block before:size-[6px] before:rounded-sm after:relative after:top-[-8px] after:left-[calc(100%-6px)] after:block after:size-[6px] after:rounded-sm";

  return (
    <div
      className={cn(
        orientationClassName,
        {
          "bg-accent-primary before:bg-accent-primary after:bg-accent-primary": isVisible,
        },
        classNames
      )}
    />
  );
}
