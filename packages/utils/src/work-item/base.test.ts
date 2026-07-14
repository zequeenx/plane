/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";

import { getComputedDisplayFilters, getComputedDisplayProperties } from "./base";

describe("getComputedDisplayFilters", () => {
  it("preserves spreadsheet column order", () => {
    const displayFilters: IIssueDisplayFilterOptions = {
      layout: "spreadsheet",
      spreadsheet: {
        column_order: ["priority", "customproperty_customer-tier", "assignee"],
      },
    };

    expect(getComputedDisplayFilters(displayFilters)).toEqual(
      expect.objectContaining({
        layout: "spreadsheet",
        spreadsheet: {
          column_order: ["priority", "customproperty_customer-tier", "assignee"],
        },
      })
    );
  });

  it("preserves an empty spreadsheet column order", () => {
    expect(
      getComputedDisplayFilters({
        spreadsheet: {
          column_order: [],
        },
      }).spreadsheet
    ).toEqual({ column_order: [] });
  });

  it("drops malformed spreadsheet column order", () => {
    const displayFilters = {
      spreadsheet: {
        column_order: "priority",
      },
    } as unknown as IIssueDisplayFilterOptions;

    expect(getComputedDisplayFilters(displayFilters)).not.toHaveProperty("spreadsheet");
  });
});

describe("getComputedDisplayProperties", () => {
  it("preserves persisted custom display property keys and drops unknown keys", () => {
    const displayProperties = {
      assignee: false,
      customproperty_field_1: true,
      customproperty_field_2: false,
      modulecustomproperty_field_3: true,
      modulecustomproperty_field_4: false,
      unknown_property: true,
    } as IIssueDisplayProperties & { unknown_property: boolean };

    expect(getComputedDisplayProperties(displayProperties)).toEqual(
      expect.objectContaining({
        assignee: false,
        customproperty_field_1: true,
        customproperty_field_2: false,
        modulecustomproperty_field_3: true,
        modulecustomproperty_field_4: false,
      })
    );
    expect(getComputedDisplayProperties(displayProperties)).not.toHaveProperty("unknown_property");
  });
});
