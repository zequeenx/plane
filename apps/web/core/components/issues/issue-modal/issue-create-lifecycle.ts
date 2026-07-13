import { isIssuePostCreateError } from "@/lib/issue-create";

type TIssueCreateLifecycleOptions<TIssue> = {
  createIssue: () => Promise<TIssue>;
  finalizeCreatedIssue?: (issue: TIssue) => Promise<void> | void;
  onCoreFailure: (error: unknown) => Promise<void> | void;
  onPostCreateFailure: (issue: TIssue, error: unknown) => Promise<void> | void;
  onSuccess: (issue: TIssue) => Promise<void> | void;
};

export const executeIssueCreateLifecycle = async <TIssue>({
  createIssue,
  finalizeCreatedIssue,
  onCoreFailure,
  onPostCreateFailure,
  onSuccess,
}: TIssueCreateLifecycleOptions<TIssue>): Promise<TIssue> => {
  let issue: TIssue;
  try {
    issue = await createIssue();
  } catch (error) {
    if (isIssuePostCreateError(error)) {
      const createdIssue = error.createdIssue as TIssue;
      try {
        await onPostCreateFailure(createdIssue, error);
      } catch {
        // Cleanup must not replace the post-create error consumed by the create form.
      }
      throw error;
    }
    await onCoreFailure(error);
    throw error;
  }

  try {
    await finalizeCreatedIssue?.(issue);
  } catch (error) {
    try {
      await onPostCreateFailure(issue, error);
    } catch {
      // Cleanup must not replace the finalization error consumed by the create form.
    }
    throw error;
  }

  await onSuccess(issue);
  return issue;
};
