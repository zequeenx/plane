/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
// hooks
import { useModule } from "@/hooks/store/use-module";
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
import { useCustomFieldGroupContext } from "@/hooks/use-custom-field-group-context";

export const useCustomFieldGrouping = (sourceModuleIdOverride?: string | null) => {
  const { moduleName, projectId, sourceModuleId, workspaceSlug } = useCustomFieldGroupContext(sourceModuleIdOverride);
  const { fetchModuleDetails } = useModule();
  const { fieldsLoader: moduleFieldsLoader, getFields: getModuleFields, getFieldsByModuleId } = useModuleIssueFields();
  const {
    fieldsLoader: projectFieldsLoader,
    getFields: getProjectFields,
    getFieldsByProjectId,
  } = useProjectIssueFields();
  // derived values
  const projectFields = projectId ? getFieldsByProjectId(projectId) : undefined;
  const moduleFields = sourceModuleId ? getFieldsByModuleId(sourceModuleId) : undefined;

  useEffect(() => {
    if (workspaceSlug && projectId && !projectFields && !projectFieldsLoader[projectId]) {
      void getProjectFields(workspaceSlug, projectId).catch((error) =>
        console.error("Failed to load project issue fields:", error)
      );
    }
  }, [getProjectFields, projectFields, projectFieldsLoader, projectId, workspaceSlug]);

  useEffect(() => {
    if (workspaceSlug && projectId && sourceModuleId && !moduleFields && !moduleFieldsLoader[sourceModuleId]) {
      void getModuleFields(workspaceSlug, projectId, sourceModuleId).catch((error) =>
        console.error("Failed to load module issue fields:", error)
      );
    }
  }, [getModuleFields, moduleFields, moduleFieldsLoader, projectId, sourceModuleId, workspaceSlug]);

  useEffect(() => {
    if (workspaceSlug && projectId && sourceModuleId && !moduleName) {
      void fetchModuleDetails(workspaceSlug, projectId, sourceModuleId).catch((error) =>
        console.error("Failed to load source module:", error)
      );
    }
  }, [fetchModuleDetails, moduleName, projectId, sourceModuleId, workspaceSlug]);

  return {
    moduleFields,
    moduleName,
    projectFields,
    projectId,
    sourceModuleId,
  };
};
