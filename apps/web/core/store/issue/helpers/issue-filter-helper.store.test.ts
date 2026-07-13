import { describe, expect, it } from "vitest";

import { getServerGroupBy, getServerGroupFilter } from "./issue-filter-helper.store";

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
});
