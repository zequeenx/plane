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
    "maps populated and empty %s pagination groups into rich filters",
    (groupBy) => {
      const store = new IssueFilterHelperStore();
      const options = { canGroup: true, perPageCount: 50 };
      const populated = store.getPaginationParams({ group_by: groupBy }, options, undefined, "value-1");
      const empty = store.getPaginationParams({ group_by: groupBy }, options, undefined, "None");

      expect(JSON.parse(populated.filters as string)).toEqual({ [`${groupBy}__exact`]: "value-1" });
      expect(JSON.parse(empty.filters as string)).toEqual({ [`${groupBy}__is_empty`]: true });
      expect(populated).not.toHaveProperty(`${groupBy}__exact`);
      expect(empty).not.toHaveProperty(`${groupBy}__is_empty`);
    }
  );

  it("combines custom pagination with existing rich filters", () => {
    const store = new IssueFilterHelperStore();
    const existingFilters = { priority__in: ["high"] };

    const params = store.getPaginationParams(
      {
        filters: JSON.stringify(existingFilters),
        group_by: "customproperty_select-field",
      },
      { canGroup: true, perPageCount: 50 },
      undefined,
      "option-1"
    );

    expect(JSON.parse(params.filters as string)).toEqual({
      and: [existingFilters, { "customproperty_select-field__exact": "option-1" }],
    });
  });

  it("appends custom pagination to an existing conjunction without nesting it", () => {
    const store = new IssueFilterHelperStore();
    const existingCondition = { priority__in: ["high"] };

    const params = store.getPaginationParams(
      {
        filters: JSON.stringify({ and: [existingCondition] }),
        group_by: "modulecustomproperty_member-field",
      },
      { canGroup: true, perPageCount: 50 },
      undefined,
      "member-1"
    );

    expect(JSON.parse(params.filters as string)).toEqual({
      and: [existingCondition, { "modulecustomproperty_member-field__exact": "member-1" }],
    });
  });

  it("keeps static pagination group mapping unchanged", () => {
    const store = new IssueFilterHelperStore();

    const params = store.getPaginationParams(
      { filters: JSON.stringify({ priority__in: ["high"] }), group_by: "state_id" },
      { canGroup: true, perPageCount: 50 },
      undefined,
      "None"
    );

    expect(params).toMatchObject({ filters: JSON.stringify({ priority__in: ["high"] }), state: "None" });
  });
});
