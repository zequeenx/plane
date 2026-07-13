/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue } from "@plane/types";
import {
  isCustomFieldGroupKey,
  stripCustomFieldGroupAnnotations,
} from "@/components/issues/issue-layouts/custom-field-grouping";
import type { TCustomFieldGroupKey } from "@/components/issues/issue-layouts/custom-field-grouping";

export type TIssueUpdates = Record<string, { ADD: string[]; REMOVE: string[] }>;

export type TCustomFieldGroupDropPlan = {
  customGroupId: string;
  customGroupKey: TCustomFieldGroupKey;
  cycleChange?: { cycleId: string | null };
  moduleChange?: { add: string[]; remove: string[] };
  sortOrder?: number;
  standardIssuePatch?: Partial<TIssue>;
};

export const buildCustomFieldGroupDropPlan = ({
  cycleKey,
  data,
  issueUpdates,
  moduleKey,
}: {
  cycleKey: Extract<keyof TIssue, string>;
  data: Partial<TIssue>;
  issueUpdates: TIssueUpdates;
  moduleKey: Extract<keyof TIssue, string>;
}): TCustomFieldGroupDropPlan | undefined => {
  const customGroupKey = Object.keys(data).find(isCustomFieldGroupKey);
  if (!customGroupKey) return undefined;

  const customGroupValue = data[customGroupKey];
  if (typeof customGroupValue !== "string" && customGroupValue !== null)
    throw new Error("Custom field group drop data is unavailable");

  const staticPatch: Partial<TIssue> = stripCustomFieldGroupAnnotations(data);
  const sortOrder = typeof staticPatch.sort_order === "number" ? staticPatch.sort_order : undefined;
  delete staticPatch.id;
  delete staticPatch.project_id;
  delete staticPatch.sort_order;

  let cycleChange: TCustomFieldGroupDropPlan["cycleChange"];
  if (Object.prototype.hasOwnProperty.call(staticPatch, cycleKey)) {
    const cycleValue = staticPatch[cycleKey];
    cycleChange = { cycleId: typeof cycleValue === "string" ? cycleValue : null };
    delete staticPatch[cycleKey];
  }

  let moduleChange: TCustomFieldGroupDropPlan["moduleChange"];
  const moduleUpdate = issueUpdates[moduleKey];
  if (moduleUpdate) {
    moduleChange = { add: moduleUpdate.ADD, remove: moduleUpdate.REMOVE };
    delete staticPatch[moduleKey];
  }

  return {
    customGroupId: customGroupValue ?? "None",
    customGroupKey,
    ...(cycleChange ? { cycleChange } : {}),
    ...(moduleChange ? { moduleChange } : {}),
    ...(sortOrder === undefined ? {} : { sortOrder }),
    ...(Object.keys(staticPatch).length > 0 ? { standardIssuePatch: staticPatch } : {}),
  };
};
