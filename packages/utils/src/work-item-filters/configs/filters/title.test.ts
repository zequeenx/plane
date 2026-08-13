/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { COMPARISON_OPERATOR, FILTER_FIELD_TYPE } from "@plane/types";

import { getTitleFilterConfig } from "./title";

describe("getTitleFilterConfig", () => {
  it("builds a title text filter with case-insensitive contains matching", () => {
    const config = getTitleFilterConfig("name")({
      allowedOperators: new Set([COMPARISON_OPERATOR.ICONTAINS]),
      allowNegative: false,
      isEnabled: true,
    });

    expect(config.label).toBe("Title");
    expect([...config.supportedOperatorConfigsMap.keys()]).toEqual([COMPARISON_OPERATOR.ICONTAINS]);
    expect(config.supportedOperatorConfigsMap.get(COMPARISON_OPERATOR.ICONTAINS)).toMatchObject({
      placeholder: "Enter title text",
      type: FILTER_FIELD_TYPE.TEXT,
    });
  });
});
