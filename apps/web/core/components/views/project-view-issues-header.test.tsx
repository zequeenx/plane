import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectViewIssuesHeader } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/views/(detail)/[viewId]/header";

const mocks = vi.hoisted(() => ({
  activeLayout: "spreadsheet",
  displayFiltersSelectionProps: undefined as { sourceModuleId?: string | null } | undefined,
}));

function MockWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

vi.mock("mobx-react", () => ({ observer: (component: unknown) => component }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "project-1", viewId: "view-1", workspaceSlug: "workspace-1" }),
}));

vi.mock("@plane/propel/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock("@plane/propel/icons", () => ({
  LockIcon: () => null,
  ViewsIcon: () => null,
}));

vi.mock("@plane/propel/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@plane/ui", () => {
  const Breadcrumbs = Object.assign(MockWrapper, { Icon: MockWrapper, Item: MockWrapper });
  const Header = Object.assign(MockWrapper, { LeftItem: MockWrapper, RightItem: MockWrapper });

  return {
    BreadcrumbNavigationSearchDropdown: () => null,
    Breadcrumbs,
    Header,
  };
});

vi.mock("@/components/common/breadcrumb-link", () => ({ BreadcrumbLink: () => null }));
vi.mock("@/components/common/switcher-label", () => ({
  SwitcherIcon: () => null,
  SwitcherLabel: () => null,
}));
vi.mock("@/components/issues/issue-layouts/filters", () => ({
  DisplayFiltersSelection: (props: { sourceModuleId?: string | null }) => {
    mocks.displayFiltersSelectionProps = props;
    return null;
  },
  FiltersDropdown: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LayoutSelection: () => null,
}));
vi.mock("@/components/views/quick-actions", () => ({ ViewQuickActions: () => null }));
vi.mock("@/components/work-item-filters/filters-toggle", () => ({ WorkItemFiltersToggle: () => null }));
vi.mock("@/hooks/store/use-command-palette", () => ({
  useCommandPalette: () => ({ toggleCreateIssueModal: vi.fn() }),
}));
vi.mock("@/hooks/store/use-issues", () => ({
  useIssues: () => ({
    issuesFilter: {
      issueFilters: { displayFilters: { layout: mocks.activeLayout }, displayProperties: {} },
      updateFilters: vi.fn(),
    },
  }),
}));
vi.mock("@/hooks/store/use-project", () => ({
  useProject: () => ({ currentProjectDetails: {}, loader: undefined }),
}));
vi.mock("@/hooks/store/use-project-view", () => ({
  useProjectView: () => ({
    getViewById: () => ({
      access: "PUBLIC",
      id: "view-1",
      is_locked: false,
      logo_props: {},
      name: "Source module view",
      source_module: "module-1",
    }),
    projectViewIds: ["view-1"],
  }),
}));
vi.mock("@/hooks/store/user", () => ({
  useUserPermissions: () => ({ allowPermissions: () => false }),
}));
vi.mock("@/hooks/use-app-router", () => ({ useAppRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/plane-web/components/breadcrumbs/common", () => ({ CommonProjectBreadcrumbs: () => null }));

describe("ProjectViewIssuesHeader", () => {
  beforeEach(() => {
    mocks.activeLayout = "spreadsheet";
    mocks.displayFiltersSelectionProps = undefined;
  });

  it("passes the view source module to Spreadsheet display properties", () => {
    renderToStaticMarkup(<ProjectViewIssuesHeader />);

    expect(mocks.displayFiltersSelectionProps?.sourceModuleId).toBe("module-1");
  });

  it.each(["list", "kanban"])("does not pass the view source module to %s display properties", (layout) => {
    mocks.activeLayout = layout;

    renderToStaticMarkup(<ProjectViewIssuesHeader />);

    expect(mocks.displayFiltersSelectionProps?.sourceModuleId).toBeUndefined();
  });
});
