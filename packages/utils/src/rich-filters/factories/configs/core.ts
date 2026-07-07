/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type {
  TBaseFilterFieldConfig,
  TDateFilterFieldConfig,
  TDateRangeFilterFieldConfig,
  TFilterValue,
  TMultiSelectFilterFieldConfig,
  TNoValueFilterFieldConfig,
  TSingleSelectFilterFieldConfig,
  TSupportedOperators,
  TTextFilterFieldConfig,
} from "@plane/types";
import { FILTER_FIELD_TYPE } from "@plane/types";
// local imports
import type { IFilterIconConfig } from "./shared";
import { createFilterFieldConfig } from "./shared";

// ------------ Selection filters ------------

/**
 * Options transformation interface for selection filters
 */
export interface TOptionTransforms<TItem, TValue extends TFilterValue = string, TIconData = undefined> {
  items: TItem[];
  getId: (item: TItem) => string;
  getLabel: (item: TItem) => string;
  getValue: (item: TItem) => TValue;
  getIconData?: (item: TItem) => TIconData;
}

/**
 * Single-select filter configuration
 */
export type TSingleSelectConfig<TValue extends TFilterValue = string> = TBaseFilterFieldConfig & {
  defaultValue?: TValue;
};

/**
 * Helper to get the single select config
 * @param transforms - How to transform items into options
 * @param config - Single-select specific configuration
 * @param iconConfig - Icon configuration for options
 * @returns The single select config
 */
export const getSingleSelectConfig = <
  TItem,
  TValue extends TFilterValue = string,
  TIconData extends string | number | boolean | object | undefined = undefined,
>(
  transforms: TOptionTransforms<TItem, TValue, TIconData>,
  config: TSingleSelectConfig<TValue>,
  iconConfig?: IFilterIconConfig<TIconData>
) =>
  createFilterFieldConfig<typeof FILTER_FIELD_TYPE.SINGLE_SELECT, TValue>({
    type: FILTER_FIELD_TYPE.SINGLE_SELECT,
    ...config,
    getOptions: () =>
      transforms.items.map((item) => ({
        id: transforms.getId(item),
        label: transforms.getLabel(item),
        value: transforms.getValue(item),
        icon: iconConfig?.getOptionIcon?.(transforms.getIconData?.(item) as TIconData),
      })),
  }) as TSingleSelectFilterFieldConfig<TValue>;

/**
 * Multi-select filter configuration
 */
export type TMultiSelectConfig<TValue extends TFilterValue = string> = TBaseFilterFieldConfig & {
  defaultValue?: TValue[];
  singleValueOperator: TSupportedOperators;
};

/**
 * Helper to get the multi select config
 * @param transforms - How to transform items into options
 * @param config - Multi-select specific configuration
 * @param iconConfig - Icon configuration for options
 * @returns The multi select config
 */
export const getMultiSelectConfig = <
  TItem,
  TValue extends TFilterValue = string,
  TIconData extends string | number | boolean | object | undefined = undefined,
>(
  transforms: TOptionTransforms<TItem, TValue, TIconData>,
  config: TMultiSelectConfig<TValue>,
  iconConfig?: IFilterIconConfig<TIconData>
) =>
  createFilterFieldConfig<typeof FILTER_FIELD_TYPE.MULTI_SELECT, TValue>({
    type: FILTER_FIELD_TYPE.MULTI_SELECT,
    ...config,
    operatorLabel: config?.operatorLabel,
    getOptions: () =>
      transforms.items.map((item) => ({
        id: transforms.getId(item),
        label: transforms.getLabel(item),
        value: transforms.getValue(item),
        icon: iconConfig?.getOptionIcon?.(transforms.getIconData?.(item) as TIconData),
      })),
  }) as TMultiSelectFilterFieldConfig<TValue>;

// ------------ Date filters ------------

/**
 * Date filter configuration
 */
export type TDateConfig = TBaseFilterFieldConfig & {
  min?: Date;
  max?: Date;
};

/**
 * Date range filter configuration
 */
export type TDateRangeConfig = TBaseFilterFieldConfig & {
  min?: Date;
  max?: Date;
};

/**
 * Helper to get the date picker config
 * @param config - Date-specific configuration
 * @returns The date picker config
 */
export const getDatePickerConfig = (config: TDateConfig): TDateFilterFieldConfig<Date> =>
  createFilterFieldConfig<typeof FILTER_FIELD_TYPE.DATE, Date>({
    type: FILTER_FIELD_TYPE.DATE,
    ...config,
  }) as TDateFilterFieldConfig<Date>;

/**
 * Helper to get the date range picker config
 * @param config - Date range-specific configuration
 * @returns The date range picker config
 */
export const getDateRangePickerConfig = (config: TDateRangeConfig): TDateRangeFilterFieldConfig<Date> =>
  createFilterFieldConfig<typeof FILTER_FIELD_TYPE.DATE_RANGE, Date>({
    type: FILTER_FIELD_TYPE.DATE_RANGE,
    ...config,
  }) as TDateRangeFilterFieldConfig<Date>;

// ------------ Text filters ------------

export type TTextConfig = TBaseFilterFieldConfig & {
  placeholder?: string;
};

export const getTextInputConfig = (config: TTextConfig): TTextFilterFieldConfig<string> =>
  createFilterFieldConfig<typeof FILTER_FIELD_TYPE.TEXT, string>({
    type: FILTER_FIELD_TYPE.TEXT,
    ...config,
  }) as TTextFilterFieldConfig<string>;

// ------------ No-value filters ------------

export const getNoValueConfig = (config: TBaseFilterFieldConfig): TNoValueFilterFieldConfig =>
  createFilterFieldConfig<typeof FILTER_FIELD_TYPE.NO_VALUE, boolean>({
    type: FILTER_FIELD_TYPE.NO_VALUE,
    ...config,
    defaultValue: true,
  }) as TNoValueFilterFieldConfig;
