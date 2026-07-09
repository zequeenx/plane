/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TIssueFieldValue,
  TIssueFieldValues,
  TModuleIssueField,
  TModuleIssueFieldValues,
  TProjectIssueField,
} from "@plane/types";

export type TIssueField = TProjectIssueField | TModuleIssueField;

export type TProjectFieldEditorProps = {
  commitPlainTextOnBlur?: boolean;
  disabled?: boolean;
  field: TIssueField;
  onChange: (fieldId: string, value: TIssueFieldValue) => void;
  projectId: string;
  value: TIssueFieldValue | undefined;
  workspaceSlug: string;
};

export type TProjectFieldValueEditorsProps = {
  commitPlainTextOnBlur?: boolean;
  disabled?: boolean;
  fields: TIssueField[];
  onChange: (fieldId: string, value: TIssueFieldValue) => void;
  projectId: string;
  values?: TIssueFieldValues | TModuleIssueFieldValues | null;
  workspaceSlug: string;
};
