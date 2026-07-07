/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// ----------------------------- EXACT Operator -----------------------------
import type { TNoValueFilterFieldConfig, TTextFilterFieldConfig } from "../field-types";
import type { EXTENDED_COLLECTION_OPERATOR, EXTENDED_COMPARISON_OPERATOR, EXTENDED_EMPTY_OPERATOR } from "../operators";

// ----------------------------- TEXT Operator -----------------------------
export type TExtendedTextOperatorConfigs = TTextFilterFieldConfig<string>;

// ----------------------------- EMPTY Operator -----------------------------
export type TExtendedEmptyOperatorConfigs = TNoValueFilterFieldConfig;

// ----------------------------- EXACT Operator -----------------------------
export type TExtendedExactOperatorConfigs = never;

// ----------------------------- IN Operator -----------------------------
export type TExtendedInOperatorConfigs = never;

// ----------------------------- RANGE Operator -----------------------------
export type TExtendedRangeOperatorConfigs = never;

// ----------------------------- Extended Operator Specific Configs -----------------------------
export type TExtendedOperatorSpecificConfigs = {
  [EXTENDED_COLLECTION_OPERATOR.NOT_IN]: TExtendedInOperatorConfigs;
  [EXTENDED_COMPARISON_OPERATOR.CONTAINS]: TExtendedTextOperatorConfigs;
  [EXTENDED_COMPARISON_OPERATOR.NOT_CONTAINS]: TExtendedTextOperatorConfigs;
  [EXTENDED_COMPARISON_OPERATOR.OVERLAPS]: TExtendedRangeOperatorConfigs;
  [EXTENDED_COMPARISON_OPERATOR.NOT_OVERLAPS]: TExtendedRangeOperatorConfigs;
  [EXTENDED_EMPTY_OPERATOR.IS_EMPTY]: TExtendedEmptyOperatorConfigs;
  [EXTENDED_EMPTY_OPERATOR.IS_NOT_EMPTY]: TExtendedEmptyOperatorConfigs;
};
