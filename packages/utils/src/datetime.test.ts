/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import {
  formatDateRange,
  renderFormattedDate,
  renderFormattedDateWithoutYear,
  renderFormattedPayloadDate,
} from "./datetime";

describe("datetime display formatting", () => {
  it("formats full display dates as unpadded year.month.day", () => {
    expect(renderFormattedDate("2026-06-01")).toBe("2026.6.1");
  });

  it("formats short display dates as unpadded month.day", () => {
    expect(renderFormattedDateWithoutYear("2026-06-01")).toBe("6.1");
  });

  it("formats display date ranges with complete numeric endpoints", () => {
    const startDate = new Date(2025, 0, 24);
    const endDate = new Date(2025, 1, 6);

    expect(formatDateRange(startDate, endDate)).toBe("2025.1.24 - 2025.2.6");
  });

  it("keeps payload dates in ISO date format", () => {
    expect(renderFormattedPayloadDate("2026-06-01")).toBe("2026-06-01");
  });
});
