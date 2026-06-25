/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { PlusIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IState, ISubState, TStateOperationsCallbacks } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { SubStateForm } from "./sub-state-form";
import { getSubStateErrorMessage, SubStateItem } from "./sub-state-item";

type TSubStateListProps = {
  state: IState;
  disabled: boolean;
  createSubState: TStateOperationsCallbacks["createSubState"];
  updateSubState: TStateOperationsCallbacks["updateSubState"];
  deleteSubState: TStateOperationsCallbacks["deleteSubState"];
};

const getNextSubStateSequence = (subStates: ISubState[]) => {
  if (subStates.length === 0) return 65535;

  return Math.max(...subStates.map((subState) => subState.sequence)) + 10000;
};

export const SubStateList = observer(function SubStateList(props: TSubStateListProps) {
  const { state, disabled, createSubState, updateSubState, deleteSubState } = props;
  // states
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // derived values
  const subStates = useMemo(() => {
    const sortedSubStates = [...(state.sub_states ?? [])];

    // oxlint-disable unicorn/no-array-sort -- This copied array keeps source data immutable without requiring ES2023 toSorted.
    return sortedSubStates.sort((a, b) => a.sequence - b.sequence);
    // oxlint-enable unicorn/no-array-sort
  }, [state.sub_states]);

  const handleCreate = async (formData: Partial<ISubState>) => {
    setIsSubmitting(true);

    try {
      await createSubState(state.id, formData);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Sub-state created successfully.",
      });
      setIsCreating(false);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: getSubStateErrorMessage(error, "Sub-state could not be created. Please try again."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (disabled && subStates.length === 0) return null;

  return (
    <div className="mt-3 border-t border-subtle pt-2">
      <div className="space-y-1 pl-8">
        {subStates.map((subState) => (
          <SubStateItem
            key={subState.id}
            stateId={state.id}
            subState={subState}
            disabled={disabled}
            updateSubState={updateSubState}
            deleteSubState={deleteSubState}
          />
        ))}

        {!disabled &&
          (isCreating ? (
            <SubStateForm
              data={{
                name: "",
                color: state.color,
                icon: "",
                sequence: getNextSubStateSequence(subStates),
              }}
              onSubmit={handleCreate}
              onCancel={() => setIsCreating(false)}
              buttonDisabled={isSubmitting}
              buttonTitle={isSubmitting ? "Creating" : "Create"}
            />
          ) : (
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-12 text-secondary transition-colors hover:bg-layer-1 hover:text-primary",
                subStates.length === 0 && "text-tertiary"
              )}
              onClick={() => setIsCreating(true)}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add sub-state
            </button>
          ))}
      </div>
    </div>
  );
});
