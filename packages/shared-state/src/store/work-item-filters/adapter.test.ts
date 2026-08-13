/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it } from "vitest";

import { FILTER_NODE_TYPE, LOGICAL_OPERATOR, type TWorkItemFilterExpression } from "@plane/types";

import { workItemFiltersAdapter } from "./adapter";

describe("workItemFiltersAdapter", () => {
  it("preserves title contains filters when converting in both directions", () => {
    const externalFilter: TWorkItemFilterExpression = {
      name__icontains: "release notes",
    };

    const internalFilter = workItemFiltersAdapter.toInternal(externalFilter);

    expect(internalFilter).toMatchObject({
      type: FILTER_NODE_TYPE.CONDITION,
      property: "name",
      operator: "icontains",
      value: "release notes",
    });
    expect(internalFilter ? workItemFiltersAdapter.toExternal(internalFilter) : null).toEqual(externalFilter);
  });

  it("preserves module custom property filters when converting to internal conditions", () => {
    const externalFilter: TWorkItemFilterExpression = {
      modulecustomproperty_field_1__contains: "alpha",
    };

    expect(workItemFiltersAdapter.toInternal(externalFilter)).toMatchObject({
      type: FILTER_NODE_TYPE.CONDITION,
      property: "modulecustomproperty_field_1",
      operator: "contains",
      value: "alpha",
    });
  });

  it("preserves module custom property filters when converting grouped conditions to external filters", () => {
    const externalFilter: TWorkItemFilterExpression = {
      [LOGICAL_OPERATOR.AND]: [
        {
          modulecustomproperty_field_1__contains: "alpha",
        },
        {
          modulecustomproperty_field_2__in: "one,two",
        },
      ],
    };

    const internalFilter = workItemFiltersAdapter.toInternal(externalFilter);

    expect(internalFilter).toMatchObject({
      type: FILTER_NODE_TYPE.GROUP,
      logicalOperator: LOGICAL_OPERATOR.AND,
      children: [
        {
          type: FILTER_NODE_TYPE.CONDITION,
          property: "modulecustomproperty_field_1",
          operator: "contains",
          value: "alpha",
        },
        {
          type: FILTER_NODE_TYPE.CONDITION,
          property: "modulecustomproperty_field_2",
          operator: "in",
          value: ["one", "two"],
        },
      ],
    });
    expect(internalFilter ? workItemFiltersAdapter.toExternal(internalFilter) : null).toEqual({
      [LOGICAL_OPERATOR.AND]: [
        {
          modulecustomproperty_field_1__contains: "alpha",
        },
        {
          modulecustomproperty_field_2__in: "one,two",
        },
      ],
    });
  });
});
