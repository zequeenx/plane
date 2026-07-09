/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import type { TIssueModuleFieldValues } from "@plane/types";

import { getModuleIdsWithFieldValues } from "./module";

describe("getModuleIdsWithFieldValues", () => {
  it("returns removed module ids that have non-empty module field values", () => {
    const moduleFieldValues: TIssueModuleFieldValues = {
      module_with_text: {
        field_1: "ready",
      },
      module_with_member_list: {
        field_2: ["member_1"],
      },
      module_with_date_range: {
        field_3: { start: "2026-07-09", end: null },
      },
      module_with_empty_values: {
        field_4: "",
        field_5: [],
        field_6: { start: null, end: null },
        field_7: null,
      },
    };

    expect(
      getModuleIdsWithFieldValues(moduleFieldValues, [
        "module_with_text",
        "module_with_member_list",
        "module_with_date_range",
        "module_with_empty_values",
        "module_without_values",
      ])
    ).toEqual(["module_with_text", "module_with_member_list", "module_with_date_range"]);
  });
});
