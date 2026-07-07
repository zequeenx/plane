/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TExtendedSupportedOperators } from "@plane/types";
import { COLLECTION_OPERATOR, COMPARISON_OPERATOR, EQUALITY_OPERATOR, EXTENDED_EMPTY_OPERATOR } from "@plane/types";

/**
 * Extended operator labels
 */
export const EXTENDED_OPERATOR_LABELS_MAP: Record<TExtendedSupportedOperators, string> = {
  [EQUALITY_OPERATOR.NOT_EXACT]: "is not",
  [COLLECTION_OPERATOR.CONTAINS_ANY]: "contains any of",
  [COLLECTION_OPERATOR.NOT_CONTAINS_ANY]: "does not contain any of",
  [COLLECTION_OPERATOR.NOT_IN]: "is none of",
  [COMPARISON_OPERATOR.CONTAINS]: "contains",
  [COMPARISON_OPERATOR.ICONTAINS]: "contains",
  [COMPARISON_OPERATOR.NOT_CONTAINS]: "does not contain",
  [COMPARISON_OPERATOR.OVERLAPS]: "overlaps",
  [COMPARISON_OPERATOR.NOT_OVERLAPS]: "does not overlap",
  [EXTENDED_EMPTY_OPERATOR.IS_EMPTY]: "is empty",
  [EXTENDED_EMPTY_OPERATOR.IS_NOT_EMPTY]: "is not empty",
} as const;

/**
 * Extended date-specific operator labels
 */
export const EXTENDED_DATE_OPERATOR_LABELS_MAP: Record<TExtendedSupportedOperators, string> = {
  [EQUALITY_OPERATOR.NOT_EXACT]: "is not",
  [COLLECTION_OPERATOR.CONTAINS_ANY]: "contains any of",
  [COLLECTION_OPERATOR.NOT_CONTAINS_ANY]: "does not contain any of",
  [COLLECTION_OPERATOR.NOT_IN]: "is none of",
  [COMPARISON_OPERATOR.CONTAINS]: "contains",
  [COMPARISON_OPERATOR.ICONTAINS]: "contains",
  [COMPARISON_OPERATOR.NOT_CONTAINS]: "does not contain",
  [COMPARISON_OPERATOR.OVERLAPS]: "overlaps",
  [COMPARISON_OPERATOR.NOT_OVERLAPS]: "does not overlap",
  [EXTENDED_EMPTY_OPERATOR.IS_EMPTY]: "is empty",
  [EXTENDED_EMPTY_OPERATOR.IS_NOT_EMPTY]: "is not empty",
} as const;

/**
 * Negated operator labels for all operators
 */
export const NEGATED_OPERATOR_LABELS_MAP: Record<never, string> = {} as const;

/**
 * Negated date operator labels for all date operators
 */
export const NEGATED_DATE_OPERATOR_LABELS_MAP: Record<never, string> = {} as const;
