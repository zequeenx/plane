import { uniq } from "lodash-es";
import type { TIssue, TIssueGroupByOptions } from "@plane/types";

import { isCustomFieldGroupKey, normalizeCustomFieldGroupId } from "./custom-field-grouping";

type TStaticGroupKey = Extract<keyof TIssue, string>;

type TBuildGroupDragUpdate = {
  currentValue: unknown;
  destinationGroupId: string;
  groupBy: Exclude<TIssueGroupByOptions, null>;
  sourceGroupId: string;
  staticGroupKey?: TStaticGroupKey;
};

export const getUpdatedStaticGroupValue = (
  currentValue: unknown,
  sourceGroupId: string,
  destinationGroupId: string
): string | string[] | null => {
  if (Array.isArray(currentValue)) {
    const nextValue = currentValue.filter(
      (value): value is string => typeof value === "string" && value !== sourceGroupId
    );
    return destinationGroupId === "None" ? nextValue : uniq([...nextValue, destinationGroupId]);
  }

  return destinationGroupId === "None" ? null : destinationGroupId;
};

export const buildGroupDragUpdate = ({
  currentValue,
  destinationGroupId,
  groupBy,
  sourceGroupId,
  staticGroupKey,
}: TBuildGroupDragUpdate): { groupKey: TStaticGroupKey; groupValue: string | string[] | null } | undefined => {
  if (isCustomFieldGroupKey(groupBy)) {
    return {
      groupKey: groupBy,
      groupValue: normalizeCustomFieldGroupId(destinationGroupId),
    };
  }

  if (!staticGroupKey) return undefined;

  return {
    groupKey: staticGroupKey,
    groupValue: getUpdatedStaticGroupValue(currentValue, sourceGroupId, destinationGroupId),
  };
};
