/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { IIssueDisplayFilterOptions, TIssueGroupByOptions } from "@plane/types";
// components
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";
import { buildCustomFieldGroupOptions } from "@/components/issues/issue-layouts/custom-field-grouping";
// hooks
import { useCustomFieldGrouping } from "@/hooks/use-custom-field-grouping";
import { useGroupByOptions } from "@/plane-web/components/issues/issue-layouts/utils";

type Props = {
  displayFilters: IIssueDisplayFilterOptions | undefined;
  groupByOptions: TIssueGroupByOptions[];
  handleUpdate: (val: TIssueGroupByOptions) => void;
  ignoreGroupedFilters: Partial<TIssueGroupByOptions>[];
  sourceModuleId?: string | null;
};

export const FilterGroupBy = observer(function FilterGroupBy(props: Props) {
  const { displayFilters, groupByOptions, handleUpdate, ignoreGroupedFilters, sourceModuleId } = props;
  // hooks
  const { t } = useTranslation();
  const { moduleFields, moduleName, projectFields } = useCustomFieldGrouping(sourceModuleId);
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const selectedGroupBy = displayFilters?.group_by ?? null;
  const selectedSubGroupBy = displayFilters?.sub_group_by ?? null;

  const customOptions = buildCustomFieldGroupOptions({
    moduleFields,
    moduleLabel: t("common.module"),
    moduleName,
    projectFields,
    projectLabel: t("common.project"),
  });
  const options: { key: TIssueGroupByOptions; title: string }[] = [
    ...useGroupByOptions(groupByOptions).map((option) => ({
      key: option.key,
      title: t(option.titleTranslationKey),
    })),
    ...customOptions,
  ];

  return (
    <>
      <FilterHeader
        title={t("common.group_by")}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div>
          {options.map((groupBy) => {
            if (
              displayFilters?.layout === "kanban" &&
              selectedSubGroupBy !== null &&
              groupBy.key === selectedSubGroupBy
            )
              return null;
            if (ignoreGroupedFilters.some((ignoredGroup) => ignoredGroup === groupBy.key)) return null;

            return (
              <FilterOption
                key={groupBy?.key}
                isChecked={selectedGroupBy === groupBy.key}
                onClick={() => handleUpdate(groupBy.key)}
                title={groupBy.title}
                multiple={false}
              />
            );
          })}
        </div>
      )}
    </>
  );
});
