/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// @ts-expect-error Due to live server dependencies
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/dist/cjs/entry-point/element/adapter.js";
import {
  extractClosestEdge,
  // @ts-expect-error Due to live server dependencies
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/dist/cjs/closest-edge.js";
import React, { Fragment, useEffect, useId, useMemo } from "react";
import { Draggable } from "./draggable";
import {
  createSortablePayload,
  isSortablePayloadForId,
  resolveSortableDrop,
  type TSortableOrientation,
  type TSortablePayload,
} from "./sortable-utils";

type TEnhancedData<T> = T & TSortablePayload;

export type TSortableRenderHelpers = {
  dragHandleRef: React.RefCallback<HTMLButtonElement>;
  isDragging: boolean;
};

type Props<T> = {
  data: T[];
  render: (item: T, index: number, helpers: TSortableRenderHelpers) => React.ReactNode;
  onChange: (data: T[], movedItem?: T) => void;
  keyExtractor: (item: T, index: number) => string;
  containerClassName?: string;
  id?: string;
  orientation?: TSortableOrientation;
};

export function Sortable<T>({
  data,
  render,
  onChange,
  keyExtractor,
  containerClassName,
  id,
  orientation = "vertical",
}: Props<T>) {
  const generatedId = useId();
  const sortableId = id ?? generatedId;

  useEffect(() => {
    const unsubscribe = monitorForElements({
      // @ts-expect-error Due to live server dependencies
      canMonitor: ({ source }) => isSortablePayloadForId(source.data, sortableId),
      // @ts-expect-error Due to live server dependencies
      onDrop({ source, location }) {
        const destination = location?.current?.dropTargets[0];
        if (!destination) return;

        const edge = extractClosestEdge(destination.data);
        if (!edge) return;

        const result = resolveSortableDrop(data, source.data, destination.data, edge, sortableId, keyExtractor);
        if (!result) return;

        onChange(result.data, result.movedItem);
      },
    });

    return unsubscribe;
  }, [data, keyExtractor, onChange, sortableId]);

  const enhancedData = useMemo<TEnhancedData<T>[]>(
    () =>
      data.map((item, index) => ({
        ...item,
        ...createSortablePayload(item, index, sortableId, keyExtractor),
      })),
    [data, keyExtractor, sortableId]
  );

  return (
    <>
      {enhancedData.map((enhancedItem, index) => (
        <Draggable
          key={enhancedItem.__sortableKey__}
          data={enhancedItem}
          className={containerClassName}
          orientation={orientation}
        >
          {(helpers) => <Fragment>{render(data[index], index, helpers)}</Fragment>}
        </Draggable>
      ))}
    </>
  );
}

export default Sortable;
