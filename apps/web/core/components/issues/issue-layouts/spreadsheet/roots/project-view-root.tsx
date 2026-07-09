/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// mobx store
// components
import { useProjectView } from "@/hooks/store/use-project-view";
import { ProjectIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseSpreadsheetRoot } from "../base-spreadsheet-root";
// types
// constants

export const ProjectViewSpreadsheetLayout = observer(function ProjectViewSpreadsheetLayout() {
  const { viewId } = useParams();
  const { getViewById } = useProjectView();
  const projectView = viewId ? getViewById(viewId.toString()) : undefined;

  return (
    <BaseSpreadsheetRoot
      QuickActions={ProjectIssueQuickActions}
      sourceModuleId={projectView?.source_module ?? null}
      viewId={viewId.toString()}
    />
  );
});
