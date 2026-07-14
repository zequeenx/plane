/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { resolveSpreadsheetColumnOrder } from "@plane/utils";

import {
  getAvailableSpreadsheetColumns,
  getIsSpreadsheetEstimateEnabled,
  getVisibleSpreadsheetColumns,
} from "./column-order";

describe("getIsSpreadsheetEstimateEnabled", () => {
  it("disables estimates at project level while project details are unavailable", () => {
    expect(getIsSpreadsheetEstimateEnabled(false, undefined)).toBe(false);
  });

  it("disables estimates at project level when no estimate configuration exists", () => {
    expect(getIsSpreadsheetEstimateEnabled(false, null)).toBe(false);
  });

  it("enables estimates at project level when estimate configuration exists", () => {
    expect(getIsSpreadsheetEstimateEnabled(false, "estimate-id")).toBe(true);
  });

  it("enables estimates at workspace level without project details", () => {
    expect(getIsSpreadsheetEstimateEnabled(true, undefined)).toBe(true);
  });
});

describe("getAvailableSpreadsheetColumns", () => {
  it("filters disabled capabilities and appends project and module fields", () => {
    const result = getAvailableSpreadsheetColumns({
      cycleViewEnabled: false,
      estimateEnabled: false,
      moduleViewEnabled: true,
      projectFieldIds: ["customer-tier"],
      moduleFieldIds: ["release-train"],
      workspaceLevel: false,
    });

    expect(result).not.toContain("cycle");
    expect(result).not.toContain("estimate");
    expect(result).toContain("modules");
    expect(result.slice(-2)).toEqual(["customproperty_customer-tier", "modulecustomproperty_release-train"]);
  });

  it("starts with the fixed system order and excludes the combined ID column", () => {
    const result = getAvailableSpreadsheetColumns({
      cycleViewEnabled: true,
      estimateEnabled: true,
      moduleViewEnabled: true,
      projectFieldIds: [],
      moduleFieldIds: [],
      workspaceLevel: false,
    });

    expect(result).toEqual([
      "state",
      "sub_state",
      "priority",
      "assignee",
      "labels",
      "modules",
      "cycle",
      "start_date",
      "due_date",
      "estimate",
      "created_on",
      "updated_on",
      "link",
      "attachment_count",
      "sub_issue_count",
    ]);
    expect(result).not.toContain("key");
  });

  it("filters every disabled project capability", () => {
    const result = getAvailableSpreadsheetColumns({
      cycleViewEnabled: false,
      estimateEnabled: false,
      moduleViewEnabled: false,
      projectFieldIds: [],
      moduleFieldIds: [],
      workspaceLevel: false,
    });

    expect(result).not.toContain("cycle");
    expect(result).not.toContain("estimate");
    expect(result).not.toContain("modules");
  });

  it("uses system columns only at workspace level", () => {
    const result = getAvailableSpreadsheetColumns({
      cycleViewEnabled: true,
      estimateEnabled: true,
      moduleViewEnabled: true,
      projectFieldIds: ["ignored-project-field"],
      moduleFieldIds: ["ignored-module-field"],
      workspaceLevel: true,
    });

    expect(result).toContain("cycle");
    expect(result).toContain("estimate");
    expect(result).toContain("modules");
    expect(result).not.toContain("customproperty_ignored-project-field");
    expect(result).not.toContain("modulecustomproperty_ignored-module-field");
  });

  it("does not mutate field ID inputs", () => {
    const projectFieldIds = ["customer-tier"];
    const moduleFieldIds = ["release-train"];

    getAvailableSpreadsheetColumns({
      cycleViewEnabled: true,
      estimateEnabled: true,
      moduleViewEnabled: true,
      projectFieldIds,
      moduleFieldIds,
      workspaceLevel: false,
    });

    expect(projectFieldIds).toEqual(["customer-tier"]);
    expect(moduleFieldIds).toEqual(["release-train"]);
  });
});

