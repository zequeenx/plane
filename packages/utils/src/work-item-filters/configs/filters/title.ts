/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { IFilterIconConfig, TCreateFilterConfig, TCreateFilterConfigParams } from "../../../rich-filters";
import { createFilterConfig, createOperatorConfigEntry, getTextInputConfig } from "../../../rich-filters";
import type { TFilterProperty } from "@plane/types";
import { COMPARISON_OPERATOR } from "@plane/types";

export type TCreateTitleFilterParams = TCreateFilterConfigParams & IFilterIconConfig;

export const getTitleFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateTitleFilterParams> =>
  (params: TCreateTitleFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "Title",
      ...params,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COMPARISON_OPERATOR.ICONTAINS, params, (updatedParams) =>
          getTextInputConfig({ ...updatedParams, placeholder: "Enter title text" })
        ),
      ]),
    });
