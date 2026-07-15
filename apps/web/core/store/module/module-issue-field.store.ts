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
  TIssueFieldValue,
  TIssueCustomFieldLocalUpdater,
  TIssueModuleFieldValues,
  TModuleIssueField,
  TModuleIssueFieldOption,
  TModuleIssueFieldPayload,
  TModuleIssueFieldUpdatePayload,
  TModuleIssueFieldValuesUpdatePayload,
} from "@plane/types";
import { EProjectIssueFieldType } from "@plane/types";
// services
import { ModuleIssueFieldService } from "@/services/module";
// store
import {
  enqueueCustomFieldMutation,
  reconcileCustomFieldMutationValues,
} from "@/store/issue/custom-field-mutation-queue";
import type { CoreRootStore } from "@/store/root.store";

type TModuleFieldValuesResponse = {
  module_field_values: Record<string, TModuleIssueFieldValuesUpdatePayload["field_values"]>;
};

export interface IModuleIssueFieldStore {
  // states
  loader: boolean;
  fieldsLoader: Record<string, boolean>;
  disabledFieldsLoader: Record<string, boolean>;
  // observables
  fieldsMap: Record<string, TModuleIssueField[]>;
  disabledFieldsMap: Record<string, TModuleIssueField[]>;
  // computed actions
  getFieldsByModuleId: (moduleId: string) => TModuleIssueField[] | undefined;
  getDisabledFieldsByModuleId: (moduleId: string) => TModuleIssueField[] | undefined;
  getFieldById: (moduleId: string, fieldId: string) => TModuleIssueField | undefined;
  getDisabledFieldById: (moduleId: string, fieldId: string) => TModuleIssueField | undefined;
  // actions
  getFields: (workspaceSlug: string, projectId: string, moduleId: string) => Promise<TModuleIssueField[]>;
  getDisabledFields: (workspaceSlug: string, projectId: string, moduleId: string) => Promise<TModuleIssueField[]>;
  createField: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    data: TModuleIssueFieldPayload
  ) => Promise<TModuleIssueField>;
  updateField: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    data: TModuleIssueFieldUpdatePayload
  ) => Promise<TModuleIssueField>;
  deleteField: (workspaceSlug: string, projectId: string, moduleId: string, fieldId: string) => Promise<void>;
  createOption: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    value: string
  ) => Promise<TModuleIssueFieldOption>;
  deleteOption: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    optionId: string
  ) => Promise<void>;
  updateIssueValues: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string,
    data: TModuleIssueFieldValuesUpdatePayload,
    updateLocalState?: TIssueCustomFieldLocalUpdater
  ) => Promise<TModuleFieldValuesResponse>;
  deleteIssueValue: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string,
    fieldId: string
  ) => Promise<TModuleFieldValuesResponse>;
}

export class ModuleIssueFieldStore implements IModuleIssueFieldStore {
  // states
  loader: boolean = false;
  fieldsLoader: Record<string, boolean> = {};
  disabledFieldsLoader: Record<string, boolean> = {};
  // observables
  fieldsMap: Record<string, TModuleIssueField[]> = {};
  disabledFieldsMap: Record<string, TModuleIssueField[]> = {};
  // root store
  rootStore: CoreRootStore;
  // services
  moduleIssueFieldService;

