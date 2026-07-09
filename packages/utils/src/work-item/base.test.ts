/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import type { IIssueDisplayProperties } from "@plane/types";

import { getComputedDisplayProperties } from "./base";

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
