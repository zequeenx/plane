import { describe, expect, it, vi } from "vitest";
import { IssuePostCreateError } from "@/lib/issue-create";

import { prepareGroupedIssueCreatePayload } from "./issue-create-context";
import { executeIssueCreateLifecycle } from "./issue-create-lifecycle";

describe("executeIssueCreateLifecycle", () => {
  it("recognizes a store-level post-create error carrying the created issue", async () => {
    const issue = { id: "issue-1" };
    const attachmentError = new Error("module attachment failed");
    const postCreateError = new IssuePostCreateError(issue, attachmentError);
    const onCoreFailure = vi.fn();
    const onPostCreateFailure = vi.fn();

    await expect(
      executeIssueCreateLifecycle({
        createIssue: async () => {
          throw postCreateError;
        },
        onCoreFailure,
        onPostCreateFailure,
        onSuccess: vi.fn(),
      })
    ).rejects.toBe(postCreateError);

    expect(onPostCreateFailure).toHaveBeenCalledWith(issue, postCreateError);
    expect(onCoreFailure).not.toHaveBeenCalled();
  });

  it.each(["attachment", "property"])(
    "treats %s failure after core creation as a post-create failure",
    async (operation) => {
      const issue = { id: "issue-1" };
      const postCreateError = new Error(`${operation} failed`);
      const onCoreFailure = vi.fn();
      const onPostCreateFailure = vi.fn();
      const onSuccess = vi.fn();

      await expect(
        executeIssueCreateLifecycle({
          createIssue: async () => issue,
          finalizeCreatedIssue: async () => {
            throw postCreateError;
          },
          onCoreFailure,
          onPostCreateFailure,
          onSuccess,
        })
      ).rejects.toBe(postCreateError);

      expect(onPostCreateFailure).toHaveBeenCalledWith(issue, postCreateError);
      expect(onCoreFailure).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    }
  );

  it("blocks a missing required module context before the create endpoint", async () => {
    const createEndpoint = vi.fn();
    const onCoreFailure = vi.fn();
    const onPostCreateFailure = vi.fn();

    await expect(
      executeIssueCreateLifecycle({
        createIssue: async () => {
          const payload = prepareGroupedIssueCreatePayload(
            { name: "Grouped issue", project_id: "project-1" },
            { projectId: "project-1", requiredModuleId: null, scope: "module" }
          );
          return await createEndpoint(payload);
        },
        onCoreFailure,
        onPostCreateFailure,
        onSuccess: vi.fn(),
      })
    ).rejects.toThrow("module context is unavailable");

    expect(createEndpoint).not.toHaveBeenCalled();
    expect(onCoreFailure).toHaveBeenCalledTimes(1);
    expect(onPostCreateFailure).not.toHaveBeenCalled();
  });

  it("awaits finalization before reporting create success", async () => {
    const calls: string[] = [];
    const issue = { id: "issue-1" };

    const result = await executeIssueCreateLifecycle({
      finalizeCreatedIssue: async () => {
        calls.push("finalize");
      },
      createIssue: async () => {
        calls.push("core-create");
        return issue;
      },
      onCoreFailure: vi.fn(),
      onPostCreateFailure: vi.fn(),
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
        finalizeCreatedIssue: async () => {
          calls.push("finalize");
          throw finalizationError;
        },
        createIssue: async () => {
          calls.push("core-create");
          return issue;
        },
        onCoreFailure,
        onPostCreateFailure: async (createdIssue, error) => {
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
    const finalizeCreatedIssue = vi.fn();
    const onPostCreateFailure = vi.fn();
    const onSuccess = vi.fn();

    await expect(
      executeIssueCreateLifecycle({
        finalizeCreatedIssue,
        createIssue: async () => {
          calls.push("core-create");
          throw createError;
        },
        onCoreFailure: async (error) => {
          expect(error).toBe(createError);
          calls.push("core-create-failure");
        },
        onPostCreateFailure,
        onSuccess,
      })
    ).rejects.toBe(createError);

    expect(calls).toEqual(["core-create", "core-create-failure"]);
    expect(finalizeCreatedIssue).not.toHaveBeenCalled();
    expect(onPostCreateFailure).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
