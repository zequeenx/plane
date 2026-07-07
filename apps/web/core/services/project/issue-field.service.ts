/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { AxiosRequestConfig } from "axios";
import type {
  TIssueFieldValuesUpdatePayload,
  TProjectIssueField,
  TProjectIssueFieldOption,
  TProjectIssueFieldPayload,
  TProjectIssueFieldUpdatePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

type TDeleteData = Parameters<APIService["delete"]>[1];

export class ProjectIssueFieldService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TProjectIssueField[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listDisabled(workspaceSlug: string, projectId: string): Promise<TProjectIssueField[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/disabled/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: TProjectIssueFieldPayload): Promise<TProjectIssueField> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    fieldId: string,
    data: TProjectIssueFieldUpdatePayload
  ): Promise<TProjectIssueField> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/${fieldId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  delete(workspaceSlug: string, projectId: string, fieldId: string): Promise<void>;
  delete(url: string, data?: TDeleteData, config?: AxiosRequestConfig): ReturnType<APIService["delete"]>;
  async delete(
    first: string,
    second?: string | TDeleteData,
    third?: string | AxiosRequestConfig
  ): Promise<void | Awaited<ReturnType<APIService["delete"]>>> {
    if (typeof second === "string" && typeof third === "string") {
      return super
        .delete(`/api/workspaces/${first}/projects/${second}/issue-fields/${third}/`)
        .then(() => undefined)
        .catch((error) => {
          throw error?.response?.data;
        });
    }

    return super.delete(first, second, third as AxiosRequestConfig);
  }

  async createOption(
    workspaceSlug: string,
    projectId: string,
    fieldId: string,
    value: string
  ): Promise<TProjectIssueFieldOption> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/${fieldId}/options/`, {
      value,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteOption(workspaceSlug: string, projectId: string, fieldId: string, optionId: string): Promise<void> {
    return super
      .delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/${fieldId}/options/${optionId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueFieldValuesUpdatePayload
  ): Promise<TIssueFieldValuesUpdatePayload> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/field-values/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
