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
