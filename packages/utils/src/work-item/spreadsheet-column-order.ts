/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";

type TSpreadsheetColumn = keyof IIssueDisplayProperties;

export const resolveSpreadsheetColumnOrder = (
  savedOrder: readonly TSpreadsheetColumn[] | undefined,
  availableOrder: readonly TSpreadsheetColumn[]
): TSpreadsheetColumn[] => {
  const availableColumns = [...new Set(availableOrder.filter((property) => property !== "key"))];
  const availableColumnSet = new Set<TSpreadsheetColumn>(availableColumns);
  const savedColumns = [...new Set((savedOrder ?? []).filter((property) => availableColumnSet.has(property)))];
  const savedColumnSet = new Set(savedColumns);

  return [...savedColumns, ...availableColumns.filter((property) => !savedColumnSet.has(property))];
};

export const moveSpreadsheetColumn = (
  order: readonly TSpreadsheetColumn[],
  property: TSpreadsheetColumn,
  offset: -1 | 1
): TSpreadsheetColumn[] => {
  const movedOrder = [...order];
  const currentIndex = movedOrder.indexOf(property);
  const nextIndex = currentIndex + offset;

  if (currentIndex === -1 || nextIndex < 0 || nextIndex >= movedOrder.length) return movedOrder;

  [movedOrder[currentIndex], movedOrder[nextIndex]] = [movedOrder[nextIndex], movedOrder[currentIndex]];

  return movedOrder;
};

export const hasExplicitSpreadsheetColumnOrder = (filters: IIssueDisplayFilterOptions | undefined): boolean => {
  const columnOrder = filters?.spreadsheet?.column_order;

  return Array.isArray(columnOrder) && columnOrder.length > 0;
};

export const hasSpreadsheetColumnOrderChanged = (
  currentOrder: readonly TSpreadsheetColumn[] | undefined,
  savedOrder: readonly TSpreadsheetColumn[] | undefined
): boolean => {
  const currentColumns = currentOrder ?? [];
  const savedColumns = savedOrder ?? [];

  return (
    currentColumns.length !== savedColumns.length ||
    currentColumns.some((property, index) => property !== savedColumns[index])
  );
};
