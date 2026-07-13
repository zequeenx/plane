/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum EProjectIssueFieldType {
  SINGLE_SELECT = "single_select",
  MULTI_SELECT = "multi_select",
  SINGLE_MEMBER = "single_member",
  MULTI_MEMBER = "multi_member",
  DATE = "date",
  DATE_RANGE = "date_range",
  PLAIN_TEXT = "plain_text",
}

export type TProjectIssueFieldId = string;

export type TCustomPropertyKey = `customproperty_${TProjectIssueFieldId}`;

export type TModuleIssueFieldId = string;

export type TModuleCustomPropertyKey = `modulecustomproperty_${TModuleIssueFieldId}`;

export type TCustomPropertyFilterOperator =
  | "contains"
  | "icontains"
  | "not_contains"
  | "exact"
  | "in"
  | "not_exact"
  | "not_in"
  | "contains_any"
  | "not_contains_any"
  | "range"
  | "is_empty"
  | "is_not_empty"
  | "overlaps"
  | "not_overlaps";

export type TProjectIssueFieldOption = {
  id: string;
  value: string;
  sort_order: number;
  field: TProjectIssueFieldId;
  project: string;
  workspace: string;
  created_at: string;
  updated_at: string;
};

export type TProjectIssueField = {
  id: TProjectIssueFieldId;
  name: string;
  description: string;
  field_type: EProjectIssueFieldType;
  sort_order: number;
  is_disabled: boolean;
  disabled_at: string | null;
  options: TProjectIssueFieldOption[];
  project: string;
  workspace: string;
  created_at: string;
  updated_at: string;
};

export type TModuleIssueFieldOption = TProjectIssueFieldOption & {
  module: string;
  field: TModuleIssueFieldId;
};

export type TModuleIssueField = Omit<TProjectIssueField, "id" | "options"> & {
  id: TModuleIssueFieldId;
  module: string;
  options: TModuleIssueFieldOption[];
};

export type TIssueFieldDateRangeValue = {
  start: string | null;
  end: string | null;
};

export type TIssueFieldValue = string | string[] | TIssueFieldDateRangeValue | null;

export type TIssueFieldValues = Partial<Record<TProjectIssueFieldId, TIssueFieldValue>>;

export type TModuleIssueFieldValues = Partial<Record<TModuleIssueFieldId, TIssueFieldValue>>;

export type TIssueModuleFieldValues = Partial<Record<string, TModuleIssueFieldValues>>;

export type TProjectIssueFieldPayload = Partial<
  Pick<TProjectIssueField, "description" | "sort_order" | "is_disabled">
> &
  Pick<TProjectIssueField, "name" | "field_type">;

export type TProjectIssueFieldUpdatePayload = Partial<TProjectIssueFieldPayload>;

export type TIssueFieldValuesUpdatePayload = {
  field_values: TIssueFieldValues;
};

export type TModuleIssueFieldPayload = Partial<Pick<TModuleIssueField, "description" | "sort_order" | "is_disabled">> &
  Pick<TModuleIssueField, "name" | "field_type">;

export type TModuleIssueFieldUpdatePayload = Partial<TModuleIssueFieldPayload>;

export type TModuleIssueFieldValuesUpdatePayload = {
  field_values: TModuleIssueFieldValues;
};

export type TIssueCustomFieldLocalUpdate =
  | { fieldValues: TIssueFieldValues; scope: "project" }
  | { fieldValues: TModuleIssueFieldValues; moduleId: string; scope: "module" };

export type TIssueCustomFieldLocalUpdater = (issueId: string, update: TIssueCustomFieldLocalUpdate) => void;

export type TModuleIssueFieldValueDeletePayload = {
  field_values: Record<TModuleIssueFieldId, null>;
};
