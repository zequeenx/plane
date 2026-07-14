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
import React, { Fragment, useEffect, useMemo } from "react";
import { Draggable } from "./draggable";
import { moveSortableItem, type TSortableOrientation } from "./sortable-utils";

type TEnhancedData<T> = T & { __uuid__?: string };

export type TSortableRenderHelpers = {
  dragHandleRef: React.MutableRefObject<HTMLButtonElement | null>;
};

type Props<T> = {
  data: TEnhancedData<T>[];
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
  useEffect(() => {
    const unsubscribe = monitorForElements({
      // @ts-expect-error Due to live server dependencies
      onDrop({ source, location }) {
        const destination = location?.current?.dropTargets[0];
        if (!destination) return;

        const edge = extractClosestEdge(destination.data);
        if (!edge) return;

        const { data: nextData, movedItem } = moveSortableItem(
          data,
          source.data as T,
          destination.data as T,
          edge,
          keyExtractor
        );
        onChange(nextData, movedItem);
      },
    });

    return unsubscribe;
  }, [data, keyExtractor, onChange]);

  const enhancedData = useMemo(() => {
    const uuid = id ? id : Math.random().toString(36).substring(7);
    return data.map((item) => ({ ...item, __uuid__: uuid }));
  }, [data, id]);

  return (
    <>
      {data.map((item, index) => (
        <Draggable
          // oxlint-disable-next-line react/no-array-index-key -- keyExtractor returns the consumer's stable item key.
          key={keyExtractor(enhancedData[index], index)}
          data={enhancedData[index]}
          className={containerClassName}
          orientation={orientation}
        >
          {(helpers) => <Fragment>{render(item, index, helpers)}</Fragment>}
        </Draggable>
      ))}
    </>
  );
}

export default Sortable;
