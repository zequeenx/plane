/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// local imports
import type { TSubStateDropdownBaseProps } from "./base";
import { SubStateDropdownBase } from "./base";

export type TSubStateDropdownProps = Omit<TSubStateDropdownBaseProps, "getSubStateById" | "subStates"> & {
  stateId: string | null | undefined;
};

export const SubStateDropdown = observer(function SubStateDropdown(props: TSubStateDropdownProps) {
  const { disabled = false, stateId } = props;
  // store hooks
  const { getSubStateById, getSubStatesByStateId } = useProjectState();
  // derived values
  const subStates = getSubStatesByStateId(stateId);

  return (
    <SubStateDropdownBase
      {...props}
      disabled={disabled || !stateId || subStates.length === 0}
      getSubStateById={getSubStateById}
      subStates={subStates}
    />
  );
});
