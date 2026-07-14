/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";

import {
  hasExplicitSpreadsheetColumnOrder,
  hasSpreadsheetColumnOrderChanged,
  moveSpreadsheetColumn,
  resolveSpreadsheetColumnOrder,
} from "./spreadsheet-column-order";

type TColumn = keyof IIssueDisplayProperties;

describe("resolveSpreadsheetColumnOrder", () => {
  it("uses available order when no saved order exists", () => {
    const availableOrder: TColumn[] = ["state", "priority", "assignee"];

    expect(resolveSpreadsheetColumnOrder(undefined, availableOrder)).toEqual(["state", "priority", "assignee"]);
  });

  it("keeps saved available columns first and appends missing available columns", () => {
    const savedOrder: TColumn[] = ["priority", "state"];
    const availableOrder: TColumn[] = ["state", "assignee", "priority", "labels"];

    expect(resolveSpreadsheetColumnOrder(savedOrder, availableOrder)).toEqual([
      "priority",
      "state",
      "assignee",
      "labels",
    ]);
  });

  it("excludes key, removes duplicates, and discards unavailable saved columns", () => {
    const savedOrder: TColumn[] = ["key", "priority", "due_date", "priority", "assignee"];
    const availableOrder: TColumn[] = ["key", "assignee", "priority", "assignee"];

    expect(resolveSpreadsheetColumnOrder(savedOrder, availableOrder)).toEqual(["priority", "assignee"]);
  });

  it("retains project and module custom property columns", () => {
    const projectCustomProperty: TColumn = "customproperty_customer-tier";
    const moduleCustomProperty: TColumn = "modulecustomproperty_effort";
    const availableOrder: TColumn[] = [projectCustomProperty, "state", moduleCustomProperty];

    expect(resolveSpreadsheetColumnOrder([moduleCustomProperty, projectCustomProperty], availableOrder)).toEqual([
      moduleCustomProperty,
      projectCustomProperty,
      "state",
    ]);
  });

  it("does not mutate either input order", () => {
    const savedOrder: TColumn[] = ["priority", "state"];
    const availableOrder: TColumn[] = ["state", "priority", "assignee"];

    resolveSpreadsheetColumnOrder(savedOrder, availableOrder);

    expect(savedOrder).toEqual(["priority", "state"]);
    expect(availableOrder).toEqual(["state", "priority", "assignee"]);
  });
});

describe("moveSpreadsheetColumn", () => {
  it("moves a column one position in either direction without mutating the input", () => {
    const order: TColumn[] = ["state", "priority", "assignee"];

    expect(moveSpreadsheetColumn(order, "priority", -1)).toEqual(["priority", "state", "assignee"]);
    expect(moveSpreadsheetColumn(order, "priority", 1)).toEqual(["state", "assignee", "priority"]);
    expect(order).toEqual(["state", "priority", "assignee"]);
  });

  it("returns an equal copy when the column is missing or at the requested boundary", () => {
    const order: TColumn[] = ["state", "priority"];
    const missingResult = moveSpreadsheetColumn(order, "assignee", 1);
    const boundaryResult = moveSpreadsheetColumn(order, "state", -1);

    expect(missingResult).toEqual(order);
    expect(missingResult).not.toBe(order);
    expect(boundaryResult).toEqual(order);
    expect(boundaryResult).not.toBe(order);
  });
});

describe("hasExplicitSpreadsheetColumnOrder", () => {
  it("returns true only for a non-empty spreadsheet column order", () => {
    const explicitFilters: IIssueDisplayFilterOptions = { spreadsheet: { column_order: ["priority"] } };

    expect(hasExplicitSpreadsheetColumnOrder(explicitFilters)).toBe(true);
    expect(hasExplicitSpreadsheetColumnOrder({ spreadsheet: { column_order: [] } })).toBe(false);
    expect(hasExplicitSpreadsheetColumnOrder({ spreadsheet: {} })).toBe(false);
    expect(hasExplicitSpreadsheetColumnOrder(undefined)).toBe(false);
    expect(
      hasExplicitSpreadsheetColumnOrder({
        spreadsheet: { column_order: "priority" },
      } as unknown as IIssueDisplayFilterOptions)
    ).toBe(false);
  });
});

describe("hasSpreadsheetColumnOrderChanged", () => {
  it("compares column orders by position", () => {
    expect(hasSpreadsheetColumnOrderChanged(["state", "priority"], ["state", "priority"])).toBe(false);
    expect(hasSpreadsheetColumnOrderChanged(["priority", "state"], ["state", "priority"])).toBe(true);
    expect(hasSpreadsheetColumnOrderChanged(["state"], ["state", "priority"])).toBe(true);
  });

  it("treats a missing order as an empty order", () => {
    expect(hasSpreadsheetColumnOrderChanged(undefined, undefined)).toBe(false);
    expect(hasSpreadsheetColumnOrderChanged([], undefined)).toBe(false);
    expect(hasSpreadsheetColumnOrderChanged(undefined, [])).toBe(false);
    expect(hasSpreadsheetColumnOrderChanged(["state"], undefined)).toBe(true);
  });
});
