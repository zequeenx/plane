/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";
import type {
  TDateRangeFilterFieldConfig,
  TNoValueFilterFieldConfig,
  TMultiSelectFilterFieldConfig,
} from "../field-types";
import type { TExtendedOperatorSpecificConfigs } from "../operator-configs";
import type { TFilterOperatorHelper } from "./shared";

// -------- DATE FILTER OPERATORS --------

/**
 * Union type representing all extended operators that support date filter types.
 */
export type TExtendedSupportedDateFilterOperators<V extends TFilterValue = TFilterValue> = {
  [K in keyof TExtendedOperatorSpecificConfigs]: TFilterOperatorHelper<
    TExtendedOperatorSpecificConfigs,
    K,
    TDateRangeFilterFieldConfig<V> | TNoValueFilterFieldConfig
  >;
}[keyof TExtendedOperatorSpecificConfigs];

export type TExtendedAllAvailableDateFilterOperatorsForDisplay<V extends TFilterValue = TFilterValue> =
  TExtendedSupportedDateFilterOperators<V>;

// -------- SELECT FILTER OPERATORS --------

/**
 * Union type representing all extended operators that support select filter types.
 */
export type TExtendedSupportedSelectFilterOperators<V extends TFilterValue = TFilterValue> = {
  [K in keyof TExtendedOperatorSpecificConfigs]: TFilterOperatorHelper<
    TExtendedOperatorSpecificConfigs,
    K,
    TMultiSelectFilterFieldConfig<V> | TNoValueFilterFieldConfig
  >;
}[keyof TExtendedOperatorSpecificConfigs];

export type TExtendedAllAvailableSelectFilterOperatorsForDisplay<V extends TFilterValue = TFilterValue> =
  TExtendedSupportedSelectFilterOperators<V>;
