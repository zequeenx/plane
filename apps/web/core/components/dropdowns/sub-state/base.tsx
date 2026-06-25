/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CheckIcon, ChevronDownIcon, SearchIcon, StatePropertyIcon } from "@plane/propel/icons";
import type { ISubState } from "@plane/types";
import { ComboDropDown } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { DropdownButton } from "@/components/dropdowns/buttons";
import { BUTTON_VARIANTS_WITH_TEXT } from "@/components/dropdowns/constants";
import type { TDropdownProps } from "@/components/dropdowns/types";
// hooks
import { useDropdown } from "@/hooks/use-dropdown";

export type TSubStateDropdownBaseProps = TDropdownProps & {
  button?: ReactNode;
  dropdownArrow?: boolean;
  dropdownArrowClassName?: string;
  getSubStateById: (subStateId: string | null | undefined) => ISubState | undefined;
  iconSize?: string;
  onChange: (subStateId: string | null) => void;
  onClose?: () => void;
  projectId: string | undefined;
  renderByDefault?: boolean;
  showTooltip?: boolean;
  subStates: ISubState[];
  value: string | null | undefined;
};

export const SubStateDropdownBase = observer(function SubStateDropdownBase(props: TSubStateDropdownBaseProps) {
  const {
    button,
    buttonClassName,
    buttonContainerClassName,
    buttonVariant,
    className = "",
    disabled = false,
    dropdownArrow = false,
    dropdownArrowClassName = "",
    getSubStateById,
    hideIcon = false,
    iconSize = "size-4",
    onChange,
    onClose,
    placement,
    renderByDefault = true,
    showTooltip = false,
    subStates,
    tabIndex,
    value,
  } = props;
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // popper-js refs
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  // states
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  // store hooks
  const { t } = useTranslation();

  const selectedSubState = value ? getSubStateById(value) : undefined;
  const isDropdownDisabled = disabled || subStates.length === 0;
  const placeholder = "Sub-state";
  const noSubStateLabel = "No sub-state";

  // popper-js init
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
    ],
  });
  // dropdown init
  const { handleClose, handleKeyDown, handleOnClick, searchInputKeyDown } = useDropdown({
    dropdownRef,
    inputRef,
    isOpen,
    onClose,
    query,
    setIsOpen,
    setQuery,
  });

  const options = subStates.map((subState) => ({
    value: subState.id,
    query: subState.name,
    content: (
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: subState.color }}
          aria-hidden="true"
        />
        {subState.icon && <span className="flex-shrink-0">{subState.icon}</span>}
        <span className="flex-grow truncate text-left">{subState.name}</span>
      </div>
    ),
  }));

  const filteredOptions =
    query === "" ? options : options.filter((option) => option.query.toLowerCase().includes(query.toLowerCase()));

  const dropdownOnChange = (subStateId: string | null) => {
    onChange(subStateId);
    handleClose();
  };

  const comboButton = button ? (
    <button
      ref={setReferenceElement}
      type="button"
      className={cn("clickable block h-full w-full outline-none", buttonContainerClassName)}
      onClick={handleOnClick}
      disabled={isDropdownDisabled}
      tabIndex={tabIndex}
    >
      {button}
    </button>
  ) : (
    <button
      tabIndex={tabIndex}
      ref={setReferenceElement}
      type="button"
      className={cn(
        "clickable block h-full max-w-full outline-none",
        {
          "cursor-not-allowed text-secondary": isDropdownDisabled,
          "cursor-pointer": !isDropdownDisabled,
        },
        buttonContainerClassName
      )}
      onClick={handleOnClick}
      disabled={isDropdownDisabled}
    >
      <DropdownButton
        className={buttonClassName}
        isActive={isOpen}
        tooltipHeading={placeholder}
        tooltipContent={selectedSubState?.name ?? placeholder}
        showTooltip={showTooltip}
        variant={buttonVariant}
        renderToolTipByDefault={renderByDefault}
      >
        {!hideIcon &&
          (selectedSubState ? (
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: selectedSubState.color }}
              aria-hidden="true"
            />
          ) : (
            <StatePropertyIcon className={cn("flex-shrink-0 text-tertiary", iconSize)} />
          ))}
        {selectedSubState?.icon && <span className="flex-shrink-0">{selectedSubState.icon}</span>}
        {BUTTON_VARIANTS_WITH_TEXT.includes(buttonVariant) && (
          <span className="flex-grow truncate text-left">{selectedSubState?.name ?? placeholder}</span>
        )}
        {dropdownArrow && (
          <ChevronDownIcon className={cn("h-2.5 w-2.5 flex-shrink-0", dropdownArrowClassName)} aria-hidden="true" />
        )}
      </DropdownButton>
    </button>
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <ComboDropDown
      as="div"
      ref={dropdownRef}
      className={cn("h-full", className)}
      value={value ?? null}
      onChange={dropdownOnChange}
      disabled={isDropdownDisabled}
      onKeyDown={handleKeyDown}
      button={comboButton}
      renderByDefault={renderByDefault}
    >
      {isOpen && (
        <Combobox.Options className="fixed z-10" static>
          <div
            className="my-1 w-48 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
          >
            <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
              <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
              <Combobox.Input
                as="input"
                ref={inputRef}
                className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.search.label")}
                displayValue={(assigned: any) => assigned?.name}
                onKeyDown={searchInputKeyDown}
              />
            </div>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
              <Combobox.Option
                value={null}
                className={({ active, selected }) =>
                  cn(
                    "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                    {
                      "bg-layer-transparent-hover": active,
                      "text-primary": selected,
                      "text-secondary": !selected,
                    }
                  )
                }
              >
                {({ selected }) => (
                  <>
                    <span className="flex-grow truncate">{noSubStateLabel}</span>
                    {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                  </>
                )}
              </Combobox.Option>
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <Combobox.Option
                    key={option.value}
                    value={option.value}
                    className={({ active, selected }) =>
                      cn(
                        "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                        {
                          "bg-layer-transparent-hover": active,
                          "text-primary": selected,
                          "text-secondary": !selected,
                        }
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className="flex-grow truncate">{option.content}</span>
                        {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                      </>
                    )}
                  </Combobox.Option>
                ))
              ) : (
                <p className="px-1.5 py-1 text-placeholder italic">{t("common.search.no_matches_found")}</p>
              )}
            </div>
          </div>
        </Combobox.Options>
      )}
    </ComboDropDown>
  );
});
