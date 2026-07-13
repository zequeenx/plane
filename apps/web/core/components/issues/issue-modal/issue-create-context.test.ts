import { describe, expect, it } from "vitest";

import { getGroupedIssueCreateModalProps, prepareGroupedIssueCreatePayload } from "./issue-create-context";

describe("grouped issue create modal context", () => {
  it("locks project selection for a project custom field group", () => {
    expect(getGroupedIssueCreateModalProps("customproperty_select-field", "project-1", null)).toEqual({
      groupedIssueCreateContext: { projectId: "project-1", scope: "project" },
      isProjectSelectionDisabled: true,
    });
  });

  it("carries a source module through project custom grouping modal submission", () => {
    const props = getGroupedIssueCreateModalProps("customproperty_select-field", "project-1", "module-a");

    expect(props).toEqual({
      groupedIssueCreateContext: { projectId: "project-1", requiredModuleId: "module-a", scope: "project" },
      isProjectSelectionDisabled: true,
    });
    expect(
      prepareGroupedIssueCreatePayload(
        { module_ids: ["module-b"], project_id: "project-2" },
        props.groupedIssueCreateContext!
      )
    ).toMatchObject({ module_ids: ["module-b", "module-a"], project_id: "project-1" });
  });

  it("keeps plain project custom grouping creation free of module attachment", () => {
    const context = getGroupedIssueCreateModalProps(
      "customproperty_select-field",
      "project-1",
      null
    ).groupedIssueCreateContext!;

    expect(prepareGroupedIssueCreatePayload({ project_id: "project-2" }, context)).toEqual({
      project_id: "project-1",
    });
  });

  it("uses the grouped project instead of an edited form project at submit", () => {
    expect(
      prepareGroupedIssueCreatePayload(
        { name: "Grouped issue", project_id: "project-2" },
        { projectId: "project-1", scope: "project" }
      )
    ).toMatchObject({ name: "Grouped issue", project_id: "project-1" });
  });

  it("re-enforces the required source module while preserving other form modules", () => {
    expect(
      prepareGroupedIssueCreatePayload(
        { module_ids: ["module-b"], project_id: "project-2" },
        { projectId: "project-1", requiredModuleId: "module-a", scope: "module" }
      )
    ).toMatchObject({ module_ids: ["module-b", "module-a"], project_id: "project-1" });
  });
});
