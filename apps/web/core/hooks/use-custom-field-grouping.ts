/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// hooks
import { loadSourceModuleDetailsOnce } from "@/hooks/custom-field-grouping-utils";
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
  // states
  const [attemptedModuleFieldsKey, setAttemptedModuleFieldsKey] = useState<string>();
  const [attemptedProjectFieldsKey, setAttemptedProjectFieldsKey] = useState<string>();
  // derived values
  const projectFields = projectId ? getFieldsByProjectId(projectId) : undefined;
  const moduleFields = sourceModuleId ? getFieldsByModuleId(sourceModuleId) : undefined;
  const moduleFieldsAreLoading = sourceModuleId ? !!moduleFieldsLoader[sourceModuleId] : false;
  const projectFieldsAreLoading = projectId ? !!projectFieldsLoader[projectId] : false;
  const moduleFieldsLoading = !!(
    workspaceSlug &&
    projectId &&
    sourceModuleId &&
    !moduleFields &&
    (attemptedModuleFieldsKey !== sourceModuleId || moduleFieldsAreLoading)
  );
  const projectFieldsLoading = !!(
    workspaceSlug &&
    projectId &&
    !projectFields &&
    (attemptedProjectFieldsKey !== projectId || projectFieldsAreLoading)
  );

  useEffect(() => {
    if (!workspaceSlug || !projectId || projectFields || attemptedProjectFieldsKey === projectId) return;

    setAttemptedProjectFieldsKey(projectId);
    if (projectFieldsAreLoading || projectFieldsLoader[projectId]) return;

    void getProjectFields(workspaceSlug, projectId).catch((error) =>
      console.error("Failed to load project issue fields:", error)
    );
  }, [
    attemptedProjectFieldsKey,
    getProjectFields,
    projectFields,
    projectFieldsAreLoading,
    projectFieldsLoader,
    projectId,
    workspaceSlug,
  ]);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !sourceModuleId || moduleFields || attemptedModuleFieldsKey === sourceModuleId)
      return;

    setAttemptedModuleFieldsKey(sourceModuleId);
    if (moduleFieldsAreLoading || moduleFieldsLoader[sourceModuleId]) return;

    void getModuleFields(workspaceSlug, projectId, sourceModuleId).catch((error) =>
      console.error("Failed to load module issue fields:", error)
    );
  }, [
    attemptedModuleFieldsKey,
    getModuleFields,
    moduleFields,
    moduleFieldsAreLoading,
    moduleFieldsLoader,
    projectId,
    sourceModuleId,
    workspaceSlug,
  ]);

  useEffect(() => {
    if (workspaceSlug && projectId && sourceModuleId && !moduleName) {
      void loadSourceModuleDetailsOnce(sourceModuleId, () =>
        fetchModuleDetails(workspaceSlug, projectId, sourceModuleId).catch((error) => {
          console.error("Failed to load source module:", error);
          throw error;
        })
      ).catch(() => undefined);
    }
  }, [fetchModuleDetails, moduleName, projectId, sourceModuleId, workspaceSlug]);

  return {
    moduleFields,
    moduleFieldsLoading,
    moduleName,
    projectFields,
    projectFieldsLoading,
    projectId,
    sourceModuleId,
  };
};
