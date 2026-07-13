import type {
  TCustomPropertyKey,
  TIssueGroupByOptions,
  TModuleCustomPropertyKey,
  TModuleIssueField,
  TProjectIssueField,
} from "@plane/types";
import { EProjectIssueFieldType } from "@plane/types";

export const CUSTOM_PROPERTY_PREFIX = "customproperty_";
export const MODULE_CUSTOM_PROPERTY_PREFIX = "modulecustomproperty_";

export type TCustomFieldGroupKey = TCustomPropertyKey | TModuleCustomPropertyKey;
export type TCustomFieldGroupScope = "project" | "module";

export type TCustomFieldGroupColumn = {
  avatarUrl?: string;
  id: string;
  kind: "member" | "none" | "option";
  name: string;
};

type TMemberColumnInput = {
  avatarUrl?: string;
  displayName: string;
  id: string;
};

export const parseCustomFieldGroupKey = (
  key: TIssueGroupByOptions | string | null | undefined
): { fieldId: string; scope: TCustomFieldGroupScope } | undefined => {
  if (!key) return undefined;
  if (key.startsWith(MODULE_CUSTOM_PROPERTY_PREFIX)) {
    const fieldId = key.slice(MODULE_CUSTOM_PROPERTY_PREFIX.length);
    return fieldId ? { fieldId, scope: "module" } : undefined;
  }
  if (key.startsWith(CUSTOM_PROPERTY_PREFIX)) {
    const fieldId = key.slice(CUSTOM_PROPERTY_PREFIX.length);
    return fieldId ? { fieldId, scope: "project" } : undefined;
  }
  return undefined;
};

export const isCustomFieldGroupKey = (
  key: TIssueGroupByOptions | string | null | undefined
): key is TCustomFieldGroupKey => !!parseCustomFieldGroupKey(key);

export const isGroupableCustomField = (field: TProjectIssueField | TModuleIssueField) =>
  !field.is_disabled &&
  (field.field_type === EProjectIssueFieldType.SINGLE_SELECT ||
    field.field_type === EProjectIssueFieldType.SINGLE_MEMBER);

export const buildCustomFieldGroupOptions = ({
  moduleFields = [],
  moduleLabel,
  moduleName,
  projectFields = [],
  projectLabel,
}: {
  moduleFields?: TModuleIssueField[];
  moduleLabel: string;
  moduleName?: string;
  projectFields?: TProjectIssueField[];
  projectLabel: string;
}): { key: TCustomFieldGroupKey; title: string }[] => {
  const projectOptions = projectFields.filter(isGroupableCustomField).map((field) => ({
    key: `${CUSTOM_PROPERTY_PREFIX}${field.id}` as TCustomPropertyKey,
    title: `${field.name} (${projectLabel})`,
  }));
  const moduleOptions = moduleName
    ? moduleFields.filter(isGroupableCustomField).map((field) => ({
        key: `${MODULE_CUSTOM_PROPERTY_PREFIX}${field.id}` as TModuleCustomPropertyKey,
        title: `${field.name} (${moduleLabel} ${moduleName})`,
      }))
    : [];
  return [...projectOptions, ...moduleOptions];
};

export const buildCustomFieldGroupColumns = (
  field: TProjectIssueField | TModuleIssueField,
  members: TMemberColumnInput[]
): TCustomFieldGroupColumn[] => {
  const columns =
    field.field_type === EProjectIssueFieldType.SINGLE_SELECT
      ? field.options.map((option) => ({ id: option.id, kind: "option" as const, name: option.value }))
      : members.map((member) => ({
          avatarUrl: member.avatarUrl,
          id: member.id,
          kind: "member" as const,
          name: member.displayName,
        }));
  return [...columns, { id: "None", kind: "none", name: "None" }];
};
