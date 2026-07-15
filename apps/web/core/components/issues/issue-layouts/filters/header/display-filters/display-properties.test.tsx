import React from "react";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DisplayPropertyChip } from "./display-property-chip";
import { FilterDisplayProperties } from "./display-properties";

type TDisplayPropertyOption = {
  key: keyof IIssueDisplayProperties;
  label: string;
  isEnabled: boolean;
};

type TSortableRenderHelpers = {
  dragHandleRef: React.RefCallback<HTMLButtonElement>;
  isDragging: boolean;
};

type TDisplayPropertyChipElement = React.ReactElement<
  React.ComponentProps<typeof DisplayPropertyChip>,
  typeof DisplayPropertyChip
>;

type TButtonElement = React.ReactElement<
  React.ButtonHTMLAttributes<HTMLButtonElement> & React.RefAttributes<HTMLButtonElement>,
  "button"
>;

type THandleWrapperElement = React.ReactElement<
  React.HTMLAttributes<HTMLSpanElement> & React.RefAttributes<HTMLSpanElement> & { children: TButtonElement },
  "span"
>;

type TSortableProps = {
  data: TDisplayPropertyOption[];
  id?: string;
  keyExtractor: (item: TDisplayPropertyOption, index: number) => string;
  onChange: (data: TDisplayPropertyOption[]) => void;
  orientation?: "horizontal" | "vertical";
  render: (item: TDisplayPropertyOption, index: number, helpers: TSortableRenderHelpers) => React.ReactNode;
};

const mocks = vi.hoisted(() => ({
  draggingByProperty: {} as Partial<Record<keyof IIssueDisplayProperties, boolean>>,
  moduleFields: undefined as { id: string; name: string }[] | undefined,
  params: {
    moduleId: undefined as string | undefined,
    projectId: undefined as string | undefined,
    workspaceSlug: undefined as string | undefined,
  },
  projectDetails: undefined as { cycle_view?: boolean; estimate?: string | null; module_view?: boolean } | undefined,
  projectFields: undefined as { id: string; name: string }[] | undefined,
  sortableChipElements: [] as TDisplayPropertyChipElement[],
  sortableProps: [] as TSortableProps[],
}));

vi.mock("mobx-react", () => ({
  observer: (component: unknown) => component,
}));

vi.mock("next/navigation", () => ({
  useParams: () => mocks.params,
}));

vi.mock("@plane/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@plane/ui", async (importOriginal) => {
  const original = await importOriginal<typeof import("@plane/ui")>();

  return {
    ...original,
    Sortable: (props: TSortableProps) => {
      mocks.sortableProps.push(props);
      return (
        <>
          {props.data.map((item, index) => {
            const element = props.render(item, index, {
              dragHandleRef: vi.fn(),
              isDragging: !!mocks.draggingByProperty[item.key],
            });
            if (React.isValidElement(element)) mocks.sortableChipElements.push(element as TDisplayPropertyChipElement);

            return <React.Fragment key={item.key}>{element}</React.Fragment>;
          })}
        </>
      );
    },
    Tooltip: ({
      children,
      disabled,
      tooltipContent,
    }: {
      children: React.ReactElement;
      disabled?: boolean;
      tooltipContent: React.ReactNode;
    }) => (
      <span data-tooltip-content={tooltipContent} data-tooltip-disabled={disabled ? "true" : "false"}>
        {children}
      </span>
    ),
  };
});

vi.mock("@/hooks/store/use-module-issue-fields", () => ({
  useModuleIssueFields: () => ({
    fieldsLoader: {},
    getFields: vi.fn(),
    getFieldsByModuleId: () => mocks.moduleFields,
  }),
}));

vi.mock("@/hooks/store/use-project-issue-fields", () => ({
  useProjectIssueFields: () => ({
    fieldsLoader: {},
    getFields: vi.fn(),
    getFieldsByProjectId: () => mocks.projectFields,
  }),
}));

vi.mock("@/hooks/store/use-project", () => ({
  useProject: () => ({ currentProjectDetails: mocks.projectDetails }),
}));

vi.mock("../helpers/filter-header", () => ({
  FilterHeader: () => null,
}));

const renderProperties = (
  layout: IIssueDisplayFilterOptions["layout"],
  overrides: Partial<React.ComponentProps<typeof FilterDisplayProperties>> = {}
) => {
  const handleDisplayFiltersUpdate = vi.fn();
  const handleUpdate = vi.fn();

  const markup = renderToStaticMarkup(
    <FilterDisplayProperties
      displayFilters={{ layout }}
      displayProperties={{ key: true, priority: false, state: true }}
      displayPropertiesToRender={["key", "state", "priority"]}
      handleDisplayFiltersUpdate={handleDisplayFiltersUpdate}
      handleUpdate={handleUpdate}
      {...overrides}
    />
  );

  return { handleDisplayFiltersUpdate, handleUpdate, markup };
};

