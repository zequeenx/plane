import type { TIssue } from "@plane/types";
import { describe, expect, it, vi } from "vitest";

import type { IssueSubIssuesStore } from "./sub_issues.store";
import { WorkItemSubIssueFiltersStore } from "./sub_issues_filter.store";

vi.mock("@/lib/store-context", () => ({ store: {} }));

const issueFixture = (id: string, overrides: Partial<TIssue> = {}): TIssue => ({
  archived_at: null,
  assignee_ids: [],
  attachment_count: 0,
  completed_at: null,
  created_at: `2026-07-13T00:00:0${id === "issue-1" ? "1" : "2"}Z`,
  created_by: "member-1",
  cycle_id: null,
  estimate_point: null,
  field_values: {},
  id,
  is_draft: false,
  label_ids: [],
  link_count: 0,
  module_ids: ["module-1"],
  name: id,
  parent_id: "parent-1",
  priority: "none",
  project_id: "project-1",
  sequence_id: id === "issue-1" ? 1 : 2,
  sort_order: 100,
  start_date: null,
  state_id: "state-1",
  sub_issues_count: 0,
  sub_state_id: null,
  target_date: null,
  type_id: null,
  updated_at: "2026-07-13T00:00:00Z",
  updated_by: "member-1",
  ...overrides,
});

describe("WorkItemSubIssueFiltersStore custom field grouping", () => {
  it("groups module custom fields using the project view source module", () => {
    const issues = [
      issueFixture("issue-1", {
        module_field_values: { "module-1": { "member-field": "member-1" } },
      }),
      issueFixture("issue-2", {
        module_field_values: { "module-1": { "member-field": null } },
      }),
    ];
    const subIssueStore = {
      rootIssueDetailStore: {
        rootIssueStore: {
          issues: {
            getIssuesByIds: () => issues,
          },
          moduleId: undefined,
          rootStore: {
            projectView: {
              getViewById: () => ({ source_module: "module-1" }),
            },
          },
          viewId: "view-1",
        },
      },
      subIssuesByIssueId: () => issues.map((issue) => issue.id),
    } as unknown as IssueSubIssuesStore;
    const filterStore = new WorkItemSubIssueFiltersStore(subIssueStore);
    filterStore.subIssueFilters["parent-1"] = {
      displayFilters: { group_by: "modulecustomproperty_member-field" },
      filters: {},
    };

    expect(filterStore.sourceModuleId).toBe("module-1");
    expect(filterStore.getGroupedSubWorkItems("parent-1")).toEqual({
      "member-1": ["issue-1"],
      None: ["issue-2"],
    });
  });
});
