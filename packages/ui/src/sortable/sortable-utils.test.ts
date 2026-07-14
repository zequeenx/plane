import { describe, expect, it } from "vitest";
import {
  createSortablePayload,
  getSortableEdges,
  isSortablePayloadForId,
  moveSortableItem,
  resolveSortableDrop,
} from "./sortable-utils";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
const keyExtractor = (item: { id: string }) => item.id;
const indexKeyExtractor = (item: { id: string }, index: number) => `${index}:${item.id}`;

const payload = (sortableId: string, sortableKey: string) => ({
  __uuid__: sortableId,
  __sortableKey__: sortableKey,
});

describe("createSortablePayload", () => {
  it("extracts the stable key with the item's real index", () => {
    expect(createSortablePayload(items[2], 2, "first", indexKeyExtractor)).toEqual({
      __uuid__: "first",
      __sortableKey__: "2:c",
    });
  });
});

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
    expect(moveSortableItem(items, "c", "a", edge, keyExtractor).data).toEqual([{ id: "c" }, { id: "a" }, { id: "b" }]);
  });

  it.each(["bottom", "right"] as const)("inserts after for the %s edge", (edge) => {
    expect(moveSortableItem(items, "a", "c", edge, keyExtractor).data).toEqual([{ id: "b" }, { id: "c" }, { id: "a" }]);
  });

  it("adjusts the destination index when moving forward", () => {
    expect(moveSortableItem(items, "a", "b", "bottom", keyExtractor).data).toEqual([
      { id: "b" },
      { id: "a" },
      { id: "c" },
    ]);
  });

  it("preserves the destination index when moving backward", () => {
    expect(moveSortableItem(items, "c", "b", "top", keyExtractor).data).toEqual([
      { id: "a" },
      { id: "c" },
      { id: "b" },
    ]);
  });

  it("uses stable keys computed with each item's real index", () => {
    expect(moveSortableItem(items, "2:c", "1:b", "top", indexKeyExtractor).data).toEqual([
      { id: "a" },
      { id: "c" },
      { id: "b" },
    ]);
  });

  it("returns a copy and no moved item when the source key is missing", () => {
    const result = moveSortableItem(items, "missing", "b", "top", keyExtractor);

    expect(result).toEqual({ data: items, movedItem: undefined });
    expect(result.data).not.toBe(items);
  });

  it("returns a copy and no moved item when the destination key is missing", () => {
    const result = moveSortableItem(items, "b", "missing", "bottom", keyExtractor);

    expect(result).toEqual({ data: items, movedItem: undefined });
    expect(result.data).not.toBe(items);
  });

  it("does not mutate the input and returns the moved item", () => {
    const input = [...items];

    const result = moveSortableItem(input, "a", "c", "bottom", keyExtractor);

    expect(input).toEqual(items);
    expect(result.data).not.toBe(input);
    expect(result.movedItem).toBe(input[0]);
  });
});

describe("isSortablePayloadForId", () => {
  it("matches only payloads with the requested sortable ID and a stable key", () => {
    expect(isSortablePayloadForId(payload("first", "a"), "first")).toBe(true);
    expect(isSortablePayloadForId(payload("second", "a"), "first")).toBe(false);
    expect(isSortablePayloadForId({ __uuid__: "first" }, "first")).toBe(false);
    expect(isSortablePayloadForId({ __sortableKey__: "a" }, "first")).toBe(false);
  });
});

describe("resolveSortableDrop", () => {
  it("returns a move for source and destination payloads from the same sortable", () => {
    expect(
      resolveSortableDrop(items, payload("first", "a"), payload("first", "c"), "bottom", "first", keyExtractor)
    ).toEqual({
      data: [{ id: "b" }, { id: "c" }, { id: "a" }],
      movedItem: { id: "a" },
    });
  });

  it("returns no result when the source belongs to another sortable", () => {
    expect(
      resolveSortableDrop(items, payload("second", "a"), payload("first", "c"), "bottom", "first", keyExtractor)
    ).toBeUndefined();
  });

  it("returns no result when the destination belongs to another sortable", () => {
    expect(
      resolveSortableDrop(items, payload("first", "a"), payload("second", "c"), "bottom", "first", keyExtractor)
    ).toBeUndefined();
  });

  it("returns no result when either stable key cannot be resolved", () => {
    expect(
      resolveSortableDrop(items, payload("first", "missing"), payload("first", "c"), "bottom", "first", keyExtractor)
    ).toBeUndefined();
  });
});