const findSortableChip = (label: string) => {
  const chip = mocks.sortableChipElements.find((element) => element.props.label === label);
  if (!chip) throw new Error(`Expected sortable chip with label: ${label}`);
  return chip;
};

const getTooltipDisabledStates = (markup: string) =>
  Array.from(markup.matchAll(/data-tooltip-disabled="([^"]+)"/g), (match) => match[1]);

const getElementRef = <T,>(element: React.ReactElement | undefined) =>
  (element as (React.ReactElement & { ref: React.Ref<T> | null }) | undefined)?.ref;

const getChipControls = (chip: TDisplayPropertyChipElement) => {
  const tree = DisplayPropertyChip(chip.props);
  const children = React.Children.toArray(tree.props.children).filter(React.isValidElement) as React.ReactElement[];
  const labelButton = children.at(-1) as TButtonElement;
  const tooltip = chip.props.isSortable ? children[0] : undefined;
  const handleWrapper = tooltip
    ? ((tooltip as React.ReactElement<{ children: THandleWrapperElement }>).props.children as THandleWrapperElement)
    : undefined;
  const handleButton = handleWrapper
    ? (React.Children.only(handleWrapper.props.children) as TButtonElement)
    : undefined;

  return { handleButton, handleWrapper, labelButton, tooltip, tree };
};

