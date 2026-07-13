/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
// hooks
import { useModule } from "@/hooks/store/use-module";
import { useProjectView } from "@/hooks/store/use-project-view";

export const useCustomFieldGroupContext = (sourceModuleIdOverride?: string | null) => {
  const { moduleId, projectId, viewId, workspaceSlug } = useParams();
  const { getModuleById } = useModule();
  const { getViewById } = useProjectView();
  // derived values
  const projectView = viewId ? getViewById(viewId.toString()) : undefined;
  const sourceModuleId = sourceModuleIdOverride ?? moduleId?.toString() ?? projectView?.source_module ?? null;
  const sourceModule = sourceModuleId ? getModuleById(sourceModuleId) : null;

  return {
    moduleName: sourceModule?.name,
    projectId: projectId?.toString(),
    sourceModuleId,
    workspaceSlug: workspaceSlug?.toString(),
  };
};
