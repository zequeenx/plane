/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane constants
import { ISSUE_DISPLAY_PROPERTIES, SPREADSHEET_PROPERTY_LIST } from "@plane/constants";
// plane i18n
import { useTranslation } from "@plane/i18n";
// types
import { EIssueLayoutTypes, type IIssueDisplayFilterOptions, type IIssueDisplayProperties } from "@plane/types";
// plane ui
import { Sortable } from "@plane/ui";
// plane utils
import { moveSpreadsheetColumn, resolveSpreadsheetColumnOrder } from "@plane/utils";
// components
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
import { DisplayPropertyChip } from "./display-property-chip";
import { FilterHeader } from "../helpers/filter-header";

type TDisplayPropertyOption = {
  key: keyof IIssueDisplayProperties;
  label: string;
};

const SPREADSHEET_ONLY_DISPLAY_PROPERTIES: typeof ISSUE_DISPLAY_PROPERTIES = [
  { key: "created_on", titleTranslationKey: "common.created_on" },
  { key: "updated_on", titleTranslationKey: "common.updated_on" },
];

type Props = {
  displayFilters?: IIssueDisplayFilterOptions;
  displayProperties: IIssueDisplayProperties;
  displayPropertiesToRender: (keyof IIssueDisplayProperties)[];
  handleDisplayFiltersUpdate?: (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => void;
  handleUpdate: (updatedDisplayProperties: Partial<IIssueDisplayProperties>) => void;
  cycleViewDisabled?: boolean;
  moduleViewDisabled?: boolean;
  sourceModuleId?: string | null;
  isEpic?: boolean;
};

export const FilterDisplayProperties = observer(function FilterDisplayProperties(props: Props) {
  const {
    displayProperties,
    displayPropertiesToRender,
    handleUpdate,
    cycleViewDisabled = false,
    moduleViewDisabled = false,
    sourceModuleId,
    isEpic = false,
  } = props;
  // hooks
  const { t } = useTranslation();
  const { workspaceSlug, projectId, moduleId } = useParams();
  const { fieldsLoader: moduleFieldsLoader, getFields: getModuleFields, getFieldsByModuleId } = useModuleIssueFields();
  const { fieldsLoader, getFields, getFieldsByProjectId } = useProjectIssueFields();
  // states
  const [previewEnabled, setPreviewEnabled] = React.useState(true);
  // derived values
  const currentProjectId = projectId?.toString();
  const currentSourceModuleId = sourceModuleId ?? moduleId?.toString();
  const isProjectScopedView = !!workspaceSlug && !!currentProjectId;
  const fields = isProjectScopedView ? getFieldsByProjectId(currentProjectId) : undefined;
  const moduleFields = currentSourceModuleId ? getFieldsByModuleId(currentSourceModuleId) : undefined;
  const isSpreadsheetLayout = props.displayFilters?.layout === EIssueLayoutTypes.SPREADSHEET;
  const areCustomDisplayPropertiesReady =
    (!isProjectScopedView || fields !== undefined) && (!currentSourceModuleId || moduleFields !== undefined);
  const isColumnOrderingEnabled = isSpreadsheetLayout && areCustomDisplayPropertiesReady;

  useEffect(() => {
    if (!isProjectScopedView) return;
    if (fields || fieldsLoader[currentProjectId]) return;

    getFields(workspaceSlug.toString(), currentProjectId).catch((error) => {
      console.error("Failed to load project issue fields:", error);
    });
  }, [currentProjectId, fields, fieldsLoader, getFields, isProjectScopedView, workspaceSlug]);

  useEffect(() => {
    if (!isProjectScopedView || !currentSourceModuleId) return;
    if (moduleFields || moduleFieldsLoader[currentSourceModuleId]) return;

    getModuleFields(workspaceSlug.toString(), currentProjectId, currentSourceModuleId).catch((error) => {
      console.error("Failed to load module issue fields:", error);
    });
  }, [
    currentProjectId,
    currentSourceModuleId,
    getModuleFields,
    isProjectScopedView,
    moduleFields,
    moduleFieldsLoader,
    workspaceSlug,
  ]);

  // Filter out "cycle" and "module" keys if cycleViewDisabled or moduleViewDisabled is true
  // Also filter out display properties that should not be rendered
  const systemDisplayProperties: typeof ISSUE_DISPLAY_PROPERTIES = isSpreadsheetLayout
    ? [...ISSUE_DISPLAY_PROPERTIES, ...SPREADSHEET_ONLY_DISPLAY_PROPERTIES]
    : ISSUE_DISPLAY_PROPERTIES;
  const filteredDisplayProperties = systemDisplayProperties.reduce<typeof ISSUE_DISPLAY_PROPERTIES>((acc, property) => {
    if (!displayPropertiesToRender.includes(property.key)) return acc;

    let shouldRender = true;

    switch (property.key) {
      case "cycle":
        shouldRender = !cycleViewDisabled;
        break;
      case "modules":
        shouldRender = !moduleViewDisabled;
        break;
    }

    if (!shouldRender) return acc;

    if (isEpic && property.key === "sub_issue_count") {
      acc.push({
        key: property.key,
        titleTranslationKey: "issue.display.properties.work_item_count",
      });
      return acc;
    }

    acc.push(property);
    return acc;
  }, []);

  const customDisplayProperties =
    fields?.map((field) => ({
      key: `customproperty_${field.id}` as keyof IIssueDisplayProperties,
      title: field.name,
    })) ?? [];
  const moduleCustomDisplayProperties =
    currentSourceModuleId && moduleFields
      ? moduleFields.map((field) => ({
          key: `modulecustomproperty_${field.id}` as keyof IIssueDisplayProperties,
          title: field.name,
        }))
      : [];

  const allDisplayProperties: TDisplayPropertyOption[] = [
    ...filteredDisplayProperties.map((property) => ({
      key: property.key,
      label: t(property.titleTranslationKey),
    })),
    ...customDisplayProperties.map((property) => ({ key: property.key, label: property.title })),
    ...moduleCustomDisplayProperties.map((property) => ({ key: property.key, label: property.title })),
  ];
  const fixedIdProperty = allDisplayProperties.find((property) => property.key === "key");
  const nonIdDisplayProperties = allDisplayProperties.filter((property) => property.key !== "key");
  const optionByKey = new Map(allDisplayProperties.map((property) => [property.key, property]));
  const availableOrder = [
    ...SPREADSHEET_PROPERTY_LIST.filter((property) => optionByKey.has(property)),
    ...customDisplayProperties.map((property) => property.key),
    ...moduleCustomDisplayProperties.map((property) => property.key),
  ];
  const resolvedOrder = isColumnOrderingEnabled
    ? resolveSpreadsheetColumnOrder(props.displayFilters?.spreadsheet?.column_order, availableOrder)
    : [];
  const orderedProperties = resolvedOrder.flatMap((property) => {
    const option = optionByKey.get(property);
    return option ? [option] : [];
  });

  const handleColumnOrderChange = (columnOrder: (keyof IIssueDisplayProperties)[]) => {
    if (!isColumnOrderingEnabled) return;

    props.handleDisplayFiltersUpdate?.({
      spreadsheet: {
        ...props.displayFilters?.spreadsheet,
        column_order: columnOrder,
      },
    });
  };
  const handleOrderChange = (properties: TDisplayPropertyOption[]) =>
    handleColumnOrderChange(properties.map((property) => property.key));
  const handleKeyboardMove = (property: keyof IIssueDisplayProperties, offset: -1 | 1) =>
    handleColumnOrderChange(moveSpreadsheetColumn(resolvedOrder, property, offset));

  const renderPropertyChip = (
    property: TDisplayPropertyOption,
    dragHandleRef?: React.RefCallback<HTMLButtonElement>
  ) => (
    <DisplayPropertyChip
      key={property.key}
      dragHandleRef={dragHandleRef}
      isEnabled={!!displayProperties[property.key]}
      isSortable={isColumnOrderingEnabled && property.key !== "key"}
      label={property.label}
      onMove={(offset) => handleKeyboardMove(property.key, offset)}
      onToggle={() => handleUpdate({ [property.key]: !displayProperties[property.key] })}
      reorderLabel={t("common.drag_to_rearrange")}
    />
  );

  return (
    <>
      <FilterHeader
        title={t("issue.display.properties.label")}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {fixedIdProperty && renderPropertyChip(fixedIdProperty)}
          {isColumnOrderingEnabled ? (
            <Sortable
              data={orderedProperties}
              id="table-display-properties"
              orientation="horizontal"
              keyExtractor={(property) => property.key}
              onChange={handleOrderChange}
              containerClassName="relative"
              render={(property, _index, { dragHandleRef }) => renderPropertyChip(property, dragHandleRef)}
            />
          ) : (
            nonIdDisplayProperties.map((property) => renderPropertyChip(property))
          )}
        </div>
      )}
    </>
  );
});
