type TDraggableRegistrationOptions = {
  dragHandle: HTMLElement | undefined;
  element: HTMLElement;
  getInitialData: () => Record<string, unknown>;
  onDragStart: () => void;
  onDrop: () => void;
};

type TDraggableRegistrationControllerOptions = {
  getData: () => Record<string, unknown>;
  getElement: () => HTMLElement | null;
  getHandle: () => HTMLElement | null;
  onDragStart: () => void;
  onDrop: () => void;
  register: (options: TDraggableRegistrationOptions) => () => void;
};

type TDraggableRegistrationController = {
  mount: () => () => void;
  sync: () => void;
};

export const createDraggableRegistrationController = (
  options: TDraggableRegistrationControllerOptions
): TDraggableRegistrationController => {
  const { getData, getElement, getHandle, onDragStart, onDrop, register } = options;
  let activeMount = 0;
  let cleanupRegistration: (() => void) | undefined;
  let isMounted = false;

  const cleanup = () => {
    const currentCleanup = cleanupRegistration;
    cleanupRegistration = undefined;
    currentCleanup?.();
  };

  const sync = () => {
    if (!isMounted) return;

    cleanup();
    const element = getElement();
    if (!element) return;

    cleanupRegistration = register({
      dragHandle: getHandle() ?? undefined,
      element,
      getInitialData: getData,
      onDragStart,
      onDrop,
    });
  };

  const mount = () => {
    const mountId = ++activeMount;
    isMounted = true;
    sync();
    let isUnmounted = false;

    return () => {
      if (isUnmounted) return;
      isUnmounted = true;
      if (!isMounted || mountId !== activeMount) return;

      isMounted = false;
      cleanup();
    };
  };

  return { mount, sync };
};
