import { describe, expect, it } from "vitest";

import { IssueFilterHelperStore, getServerGroupBy, getServerGroupFilter } from "./issue-filter-helper.store";

describe("custom field server grouping params", () => {
  it.each(["customproperty_select-field", "modulecustomproperty_member-field"] as const)(
    "preserves %s as a group_by value",
    (groupBy) => {
      expect(getServerGroupBy(groupBy)).toBe(groupBy);
    }
  );

  it.each(["customproperty_select-field", "modulecustomproperty_member-field"])(
    "uses an exact group pagination filter for %s",
    (groupBy) => {
      expect(getServerGroupFilter(groupBy)).toBe(`${groupBy}__exact`);
    }
  );

  it.each(["customproperty_select-field", "modulecustomproperty_member-field"] as const)(
    "maps populated and empty %s pagination groups to backend field filters",
    (groupBy) => {
      const store = new IssueFilterHelperStore();
      const options = { canGroup: true, perPageCount: 50 };
      const populated = store.getPaginationParams({ group_by: groupBy }, options, undefined, "value-1");
      const empty = store.getPaginationParams({ group_by: groupBy }, options, undefined, "None");

      expect(populated).toMatchObject({ [`${groupBy}__exact`]: "value-1" });
      expect(populated).not.toHaveProperty(`${groupBy}__is_empty`);
      expect(empty).toMatchObject({ [`${groupBy}__is_empty`]: true });
      expect(empty).not.toHaveProperty(`${groupBy}__exact`);
    }
  );

  it("keeps static pagination group mapping unchanged", () => {
    const store = new IssueFilterHelperStore();

    expect(
      store.getPaginationParams({ group_by: "state_id" }, { canGroup: true, perPageCount: 50 }, undefined, "None")
    ).toMatchObject({ state: "None" });
  });
});
