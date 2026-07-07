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

export type TIssueFieldDateRangeValue = {
  start: string | null;
  end: string | null;
};

export type TIssueFieldValue = string | string[] | TIssueFieldDateRangeValue | null;

export type TIssueFieldValues = Record<TProjectIssueFieldId, TIssueFieldValue>;

export type TProjectIssueFieldPayload = Partial<
  Pick<TProjectIssueField, "description" | "sort_order" | "is_disabled">
> &
  Pick<TProjectIssueField, "name" | "field_type">;

export type TProjectIssueFieldUpdatePayload = Partial<TProjectIssueFieldPayload>;

export type TIssueFieldValuesUpdatePayload = {
  field_values: TIssueFieldValues;
};
