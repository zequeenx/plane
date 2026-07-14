/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { KeyboardEvent } from "react";
import { GripVertical } from "lucide-react";
// plane ui
import { cn, Tooltip } from "@plane/ui";

type Props = {
  dragHandleRef?: React.RefCallback<HTMLButtonElement>;
  isEnabled: boolean;
  isSortable: boolean;
  label: string;
  onMove: (offset: -1 | 1) => void;
  onToggle: () => void;
  reorderLabel: string;
};

export function DisplayPropertyChip(props: Props) {
  const { dragHandleRef, isEnabled, isSortable, label, onMove, onToggle, reorderLabel } = props;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    onMove(event.key === "ArrowLeft" ? -1 : 1);
  };

  return (
    <div
      className={cn("flex max-w-full min-w-0 items-center rounded-sm border text-11 transition-all", {
        "border-accent-strong bg-accent-primary text-on-color": isEnabled,
        "border-subtle hover:bg-layer-1": !isEnabled,
      })}
    >
      {isSortable && (
        <Tooltip tooltipContent={reorderLabel}>
          <span className="inline-flex size-5 shrink-0">
            <button
              ref={dragHandleRef}
              type="button"
              aria-label={`${reorderLabel}: ${label}`}
              aria-keyshortcuts="ArrowLeft ArrowRight"
              className="grid size-5 shrink-0 cursor-grab place-items-center active:cursor-grabbing"
              onKeyDown={handleKeyDown}
            >
              <GripVertical className="size-3" />
            </button>
          </span>
        </Tooltip>
      )}
      <button type="button" className="min-w-0 truncate px-2 py-0.5" title={label} onClick={onToggle}>
        {label}
      </button>
    </div>
  );
}
