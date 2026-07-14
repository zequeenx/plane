/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

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
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DropIndicator } from "../drop-indicator";
import { cn } from "../utils";
import { createDraggableRegistrationController } from "./draggable-registration";
import type { TSortableRenderHelpers } from "./sortable";
import {
  getSortableEdges,
  isSortablePayloadForId,
  type TSortableEdge,
  type TSortableOrientation,
} from "./sortable-utils";

type Props = {
  children: React.ReactNode | ((helpers: TSortableRenderHelpers) => React.ReactNode);
  data: unknown;
  className?: string;
  orientation?: TSortableOrientation;
};

function Draggable({ children, data, className, orientation = "vertical" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dataRef = useRef<Record<string, unknown>>(data as Record<string, unknown>);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const [dragging, setDragging] = useState<boolean>(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<TSortableEdge | null>(null);
  const [registrationController] = useState(() =>
    createDraggableRegistrationController({
      getData: () => dataRef.current,
      getElement: () => ref.current,
      getHandle: () => dragHandleRef.current,
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
      register: (registrationOptions) => draggable(registrationOptions),
    })
  );

  const dragHandleCallbackRef = useRef<React.RefCallback<HTMLButtonElement>>((element) => {
    dragHandleRef.current = element;
    registrationController.sync();
  });

  useLayoutEffect(() => {
    dataRef.current = data as Record<string, unknown>;
  }, [data]);

  useLayoutEffect(() => registrationController.mount(), [registrationController]);

  useEffect(() => {
    const el = ref.current;
    const draggableData = data as Record<string, unknown>;

    if (el) {
      return dropTargetForElements({
        element: el,
        // @ts-expect-error Due to live server dependencies
        onDragEnter: (args) => {
          setIsDraggedOver(true);
          setClosestEdge(extractClosestEdge(args.self.data));
        },
        // @ts-expect-error Due to live server dependencies
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDragLeave: () => {
          setIsDraggedOver(false);
          setClosestEdge(null);
        },
        onDrop: () => {
          setIsDraggedOver(false);
          setClosestEdge(null);
        },
        // @ts-expect-error Due to live server dependencies
        canDrop: ({ source }) =>
          typeof draggableData.__uuid__ === "string" &&
          isSortablePayloadForId(source.data, draggableData.__uuid__) &&
          !isEqual(source.data, draggableData),
        // @ts-expect-error Due to live server dependencies
        getData: ({ input, element }) =>
          attachClosestEdge(draggableData, {
            input,
            element,
            allowedEdges: getSortableEdges(orientation),
          }),
      });
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
      {typeof children === "function" ? children({ dragHandleRef: dragHandleCallbackRef.current }) : children}
      <DropIndicator
        isVisible={isDraggedOver && closestEdge === afterEdge}
        orientation={indicatorOrientation}
        classNames={cn(orientation === "horizontal" && "absolute top-0 right-[-1px] bottom-0")}
      />
    </div>
  );
}

export { Draggable };
