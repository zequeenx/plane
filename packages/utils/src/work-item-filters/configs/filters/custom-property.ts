/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type {
  IUserLite,
  TCustomPropertyKey,
  TFilterConfig,
  TModuleCustomPropertyKey,
  TModuleIssueField,
  TModuleIssueFieldOption,
  TOperatorConfigMap,
  TProjectIssueField,
  TProjectIssueFieldOption,
  TSupportedOperators,
} from "@plane/types";
import {
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  EProjectIssueFieldType,
  EXTENDED_EMPTY_OPERATOR,
} from "@plane/types";
// local imports
import type { IFilterIconConfig, TCreateFilterConfigParams, TCreateDateFilterParams } from "../../../rich-filters";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getDatePickerConfig,
  getDateRangePickerConfig,
  getMemberMultiSelectConfig,
  getMultiSelectConfig,
  getNoValueConfig,
  getTextInputConfig,
} from "../../../rich-filters";

export type TCreateCustomPropertyFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<string | Date | IUserLite> & {
    field: TProjectIssueField | TModuleIssueField;
    members?: IUserLite[];
  };

const getCustomPropertyKey = (
  fieldId: string,
  prefix: "customproperty_" | "modulecustomproperty_" = "customproperty_"
): TCustomPropertyKey | TModuleCustomPropertyKey =>
  `${prefix}${fieldId}` as TCustomPropertyKey | TModuleCustomPropertyKey;

const createEmptyOperatorEntries = (params: TCreateFilterConfigParams) => [
  createOperatorConfigEntry(EXTENDED_EMPTY_OPERATOR.IS_EMPTY, params, (updatedParams) =>
    getNoValueConfig(updatedParams)
  ),
  createOperatorConfigEntry(EXTENDED_EMPTY_OPERATOR.IS_NOT_EMPTY, params, (updatedParams) =>
    getNoValueConfig(updatedParams)
  ),
];

const getCustomDateOperators = (params: TCreateDateFilterParams): TOperatorConfigMap =>
  new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updatedParams) => getDatePickerConfig(updatedParams)),
    createOperatorConfigEntry(COMPARISON_OPERATOR.RANGE, params, (updatedParams) =>
      getDateRangePickerConfig(updatedParams)
    ),
    ...createEmptyOperatorEntries(params),
  ]);

const getCustomDateRangeOperators = (params: TCreateDateFilterParams): TOperatorConfigMap =>
  new Map([
    createOperatorConfigEntry(COMPARISON_OPERATOR.OVERLAPS, params, (updatedParams) =>
      getDateRangePickerConfig(updatedParams)
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.NOT_OVERLAPS, params, (updatedParams) =>
      getDateRangePickerConfig(updatedParams)
    ),
    ...createEmptyOperatorEntries(params),
  ]);

const getCustomTextOperators = (params: TCreateFilterConfigParams): TOperatorConfigMap =>
  new Map([
    createOperatorConfigEntry(COMPARISON_OPERATOR.CONTAINS, params, (updatedParams) =>
      getTextInputConfig({ ...updatedParams, placeholder: "Enter text" })
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.NOT_CONTAINS, params, (updatedParams) =>
      getTextInputConfig({ ...updatedParams, placeholder: "Enter text" })
    ),
    ...createEmptyOperatorEntries(params),
  ]);

const getCustomOptionMultiSelectConfig = (
  params: TCreateCustomPropertyFilterParams,
  singleValueOperator: TSupportedOperators
) =>
  getMultiSelectConfig<TProjectIssueFieldOption | TModuleIssueFieldOption, string, string>(
    {
      items: params.field.options,
      getId: (option) => option.id,
      getLabel: (option) => option.value,
      getValue: (option) => option.id,
      getIconData: (option) => option.value,
    },
    {
      singleValueOperator,
      ...params,
    },
    {
      getOptionIcon: params.getOptionIcon,
    }
  );

const getCustomOptionOperators = (params: TCreateCustomPropertyFilterParams): TOperatorConfigMap =>
  new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
      getCustomOptionMultiSelectConfig(updatedParams, EQUALITY_OPERATOR.EXACT)
    ),
    createOperatorConfigEntry(COLLECTION_OPERATOR.NOT_IN, params, (updatedParams) =>
      getCustomOptionMultiSelectConfig(updatedParams, EQUALITY_OPERATOR.EXACT)
    ),
    ...createEmptyOperatorEntries(params),
  ]);

const getCustomMemberOperators = (params: TCreateCustomPropertyFilterParams): TOperatorConfigMap =>
  new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
      getMemberMultiSelectConfig(
        {
          ...updatedParams,
          members: updatedParams.members ?? [],
        },
        EQUALITY_OPERATOR.EXACT
      )
    ),
    createOperatorConfigEntry(COLLECTION_OPERATOR.NOT_IN, params, (updatedParams) =>
      getMemberMultiSelectConfig(
        {
          ...updatedParams,
          members: updatedParams.members ?? [],
        },
        EQUALITY_OPERATOR.EXACT
      )
    ),
    ...createEmptyOperatorEntries(params),
  ]);

const getSupportedOperatorConfigsMap = (params: TCreateCustomPropertyFilterParams): TOperatorConfigMap | undefined => {
  switch (params.field.field_type) {
    case EProjectIssueFieldType.DATE:
      return getCustomDateOperators(params);
    case EProjectIssueFieldType.DATE_RANGE:
      return getCustomDateRangeOperators(params);
    case EProjectIssueFieldType.PLAIN_TEXT:
      return getCustomTextOperators(params);
    case EProjectIssueFieldType.SINGLE_SELECT:
    case EProjectIssueFieldType.MULTI_SELECT:
      return getCustomOptionOperators(params);
    case EProjectIssueFieldType.SINGLE_MEMBER:
    case EProjectIssueFieldType.MULTI_MEMBER:
      return getCustomMemberOperators(params);
    default:
      return undefined;
  }
};

export const getCustomPropertyFilterConfig =
  (field: TProjectIssueField | TModuleIssueField, prefix?: "customproperty_" | "modulecustomproperty_") =>
  (
    params: Omit<TCreateCustomPropertyFilterParams, "field">
  ): TFilterConfig<TCustomPropertyKey | TModuleCustomPropertyKey> | undefined => {
    if (field.is_disabled) return undefined;

    const configParams = {
      ...params,
      field,
    };
    const supportedOperatorConfigsMap = getSupportedOperatorConfigsMap(configParams);
    if (!supportedOperatorConfigsMap) return undefined;

    const isMemberField =
      field.field_type === EProjectIssueFieldType.SINGLE_MEMBER ||
      field.field_type === EProjectIssueFieldType.MULTI_MEMBER;
    const isEnabled = params.isEnabled && (!isMemberField || params.members !== undefined);

    return createFilterConfig<TCustomPropertyKey | TModuleCustomPropertyKey>({
      id: getCustomPropertyKey(field.id, prefix),
      label: field.name,
      ...configParams,
      isEnabled,
      icon: params.filterIcon,
      allowMultipleFilters: true,
      supportedOperatorConfigsMap,
    });
  };
