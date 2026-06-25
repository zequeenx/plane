/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// types
import type { TSpreadsheetColumn } from "@plane/types";
// components
import { SubStateDropdown } from "@/components/dropdowns/sub-state";

export const SpreadsheetSubStateColumn: TSpreadsheetColumn = observer(function SpreadsheetSubStateColumn(props) {
  const { issue, onChange, disabled, onClose } = props;

  return (
    <div className="h-11 border-b-[0.5px] border-subtle">
      <SubStateDropdown
        value={issue.sub_state_id}
        stateId={issue.state_id}
        projectId={issue.project_id ?? undefined}
        onChange={(subStateId) =>
          onChange(issue, { sub_state_id: subStateId }, { changed_property: "sub_state", change_details: subStateId })
        }
        disabled={disabled}
        buttonVariant="transparent-with-text"
        buttonClassName="text-left rounded-none group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10 px-page-x"
        buttonContainerClassName="w-full"
        onClose={onClose}
        showTooltip
      />
    </div>
  );
});
