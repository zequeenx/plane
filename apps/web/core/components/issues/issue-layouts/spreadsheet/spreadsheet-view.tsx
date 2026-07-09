/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane constants
import { SPREADSHEET_SELECT_GROUP, SPREADSHEET_PROPERTY_LIST } from "@plane/constants";
// types
import type { TIssue, IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
// components
import { MultipleSelectGroup } from "@/components/core/multiple-select";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
import { useBulkOperationStatus } from "@/hooks/use-bulk-operation-status";
// plane web components
import { IssueBulkOperationsRoot } from "@/plane-web/components/issues/bulk-operations";
// local imports
import type { TRenderQuickActions } from "../list/list-view-types";
import { SpreadsheetAddIssueButton } from "../quick-add/button/spreadsheet";
import { QuickAddIssueRoot } from "../quick-add/root";
import { SpreadsheetTable } from "./spreadsheet-table";

type Props = {
  displayProperties: IIssueDisplayProperties;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  issueIds: string[] | undefined;
  quickActions: TRenderQuickActions;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  openIssuesListModal?: (() => void) | null;
  quickAddCallback?: (projectId: string | null | undefined, data: TIssue) => Promise<TIssue | undefined>;
  canEditProperties: (projectId: string | undefined) => boolean;
  canLoadMoreIssues: boolean;
  loadMoreIssues: () => void;
  enableQuickCreateIssue?: boolean;
  disableIssueCreation?: boolean;
  isWorkspaceLevel?: boolean;
  isEpic?: boolean;
  sourceModuleId?: string | null;
};

export const SpreadsheetView = observer(function SpreadsheetView(props: Props) {
  const {
    displayProperties,
    displayFilters,
    handleDisplayFilterUpdate,
    issueIds,
    quickActions,
    updateIssue,
    quickAddCallback,
    canEditProperties,
    enableQuickCreateIssue,
    disableIssueCreation,
    canLoadMoreIssues,
    loadMoreIssues,
    isWorkspaceLevel = false,
    isEpic = false,
    sourceModuleId,
  } = props;
  // refs
  const containerRef = useRef<HTMLTableElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  // router
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { currentProjectDetails } = useProject();
  const { fieldsLoader: moduleFieldsLoader, getFields: getModuleFields, getFieldsByModuleId } = useModuleIssueFields();
  const { fieldsLoader, getFields, getFieldsByProjectId } = useProjectIssueFields();
  // plane web hooks
  const isBulkOperationsEnabled = useBulkOperationStatus();

  const isEstimateEnabled: boolean = currentProjectDetails?.estimate !== null;

  const currentProjectId = projectId?.toString();
  const isProjectScopedView = !isWorkspaceLevel && !!workspaceSlug && !!currentProjectId;
  const projectIssueFields = isProjectScopedView ? getFieldsByProjectId(currentProjectId) : undefined;
  const moduleIssueFields = sourceModuleId ? getFieldsByModuleId(sourceModuleId) : undefined;

  useEffect(() => {
    if (!isProjectScopedView) return;
    if (projectIssueFields || fieldsLoader[currentProjectId]) return;

    getFields(workspaceSlug.toString(), currentProjectId).catch((error) => {
      console.error("Failed to load project issue fields:", error);
    });
  }, [currentProjectId, fieldsLoader, getFields, isProjectScopedView, projectIssueFields, workspaceSlug]);

  useEffect(() => {
    if (!isProjectScopedView || !sourceModuleId) return;
    if (moduleIssueFields || moduleFieldsLoader[sourceModuleId]) return;

    getModuleFields(workspaceSlug.toString(), currentProjectId, sourceModuleId).catch((error) => {
      console.error("Failed to load module issue fields:", error);
    });
  }, [
    currentProjectId,
    getModuleFields,
    isProjectScopedView,
    moduleFieldsLoader,
    moduleIssueFields,
    sourceModuleId,
    workspaceSlug,
  ]);

  const spreadsheetColumnsList = useMemo(() => {
    const systemColumns = isWorkspaceLevel
      ? SPREADSHEET_PROPERTY_LIST
      : SPREADSHEET_PROPERTY_LIST.filter((property) => {
          if (property === "cycle" && !currentProjectDetails?.cycle_view) return false;
          if (property === "modules" && !currentProjectDetails?.module_view) return false;
          return true;
        });

    const customColumns = isProjectScopedView
      ? projectIssueFields?.reduce<(keyof IIssueDisplayProperties)[]>((acc, field) => {
          const property = `customproperty_${field.id}` as keyof IIssueDisplayProperties;
          if (displayProperties[property]) acc.push(property);

          return acc;
        }, [])
      : undefined;
    const moduleCustomColumns =
      isProjectScopedView && sourceModuleId
        ? moduleIssueFields?.reduce<(keyof IIssueDisplayProperties)[]>((acc, field) => {
            const property = `modulecustomproperty_${field.id}` as keyof IIssueDisplayProperties;
            if (displayProperties[property]) acc.push(property);

            return acc;
          }, [])
        : undefined;

    return [...systemColumns, ...(customColumns ?? []), ...(moduleCustomColumns ?? [])];
  }, [
    currentProjectDetails?.cycle_view,
    currentProjectDetails?.module_view,
    displayProperties,
    isWorkspaceLevel,
    isProjectScopedView,
    moduleIssueFields,
    projectIssueFields,
    sourceModuleId,
  ]);

  if (!issueIds || issueIds.length === 0) return <></>;
  return (
    <div className="relative flex h-full w-full flex-col overflow-x-hidden bg-layer-1 whitespace-nowrap text-secondary">
      <div ref={portalRef} className="spreadsheet-menu-portal" />
      <MultipleSelectGroup
        containerRef={containerRef}
        entities={{
          [SPREADSHEET_SELECT_GROUP]: issueIds,
        }}
        disabled={!isBulkOperationsEnabled || isEpic}
      >
        {(helpers) => (
          <>
            <div ref={containerRef} className="vertical-scrollbar horizontal-scrollbar scrollbar-lg h-full w-full">
              <SpreadsheetTable
                displayProperties={displayProperties}
                displayFilters={displayFilters}
                handleDisplayFilterUpdate={handleDisplayFilterUpdate}
                issueIds={issueIds}
                isEstimateEnabled={isEstimateEnabled}
                portalElement={portalRef}
                quickActions={quickActions}
                updateIssue={updateIssue}
                canEditProperties={canEditProperties}
                containerRef={containerRef}
                canLoadMoreIssues={canLoadMoreIssues}
                loadMoreIssues={loadMoreIssues}
                spreadsheetColumnsList={spreadsheetColumnsList}
                selectionHelpers={helpers}
                isEpic={isEpic}
                sourceModuleId={sourceModuleId}
              />
            </div>
            <div className="border-t border-subtle">
              <div className="sticky bottom-0 left-0 z-5">
                {enableQuickCreateIssue && !disableIssueCreation && (
                  <QuickAddIssueRoot
                    layout={EIssueLayoutTypes.SPREADSHEET}
                    QuickAddButton={SpreadsheetAddIssueButton}
                    quickAddCallback={quickAddCallback}
                    isEpic={isEpic}
                  />
                )}
              </div>
            </div>
            <IssueBulkOperationsRoot selectionHelpers={helpers} />
          </>
        )}
      </MultipleSelectGroup>
    </div>
  );
});
