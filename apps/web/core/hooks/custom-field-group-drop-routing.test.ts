import type { TIssue } from "@plane/types";
import { describe, expect, it } from "vitest";

import { buildCustomFieldGroupDropPlan } from "./custom-field-group-drop-routing";

describe("buildCustomFieldGroupDropPlan", () => {
  it("separates the custom field, sort order, and ordinary static patch", () => {
    const data: Partial<TIssue> = {
      "customproperty_select-field": "option-b",
      id: "issue-1",
      project_id: "project-1",
      sort_order: 200,
      state_id: "state-2",
    };

    expect(
      buildCustomFieldGroupDropPlan({ cycleKey: "cycle_id", data, issueUpdates: {}, moduleKey: "module_ids" })
    ).toEqual({
      customGroupId: "option-b",
      customGroupKey: "customproperty_select-field",
      sortOrder: 200,
      standardIssuePatch: { state_id: "state-2" },
    });
  });

  it("constructs independent cycle and module operations without leaking them into the standard patch", () => {
    const data: Partial<TIssue> = {
      "modulecustomproperty_member-field": "member-2",
      cycle_id: null,
      id: "issue-1",
      module_ids: ["module-2"],
      priority: "high",
      project_id: "project-1",
      sort_order: 300,
    };

    expect(
      buildCustomFieldGroupDropPlan({
        cycleKey: "cycle_id",
        data,
        issueUpdates: {
          module_ids: { ADD: ["module-2"], REMOVE: ["module-1"] },
        },
        moduleKey: "module_ids",
      })
    ).toEqual({
      customGroupId: "member-2",
      customGroupKey: "modulecustomproperty_member-field",
      cycleChange: { cycleId: null },
      moduleChange: { add: ["module-2"], remove: ["module-1"] },
      sortOrder: 300,
      standardIssuePatch: { priority: "high" },
    });
  });
});
