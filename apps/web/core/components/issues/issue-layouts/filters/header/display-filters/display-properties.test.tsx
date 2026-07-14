import React from "react";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilterDisplayProperties } from "./display-properties";

type TDisplayPropertyOption = {
  key: keyof IIssueDisplayProperties;
  label: string;
};

type TDisplayPropertyChipProps = {
  dragHandleRef?: React.RefCallback<HTMLButtonElement>;
  isEnabled: boolean;
  isSortable: boolean;
  label: string;
  onMove: (offset: -1 | 1) => void;
  onToggle: () => void;
};

type TSortableProps = {
  data: TDisplayPropertyOption[];
  id?: string;
  keyExtractor: (item: TDisplayPropertyOption, index: number) => string;
  onChange: (data: TDisplayPropertyOption[]) => void;
  orientation?: "horizontal" | "vertical";
  render: (
    item: TDisplayPropertyOption,
    index: number,
    helpers: { dragHandleRef: React.RefCallback<HTMLButtonElement> }
  ) => React.ReactNode;
};

const mocks = vi.hoisted(() => ({
  chipProps: [] as TDisplayPropertyChipProps[],
  moduleFields: undefined as { id: string; name: string }[] | undefined,
  params: {
    moduleId: undefined as string | undefined,
    projectId: undefined as string | undefined,
    workspaceSlug: undefined as string | undefined,
  },
  projectFields: undefined as { id: string; name: string }[] | undefined,
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

vi.mock("@plane/ui", () => ({
  Sortable: (props: TSortableProps) => {
    mocks.sortableProps.push(props);
    return (
      <>
        {props.data.map((item, index) => (
          <React.Fragment key={item.key}>{props.render(item, index, { dragHandleRef: vi.fn() })}</React.Fragment>
        ))}
      </>
    );
  },
}));

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

vi.mock("../helpers/filter-header", () => ({
  FilterHeader: () => null,
}));

vi.mock("./display-property-chip", () => ({
  DisplayPropertyChip: (props: TDisplayPropertyChipProps) => {
    mocks.chipProps.push(props);
    return <span>{props.label}</span>;
  },
}));

const renderProperties = (
  layout: IIssueDisplayFilterOptions["layout"],
  overrides: Partial<React.ComponentProps<typeof FilterDisplayProperties>> = {}
) => {
  const handleDisplayFiltersUpdate = vi.fn();
  const handleUpdate = vi.fn();

  renderToStaticMarkup(
    <FilterDisplayProperties
      displayFilters={{ layout }}
      displayProperties={{ key: true, priority: false, state: true }}
      displayPropertiesToRender={["key", "state", "priority"]}
      handleDisplayFiltersUpdate={handleDisplayFiltersUpdate}
      handleUpdate={handleUpdate}
      {...overrides}
    />
  );

  return { handleDisplayFiltersUpdate, handleUpdate };
};

describe("FilterDisplayProperties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chipProps.length = 0;
    mocks.sortableProps.length = 0;
    mocks.params = { moduleId: undefined, projectId: undefined, workspaceSlug: undefined };
    mocks.projectFields = undefined;
    mocks.moduleFields = undefined;
  });

  it("renders sortable Spreadsheet handles for enabled and disabled fields while keeping ID fixed", () => {
    renderProperties("spreadsheet");

    expect(mocks.sortableProps).toHaveLength(1);
    expect(mocks.sortableProps[0]).toMatchObject({
      id: "table-display-properties",
      orientation: "horizontal",
    });
    expect(mocks.chipProps.map(({ isEnabled, isSortable, label }) => ({ isEnabled, isSortable, label }))).toEqual([
      { isEnabled: true, isSortable: false, label: "issue.display.properties.id" },
      { isEnabled: true, isSortable: true, label: "common.state" },
      { isEnabled: false, isSortable: true, label: "common.priority" },
    ]);
  });

  it("does not render sortable handles outside Spreadsheet layout", () => {
    renderProperties("list");

    expect(mocks.sortableProps).toHaveLength(0);
    expect(mocks.chipProps).toHaveLength(3);
    expect(mocks.chipProps.every((props) => !props.isSortable && props.dragHandleRef === undefined)).toBe(true);
  });

  it("resolves system, project, and module fields into one Spreadsheet order after fixed ID", () => {
    mocks.params = { moduleId: "module-1", projectId: "project-1", workspaceSlug: "workspace-1" };
    mocks.projectFields = [{ id: "customer-tier", name: "Customer tier" }];
    mocks.moduleFields = [{ id: "effort", name: "Effort" }];

    renderProperties("spreadsheet", {
      displayFilters: {
        layout: "spreadsheet",
        spreadsheet: {
          column_order: ["modulecustomproperty_effort", "updated_on", "customproperty_customer-tier"],
        },
      },
      displayPropertiesToRender: ["key", "state", "created_on", "updated_on"],
    });

    expect(mocks.chipProps.map(({ label }) => label)).toEqual([
      "issue.display.properties.id",
      "Effort",
      "common.updated_on",
      "Customer tier",
      "common.state",
      "common.created_on",
    ]);
    expect(mocks.sortableProps[0].data.map(({ key }) => key)).toEqual([
      "modulecustomproperty_effort",
      "updated_on",
      "customproperty_customer-tier",
      "state",
      "created_on",
    ]);
  });

  it("emits the complete Spreadsheet order after a drop, including unchecked fields", () => {
    const { handleDisplayFiltersUpdate } = renderProperties("spreadsheet");
    const sortable = mocks.sortableProps[0];

    sortable.onChange([sortable.data[1], sortable.data[0]]);

    expect(handleDisplayFiltersUpdate).toHaveBeenCalledWith({
      spreadsheet: { column_order: ["priority", "state"] },
    });
  });

  it("toggles a chip through only the display-properties update handler", () => {
    const { handleDisplayFiltersUpdate, handleUpdate } = renderProperties("spreadsheet");
    const priorityChip = mocks.chipProps.find(({ label }) => label === "common.priority");

    priorityChip?.onToggle();

    expect(handleUpdate).toHaveBeenCalledWith({ priority: true });
    expect(handleDisplayFiltersUpdate).not.toHaveBeenCalled();
  });

  it("emits complete orders for keyboard moves and preserves the order at a boundary", () => {
    const { handleDisplayFiltersUpdate } = renderProperties("spreadsheet");
    const stateChip = mocks.chipProps.find(({ label }) => label === "common.state");
    const priorityChip = mocks.chipProps.find(({ label }) => label === "common.priority");

    priorityChip?.onMove(-1);
    stateChip?.onMove(-1);

    expect(handleDisplayFiltersUpdate).toHaveBeenNthCalledWith(1, {
      spreadsheet: { column_order: ["priority", "state"] },
    });
    expect(handleDisplayFiltersUpdate).toHaveBeenNthCalledWith(2, {
      spreadsheet: { column_order: ["state", "priority"] },
    });
  });
});
