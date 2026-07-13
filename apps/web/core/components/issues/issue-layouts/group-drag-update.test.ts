import { describe, expect, it } from "vitest";

import { buildGroupDragUpdate } from "./group-drag-update";

describe("buildGroupDragUpdate", () => {
  it("preserves scalar static group behavior", () => {
    expect(
      buildGroupDragUpdate({
        currentValue: "high",
        destinationGroupId: "low",
        groupBy: "priority",
        sourceGroupId: "high",
        staticGroupKey: "priority",
      })
    ).toEqual({ groupKey: "priority", groupValue: "low" });

    expect(
      buildGroupDragUpdate({
        currentValue: "high",
        destinationGroupId: "None",
        groupBy: "priority",
        sourceGroupId: "high",
        staticGroupKey: "priority",
      })
    ).toEqual({ groupKey: "priority", groupValue: null });
  });

  it("preserves array static group behavior without mutating the source", () => {
    const currentValue = ["label-a", "label-b"];

    expect(
      buildGroupDragUpdate({
        currentValue,
        destinationGroupId: "label-c",
        groupBy: "labels",
        sourceGroupId: "label-a",
        staticGroupKey: "label_ids",
      })
    ).toEqual({ groupKey: "label_ids", groupValue: ["label-b", "label-c"] });
    expect(currentValue).toEqual(["label-a", "label-b"]);
  });

  it("constructs local dynamic annotations including the None convention", () => {
    expect(
      buildGroupDragUpdate({
        currentValue: "option-a",
        destinationGroupId: "option-b",
        groupBy: "customproperty_select-field",
        sourceGroupId: "option-a",
      })
    ).toEqual({ groupKey: "customproperty_select-field", groupValue: "option-b" });

    expect(
      buildGroupDragUpdate({
        currentValue: "member-1",
        destinationGroupId: "None",
        groupBy: "modulecustomproperty_member-field",
        sourceGroupId: "member-1",
      })
    ).toEqual({ groupKey: "modulecustomproperty_member-field", groupValue: null });
  });
});
