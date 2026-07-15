import { EIssueFilterType } from "@plane/constants";
import type { IIssueFilters } from "@plane/types";
import { describe, expect, it, vi } from "vitest";

import type { IIssueRootStore } from "../root.store";
import { WorkspaceIssuesFilter } from "./filter.store";

vi.mock("@/lib/store-context", () => ({ store: {} }));

const createStore = () => {
  const fetchIssuesWithExistingPagination = vi.fn();
  const rootStore = {
    currentUserId: "member-1",
    globalViewId: "view-1",
    workspaceIssues: { fetchIssuesWithExistingPagination },
  } as unknown as IIssueRootStore;
  const store = new WorkspaceIssuesFilter(rootStore);
  store.filters["view-1"] = {
    displayFilters: { layout: "spreadsheet", order_by: "-created_at" },
    displayProperties: {},
    kanbanFilters: { group_by: [], sub_group_by: [] },
    richFilters: {},
  } as IIssueFilters;

  return { fetchIssuesWithExistingPagination, store };
};

describe("WorkspaceIssuesFilter", () => {
  it("does not refetch issues when only the Spreadsheet column order changes", async () => {
    const { fetchIssuesWithExistingPagination, store } = createStore();

    await store.updateFilters(
      "workspace-1",
      undefined,
      EIssueFilterType.DISPLAY_FILTERS,
      { spreadsheet: { column_order: ["priority", "state"] } },
      "view-1"
    );

    expect(fetchIssuesWithExistingPagination).not.toHaveBeenCalled();
  });

  it("refetches issues when server-relevant ordering changes", async () => {
    const { fetchIssuesWithExistingPagination, store } = createStore();

    await store.updateFilters(
      "workspace-1",
      undefined,
      EIssueFilterType.DISPLAY_FILTERS,
      { order_by: "priority" },
      "view-1"
    );

    expect(fetchIssuesWithExistingPagination).toHaveBeenCalledWith("workspace-1", "view-1", "mutation");
  });
});
