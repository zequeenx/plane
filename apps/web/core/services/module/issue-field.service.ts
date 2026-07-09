/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TModuleIssueField,
  TModuleIssueFieldOption,
  TModuleIssueFieldPayload,
  TModuleIssueFieldUpdatePayload,
  TModuleIssueFieldValuesUpdatePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class ModuleIssueFieldService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string, moduleId: string): Promise<TModuleIssueField[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/`).then(
      (response) => response?.data
    );
  }

  async listDisabled(workspaceSlug: string, projectId: string, moduleId: string): Promise<TModuleIssueField[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/disabled/`
    ).then((response) => response?.data);
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    data: TModuleIssueFieldPayload
  ): Promise<TModuleIssueField> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/`,
      data
    ).then((response) => response?.data);
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    data: TModuleIssueFieldUpdatePayload
  ): Promise<TModuleIssueField> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/${fieldId}/`,
      data
    ).then((response) => response?.data);
  }

  async deleteField(workspaceSlug: string, projectId: string, moduleId: string, fieldId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/${fieldId}/`
    ).then(() => undefined);
  }

  async createOption(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    value: string
  ): Promise<TModuleIssueFieldOption> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/${fieldId}/options/`,
      { value }
    ).then((response) => response?.data);
  }

  async deleteOption(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    optionId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/${fieldId}/options/${optionId}/`
    ).then(() => undefined);
  }

  async updateIssueValues(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string,
    data: TModuleIssueFieldValuesUpdatePayload
  ): Promise<{ module_field_values: Record<string, TModuleIssueFieldValuesUpdatePayload["field_values"]> }> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issues/${issueId}/field-values/`,
      data
    ).then((response) => response?.data);
  }
}
