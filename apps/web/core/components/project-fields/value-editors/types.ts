/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueFieldValue, TIssueFieldValues, TProjectIssueField } from "@plane/types";

export type TProjectFieldEditorProps = {
  disabled?: boolean;
  field: TProjectIssueField;
  onChange: (fieldId: string, value: TIssueFieldValue) => void;
  projectId: string;
  value: TIssueFieldValue | undefined;
  workspaceSlug: string;
};

export type TProjectFieldValueEditorsProps = {
  disabled?: boolean;
  fields: TProjectIssueField[];
  onChange: (fieldId: string, value: TIssueFieldValue) => void;
  projectId: string;
  values?: TIssueFieldValues | null;
  workspaceSlug: string;
};
