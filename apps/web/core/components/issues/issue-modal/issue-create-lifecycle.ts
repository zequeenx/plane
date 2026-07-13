import { isIssuePostCreateError } from "@/lib/issue-create";

type TIssueCreateLifecycleOptions<TIssue> = {
  createIssue: () => Promise<TIssue>;
  finalizeCreatedIssue?: (issue: TIssue) => Promise<void> | void;
  onCoreFailure: (error: unknown) => Promise<void> | void;
  onPostCreateFailure: (issue: TIssue, error: unknown) => Promise<void> | void;
  onSuccess: (issue: TIssue) => Promise<void> | void;
  reportCleanupFailure?: (cleanupError: unknown, lifecycleError: unknown) => void;
};

const reportCleanupFailureWithoutReplacingOriginal = (
  reporter: TIssueCreateLifecycleOptions<unknown>["reportCleanupFailure"],
  cleanupError: unknown,
  lifecycleError: unknown
) => {
  try {
    reporter?.(cleanupError, lifecycleError);
  } catch {
    // Error reporting must not replace the lifecycle error consumed by the create form.
  }
};

export const executeIssueCreateLifecycle = async <TIssue>({
  createIssue,
  finalizeCreatedIssue,
  onCoreFailure,
  onPostCreateFailure,
  onSuccess,
  reportCleanupFailure,
}: TIssueCreateLifecycleOptions<TIssue>): Promise<TIssue> => {
  let issue: TIssue;
  try {
    issue = await createIssue();
  } catch (error) {
    if (isIssuePostCreateError(error)) {
      const createdIssue = error.createdIssue as TIssue;
      try {
        await onPostCreateFailure(createdIssue, error);
      } catch (cleanupError) {
        reportCleanupFailureWithoutReplacingOriginal(reportCleanupFailure, cleanupError, error);
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
    } catch (cleanupError) {
      reportCleanupFailureWithoutReplacingOriginal(reportCleanupFailure, cleanupError, error);
    }
    throw error;
  }

  await onSuccess(issue);
  return issue;
};
