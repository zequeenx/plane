/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Extended logical operators
 */
export const EXTENDED_LOGICAL_OPERATOR = {} as const;

/**
 * Extended equality operators
 */
export const EXTENDED_EQUALITY_OPERATOR = {} as const;
export const EXTENDED_EMPTY_OPERATOR = {
  IS_EMPTY: "is_empty",
  IS_NOT_EMPTY: "is_not_empty",
} as const;

/**
 * Extended collection operators
 */
export const EXTENDED_COLLECTION_OPERATOR = {
  NOT_IN: "not_in",
} as const;

/**
 * Extended comparison operators
 */
export const EXTENDED_COMPARISON_OPERATOR = {
  CONTAINS: "contains",
  NOT_CONTAINS: "not_contains",
  OVERLAPS: "overlaps",
  NOT_OVERLAPS: "not_overlaps",
} as const;

/**
 * Extended operators that support multiple values
 */
export const EXTENDED_MULTI_VALUE_OPERATORS = [
  EXTENDED_COLLECTION_OPERATOR.NOT_IN,
  EXTENDED_COMPARISON_OPERATOR.OVERLAPS,
  EXTENDED_COMPARISON_OPERATOR.NOT_OVERLAPS,
] as const;

/**
 * All extended operators
 */
export const EXTENDED_OPERATORS = {
  ...EXTENDED_EQUALITY_OPERATOR,
  ...EXTENDED_EMPTY_OPERATOR,
  ...EXTENDED_COLLECTION_OPERATOR,
  ...EXTENDED_COMPARISON_OPERATOR,
} as const;
/**
 * All extended operators that can be used in filter conditions
 */
export type TExtendedSupportedOperators = (typeof EXTENDED_OPERATORS)[keyof typeof EXTENDED_OPERATORS];
