/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, computed, makeObservable, observable } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { TIssueGroupByOptions } from "@plane/types";
import { isIssueGroupDragAllowed } from "@/components/issues/issue-layouts/custom-field-grouping";
// constants
// store
import type { IssueRootStore } from "./root.store";

export interface IIssueKanBanViewStore {
  kanBanToggle: {
    groupByHeaderMinMax: string[];
    subgroupByIssuesVisibility: string[];
  };
  isDragging: boolean;
  // computed
  getCanUserDragDrop: (
    group_by: TIssueGroupByOptions | undefined,
    sub_group_by: TIssueGroupByOptions | undefined
  ) => boolean;
  canUserDragDropVertically: boolean;
  canUserDragDropHorizontally: boolean;
  // actions
  handleKanBanToggle: (toggle: "groupByHeaderMinMax" | "subgroupByIssuesVisibility", value: string) => void;
  setIsDragging: (isDragging: boolean) => void;
}

export class IssueKanBanViewStore implements IIssueKanBanViewStore {
  kanBanToggle: {
    groupByHeaderMinMax: string[];
    subgroupByIssuesVisibility: string[];
  } = { groupByHeaderMinMax: [], subgroupByIssuesVisibility: [] };
  isDragging = false;
  // root store
  rootStore;

  constructor(_rootStore: IssueRootStore) {
    makeObservable(this, {
      kanBanToggle: observable,
      isDragging: observable.ref,
      // computed
      canUserDragDropVertically: computed,
      canUserDragDropHorizontally: computed,

      // actions
      handleKanBanToggle: action,
      setIsDragging: action.bound,
    });

    this.rootStore = _rootStore;
  }

  setIsDragging = (isDragging: boolean) => {
    this.isDragging = isDragging;
  };

  getCanUserDragDrop = computedFn(
    (group_by: TIssueGroupByOptions | undefined, sub_group_by: TIssueGroupByOptions | undefined) => {
      if (isIssueGroupDragAllowed(group_by)) {
        if (!sub_group_by) return true;
        if (isIssueGroupDragAllowed(sub_group_by)) return true;
      }
      return false;
    }
  );

  get canUserDragDropVertically() {
    return false;
  }

  get canUserDragDropHorizontally() {
    return false;
  }

  handleKanBanToggle = (toggle: "groupByHeaderMinMax" | "subgroupByIssuesVisibility", value: string) => {
    this.kanBanToggle = {
      ...this.kanBanToggle,
      [toggle]: this.kanBanToggle[toggle].includes(value)
        ? this.kanBanToggle[toggle].filter((v) => v !== value)
        : [...this.kanBanToggle[toggle], value],
    };
  };
}