  constructor(_rootStore: CoreRootStore) {
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
      deleteIssueValue: action,
    });

    this.rootStore = _rootStore;
    this.moduleIssueFieldService = new ModuleIssueFieldService();
  }

  getFieldsByModuleId = computedFn((moduleId: string) => this.fieldsMap[moduleId]);

  getDisabledFieldsByModuleId = computedFn((moduleId: string) => this.disabledFieldsMap[moduleId]);

  getFieldById = computedFn((moduleId: string, fieldId: string) =>
    this.fieldsMap[moduleId]?.find((field) => field.id === fieldId)
  );

  getDisabledFieldById = computedFn((moduleId: string, fieldId: string) =>
    this.disabledFieldsMap[moduleId]?.find((field) => field.id === fieldId)
  );

  getFields = async (workspaceSlug: string, projectId: string, moduleId: string) => {
    try {
      runInAction(() => {
        set(this.fieldsLoader, [moduleId], true);
      });
      const response = await this.moduleIssueFieldService.list(workspaceSlug, projectId, moduleId);

      runInAction(() => {
        set(this.fieldsMap, [moduleId], this.orderFields(response));
        set(this.fieldsLoader, [moduleId], false);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.fieldsLoader, [moduleId], false);
      });
      throw error;
    }
  };

  getDisabledFields = async (workspaceSlug: string, projectId: string, moduleId: string) => {
    try {
      runInAction(() => {
        set(this.disabledFieldsLoader, [moduleId], true);
      });
      const response = await this.moduleIssueFieldService.listDisabled(workspaceSlug, projectId, moduleId);

      runInAction(() => {
        set(this.disabledFieldsMap, [moduleId], this.orderFields(response));
        set(this.disabledFieldsLoader, [moduleId], false);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.disabledFieldsLoader, [moduleId], false);
      });
      throw error;
    }
  };

  createField = async (workspaceSlug: string, projectId: string, moduleId: string, data: TModuleIssueFieldPayload) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      const response = await this.moduleIssueFieldService.create(workspaceSlug, projectId, moduleId, data);

      runInAction(() => {
        this.upsertField(moduleId, response);
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
    moduleId: string,
    fieldId: string,
    data: TModuleIssueFieldUpdatePayload
  ) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      const response = await this.moduleIssueFieldService.update(workspaceSlug, projectId, moduleId, fieldId, data);

      if (data.is_disabled === true || data.is_disabled === false) {
        await Promise.all([
          this.getFields(workspaceSlug, projectId, moduleId),
          this.getDisabledFields(workspaceSlug, projectId, moduleId),
        ]);
        if (data.is_disabled === true) {
          runInAction(() => {
            this.removeFieldValuesFromCachedIssues(projectId, moduleId, fieldId);
          });
        }
      } else {
        runInAction(() => {
          this.upsertField(moduleId, response);
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

  deleteField = async (workspaceSlug: string, projectId: string, moduleId: string, fieldId: string) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      await this.moduleIssueFieldService.deleteField(workspaceSlug, projectId, moduleId, fieldId);
      await Promise.all([
        this.getFields(workspaceSlug, projectId, moduleId),
        this.getDisabledFields(workspaceSlug, projectId, moduleId),
      ]);
      runInAction(() => {
        this.removeFieldValuesFromCachedIssues(projectId, moduleId, fieldId);
        this.loader = false;
      });
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  createOption = async (workspaceSlug: string, projectId: string, moduleId: string, fieldId: string, value: string) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      const response = await this.moduleIssueFieldService.createOption(
        workspaceSlug,
        projectId,
        moduleId,
        fieldId,
        value
      );

      runInAction(() => {
        this.upsertOption(moduleId, fieldId, response);
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

  deleteOption = async (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    optionId: string
  ) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      await this.moduleIssueFieldService.deleteOption(workspaceSlug, projectId, moduleId, fieldId, optionId);

      runInAction(() => {
        this.removeOption(moduleId, fieldId, optionId);
        this.removeOptionValuesFromCachedIssues(projectId, moduleId, fieldId, optionId);
        this.loader = false;
      });
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  updateIssueValues = (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string,
    data: TModuleIssueFieldValuesUpdatePayload,
    updateLocalState?: TIssueCustomFieldLocalUpdater
  ) =>
    enqueueCustomFieldMutation(
      Object.keys(data.field_values).map((fieldId) => `module:${moduleId}:${issueId}:${fieldId}`),
      async () => {
        const issue = this.rootStore.issue.issues.getIssueById(issueId);
        const previousFieldValues = Object.fromEntries(
          Object.keys(data.field_values).map((fieldId) => [
            fieldId,
            issue?.module_field_values?.[moduleId]?.[fieldId] ?? null,
          ])
        );
        updateLocalState?.(issueId, { fieldValues: data.field_values, moduleId, scope: "module" });

        let response: TModuleFieldValuesResponse;
        try {
          response = await this.moduleIssueFieldService.updateIssueValues(
            workspaceSlug,
            projectId,
            moduleId,
            issueId,
            data
          );
        } catch (error) {
          updateLocalState?.(issueId, { fieldValues: previousFieldValues, moduleId, scope: "module" });
          throw error;
        }

        this.updateIssueModuleFieldValues(issueId, moduleId, response, data);

        return response;
      }
    );

  deleteIssueValue = async (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string,
    fieldId: string
  ) => {
    const response = await this.moduleIssueFieldService.deleteIssueValue(
      workspaceSlug,
      projectId,
      moduleId,
      issueId,
      fieldId
    );

    this.updateIssueModuleFieldValues(issueId, moduleId, response, { field_values: { [fieldId]: null } });

    return response;
  };

  private orderFields = (fields: TModuleIssueField[]) => sortBy(fields, [(field) => field.sort_order]);

  private upsertField = (moduleId: string, field: TModuleIssueField) => {
    const map = field.is_disabled ? this.disabledFieldsMap : this.fieldsMap;
    const otherMap = field.is_disabled ? this.fieldsMap : this.disabledFieldsMap;

    set(map, [moduleId], this.upsertInList(map[moduleId] ?? [], field));
    set(
      otherMap,
      [moduleId],
      (otherMap[moduleId] ?? []).filter((currentField) => currentField.id !== field.id)
    );
  };

  private upsertOption = (moduleId: string, fieldId: string, option: TModuleIssueFieldOption) => {
    this.upsertFieldOption(this.fieldsMap, moduleId, fieldId, option);
    this.upsertFieldOption(this.disabledFieldsMap, moduleId, fieldId, option);
  };

  private removeOption = (moduleId: string, fieldId: string, optionId: string) => {
    this.removeFieldOption(this.fieldsMap, moduleId, fieldId, optionId);
    this.removeFieldOption(this.disabledFieldsMap, moduleId, fieldId, optionId);
  };

  private removeFieldValuesFromCachedIssues = (projectId: string, moduleId: string, fieldId: string) => {
    const issuesMap = this.rootStore.issue.issues.issuesMap;

    Object.values(issuesMap).forEach((issue) => {
      const moduleFieldValues = issue.module_field_values?.[moduleId];
      if (issue.project_id !== projectId || !moduleFieldValues || !(fieldId in moduleFieldValues)) return;

      const fieldValues = Object.assign({}, moduleFieldValues);
      delete fieldValues[fieldId];
      this.updateIssueModuleFieldValues(issue.id, moduleId, { module_field_values: { [moduleId]: fieldValues } });
    });
  };

  private removeOptionValuesFromCachedIssues = (
    projectId: string,
    moduleId: string,
    fieldId: string,
    optionId: string
  ) => {
    if (!this.isOptionField(moduleId, fieldId)) return;

    const issuesMap = this.rootStore.issue.issues.issuesMap;

    Object.values(issuesMap).forEach((issue) => {
      const moduleFieldValues = issue.module_field_values?.[moduleId];
      if (issue.project_id !== projectId || !moduleFieldValues || !(fieldId in moduleFieldValues)) return;

      const nextValue = this.removeOptionFromValue(moduleFieldValues[fieldId], optionId);
      const fieldValues = Object.assign({}, moduleFieldValues);

      if (typeof nextValue === "undefined") delete fieldValues[fieldId];
      else fieldValues[fieldId] = nextValue;

      this.updateIssueModuleFieldValues(issue.id, moduleId, { module_field_values: { [moduleId]: fieldValues } });
    });
  };

  private updateIssueModuleFieldValues = (
    issueId: string,
    moduleId: string,
    response: TModuleFieldValuesResponse,
    submittedData?: TModuleIssueFieldValuesUpdatePayload
  ) => {
    const issue = this.rootStore.issue.issues.getIssueById(issueId);
    const mergedModuleFieldValues: TIssueModuleFieldValues = Object.assign({}, issue?.module_field_values ?? {});
    const responseModuleFieldValues = response.module_field_values[moduleId];

    if (submittedData) {
      const reconciledModuleFieldValues = reconcileCustomFieldMutationValues(
        mergedModuleFieldValues[moduleId],
        responseModuleFieldValues,
        Object.keys(submittedData.field_values)
      );
      if (Object.keys(reconciledModuleFieldValues).length > 0)
        mergedModuleFieldValues[moduleId] = reconciledModuleFieldValues;
      else delete mergedModuleFieldValues[moduleId];
    } else if (Object.prototype.hasOwnProperty.call(response.module_field_values, moduleId)) {
      if (responseModuleFieldValues && Object.keys(responseModuleFieldValues).length > 0) {
        mergedModuleFieldValues[moduleId] = responseModuleFieldValues;
      } else {
        delete mergedModuleFieldValues[moduleId];
      }
    }

    this.rootStore.issue.issues.updateIssue(issueId, { module_field_values: mergedModuleFieldValues });
  };

  private isOptionField = (moduleId: string, fieldId: string) => {
    const field = this.getFieldById(moduleId, fieldId) ?? this.getDisabledFieldById(moduleId, fieldId);

    return (
      field?.field_type === EProjectIssueFieldType.SINGLE_SELECT ||
      field?.field_type === EProjectIssueFieldType.MULTI_SELECT
    );
  };

  private removeOptionFromValue = (
    fieldValue: TIssueFieldValue | undefined,
    optionId: string
  ): TIssueFieldValue | undefined => {
    if (fieldValue === optionId) return undefined;

    if (Array.isArray(fieldValue)) {
      const filteredValue = fieldValue.filter((currentOptionId) => currentOptionId !== optionId);
      return filteredValue.length > 0 ? filteredValue : undefined;
    }

    return fieldValue;
  };

  private upsertFieldOption = (
    map: Record<string, TModuleIssueField[]>,
    moduleId: string,
    fieldId: string,
    option: TModuleIssueFieldOption
  ) => {
    const fields = map[moduleId];
    if (!fields) return;

    set(
      map,
      [moduleId],
      fields.map((field) => {
        if (field.id !== fieldId) return field;

        return Object.assign({}, field, {
          options: sortBy(this.upsertInList(field.options, option), [(currentOption) => currentOption.sort_order]),
        });
      })
    );
  };

  private removeFieldOption = (
    map: Record<string, TModuleIssueField[]>,
    moduleId: string,
    fieldId: string,
    optionId: string
  ) => {
    const fields = map[moduleId];
    if (!fields) return;

    set(
      map,
      [moduleId],
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
