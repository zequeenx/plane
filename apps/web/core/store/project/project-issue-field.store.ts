/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, sortBy } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  TIssueFieldValuesUpdatePayload,
  TProjectIssueField,
  TProjectIssueFieldOption,
  TProjectIssueFieldPayload,
  TProjectIssueFieldUpdatePayload,
} from "@plane/types";
// services
import { ProjectIssueFieldService } from "@/services/project";
// store
import type { ProjectRootStore } from "@/store/project";

export interface IProjectIssueFieldStore {
  // states
  loader: boolean;
  fieldsLoader: Record<string, boolean>;
  disabledFieldsLoader: Record<string, boolean>;
  // observables
  fieldsMap: Record<string, TProjectIssueField[]>;
  disabledFieldsMap: Record<string, TProjectIssueField[]>;
  // computed actions
  getFieldsByProjectId: (projectId: string) => TProjectIssueField[] | undefined;
  getDisabledFieldsByProjectId: (projectId: string) => TProjectIssueField[] | undefined;
  getFieldById: (projectId: string, fieldId: string) => TProjectIssueField | undefined;
  getDisabledFieldById: (projectId: string, fieldId: string) => TProjectIssueField | undefined;
  // actions
  getFields: (workspaceSlug: string, projectId: string) => Promise<TProjectIssueField[]>;
  getDisabledFields: (workspaceSlug: string, projectId: string) => Promise<TProjectIssueField[]>;
  createField: (
    workspaceSlug: string,
    projectId: string,
    data: TProjectIssueFieldPayload
  ) => Promise<TProjectIssueField>;
  updateField: (
    workspaceSlug: string,
    projectId: string,
    fieldId: string,
    data: TProjectIssueFieldUpdatePayload
  ) => Promise<TProjectIssueField>;
  deleteField: (workspaceSlug: string, projectId: string, fieldId: string) => Promise<void>;
  createOption: (
    workspaceSlug: string,
    projectId: string,
    fieldId: string,
    value: string
  ) => Promise<TProjectIssueFieldOption>;
  deleteOption: (workspaceSlug: string, projectId: string, fieldId: string, optionId: string) => Promise<void>;
  updateIssueValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueFieldValuesUpdatePayload
  ) => Promise<TIssueFieldValuesUpdatePayload>;
}

export class ProjectIssueFieldStore implements IProjectIssueFieldStore {
  // states
  loader: boolean = false;
  fieldsLoader: Record<string, boolean> = {};
  disabledFieldsLoader: Record<string, boolean> = {};
  // observables
  fieldsMap: Record<string, TProjectIssueField[]> = {};
  disabledFieldsMap: Record<string, TProjectIssueField[]> = {};
  // root store
  projectRootStore: ProjectRootStore;
  // services
  projectIssueFieldService;

  constructor(_projectRootStore: ProjectRootStore) {
    makeObservable(this, {
      // states
      loader: observable.ref,
      fieldsLoader: observable,
      disabledFieldsLoader: observable,
      // observables
      fieldsMap: observable,
      disabledFieldsMap: observable,
      // actions
      getFields: action,
      getDisabledFields: action,
      createField: action,
      updateField: action,
      deleteField: action,
      createOption: action,
      deleteOption: action,
      updateIssueValues: action,
    });

    this.projectRootStore = _projectRootStore;
    this.projectIssueFieldService = new ProjectIssueFieldService();
  }

  getFieldsByProjectId = computedFn((projectId: string) => this.fieldsMap[projectId]);

  getDisabledFieldsByProjectId = computedFn((projectId: string) => this.disabledFieldsMap[projectId]);

  getFieldById = computedFn((projectId: string, fieldId: string) =>
    this.fieldsMap[projectId]?.find((field) => field.id === fieldId)
  );

  getDisabledFieldById = computedFn((projectId: string, fieldId: string) =>
    this.disabledFieldsMap[projectId]?.find((field) => field.id === fieldId)
  );

