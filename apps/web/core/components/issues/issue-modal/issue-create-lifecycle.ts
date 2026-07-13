type TIssueCreateLifecycleOptions<TIssue> = {
  beforeSuccess?: (issue: TIssue) => Promise<void> | void;
  create: () => Promise<TIssue>;
  onCoreFailure: (error: unknown) => Promise<void> | void;
  onFinalizationFailure: (issue: TIssue, error: unknown) => Promise<void> | void;
  onSuccess: (issue: TIssue) => Promise<void> | void;
};

export const executeIssueCreateLifecycle = async <TIssue>({
  beforeSuccess,
  create,
  onCoreFailure,
  onFinalizationFailure,
  onSuccess,
}: TIssueCreateLifecycleOptions<TIssue>): Promise<TIssue> => {
  let issue: TIssue;
  try {
    issue = await create();
  } catch (error) {
    await onCoreFailure(error);
    throw error;
  }

  try {
    await beforeSuccess?.(issue);
  } catch (error) {
    try {
      await onFinalizationFailure(issue, error);
    } catch {
      // Cleanup must not replace the finalization error consumed by the create form.
    }
    throw error;
  }

  await onSuccess(issue);
  return issue;
};
