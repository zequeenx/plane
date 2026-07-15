import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TRegistrationOptions = {
  onDragStart: () => void;
  onDrop: () => void;
};

const mocks = vi.hoisted(() => {
  const refs: { current: unknown }[] = [];
  const states: unknown[] = [];
  let refIndex = 0;
  let stateIndex = 0;

  return {
    draggable: vi.fn((_options: TRegistrationOptions) => vi.fn()),
    refs,
    resetHooks: () => {
      refIndex = 0;
      stateIndex = 0;
    },
    resetState: () => {
      refs.length = 0;
      states.length = 0;
      refIndex = 0;
      stateIndex = 0;
    },
    useRef: <T,>(initialValue: T) => {
      const index = refIndex++;
      refs[index] ??= { current: initialValue };
      return refs[index] as { current: T };
    },
    useState: <T,>(initialValue: T | (() => T)) => {
      const index = stateIndex++;
      if (!(index in states))
        states[index] = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;

      return [
        states[index] as T,
        (value: T | ((current: T) => T)) => {
          states[index] = typeof value === "function" ? (value as (current: T) => T)(states[index] as T) : value;
        },
      ] as const;
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();

  return {
    ...original,
    useEffect: vi.fn(),
    useLayoutEffect: (effect: () => void | (() => void)) => effect(),
    useRef: mocks.useRef,
    useState: mocks.useState,
  };
});

vi.mock("@atlaskit/pragmatic-drag-and-drop/dist/cjs/entry-point/element/adapter.js", () => ({
  draggable: mocks.draggable,
  dropTargetForElements: vi.fn(() => vi.fn()),
}));

import { Draggable } from "./draggable";

const renderDraggable = (observedDraggingStates: boolean[]) => {
  mocks.resetHooks();
  const tree = Draggable({
    children: ({ isDragging }) => {
      observedDraggingStates.push(isDragging);
      return null;
    },
    data: { __sortableKey__: "item", __uuid__: "sortable" },
  });

  return tree as React.ReactElement & { ref: { current: HTMLDivElement | null } };
};

describe("Draggable render helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetState();
  });

  it("reports authoritative drag state from the registered drag lifecycle callbacks", () => {
    const observedDraggingStates: boolean[] = [];
    const firstRender = renderDraggable(observedDraggingStates);
    firstRender.ref.current = {} as HTMLDivElement;

    observedDraggingStates.length = 0;
    renderDraggable(observedDraggingStates);
    const registration = mocks.draggable.mock.calls.at(-1)?.[0];
    if (!registration) throw new Error("Expected Draggable to register its drag lifecycle callbacks");

    registration.onDragStart();
    renderDraggable(observedDraggingStates);
    registration.onDrop();
    renderDraggable(observedDraggingStates);

    expect(observedDraggingStates).toEqual([false, true, false]);
  });
});
