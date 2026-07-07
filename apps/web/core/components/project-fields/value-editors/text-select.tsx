/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useMemo, useRef, useState } from "react";
import { Combobox } from "@headlessui/react";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { observer } from "mobx-react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { EProjectIssueFieldType } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
import { useDropdownKeyDown } from "@/hooks/use-dropdown-key-down";
// local imports
import type { TProjectFieldEditorProps } from "./types";

export const ProjectFieldTextSelectEditor = observer(function ProjectFieldTextSelectEditor(
  props: TProjectFieldEditorProps
) {
  const { disabled = false, field, onChange, projectId, value, workspaceSlug } = props;
  const { t } = useTranslation();
  const { createOption, deleteOption } = useProjectIssueFields();
  const isMultiple = field.field_type === EProjectIssueFieldType.MULTI_SELECT;
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  // states
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [deleteOptionId, setDeleteOptionId] = useState<string | null>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  // popper-js init
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
    ],
  });

  const selectedOptionIds = useMemo(() => {
    if (isMultiple) return Array.isArray(value) ? value : [];
    return typeof value === "string" ? [value] : [];
  }, [isMultiple, value]);

  const selectedOptions = field.options.filter((option) => selectedOptionIds.includes(option.id));
  const deleteOptionValue = field.options.find((option) => option.id === deleteOptionId)?.value;
  const filteredOptions = field.options.filter((option) => option.value.toLowerCase().includes(query.toLowerCase()));
  const canCreateOption =
    query.trim().length > 0 &&
    !field.options.some((option) => option.value.trim().toLowerCase() === query.trim().toLowerCase());

  const closeDropdown = () => {
    setIsOpen(false);
    setQuery("");
  };

  const openDropdown = () => {
    if (disabled) return;
    setIsOpen(true);
    referenceElement?.focus();
  };

  const toggleDropdown = () => {
    if (isOpen) closeDropdown();
    else openDropdown();
  };

  const handleKeyDown = useDropdownKeyDown(openDropdown, closeDropdown, isOpen);
  useOutsideClickDetector(dropdownRef, closeDropdown);

  const handleSelect = (optionId: string) => {
    if (isMultiple) {
      const nextValue = selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((currentOptionId) => currentOptionId !== optionId)
        : [...selectedOptionIds, optionId];

      onChange(field.id, nextValue);
      return;
    }

    onChange(field.id, optionId === value ? null : optionId);
    closeDropdown();
  };

  const handleCreateOption = async () => {
    const optionValue = query.trim();
    if (!optionValue) return;

    try {
      setIsUpdating(true);
      const option = await createOption(workspaceSlug, projectId, field.id, optionValue);
      setQuery("");
      if (isMultiple) {
        onChange(field.id, [...selectedOptionIds, option.id]);
      } else {
        onChange(field.id, option.id);
        closeDropdown();
      }
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("project_settings.fields.toasts.option_created.error.message"),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteOptionClick = (event: React.MouseEvent<HTMLButtonElement>, optionId: string) => {
    event.stopPropagation();
    event.preventDefault();

    setDeleteOptionId(optionId);
  };

  const handleDeleteOption = async () => {
    if (!deleteOptionId) return;

    try {
      setIsUpdating(true);
      await deleteOption(workspaceSlug, projectId, field.id, deleteOptionId);
      if (selectedOptionIds.includes(deleteOptionId)) {
        const nextValue = selectedOptionIds.filter((currentOptionId) => currentOptionId !== deleteOptionId);
        onChange(field.id, isMultiple ? nextValue : null);
      }
      setDeleteOptionId(null);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("project_settings.fields.toasts.option_deleted.error.message"),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const label =
    selectedOptions.length === 0
      ? field.name
      : isMultiple
        ? selectedOptions.length === 1
          ? selectedOptions[0].value
          : `${selectedOptions.length} selected`
        : (selectedOptions[0]?.value ?? field.name);

  return (
    <>
      <AlertModalCore
        handleClose={() => setDeleteOptionId(null)}
        handleSubmit={handleDeleteOption}
        isSubmitting={isUpdating}
        isOpen={!!deleteOptionId}
        primaryButtonText={{
          default: t("common.delete"),
          loading: t("common.deleting"),
        }}
        secondaryButtonText={t("common.cancel")}
        title={t("project_settings.fields.options.delete_modal.title")}
        content={
          <>
            {t("project_settings.fields.options.delete_modal.description_prefix")}{" "}
            <span className="font-medium text-primary">{deleteOptionValue}</span>?{" "}
            {t("project_settings.fields.options.delete_modal.description_suffix")}
          </>
        }
      />
      <Combobox
        as="div"
        ref={dropdownRef}
        role="presentation"
        value={isMultiple ? selectedOptionIds : (selectedOptionIds[0] ?? null)}
        onChange={handleSelect}
        disabled={disabled || isUpdating}
        className="group relative h-7.5 w-full grow text-left"
        onKeyDown={handleKeyDown}
      >
        <Combobox.Button as={Fragment}>
          <button
            ref={setReferenceElement}
            type="button"
            className={cn(
              "group flex h-7.5 w-full items-center justify-between gap-2 rounded-sm px-2 text-body-xs-regular outline-none",
              disabled || isUpdating
                ? "cursor-not-allowed text-secondary"
                : "cursor-pointer text-primary hover:bg-layer-transparent-hover",
              selectedOptions.length === 0 && "text-placeholder"
            )}
            onClick={toggleDropdown}
            disabled={disabled || isUpdating}
          >
            <span className="min-w-0 grow truncate text-left">{label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {!disabled && <ChevronDown className="hidden h-3.5 w-3.5 text-secondary group-hover:inline" />}
            </span>
          </button>
        </Combobox.Button>
        {!disabled && selectedOptions.length > 0 && (
          <button
            type="button"
            aria-label={t("common.clear")}
            className="pointer-events-none absolute top-1/2 right-5 inline-flex -translate-y-1/2 rounded-sm text-secondary opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 hover:text-primary focus:pointer-events-auto focus:opacity-100"
            title={t("common.clear")}
            onClick={(event) => {
              event.stopPropagation();
              onChange(field.id, isMultiple ? [] : null);
            }}
            disabled={isUpdating}
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
        {isOpen &&
          createPortal(
            <Combobox.Options data-prevent-outside-click static>
              <div
                ref={setPopperElement}
                style={styles.popper}
                {...attributes.popper}
                className="z-30 my-1 w-56 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
              >
                <Combobox.Input
                  className="w-full rounded-sm border border-subtle bg-surface-2 px-2 py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("search")}
                />
                <div className="vertical-scrollbar mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {filteredOptions.length > 0 ? (
                    filteredOptions.map((option) => {
                      const isSelected = selectedOptionIds.includes(option.id);

                      return (
                        <Combobox.Option
                          key={option.id}
                          value={option.id}
                          className={({ active }) =>
                            cn(
                              "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 text-secondary select-none",
                              active && "bg-layer-transparent-hover",
                              isSelected && "text-primary"
                            )
                          }
                        >
                          <span className="min-w-0 flex-grow truncate">{option.value}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {isSelected && <Check className="h-3.5 w-3.5" />}
                            {!disabled && (
                              <Tooltip tooltipContent={t("common.delete")}>
                                <button
                                  type="button"
                                  className="rounded-sm text-tertiary hover:text-danger-primary"
                                  disabled={isUpdating}
                                  onClick={(event) => handleDeleteOptionClick(event, option.id)}
                                  aria-label={t("project_settings.fields.options.delete_option_aria_label", {
                                    option: option.value,
                                  })}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </Tooltip>
                            )}
                          </span>
                        </Combobox.Option>
                      );
                    })
                  ) : (
                    <p className="px-1.5 py-1 text-placeholder italic">{t("no_matching_results")}</p>
                  )}
                </div>
                {canCreateOption && !disabled && (
                  <div className="mt-2 border-t border-subtle pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      prependIcon={<Plus className="h-3.5 w-3.5" />}
                      disabled={isUpdating}
                      onClick={handleCreateOption}
                    >
                      {query.trim()}
                    </Button>
                  </div>
                )}
              </div>
            </Combobox.Options>,
            document.body
          )}
      </Combobox>
    </>
  );
});
