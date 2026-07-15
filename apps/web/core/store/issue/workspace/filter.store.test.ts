import { EIssueFilterType } from "@plane/constants";
import { EIssuesStoreType, type IIssueFilters } from "@plane/types";
import { describe, expect, it, vi } from "vitest";

import type { IIssueRootStore } from "../root.store";
import { WorkspaceIssuesFilter } from "./filter.store";

vi.mock("@/lib/store-context", () => ({ store: {} }));

const createStore = () => {
  const fetchIssuesWithExistingPagination = vi.fn();
  const rootStore = {
    currentUserId: "member-1",
    globalViewId: "all-issues",
    workspaceIssues: { fetchIssuesWithExistingPagination },
  } as unknown as IIssueRootStore;
  const store = new WorkspaceIssuesFilter(rootStore);
  store.filters["all-issues"] = {
    displayFilters: { layout: "spreadsheet", order_by: "-created_at" },
    displayProperties: {},
    kanbanFilters: { group_by: [], sub_group_by: [] },
    richFilters: {},
  } as IIssueFilters;
  const setLocalFilters = vi.spyOn(store.handleIssuesLocalFilters, "set");

  return { fetchIssuesWithExistingPagination, setLocalFilters, store };
};

describe("WorkspaceIssuesFilter", () => {
  it("does not refetch issues when only the Spreadsheet column order changes", async () => {
    const { fetchIssuesWithExistingPagination, setLocalFilters, store } = createStore();

    await store.updateFilters(
      "workspace-1",
      undefined,
      EIssueFilterType.DISPLAY_FILTERS,
      { spreadsheet: { column_order: ["priority", "state"] } },
      "all-issues"
    );

    expect(fetchIssuesWithExistingPagination).not.toHaveBeenCalled();
    expect(setLocalFilters).toHaveBeenCalledWith(
      EIssuesStoreType.GLOBAL,
      EIssueFilterType.DISPLAY_FILTERS,
      "workspace-1",
      undefined,
      "all-issues",
      {
        display_filters: {
          layout: "spreadsheet",
          order_by: "-created_at",
          spreadsheet: { column_order: ["priority", "state"] },
        },
      }
    );
  });

  it("refetches issues when server-relevant ordering changes", async () => {
    const { fetchIssuesWithExistingPagination, setLocalFilters, store } = createStore();

    await store.updateFilters(
      "workspace-1",
      undefined,
      EIssueFilterType.DISPLAY_FILTERS,
      { order_by: "priority" },
      "all-issues"
    );

    expect(fetchIssuesWithExistingPagination).toHaveBeenCalledWith("workspace-1", "all-issues", "mutation");
    expect(setLocalFilters).toHaveBeenCalledWith(
      EIssuesStoreType.GLOBAL,
      EIssueFilterType.DISPLAY_FILTERS,
      "workspace-1",
      undefined,
      "all-issues",
      {
        display_filters: {
          layout: "spreadsheet",
          order_by: "priority",
        },
      }
    );
  });
});