  getFields = async (workspaceSlug: string, projectId: string) => {
    try {
      runInAction(() => {
        set(this.fieldsLoader, [projectId], true);
      });
      const response = await this.projectIssueFieldService.list(workspaceSlug, projectId);

      runInAction(() => {
        set(this.fieldsMap, [projectId], this.orderFields(response));
        set(this.fieldsLoader, [projectId], false);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.fieldsLoader, [projectId], false);
      });
      throw error;
    }
  };

  getDisabledFields = async (workspaceSlug: string, projectId: string) => {
    try {
      runInAction(() => {
        set(this.disabledFieldsLoader, [projectId], true);
      });
      const response = await this.projectIssueFieldService.listDisabled(workspaceSlug, projectId);

      runInAction(() => {
        set(this.disabledFieldsMap, [projectId], this.orderFields(response));
        set(this.disabledFieldsLoader, [projectId], false);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.disabledFieldsLoader, [projectId], false);
      });
      throw error;
    }
  };

  createField = async (workspaceSlug: string, projectId: string, data: TProjectIssueFieldPayload) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      const response = await this.projectIssueFieldService.create(workspaceSlug, projectId, data);

      runInAction(() => {
        this.upsertField(projectId, response);
        this.loader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  updateField = async (
    workspaceSlug: string,
    projectId: string,
    fieldId: string,
    data: TProjectIssueFieldUpdatePayload
  ) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      const response = await this.projectIssueFieldService.update(workspaceSlug, projectId, fieldId, data);

      if (data.is_disabled === true || data.is_disabled === false) {
        await Promise.all([this.getFields(workspaceSlug, projectId), this.getDisabledFields(workspaceSlug, projectId)]);
      } else {
        runInAction(() => {
          this.upsertField(projectId, response);
        });
      }

      runInAction(() => {
        this.loader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  deleteField = async (workspaceSlug: string, projectId: string, fieldId: string) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      await this.projectIssueFieldService.delete(workspaceSlug, projectId, fieldId);
      await Promise.all([this.getFields(workspaceSlug, projectId), this.getDisabledFields(workspaceSlug, projectId)]);
      runInAction(() => {
        this.loader = false;
      });
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  createOption = async (workspaceSlug: string, projectId: string, fieldId: string, value: string) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      const response = await this.projectIssueFieldService.createOption(workspaceSlug, projectId, fieldId, value);

      runInAction(() => {
        this.upsertOption(projectId, fieldId, response);
        this.loader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  deleteOption = async (workspaceSlug: string, projectId: string, fieldId: string, optionId: string) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      await this.projectIssueFieldService.deleteOption(workspaceSlug, projectId, fieldId, optionId);

      runInAction(() => {
        this.removeOption(projectId, fieldId, optionId);
        this.loader = false;
      });
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  updateIssueValues = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueFieldValuesUpdatePayload
  ) => {
    const response = await this.projectIssueFieldService.updateIssueValues(workspaceSlug, projectId, issueId, data);

    this.projectRootStore.rootStore.issue.issues.updateIssue(issueId, response);

    return response;
  };

  private orderFields = (fields: TProjectIssueField[]) => sortBy(fields, [(field) => field.sort_order]);

  private upsertField = (projectId: string, field: TProjectIssueField) => {
    const map = field.is_disabled ? this.disabledFieldsMap : this.fieldsMap;
    const otherMap = field.is_disabled ? this.fieldsMap : this.disabledFieldsMap;

    set(map, [projectId], this.upsertInList(map[projectId] ?? [], field));
    set(
      otherMap,
      [projectId],
      (otherMap[projectId] ?? []).filter((currentField) => currentField.id !== field.id)
    );
  };

  private upsertOption = (projectId: string, fieldId: string, option: TProjectIssueFieldOption) => {
    this.upsertFieldOption(this.fieldsMap, projectId, fieldId, option);
    this.upsertFieldOption(this.disabledFieldsMap, projectId, fieldId, option);
  };

  private removeOption = (projectId: string, fieldId: string, optionId: string) => {
    this.removeFieldOption(this.fieldsMap, projectId, fieldId, optionId);
    this.removeFieldOption(this.disabledFieldsMap, projectId, fieldId, optionId);
  };

  private upsertFieldOption = (
    map: Record<string, TProjectIssueField[]>,
    projectId: string,
    fieldId: string,
    option: TProjectIssueFieldOption
  ) => {
    const fields = map[projectId];
    if (!fields) return;

    set(
      map,
      [projectId],
      fields.map((field) => {
        if (field.id !== fieldId) return field;

        return Object.assign({}, field, {
          options: sortBy(this.upsertInList(field.options, option), [(currentOption) => currentOption.sort_order]),
        });
      })
    );
  };

  private removeFieldOption = (
    map: Record<string, TProjectIssueField[]>,
    projectId: string,
    fieldId: string,
    optionId: string
  ) => {
    const fields = map[projectId];
    if (!fields) return;

    set(
      map,
      [projectId],
      fields.map((field) => {
        if (field.id !== fieldId) return field;

        return Object.assign({}, field, {
          options: field.options.filter((option) => option.id !== optionId),
        });
      })
    );
  };

  private upsertInList = <T extends { id: string; sort_order: number }>(list: T[], item: T) => {
    const itemExists = list.some((currentItem) => currentItem.id === item.id);
    const updatedList = itemExists
      ? list.map((currentItem) => (currentItem.id === item.id ? item : currentItem))
      : [...list, item];

    return sortBy(updatedList, [(currentItem) => currentItem.sort_order]);
  };
}
