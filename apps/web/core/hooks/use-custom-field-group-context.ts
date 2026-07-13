/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
// hooks
import { useModule } from "@/hooks/store/use-module";
import { useProjectView } from "@/hooks/store/use-project-view";
import { resolveCustomFieldGroupSourceModuleId } from "@/hooks/custom-field-grouping-utils";

export const useCustomFieldGroupContext = (sourceModuleIdOverride?: string | null) => {
  const { moduleId, projectId, viewId, workspaceSlug } = useParams();
  const { getModuleById } = useModule();
  const { getViewById } = useProjectView();
  // derived values
  const projectView = viewId ? getViewById(viewId.toString()) : undefined;
  const sourceModuleId = resolveCustomFieldGroupSourceModuleId({
    projectViewSourceModuleId: projectView?.source_module,
    routeModuleId: moduleId?.toString(),
    sourceModuleIdOverride,
  });
  const sourceModule = sourceModuleId ? getModuleById(sourceModuleId) : null;

  return {
    moduleName: sourceModule?.name,
    projectId: projectId?.toString(),
    sourceModuleId,
    workspaceSlug: workspaceSlug?.toString(),
  };
};
