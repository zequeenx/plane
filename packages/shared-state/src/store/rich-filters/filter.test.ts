/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";

import type { TWorkItemFilterExpression, TWorkItemFilterProperty } from "@plane/types";

import { workItemFiltersAdapter } from "../work-item-filters/adapter";
import { FilterInstance } from "./filter";

type TCreateFilterOptions = {
  hasAdditionalChanges?: boolean;
  initialExpression?: TWorkItemFilterExpression;
  isDisabled?: boolean;
  onViewSave?: (expression: TWorkItemFilterExpression) => void | Promise<void>;
};

const createFilter = ({
  hasAdditionalChanges,
  initialExpression = {},
  isDisabled = false,
  onViewSave = vi.fn(),
}: TCreateFilterOptions = {}) =>
  new FilterInstance<TWorkItemFilterProperty, TWorkItemFilterExpression>({
    adapter: workItemFiltersAdapter,
    initialExpression,
    options: {
      expression: {
        saveViewOptions: {
          hasAdditionalChanges,
          isDisabled,
          onViewSave,
        },
      },
    },
  });

describe("FilterInstance.canSaveView", () => {
  it("allows an additional display change without an active rich filter", () => {
    const filter = createFilter({ hasAdditionalChanges: true });

    expect(filter.hasActiveFilters).toBe(false);
    expect(filter.canSaveView).toBe(true);
    expect(filter.isVisible).toBe(true);
  });

  it("keeps the old behavior when the additional flag is absent", () => {
    const filter = createFilter();

    expect(filter.canSaveView).toBe(false);
    expect(filter.isVisible).toBe(false);
  });

  it("does not allow a disabled Save option", () => {
    const filter = createFilter({ hasAdditionalChanges: true, isDisabled: true });

    expect(filter.canSaveView).toBe(false);
    expect(filter.isVisible).toBe(false);
  });

  it("keeps Save available for an active rich filter", () => {
    const filter = createFilter({ initialExpression: { state_id__in: "state-id" } });

    expect(filter.hasActiveFilters).toBe(true);
    expect(filter.canSaveView).toBe(true);
    expect(filter.isVisible).toBe(true);
  });

  it("reveals an existing hidden row when an additional change appears", () => {
    const filter = createFilter({ hasAdditionalChanges: false });
    expect(filter.isVisible).toBe(false);

    filter.updateExpressionOptions({
      saveViewOptions: {
        hasAdditionalChanges: true,
        isDisabled: false,
        onViewSave: vi.fn(),
      },
    });

    expect(filter.canSaveView).toBe(true);
    expect(filter.isVisible).toBe(true);
  });

  it("invokes the Save callback for an additional-only change", async () => {
    const onViewSave = vi.fn();
    const filter = createFilter({ hasAdditionalChanges: true, onViewSave });

    await filter.saveView();

    expect(onViewSave).toHaveBeenCalledOnce();
    expect(onViewSave).toHaveBeenCalledWith({});
  });
});

describe("FilterInstance view option visibility", () => {
  it("is initially visible when Update is available", () => {
    const filter = new FilterInstance<TWorkItemFilterProperty, TWorkItemFilterExpression>({
      adapter: workItemFiltersAdapter,
      initialExpression: {},
      options: {
        expression: {
          updateViewOptions: {
            hasAdditionalChanges: true,
            onViewUpdate: vi.fn(),
          },
        },
      },
    });

    expect(filter.canUpdateView).toBe(true);
    expect(filter.isVisible).toBe(true);
  });

  it("reveals an existing hidden row when Update becomes available", () => {
    const filter = createFilter();
    expect(filter.isVisible).toBe(false);

    filter.updateExpressionOptions({
      updateViewOptions: {
        hasAdditionalChanges: true,
        onViewUpdate: vi.fn(),
      },
    });

    expect(filter.canUpdateView).toBe(true);
    expect(filter.isVisible).toBe(true);
  });
});
