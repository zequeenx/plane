/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { SPREADSHEET_PROPERTY_LIST } from "@plane/constants";
import type { IIssueDisplayProperties } from "@plane/types";
import { resolveSpreadsheetColumnOrder } from "@plane/utils";

type TSpreadsheetColumn = keyof IIssueDisplayProperties;

type TAvailableSpreadsheetColumnsOptions = {
  cycleViewEnabled: boolean;
  estimateEnabled: boolean;
  moduleViewEnabled: boolean;
  projectFieldIds: readonly string[];
  moduleFieldIds: readonly string[];
  workspaceLevel: boolean;
};

type TVisibleSpreadsheetColumnsOptions = {
  availableColumns: readonly TSpreadsheetColumn[];
  displayProperties: IIssueDisplayProperties;
  savedOrder: readonly TSpreadsheetColumn[] | undefined;
};

export const getIsSpreadsheetEstimateEnabled = (
  workspaceLevel: boolean,
  estimate: string | null | undefined
): boolean => workspaceLevel || estimate != null;

export const getAvailableSpreadsheetColumns = (options: TAvailableSpreadsheetColumnsOptions): TSpreadsheetColumn[] => {
  const systemColumns = SPREADSHEET_PROPERTY_LIST.filter((property) => {
    if (property === "cycle" && !options.cycleViewEnabled) return false;
    if (property === "modules" && !options.moduleViewEnabled) return false;
    if (property === "estimate" && !options.estimateEnabled) return false;
    return true;
  });

  if (options.workspaceLevel) return systemColumns;

  return [
    ...systemColumns,
    ...options.projectFieldIds.map((fieldId) => `customproperty_${fieldId}` as TSpreadsheetColumn),
    ...options.moduleFieldIds.map((fieldId) => `modulecustomproperty_${fieldId}` as TSpreadsheetColumn),
  ];
};

export const getVisibleSpreadsheetColumns = (options: TVisibleSpreadsheetColumnsOptions): TSpreadsheetColumn[] =>
  resolveSpreadsheetColumnOrder(options.savedOrder, options.availableColumns).filter(
    (property) => !!options.displayProperties[property]
  );