describe("FilterDisplayProperties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.draggingByProperty = {};
    mocks.sortableChipElements.length = 0;
    mocks.sortableProps.length = 0;
    mocks.params = { moduleId: undefined, projectId: undefined, workspaceSlug: undefined };
    mocks.projectDetails = undefined;
    mocks.projectFields = undefined;
    mocks.moduleFields = undefined;
  });

  it("renders selected and unselected Spreadsheet chips with separate handle and label controls", () => {
    const { markup } = renderProperties("spreadsheet");
    const stateControls = getChipControls(findSortableChip("common.state"));
    const priorityControls = getChipControls(findSortableChip("common.priority"));

    expect(mocks.sortableProps).toHaveLength(1);
    expect(mocks.sortableProps[0]).toMatchObject({
      orientation: "horizontal",
    });
    expect(mocks.sortableProps[0].id).toBeUndefined();
    expect(stateControls.tree.props.className).toContain("border-accent-strong bg-accent-primary text-on-color");
    expect(priorityControls.tree.props.className).toContain("border-subtle hover:bg-layer-1");
    expect(stateControls.handleButton?.type).toBe("button");
    expect(stateControls.labelButton.type).toBe("button");
    expect(stateControls.handleButton).not.toBe(stateControls.labelButton);
    expect(stateControls.handleButton?.props["aria-label"]).toBe("common.drag_to_rearrange: common.state");
    expect(stateControls.handleButton?.props["aria-keyshortcuts"]).toBe("ArrowLeft ArrowRight");
    expect(priorityControls.handleButton?.props["aria-label"]).toBe("common.drag_to_rearrange: common.priority");
    expect(markup).toContain('data-tooltip-content="common.drag_to_rearrange"');
    expect(markup.match(/lucide-grip-vertical/g)).toHaveLength(2);
  });

  it("snapshots enabled state in sortable option data", () => {
    renderProperties("spreadsheet");

    expect(mocks.sortableProps[0].data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "state", isEnabled: true }),
        expect.objectContaining({ key: "priority", isEnabled: false }),
      ])
    );
  });

  it("renders sortable chip state from the option snapshot", () => {
    renderProperties("spreadsheet", {
      displayProperties: { key: true, state: true },
      displayPropertiesToRender: ["key", "state"],
    });
    const chip = mocks.sortableProps[0].render({ key: "state", label: "common.state", isEnabled: false }, 0, {
      dragHandleRef: vi.fn(),
      isDragging: false,
    }) as TDisplayPropertyChipElement;

    expect(getChipControls(chip).tree.props.className).toContain("border-subtle hover:bg-layer-1");
  });

  it("toggles system, project, and module properties from their captured enabled snapshots", () => {
    const projectProperty = "customproperty_customer-tier" as keyof IIssueDisplayProperties;
    const moduleProperty = "modulecustomproperty_effort" as keyof IIssueDisplayProperties;
    mocks.params = { moduleId: "module-1", projectId: "project-1", workspaceSlug: "workspace-1" };
    mocks.projectDetails = { cycle_view: true, estimate: "estimate-1", module_view: true };
    mocks.projectFields = [{ id: "customer-tier", name: "Customer tier" }];
    mocks.moduleFields = [{ id: "effort", name: "Effort" }];

    const { handleUpdate } = renderProperties("spreadsheet", {
      displayProperties: {
        key: true,
        state: true,
        [projectProperty]: true,
        [moduleProperty]: false,
      },
      displayPropertiesToRender: ["key", "state"],
    });
    const sortable = mocks.sortableProps[0];
    const divergentSnapshots = [
      { expectedValue: true, isEnabled: false, key: "state" as const },
      { expectedValue: true, isEnabled: false, key: projectProperty },
      { expectedValue: false, isEnabled: true, key: moduleProperty },
    ];

    divergentSnapshots.forEach(({ expectedValue, isEnabled, key }, index) => {
      const property = sortable.data.find((option) => option.key === key);
      if (!property) throw new Error(`Expected sortable property: ${key}`);

      const chip = sortable.render({ ...property, isEnabled }, index, {
        dragHandleRef: vi.fn(),
        isDragging: false,
      }) as TDisplayPropertyChipElement;
      getChipControls(chip).labelButton.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>);

      expect(handleUpdate).toHaveBeenNthCalledWith(index + 1, { [key]: expectedValue });
    });

    expect(handleUpdate).toHaveBeenCalledTimes(3);
  });

  it("disables only the actively dragged chip's reorder tooltip", () => {
    mocks.draggingByProperty = { state: true };

    const { markup } = renderProperties("spreadsheet");
    const stateTooltip = getChipControls(findSortableChip("common.state")).tooltip;
    const priorityTooltip = getChipControls(findSortableChip("common.priority")).tooltip;

    expect(stateTooltip?.props.disabled).toBe(true);
    expect(priorityTooltip?.props.disabled).toBe(false);
    expect(new Set(getTooltipDisabledStates(markup))).toEqual(new Set(["true", "false"]));
  });

  it("keeps the sortable handle ref below the Tooltip wrapper", () => {
    renderProperties("spreadsheet");
    const chip = findSortableChip("common.state");
    const { handleButton, handleWrapper } = getChipControls(chip);

    expect(handleWrapper?.type).toBe("span");
    expect(getElementRef<HTMLSpanElement>(handleWrapper)).toBeNull();
    expect(handleButton?.type).toBe("button");
    expect(getElementRef<HTMLButtonElement>(handleButton)).toBe(chip.props.dragHandleRef);
  });

  it("does not render a handle for ID or any List-layout chip", () => {
    const spreadsheetMarkup = renderProperties("spreadsheet").markup;
    const listMarkup = renderProperties("list").markup;

    expect(spreadsheetMarkup).toContain("issue.display.properties.id");
    expect(spreadsheetMarkup).not.toContain("common.drag_to_rearrange: issue.display.properties.id");
    expect(listMarkup).not.toContain("common.drag_to_rearrange:");
    expect(listMarkup).not.toContain("lucide-grip-vertical");
    expect(listMarkup.match(/<button/g)).toHaveLength(3);
  });

  it("keeps Spreadsheet timestamp descriptors out of non-Spreadsheet layouts", () => {
    const overrides = {
      displayPropertiesToRender: ["created_on", "updated_on"] as (keyof IIssueDisplayProperties)[],
    };

    const spreadsheetMarkup = renderProperties("spreadsheet", overrides).markup;
    const listMarkup = renderProperties("list", overrides).markup;
    const kanbanMarkup = renderProperties("kanban", overrides).markup;

    expect(spreadsheetMarkup).toContain("common.created_on");
    expect(spreadsheetMarkup).toContain("common.updated_on");
    expect(listMarkup).not.toContain("common.created_on");
    expect(listMarkup).not.toContain("common.updated_on");
    expect(kanbanMarkup).not.toContain("common.created_on");
    expect(kanbanMarkup).not.toContain("common.updated_on");
  });

  it("excludes estimate from project Spreadsheet ordering when estimates are not configured", () => {
    mocks.params = { moduleId: undefined, projectId: "project-1", workspaceSlug: "workspace-1" };
    mocks.projectDetails = { cycle_view: true, estimate: null, module_view: true };
    mocks.projectFields = [];

    renderProperties("spreadsheet", {
      displayProperties: { estimate: true, key: true, state: true },
      displayPropertiesToRender: ["key", "state", "estimate"],
    });

    expect(mocks.sortableProps[0].data.map(({ key }) => key)).toEqual(["state"]);
  });

  it("waits for project capability metadata before enabling Spreadsheet reordering", () => {
    mocks.params = { moduleId: undefined, projectId: "project-1", workspaceSlug: "workspace-1" };
    mocks.projectDetails = undefined;
    mocks.projectFields = [];

    renderProperties("spreadsheet", {
      displayProperties: { estimate: true, key: true, state: true },
      displayPropertiesToRender: ["key", "state", "estimate"],
    });

    expect(mocks.sortableProps).toHaveLength(0);
  });

  it("includes a configured project estimate and applies its saved Spreadsheet order", () => {
    mocks.params = { moduleId: undefined, projectId: "project-1", workspaceSlug: "workspace-1" };
    mocks.projectDetails = { cycle_view: true, estimate: "estimate-1", module_view: true };
    mocks.projectFields = [];

    renderProperties("spreadsheet", {
      displayFilters: {
        layout: "spreadsheet",
        spreadsheet: { column_order: ["estimate"] },
      },
      displayProperties: { estimate: true, key: true, state: true },
      displayPropertiesToRender: ["key", "state", "estimate"],
    });

    expect(mocks.sortableProps[0].data.map(({ key }) => key)).toEqual(["estimate", "state"]);
  });

  it("keeps estimate available for workspace Spreadsheet ordering", () => {
    renderProperties("spreadsheet", {
      displayProperties: { estimate: true, key: true, state: true },
      displayPropertiesToRender: ["key", "state", "estimate"],
    });

    expect(mocks.sortableProps[0].data.map(({ key }) => key)).toContain("estimate");
  });

  it("waits for applicable custom metadata before enabling Spreadsheet reordering", () => {
    mocks.params = { moduleId: "module-1", projectId: "project-1", workspaceSlug: "workspace-1" };
    mocks.projectDetails = { cycle_view: true, estimate: "estimate-1", module_view: true };
    const overrides = {
      displayFilters: {
        layout: "spreadsheet",
        spreadsheet: {
          column_order: ["modulecustomproperty_effort", "customproperty_customer-tier", "state"],
        },
      } satisfies IIssueDisplayFilterOptions,
      displayPropertiesToRender: ["key", "state"] as (keyof IIssueDisplayProperties)[],
    };

    const loadingRender = renderProperties("spreadsheet", overrides);

    expect(mocks.sortableProps).toHaveLength(0);
    expect(loadingRender.markup).toContain("common.state");
    expect(loadingRender.markup).not.toContain("common.drag_to_rearrange:");
    expect(loadingRender.handleDisplayFiltersUpdate).not.toHaveBeenCalled();

    mocks.projectFields = [{ id: "customer-tier", name: "Customer tier" }];
    mocks.moduleFields = [{ id: "effort", name: "Effort" }];
    mocks.sortableChipElements.length = 0;
    mocks.sortableProps.length = 0;

    const loadedRender = renderProperties("spreadsheet", overrides);

    expect(mocks.sortableProps).toHaveLength(1);
    expect(mocks.sortableProps[0].data.map(({ key }) => key)).toEqual([
      "modulecustomproperty_effort",
      "customproperty_customer-tier",
      "state",
    ]);
    expect(loadedRender.markup).toContain("common.drag_to_rearrange: Effort");
    expect(loadedRender.markup).toContain("common.drag_to_rearrange: Customer tier");
  });

  it("constrains long custom labels while preserving their full accessible text", () => {
    const longLabel = "Customer segment requiring an exceptionally long display property name";
    mocks.params = { moduleId: undefined, projectId: "project-1", workspaceSlug: "workspace-1" };
    mocks.projectDetails = { cycle_view: true, estimate: "estimate-1", module_view: true };
    mocks.projectFields = [{ id: "customer-segment", name: longLabel }];

    renderProperties("spreadsheet");

    const { handleButton, labelButton, tree } = getChipControls(findSortableChip(longLabel));
    expect(tree.props.className).toContain("max-w-full");
    expect(tree.props.className).toContain("min-w-0");
    expect(handleButton?.props.className).toContain("shrink-0");
    expect(labelButton.props.className).toContain("min-w-0");
    expect(labelButton.props.className).toContain("truncate");
    expect(labelButton.props.title).toBe(longLabel);
  });

  it("resolves system, project, and module fields into one Spreadsheet order after fixed ID", () => {
    mocks.params = { moduleId: "module-1", projectId: "project-1", workspaceSlug: "workspace-1" };
    mocks.projectDetails = { cycle_view: true, estimate: "estimate-1", module_view: true };
    mocks.projectFields = [{ id: "customer-tier", name: "Customer tier" }];
    mocks.moduleFields = [{ id: "effort", name: "Effort" }];

    const { markup } = renderProperties("spreadsheet", {
      displayFilters: {
        layout: "spreadsheet",
        spreadsheet: {
          column_order: ["modulecustomproperty_effort", "updated_on", "customproperty_customer-tier"],
        },
      },
      displayPropertiesToRender: ["key", "state", "created_on", "updated_on"],
    });

    expect(mocks.sortableProps[0].data.map(({ key }) => key)).toEqual([
      "modulecustomproperty_effort",
      "updated_on",
      "customproperty_customer-tier",
      "state",
      "created_on",
    ]);
    expect(markup.indexOf("issue.display.properties.id")).toBeLessThan(markup.indexOf("Effort"));
  });

  it("emits the complete Spreadsheet order after a drop, including unchecked fields", () => {
    const { handleDisplayFiltersUpdate } = renderProperties("spreadsheet");
    const sortable = mocks.sortableProps[0];

    sortable.onChange([sortable.data[1], sortable.data[0]]);

    expect(handleDisplayFiltersUpdate).toHaveBeenCalledWith({
      spreadsheet: { column_order: ["priority", "state"] },
    });
  });

  it("uses only the label button to toggle display-property visibility", () => {
    const { handleDisplayFiltersUpdate, handleUpdate } = renderProperties("spreadsheet");
    const stateControls = getChipControls(findSortableChip("common.state"));
    const priorityControls = getChipControls(findSortableChip("common.priority"));

    stateControls.labelButton.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>);
    priorityControls.labelButton.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>);

    expect(handleUpdate).toHaveBeenCalledWith({ state: false });
    expect(handleUpdate).toHaveBeenCalledWith({ priority: true });
    expect(handleUpdate).toHaveBeenCalledTimes(2);
    expect(handleDisplayFiltersUpdate).not.toHaveBeenCalled();

    handleUpdate.mockClear();
    priorityControls.handleButton?.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>);

    expect(priorityControls.handleButton?.props.onClick).toBeUndefined();
    expect(handleUpdate).not.toHaveBeenCalled();
    expect(handleDisplayFiltersUpdate).not.toHaveBeenCalled();
  });

  it("moves complete orders only for actual handle arrow keys and preserves boundaries", () => {
    const { handleDisplayFiltersUpdate } = renderProperties("spreadsheet");
    const stateHandle = getChipControls(findSortableChip("common.state")).handleButton;
    const priorityHandle = getChipControls(findSortableChip("common.priority")).handleButton;
    const unrelatedPreventDefault = vi.fn();
    const leftPreventDefault = vi.fn();
    const rightPreventDefault = vi.fn();
    const leftBoundaryPreventDefault = vi.fn();
    const rightBoundaryPreventDefault = vi.fn();

    priorityHandle?.props.onKeyDown?.({
      key: "Enter",
      preventDefault: unrelatedPreventDefault,
    } as unknown as React.KeyboardEvent<HTMLButtonElement>);
    priorityHandle?.props.onKeyDown?.({
      key: "ArrowLeft",
      preventDefault: leftPreventDefault,
    } as unknown as React.KeyboardEvent<HTMLButtonElement>);
    stateHandle?.props.onKeyDown?.({
      key: "ArrowRight",
      preventDefault: rightPreventDefault,
    } as unknown as React.KeyboardEvent<HTMLButtonElement>);
    stateHandle?.props.onKeyDown?.({
      key: "ArrowLeft",
      preventDefault: leftBoundaryPreventDefault,
    } as unknown as React.KeyboardEvent<HTMLButtonElement>);
    priorityHandle?.props.onKeyDown?.({
      key: "ArrowRight",
      preventDefault: rightBoundaryPreventDefault,
    } as unknown as React.KeyboardEvent<HTMLButtonElement>);

    expect(unrelatedPreventDefault).not.toHaveBeenCalled();
    expect(leftPreventDefault).toHaveBeenCalledOnce();
    expect(rightPreventDefault).toHaveBeenCalledOnce();
    expect(leftBoundaryPreventDefault).toHaveBeenCalledOnce();
    expect(rightBoundaryPreventDefault).toHaveBeenCalledOnce();

    expect(handleDisplayFiltersUpdate).toHaveBeenNthCalledWith(1, {
      spreadsheet: { column_order: ["priority", "state"] },
    });
    expect(handleDisplayFiltersUpdate).toHaveBeenNthCalledWith(2, {
      spreadsheet: { column_order: ["priority", "state"] },
    });
    expect(handleDisplayFiltersUpdate).toHaveBeenCalledTimes(2);
  });
});