describe("getVisibleSpreadsheetColumns", () => {
  it("applies the saved order and filters unchecked columns", () => {
    const availableColumns = ["state", "priority", "assignee"] as const;

    expect(
      getVisibleSpreadsheetColumns({
        availableColumns,
        displayProperties: { assignee: false, priority: true, state: true },
        savedOrder: ["priority", "assignee", "state"],
      })
    ).toEqual(["priority", "state"]);
  });

  it("keeps hidden fields in available metadata while omitting them from rendered columns", () => {
    const availableColumns = getAvailableSpreadsheetColumns({
      cycleViewEnabled: true,
      estimateEnabled: true,
      moduleViewEnabled: true,
      projectFieldIds: ["hidden-field", "new-project-field"],
      moduleFieldIds: ["hidden-module-field", "new-module-field"],
      workspaceLevel: false,
    });
    const savedOrder = [
      "customproperty_deleted-field",
      "priority",
      "customproperty_hidden-field",
      "modulecustomproperty_hidden-module-field",
      "state",
      "modulecustomproperty_deleted-field",
    ] as const;
    const displayProperties = {
      priority: true,
      state: true,
      "customproperty_hidden-field": false,
      "customproperty_new-project-field": true,
      "modulecustomproperty_hidden-module-field": false,
      "modulecustomproperty_new-module-field": true,
    } as const;

    const resolvedColumns = resolveSpreadsheetColumnOrder(savedOrder, availableColumns);
    const visibleColumns = getVisibleSpreadsheetColumns({ availableColumns, displayProperties, savedOrder });

    expect(availableColumns).toContain("customproperty_hidden-field");
    expect(availableColumns).toContain("modulecustomproperty_hidden-module-field");
    expect(resolvedColumns).toContain("customproperty_hidden-field");
    expect(resolvedColumns).toContain("modulecustomproperty_hidden-module-field");
    expect(resolvedColumns).not.toContain("customproperty_deleted-field");
    expect(resolvedColumns).not.toContain("modulecustomproperty_deleted-field");
    expect(visibleColumns).toEqual([
      "priority",
      "state",
      "customproperty_new-project-field",
      "modulecustomproperty_new-module-field",
    ]);
  });

  it("reconciles saved order when custom field metadata arrives later", () => {
    const savedOrder = ["customproperty_late-project-field", "state"] as const;
    const displayProperties = {
      state: true,
      "customproperty_late-project-field": true,
      "modulecustomproperty_late-module-field": true,
    } as const;
    const sharedOptions = {
      cycleViewEnabled: false,
      estimateEnabled: false,
      moduleViewEnabled: false,
      workspaceLevel: false,
    } as const;
    const loadingColumns = getAvailableSpreadsheetColumns({
      ...sharedOptions,
      projectFieldIds: [],
      moduleFieldIds: [],
    });
    const loadedColumns = getAvailableSpreadsheetColumns({
      ...sharedOptions,
      projectFieldIds: ["late-project-field"],
      moduleFieldIds: ["late-module-field"],
    });

    expect(getVisibleSpreadsheetColumns({ availableColumns: loadingColumns, displayProperties, savedOrder })).toEqual([
      "state",
    ]);
    expect(getVisibleSpreadsheetColumns({ availableColumns: loadedColumns, displayProperties, savedOrder })).toEqual([
      "customproperty_late-project-field",
      "state",
      "modulecustomproperty_late-module-field",
    ]);
    expect(savedOrder).toEqual(["customproperty_late-project-field", "state"]);
  });

  it("does not mutate saved, available, or visibility inputs", () => {
    const availableColumns = ["state", "priority", "customproperty_customer-tier"] as const;
    const savedOrder = ["priority", "customproperty_customer-tier"] as const;
    const displayProperties = { priority: true, state: false, "customproperty_customer-tier": true } as const;

    getVisibleSpreadsheetColumns({ availableColumns, displayProperties, savedOrder });

    expect(availableColumns).toEqual(["state", "priority", "customproperty_customer-tier"]);
    expect(savedOrder).toEqual(["priority", "customproperty_customer-tier"]);
    expect(displayProperties).toEqual({
      priority: true,
      state: false,
      "customproperty_customer-tier": true,
    });
  });
});
