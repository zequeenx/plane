import { describe, expect, it, vi } from "vitest";
import { createDraggableRegistrationController } from "./draggable-registration";

type TRegistrationOptions = Parameters<Parameters<typeof createDraggableRegistrationController>[0]["register"]>[0];

const createHarness = () => {
  const element = {} as HTMLElement;
  let data: Record<string, unknown> = { id: "first" };
  let handle: HTMLElement | null = null;
  const cleanups: ReturnType<typeof vi.fn>[] = [];
  const register = vi.fn((_options: TRegistrationOptions) => {
    const cleanup = vi.fn();
    cleanups.push(cleanup);
    return cleanup;
  });
  const onDragStart = vi.fn();
  const onDrop = vi.fn();
  const controller = createDraggableRegistrationController({
    getData: () => data,
    getElement: () => element,
    getHandle: () => handle,
    onDragStart,
    onDrop,
    register,
  });

  return {
    cleanups,
    controller,
    element,
    getRegistration: (index = 0) => {
      const registration = register.mock.calls[index]?.[0];
      if (!registration) throw new Error(`Expected registration at index ${index}`);
      return registration;
    },
    onDragStart,
    onDrop,
    register,
    setData: (nextData: Record<string, unknown>) => {
      data = nextData;
    },
    setHandle: (nextHandle: HTMLElement | null) => {
      handle = nextHandle;
    },
  };
};

describe("createDraggableRegistrationController", () => {
  it("registers the whole element when mounted without a handle", () => {
    const { controller, element, getRegistration, onDragStart, onDrop, register } = createHarness();

    const unmount = controller.mount();

    expect(register).toHaveBeenCalledOnce();
    expect(getRegistration()).toMatchObject({
      dragHandle: undefined,
      element,
      onDragStart,
      onDrop,
    });
    unmount();
  });

  it("cleans up and re-registers with every current handle transition", () => {
    const button1 = {} as HTMLButtonElement;
    const button2 = {} as HTMLButtonElement;
    const { cleanups, controller, register, setHandle } = createHarness();

    controller.mount();
    setHandle(button1);
    controller.sync();
    setHandle(button2);
    controller.sync();
    setHandle(null);
    controller.sync();

    expect(cleanups.slice(0, 3).map((cleanup) => cleanup.mock.calls.length)).toEqual([1, 1, 1]);
    expect(register.mock.calls.map(([options]) => options.dragHandle)).toEqual([
      undefined,
      button1,
      button2,
      undefined,
    ]);
  });

  it("reads the latest data without rebuilding the registration", () => {
    const nextData = { id: "second" };
    const { controller, getRegistration, register, setData } = createHarness();

    controller.mount();
    const getInitialData = getRegistration().getInitialData;
    setData(nextData);

    expect(register).toHaveBeenCalledOnce();
    expect(getInitialData()).toBe(nextData);
  });

  it("ignores sync before mount and cleans up repeated unmounts idempotently", () => {
    const { cleanups, controller, register } = createHarness();

    controller.sync();
    expect(register).not.toHaveBeenCalled();

    const firstUnmount = controller.mount();
    firstUnmount();
    firstUnmount();
    controller.sync();

    expect(register).toHaveBeenCalledOnce();
    expect(cleanups[0]).toHaveBeenCalledOnce();

    const secondUnmount = controller.mount();
    firstUnmount();
    expect(cleanups[1]).not.toHaveBeenCalled();
    secondUnmount();
    secondUnmount();
    expect(cleanups[1]).toHaveBeenCalledOnce();
  });
});
