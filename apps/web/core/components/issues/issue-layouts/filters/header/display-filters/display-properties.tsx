/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane constants
import { ISSUE_DISPLAY_PROPERTIES } from "@plane/constants";
// plane i18n
import { useTranslation } from "@plane/i18n";
// types
import type { IIssueDisplayProperties } from "@plane/types";
// components
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
import { FilterHeader } from "../helpers/filter-header";

type Props = {
  displayProperties: IIssueDisplayProperties;
  displayPropertiesToRender: (keyof IIssueDisplayProperties)[];
  handleUpdate: (updatedDisplayProperties: Partial<IIssueDisplayProperties>) => void;
  cycleViewDisabled?: boolean;
  moduleViewDisabled?: boolean;
  isEpic?: boolean;
};

export const FilterDisplayProperties = observer(function FilterDisplayProperties(props: Props) {
  const {
    displayProperties,
    displayPropertiesToRender,
    handleUpdate,
    cycleViewDisabled = false,
    moduleViewDisabled = false,
    isEpic = false,
  } = props;
  // hooks
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const { fieldsLoader, getFields, getFieldsByProjectId } = useProjectIssueFields();
  // states
  const [previewEnabled, setPreviewEnabled] = React.useState(true);
  // derived values
  const currentProjectId = projectId?.toString();
  const fields = currentProjectId ? getFieldsByProjectId(currentProjectId) : undefined;

  useEffect(() => {
    if (!workspaceSlug || !currentProjectId) return;
    if (fields || fieldsLoader[currentProjectId]) return;

    getFields(workspaceSlug.toString(), currentProjectId).catch((error) => {
      console.error("Failed to load project issue fields:", error);
    });
  }, [currentProjectId, fields, fieldsLoader, getFields, workspaceSlug]);

  // Filter out "cycle" and "module" keys if cycleViewDisabled or moduleViewDisabled is true
  // Also filter out display properties that should not be rendered
  const filteredDisplayProperties = ISSUE_DISPLAY_PROPERTIES.reduce<typeof ISSUE_DISPLAY_PROPERTIES>(
    (acc, property) => {
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
    },
    []
  );

  const customDisplayProperties =
    fields?.map((field) => ({
      key: `customproperty_${field.id}` as keyof IIssueDisplayProperties,
      title: field.name,
    })) ?? [];

  return (
    <>
      <FilterHeader
        title={t("issue.display.properties.label")}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {filteredDisplayProperties.map((displayProperty) => (
            <button
              key={displayProperty.key}
              type="button"
              className={`rounded-sm border px-2 py-0.5 text-11 transition-all ${
                displayProperties?.[displayProperty.key]
                  ? "border-accent-strong bg-accent-primary text-on-color"
                  : "border-subtle hover:bg-layer-1"
              }`}
              onClick={() =>
                handleUpdate({
                  [displayProperty.key]: !displayProperties?.[displayProperty.key],
                })
              }
            >
              {t(displayProperty.titleTranslationKey)}
            </button>
          ))}
          {customDisplayProperties.map((displayProperty) => (
            <button
              key={displayProperty.key}
              type="button"
              className={`rounded-sm border px-2 py-0.5 text-11 transition-all ${
                displayProperties?.[displayProperty.key]
                  ? "border-accent-strong bg-accent-primary text-on-color"
                  : "border-subtle hover:bg-layer-1"
              }`}
              onClick={() =>
                handleUpdate({
                  [displayProperty.key]: !displayProperties?.[displayProperty.key],
                })
              }
            >
              {displayProperty.title}
            </button>
          ))}
        </div>
      )}
    </>
  );
});
