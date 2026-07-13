import type { TIssue, TIssueGroupByOptions } from "@plane/types";
import { mergeModuleGroupIds, parseCustomFieldGroupKey } from "@/components/issues/issue-layouts/custom-field-grouping";

export type TGroupedIssueCreateContext =
  | { projectId?: string; requiredModuleId?: string | null; scope: "project" }
  | { projectId?: string; requiredModuleId?: string | null; scope: "module" };

export const getGroupedIssueCreateModalProps = (
  groupKey: TIssueGroupByOptions | undefined,
  projectId?: string,
  sourceModuleId?: string | null
): { groupedIssueCreateContext?: TGroupedIssueCreateContext; isProjectSelectionDisabled?: boolean } => {
  const customGroup = parseCustomFieldGroupKey(groupKey);
  if (!customGroup) return {};

  const groupedIssueCreateContext: TGroupedIssueCreateContext =
    customGroup.scope === "module"
      ? { projectId, requiredModuleId: sourceModuleId, scope: "module" }
      : { projectId, ...(sourceModuleId ? { requiredModuleId: sourceModuleId } : {}), scope: "project" };

  return { groupedIssueCreateContext, isProjectSelectionDisabled: true };
};

export const prepareGroupedIssueCreatePayload = (
  payload: Partial<TIssue>,
  context: TGroupedIssueCreateContext
): Partial<TIssue> => {
  if (!context.projectId) throw new Error("Grouped issue project context is unavailable");
  if (context.scope === "module") {
    if (!context.requiredModuleId) throw new Error("Grouped issue module context is unavailable");
    return {
      ...payload,
      module_ids: mergeModuleGroupIds(payload.module_ids, context.requiredModuleId),
      project_id: context.projectId,
    };
  }

  return {
    ...payload,
    ...(context.requiredModuleId
      ? { module_ids: mergeModuleGroupIds(payload.module_ids, context.requiredModuleId) }
      : {}),
    project_id: context.projectId,
  };
};
