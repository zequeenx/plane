import { describe, expect, it, vi } from "vitest";

import { executeIssueCreateLifecycle } from "./issue-create-lifecycle";

describe("executeIssueCreateLifecycle", () => {
  it("awaits finalization before reporting create success", async () => {
    const calls: string[] = [];
    const issue = { id: "issue-1" };

    const result = await executeIssueCreateLifecycle({
      beforeSuccess: async () => {
        calls.push("finalize");
      },
      create: async () => {
        calls.push("core-create");
        return issue;
      },
      onCoreFailure: vi.fn(),
      onFinalizationFailure: vi.fn(),
      onSuccess: async () => {
        calls.push("success");
      },
    });

    expect(result).toBe(issue);
    expect(calls).toEqual(["core-create", "finalize", "success"]);
  });

  it("suppresses standard success and core-create failure reporting when finalization fails", async () => {
    const calls: string[] = [];
    const issue = { id: "issue-1" };
    const finalizationError = new Error("group field failed");
    const onCoreFailure = vi.fn();
    const onSuccess = vi.fn();

    await expect(
      executeIssueCreateLifecycle({
        beforeSuccess: async () => {
          calls.push("finalize");
          throw finalizationError;
        },
        create: async () => {
          calls.push("core-create");
          return issue;
        },
        onCoreFailure,
        onFinalizationFailure: async (createdIssue, error) => {
          expect(createdIssue).toBe(issue);
          expect(error).toBe(finalizationError);
          calls.push("partial-create-cleanup");
        },
        onSuccess,
      })
    ).rejects.toBe(finalizationError);

    expect(calls).toEqual(["core-create", "finalize", "partial-create-cleanup"]);
    expect(onCoreFailure).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("retains existing core-create failure reporting", async () => {
    const calls: string[] = [];
    const createError = new Error("create failed");
    const beforeSuccess = vi.fn();
    const onFinalizationFailure = vi.fn();
    const onSuccess = vi.fn();

    await expect(
      executeIssueCreateLifecycle({
        beforeSuccess,
        create: async () => {
          calls.push("core-create");
          throw createError;
        },
        onCoreFailure: async (error) => {
          expect(error).toBe(createError);
          calls.push("core-create-failure");
        },
        onFinalizationFailure,
        onSuccess,
      })
    ).rejects.toBe(createError);

    expect(calls).toEqual(["core-create", "core-create-failure"]);
    expect(beforeSuccess).not.toHaveBeenCalled();
    expect(onFinalizationFailure).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
