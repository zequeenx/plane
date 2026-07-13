import { describe, expect, it } from "vitest";

import { getIssueCreateErrorMessage, IssuePostCreateError } from "./issue-create";

describe("getIssueCreateErrorMessage", () => {
  it("uses the translated partial-create message instead of the internal post-create error", () => {
    const error = new IssuePostCreateError({ id: "issue-1" }, new Error("attachment failed"));

    expect(getIssueCreateErrorMessage(error, "translated partial create", "translated fallback")).toBe(
      "translated partial create"
    );
  });

  it("preserves ordinary create errors and falls back for unknown errors", () => {
    expect(getIssueCreateErrorMessage(new Error("create failed"), "partial", "fallback")).toBe("create failed");
    expect(getIssueCreateErrorMessage({}, "partial", "fallback")).toBe("fallback");
  });
});
