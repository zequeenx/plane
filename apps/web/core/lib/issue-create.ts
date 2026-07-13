export class IssuePostCreateError<TIssue> extends Error {
  readonly createdIssue: TIssue;

  constructor(createdIssue: TIssue, cause: unknown) {
    super("Work item was created, but its post-create operations could not be completed.", { cause });
    this.name = "IssuePostCreateError";
    this.createdIssue = createdIssue;
  }
}

export const isIssuePostCreateError = (error: unknown): error is IssuePostCreateError<unknown> =>
  error instanceof IssuePostCreateError;

export const getIssueCreateErrorMessage = (
  error: unknown,
  partialCreateMessage: string,
  fallbackMessage: string
): string => {
  if (isIssuePostCreateError(error)) return partialCreateMessage;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return fallbackMessage;
};

export const settleIssueAttachmentOperations = async ({
  auxiliaryOperations = [],
  persistAttachment,
  reportAuxiliaryError,
}: {
  auxiliaryOperations?: (() => Promise<unknown> | unknown)[];
  persistAttachment: () => Promise<unknown> | unknown;
  reportAuxiliaryError: (error: unknown) => void;
}): Promise<void> => {
  const operationResults = await Promise.allSettled(
    [persistAttachment, ...auxiliaryOperations].map((operation) => Promise.resolve().then(operation))
  );
  const [attachmentResult, ...auxiliaryResults] = operationResults;

  auxiliaryResults.forEach((result) => {
    if (result.status !== "rejected") return;
    try {
      reportAuxiliaryError(result.reason);
    } catch {
      // Auxiliary reporting must not replace the persisted attachment result.
    }
  });

  if (attachmentResult?.status === "rejected") throw attachmentResult.reason;
};
