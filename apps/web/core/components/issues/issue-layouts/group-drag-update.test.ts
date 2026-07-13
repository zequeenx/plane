import type { TIssue } from "@plane/types";
import { describe, expect, it, vi } from "vitest";

import { buildGroupDragUpdate } from "./group-drag-update";
import { handleGroupDragDrop } from "./utils";

vi.mock("next/navigation", () => ({ useParams: () => ({}) }));

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

describe("handleGroupDragDrop subgroup mutation guard", () => {
  const issue = {
    id: "issue-1",
    priority: "high",
    project_id: "project-1",
    sort_order: 100,
  } as TIssue;
  const source = { columnId: "option-a", groupId: "option-a", id: issue.id, subGroupId: "high" };
  const destination = { columnId: "option-b", groupId: "option-b", id: undefined, subGroupId: "low" };

  it("does not call the update endpoint for an injected custom subgroup", async () => {
    const updateIssueOnDrop = vi.fn();

    await handleGroupDragDrop(
      source,
      destination,
      () => issue,
      () => [],
      updateIssueOnDrop,
      "customproperty_select-field",
      "modulecustomproperty_member-field"
    );

    expect(updateIssueOnDrop).not.toHaveBeenCalled();
  });

  it("keeps primary custom grouping with a static subgroup mutable", async () => {
    const updateIssueOnDrop = vi.fn();

    await handleGroupDragDrop(
      source,
      destination,
      () => issue,
      () => [],
      updateIssueOnDrop,
      "customproperty_select-field",
      "priority"
    );

    expect(updateIssueOnDrop).toHaveBeenCalledWith(
      "project-1",
      issue.id,
      expect.objectContaining({ "customproperty_select-field": "option-b", priority: "low" }),
      expect.not.objectContaining({ undefined: expect.anything() })
    );
  });
});
