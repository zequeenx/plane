import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sortable } from "./sortable";

const mocks = vi.hoisted(() => ({
  sortableIds: [] as string[],
}));

vi.mock("./draggable", () => ({
  Draggable: ({ data }: { data: { __uuid__: string } }) => {
    mocks.sortableIds.push(data.__uuid__);
    return null;
  },
}));

const renderTwoSortables = () => {
  mocks.sortableIds.length = 0;

  renderToStaticMarkup(
    <>
      <Sortable
        data={[{ key: "first-a" }, { key: "first-b" }]}
        keyExtractor={(item) => item.key}
        onChange={vi.fn()}
        render={() => null}
      />
      <Sortable
        data={[{ key: "second-a" }, { key: "second-b" }]}
        keyExtractor={(item) => item.key}
        onChange={vi.fn()}
        render={() => null}
      />
    </>
  );

  return [...mocks.sortableIds];
};

describe("Sortable instance ID", () => {
  beforeEach(() => {
    mocks.sortableIds.length = 0;
  });

  it("is shared within an instance, isolated between instances, and stable across renders", () => {
    const firstRenderIds = renderTwoSortables();
    const secondRenderIds = renderTwoSortables();

    expect(firstRenderIds[0]).toBe(firstRenderIds[1]);
    expect(firstRenderIds[2]).toBe(firstRenderIds[3]);
    expect(firstRenderIds[0]).not.toBe(firstRenderIds[2]);
    expect(secondRenderIds).toEqual(firstRenderIds);
  });

  it("preserves an explicit instance ID", () => {
    renderToStaticMarkup(
      <Sortable
        data={[{ key: "a" }, { key: "b" }]}
        id="explicit-sortable-id"
        keyExtractor={(item) => item.key}
        onChange={vi.fn()}
        render={() => null}
      />
    );

    expect(mocks.sortableIds).toEqual(["explicit-sortable-id", "explicit-sortable-id"]);
  });
});
