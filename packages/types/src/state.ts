/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TStateGroups = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

export interface ISubState {
  readonly id: string;
  state_id: string;
  project_id: string;
  workspace_id: string;
  name: string;
  color: string;
  icon: string | null;
  sequence: number;
}

export interface IState {
  readonly id: string;
  color: string;
  default: boolean;
  description: string;
  group: TStateGroups;
  name: string;
  project_id: string;
  sequence: number;
  workspace_id: string;
  order: number;
  sub_states?: ISubState[];
}

export interface IStateLite {
  color: string;
  group: TStateGroups;
  id: string;
  name: string;
}

export interface IStateResponse {
  [key: string]: IState[];
}

export type TStateOperationsCallbacks = {
  createState: (data: Partial<IState>) => Promise<IState>;
  updateState: (stateId: string, data: Partial<IState>) => Promise<IState | undefined>;
  deleteState: (stateId: string) => Promise<void>;
  createSubState: (stateId: string, data: Partial<ISubState>) => Promise<ISubState>;
  updateSubState: (stateId: string, subStateId: string, data: Partial<ISubState>) => Promise<ISubState | undefined>;
  deleteSubState: (stateId: string, subStateId: string) => Promise<void>;
  moveStatePosition: (stateId: string, data: Partial<IState>) => Promise<void>;
  markStateAsDefault: (stateId: string) => Promise<void>;
};
