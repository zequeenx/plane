import { DRAG_ALLOWED_GROUPS } from "@plane/constants";
import type {
  TCustomPropertyKey,
  TIssue,
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
export type TParsedCustomFieldGroup = { fieldId: string; scope: TCustomFieldGroupScope };
export type TIssueApiPayload = Omit<Partial<TIssue>, TCustomFieldGroupKey>;

export type TCustomFieldGroupColumn = {
  avatarUrl?: string;
  id: string;
  kind: "all" | "member" | "none" | "option";
  name: string;
};

type TMemberColumnInput = {
  avatarUrl?: string;
  displayName: string;
  id: string;
};

export const parseCustomFieldGroupKey = (
  key: TIssueGroupByOptions | string | null | undefined
): TParsedCustomFieldGroup | undefined => {
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

export const isIssueGroupDragAllowed = (groupBy: TIssueGroupByOptions | undefined) =>
  !!groupBy && (isCustomFieldGroupKey(groupBy) || DRAG_ALLOWED_GROUPS.includes(groupBy));

export const normalizeCustomFieldGroupId = (groupId: string) => (groupId === "None" ? null : groupId);

export const getCustomFieldGroupValue = (
  issue: Partial<TIssue> | undefined,
  key: TCustomFieldGroupKey,
  moduleId?: string | null
): string | null => {
  if (!issue) return null;

  const annotation = issue[key];
  if (typeof annotation === "string" || annotation === null) return annotation;

  const parsed = parseCustomFieldGroupKey(key);
  if (!parsed) return null;

  const fallback =
    parsed.scope === "project"
      ? issue.field_values?.[parsed.fieldId]
      : moduleId
        ? issue.module_field_values?.[moduleId]?.[parsed.fieldId]
        : undefined;

  return typeof fallback === "string" ? fallback : null;
};

export const applyCustomFieldGroupValue = (
  issue: TIssue,
  key: TCustomFieldGroupKey,
  groupId: string,
  moduleId?: string | null
): TIssue => {
  const value = normalizeCustomFieldGroupId(groupId);
  const parsed = parseCustomFieldGroupKey(key);
  if (!parsed) return issue;

  if (parsed.scope === "project")
    return {
      ...issue,
      [key]: value,
      field_values: { ...issue.field_values, [parsed.fieldId]: value },
    };

  if (!moduleId) return issue;

  return {
    ...issue,
    [key]: value,
    module_field_values: {
      ...issue.module_field_values,
      [moduleId]: {
        ...issue.module_field_values?.[moduleId],
        [parsed.fieldId]: value,
      },
    },
  };
};

export const stripCustomFieldGroupAnnotations = (data: Partial<TIssue>): TIssueApiPayload => {
  const payload: TIssueApiPayload = {};
  for (const [key, value] of Object.entries(data)) {
    if (!isCustomFieldGroupKey(key)) Object.assign(payload, { [key]: value });
  }
  return payload;
};

export const resolveCustomFieldGroupField = ({
  customGroup,
  getModuleField,
  getProjectField,
  projectId,
  sourceModuleId,
}: {
  customGroup: TParsedCustomFieldGroup;
  getModuleField: (moduleId: string, fieldId: string) => TModuleIssueField | undefined;
  getProjectField: (projectId: string, fieldId: string) => TProjectIssueField | undefined;
  projectId?: string;
  sourceModuleId?: string | null;
}): TProjectIssueField | TModuleIssueField | undefined => {
  if (customGroup.scope === "project") return projectId ? getProjectField(projectId, customGroup.fieldId) : undefined;
  return sourceModuleId ? getModuleField(sourceModuleId, customGroup.fieldId) : undefined;
};

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

export const getCustomFieldGroupColumns = ({
  field,
  isEpic,
  isLoading,
  members,
}: {
  field: TProjectIssueField | TModuleIssueField | undefined;
  isEpic: boolean;
  isLoading: boolean;
  members: TMemberColumnInput[];
}): TCustomFieldGroupColumn[] | undefined => {
  if (isLoading) return undefined;
  if (!field || !isGroupableCustomField(field))
    return [{ id: "All Issues", kind: "all", name: `All ${isEpic ? "Epics" : "work items"}` }];
  return buildCustomFieldGroupColumns(field, members);
};

export const executeCustomFieldGroupDrop = async ({
  onPartialFailure,
  onReconciliationError,
  onRollback,
  persistAdditionalOperations = [],
  persistFieldValue,
  persistSortOrder,
}: {
  onPartialFailure: () => Promise<void>;
  onReconciliationError: (error: unknown) => void;
  onRollback: () => Promise<void> | void;
  persistAdditionalOperations?: (() => Promise<unknown> | unknown)[];
  persistFieldValue: () => Promise<unknown> | unknown;
  persistSortOrder?: () => Promise<unknown> | unknown;
}) => {
  const operationCallbacks = [
    persistFieldValue,
    ...(persistSortOrder ? [persistSortOrder] : []),
    ...persistAdditionalOperations,
  ];
  const operations = operationCallbacks.map((operation) => Promise.resolve().then(operation));
  const results = await Promise.allSettled(operations);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (!rejected) return;

  const fulfilledCount = results.filter((result) => result.status === "fulfilled").length;
  try {
    if (fulfilledCount > 0) await onPartialFailure();
    else await onRollback();
  } catch (reconciliationError) {
    try {
      onReconciliationError(reconciliationError);
    } catch {
      // Reporting must not replace the persistence error consumed by the drag handler.
    }
  }

  throw rejected.reason;
};
