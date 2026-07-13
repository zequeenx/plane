import type { IIssueDisplayProperties, TIssue } from "@plane/types";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SpreadsheetCustomFieldCell } from "./custom-field-cell";
import { IssueColumn } from "./issue-column";

const issueFieldMocks = vi.hoisted(() => ({
  getModuleFieldById: vi.fn(),
  getProjectFieldById: vi.fn(),
  updateModuleIssueValues: vi.fn(),
  updateProjectIssueValues: vi.fn(),
}));

vi.mock("mobx-react", () => ({
  observer: (component: unknown) => component,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceSlug: "workspace-1" }),
}));

vi.mock("@plane/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@plane/propel/toast", () => ({
  setToast: vi.fn(),
  TOAST_TYPE: { ERROR: "error" },
}));

vi.mock("@/components/project-fields/value-editors/root", () => ({
  ProjectFieldValueEditor: ({ field }: { field: { id: string } }) => `editor:${field.id}`,
}));

vi.mock("@/helpers/issue-filter.helper", () => ({
  shouldRenderColumn: () => true,
}));

vi.mock("@/hooks/store/use-module-issue-fields", () => ({
  useModuleIssueFields: () => ({
    getFieldById: issueFieldMocks.getModuleFieldById,
    updateIssueValues: issueFieldMocks.updateModuleIssueValues,
  }),
}));

vi.mock("@/hooks/store/use-project-issue-fields", () => ({
  useProjectIssueFields: () => ({
    getFieldById: issueFieldMocks.getProjectFieldById,
    updateIssueValues: issueFieldMocks.updateProjectIssueValues,
  }),
}));

vi.mock("@/plane-web/components/issues/issue-layouts/utils", () => ({
  SPREADSHEET_COLUMNS: {},
}));

vi.mock("../properties/with-display-properties-HOC", () => ({
  WithDisplayPropertiesHOC: ({ children }: { children: React.ReactNode }) => children,
}));

const issueDetail: TIssue = {
  archived_at: null,
  assignee_ids: [],
  attachment_count: 0,
  completed_at: null,
  created_at: "2026-07-13T00:00:00Z",
  created_by: "member-1",
  cycle_id: null,
  estimate_point: null,
  field_values: { "project-field": "option-a" },
  id: "issue-1",
  is_draft: false,
  label_ids: [],
  link_count: 0,
  module_field_values: { "module-1": { "module-field": "option-b" } },
  module_ids: ["module-1"],
  name: "Custom field work item",
  parent_id: null,
  priority: "none",
  project_id: "project-1",
  sequence_id: 1,
  sort_order: 100,
  start_date: null,
  state_id: "state-1",
  sub_issues_count: 0,
  sub_state_id: null,
  target_date: null,
  type_id: null,
  updated_at: "2026-07-13T00:00:00Z",
  updated_by: "member-1",
};

const renderIssueColumn = (property: keyof IIssueDisplayProperties, sourceModuleId?: string) =>
  renderToStaticMarkup(
    <IssueColumn
      disableUserActions={false}
      displayProperties={{ [property]: true } as IIssueDisplayProperties}
      isEstimateEnabled={false}
      issueDetail={issueDetail}
      property={property}
      sourceModuleId={sourceModuleId}
      updateIssue={undefined}
    />
  );

const customFieldWrapperMarkup = (fieldId: string) =>
  `<div class="flex h-full w-full items-center border-b-[0.5px] border-subtle px-2">editor:${fieldId}</div>`;

describe("SpreadsheetCustomFieldCell", () => {
  it("renders the spreadsheet layout with a subtle bottom separator", () => {
    const markup = renderToStaticMarkup(<SpreadsheetCustomFieldCell>Custom field</SpreadsheetCustomFieldCell>);

    expect(markup).toContain("flex h-full w-full items-center");
    expect(markup).toContain("border-b-[0.5px]");
    expect(markup).toContain("border-subtle");
    expect(markup).toContain("px-2");
  });
});

describe("IssueColumn custom field cells", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    issueFieldMocks.getModuleFieldById.mockReturnValue(undefined);
    issueFieldMocks.getProjectFieldById.mockReturnValue(undefined);
  });

  it("renders a project custom field editor inside the separator wrapper", () => {
    issueFieldMocks.getProjectFieldById.mockReturnValue({ id: "project-field", project: "project-1" });

    const markup = renderIssueColumn("customproperty_project-field");

    expect(issueFieldMocks.getProjectFieldById).toHaveBeenCalledWith("project-1", "project-field");
    expect(markup).toContain(customFieldWrapperMarkup("project-field"));
  });

  it("renders a module custom field editor inside the separator wrapper", () => {
    issueFieldMocks.getModuleFieldById.mockReturnValue({ id: "module-field", project: "project-1" });

    const markup = renderIssueColumn("modulecustomproperty_module-field", "module-1");

    expect(issueFieldMocks.getModuleFieldById).toHaveBeenCalledWith("module-1", "module-field");
    expect(markup).toContain(customFieldWrapperMarkup("module-field"));
  });
});
