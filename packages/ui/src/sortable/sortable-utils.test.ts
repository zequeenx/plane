import { describe, expect, it } from "vitest";
import { getSortableEdges, moveSortableItem } from "./sortable-utils";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
const keyExtractor = (item: { id: string }) => item.id;

describe("getSortableEdges", () => {
  it("returns top and bottom edges for vertical sortables", () => {
    expect(getSortableEdges("vertical")).toEqual(["top", "bottom"]);
  });

  it("returns left and right edges for horizontal sortables", () => {
    expect(getSortableEdges("horizontal")).toEqual(["left", "right"]);
  });
});

describe("moveSortableItem", () => {
  it.each(["top", "left"] as const)("inserts before for the %s edge", (edge) => {
    expect(moveSortableItem(items, items[2], items[0], edge, keyExtractor).data).toEqual([
      { id: "c" },
      { id: "a" },
      { id: "b" },
    ]);
  });

  it.each(["bottom", "right"] as const)("inserts after for the %s edge", (edge) => {
    expect(moveSortableItem(items, items[0], items[2], edge, keyExtractor).data).toEqual([
      { id: "b" },
      { id: "c" },
      { id: "a" },
    ]);
  });

  it("adjusts the destination index when moving forward", () => {
    expect(moveSortableItem(items, items[0], items[1], "bottom", keyExtractor).data).toEqual([
      { id: "b" },
      { id: "a" },
      { id: "c" },
    ]);
  });

  it("preserves the destination index when moving backward", () => {
    expect(moveSortableItem(items, items[2], items[1], "top", keyExtractor).data).toEqual([
      { id: "a" },
      { id: "c" },
      { id: "b" },
    ]);
  });

  it("returns a copy and no moved item when the source is missing", () => {
    const result = moveSortableItem(items, { id: "missing" }, items[1], "top", keyExtractor);

    expect(result).toEqual({ data: items, movedItem: undefined });
    expect(result.data).not.toBe(items);
  });

  it("returns a copy and no moved item when the destination is missing", () => {
    const result = moveSortableItem(items, items[1], { id: "missing" }, "bottom", keyExtractor);

    expect(result).toEqual({ data: items, movedItem: undefined });
    expect(result.data).not.toBe(items);
  });

  it("does not mutate the input and returns the moved item", () => {
    const input = [...items];

    const result = moveSortableItem(input, input[0], input[2], "bottom", keyExtractor);

    expect(input).toEqual(items);
    expect(result.data).not.toBe(input);
    expect(result.movedItem).toBe(input[0]);
  });
});
