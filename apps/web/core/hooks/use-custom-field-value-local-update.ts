import type { TIssueCustomFieldLocalUpdater } from "@plane/types";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";

export const useCustomFieldValueLocalUpdate = (): TIssueCustomFieldLocalUpdater => {
  const { issues } = useIssuesStore();
  if ("updateCustomFieldValueLocalState" in issues) return issues.updateCustomFieldValueLocalState;
  return () => undefined;
};
