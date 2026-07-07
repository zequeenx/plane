/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";

/**
 * Extended filter types
 */
export const EXTENDED_FILTER_FIELD_TYPE = {
  TEXT: "text",
  NO_VALUE: "no_value",
} as const;

export type TTextFilterFieldConfig<V extends TFilterValue> = {
  type: typeof EXTENDED_FILTER_FIELD_TYPE.TEXT;
  isOperatorEnabled?: boolean;
  operatorLabel?: string;
  defaultValue?: V;
  placeholder?: string;
};

export type TNoValueFilterFieldConfig = {
  type: typeof EXTENDED_FILTER_FIELD_TYPE.NO_VALUE;
  isOperatorEnabled?: boolean;
  operatorLabel?: string;
  defaultValue?: boolean;
};

// -------- UNION TYPES --------

/**
 * All extended filter configurations
 */
export type TExtendedFilterFieldConfigs<V extends TFilterValue = TFilterValue> =
  | TTextFilterFieldConfig<V>
  | TNoValueFilterFieldConfig;
