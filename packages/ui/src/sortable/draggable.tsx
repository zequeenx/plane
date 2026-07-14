/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// @ts-expect-error Due to live server dependencies
import { combine } from "@atlaskit/pragmatic-drag-and-drop/dist/cjs/entry-point/combine.js";
import {
  draggable,
  dropTargetForElements,
  // @ts-expect-error Due to live server dependencies
} from "@atlaskit/pragmatic-drag-and-drop/dist/cjs/entry-point/element/adapter.js";
import {
  attachClosestEdge,
  extractClosestEdge,
  // @ts-expect-error Due to live server dependencies
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/dist/cjs/closest-edge.js";
import { isEqual } from "lodash-es";
import React, { useEffect, useRef, useState } from "react";
import { DropIndicator } from "../drop-indicator";
import { cn } from "../utils";
import type { TSortableRenderHelpers } from "./sortable";
import { getSortableEdges, type TSortableEdge, type TSortableOrientation } from "./sortable-utils";

type Props = {
  children: React.ReactNode | ((helpers: TSortableRenderHelpers) => React.ReactNode);
  data: unknown;
  className?: string;
  orientation?: TSortableOrientation;
};

function Draggable({ children, data, className, orientation = "vertical" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState<boolean>(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<TSortableEdge | null>(null);

  useEffect(() => {
    const el = ref.current;
    const draggableData = data as Record<string, unknown>;

    if (el) {
      return combine(
        draggable({
          element: el,
          dragHandle: dragHandleRef.current ?? undefined,
          onDragStart: () => setDragging(true),
          onDrop: () => setDragging(false),
          getInitialData: () => draggableData,
        }),
        dropTargetForElements({
          element: el,
          // @ts-expect-error Due to live server dependencies
          onDragEnter: (args) => {
            setIsDraggedOver(true);
            setClosestEdge(extractClosestEdge(args.self.data));
          },
          onDragLeave: () => setIsDraggedOver(false),
          onDrop: () => setIsDraggedOver(false),
          // @ts-expect-error Due to live server dependencies
          canDrop: ({ source }) =>
            !isEqual(source.data, draggableData) && source.data.__uuid__ === draggableData.__uuid__,
          // @ts-expect-error Due to live server dependencies
          getData: ({ input, element }) =>
            attachClosestEdge(draggableData, {
              input,
              element,
              allowedEdges: getSortableEdges(orientation),
            }),
        })
      );
    }
  }, [data, orientation]);

  const beforeEdge = orientation === "horizontal" ? "left" : "top";
  const afterEdge = orientation === "horizontal" ? "right" : "bottom";
  const indicatorOrientation = orientation === "horizontal" ? "vertical" : "horizontal";

  return (
    <div ref={ref} className={cn("relative", dragging && "opacity-25", className)}>
      <DropIndicator
        isVisible={isDraggedOver && closestEdge === beforeEdge}
        orientation={indicatorOrientation}
        classNames={cn(orientation === "horizontal" && "absolute top-0 bottom-0 left-[-1px]")}
      />
      {typeof children === "function" ? children({ dragHandleRef }) : children}
      <DropIndicator
        isVisible={isDraggedOver && closestEdge === afterEdge}
        orientation={indicatorOrientation}
        classNames={cn(orientation === "horizontal" && "absolute top-0 right-[-1px] bottom-0")}
      />
    </div>
  );
}

export { Draggable };
