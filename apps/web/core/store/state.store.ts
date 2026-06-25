/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, groupBy } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import { STATE_GROUPS } from "@plane/constants";
import type { IIntakeState, IState, ISubState } from "@plane/types";
// helpers
import { sortStates } from "@plane/utils";
// plane web
import { ProjectStateService } from "@/services/project/project-state.service";
import type { RootStore } from "@/plane-web/store/root.store";

export interface IStateStore {
  //Loaders
  fetchedMap: Record<string, boolean>;
  fetchedIntakeMap: Record<string, boolean>;
  // observables
  stateMap: Record<string, IState>;
  subStateMap: Record<string, ISubState>;
  intakeStateMap: Record<string, IIntakeState>;
  // computed
  workspaceStates: IState[] | undefined;
  projectStates: IState[] | undefined;
  subStates: ISubState[] | undefined;
  projectSubStates: ISubState[] | undefined;
  groupedProjectStates: Record<string, IState[]> | undefined;
  // computed actions
  getStateById: (stateId: string | null | undefined) => IState | undefined;
  getSubStateById: (subStateId: string | null | undefined) => ISubState | undefined;
  getSubStatesByStateId: (stateId: string | null | undefined) => ISubState[];
  getIntakeStateById: (intakeStateId: string | null | undefined) => IIntakeState | undefined;
  getProjectStates: (projectId: string | null | undefined) => IState[] | undefined;
  getProjectIntakeState: (projectId: string | null | undefined) => IIntakeState | undefined;
  getProjectStateIds: (projectId: string | null | undefined) => string[] | undefined;
  getProjectIntakeStateIds: (projectId: string | null | undefined) => string[] | undefined;
  getProjectDefaultStateId: (projectId: string | null | undefined) => string | undefined;
  // fetch actions
  fetchProjectStates: (workspaceSlug: string, projectId: string) => Promise<IState[]>;
  fetchProjectIntakeState: (workspaceSlug: string, projectId: string) => Promise<IIntakeState>;
  fetchWorkspaceStates: (workspaceSlug: string) => Promise<IState[]>;
  // crud actions
  createState: (workspaceSlug: string, projectId: string, data: Partial<IState>) => Promise<IState>;
  updateState: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    data: Partial<IState>
  ) => Promise<IState | undefined>;
  deleteState: (workspaceSlug: string, projectId: string, stateId: string) => Promise<void>;
  createSubState: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    data: Partial<ISubState>
  ) => Promise<ISubState>;
  updateSubState: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    subStateId: string,
    data: Partial<ISubState>
  ) => Promise<ISubState | undefined>;
  deleteSubState: (workspaceSlug: string, projectId: string, stateId: string, subStateId: string) => Promise<void>;
  markStateAsDefault: (workspaceSlug: string, projectId: string, stateId: string) => Promise<void>;
  moveStatePosition: (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    payload: Partial<IState>
  ) => Promise<void>;

  getStatePercentageInGroup: (stateId: string | null | undefined) => number | undefined;
}

export class StateStore implements IStateStore {
  stateMap: Record<string, IState> = {};
  subStateMap: Record<string, ISubState> = {};
  intakeStateMap: Record<string, IIntakeState> = {};
  //loaders
  fetchedMap: Record<string, boolean> = {};
  fetchedIntakeMap: Record<string, boolean> = {};
  rootStore: RootStore;
  router;
  stateService: ProjectStateService;

  constructor(_rootStore: RootStore) {
    makeObservable(this, {
      // observables
      stateMap: observable,
      subStateMap: observable,
      intakeStateMap: observable,
      fetchedMap: observable,
      fetchedIntakeMap: observable,
      // computed
      projectStates: computed,
      subStates: computed,
      projectSubStates: computed,
      groupedProjectStates: computed,
      // fetch action
      fetchProjectStates: action,
      fetchProjectIntakeState: action,
      // CRUD actions
      createState: action,
      updateState: action,
      deleteState: action,
      createSubState: action,
      updateSubState: action,
      deleteSubState: action,
      // state actions
      markStateAsDefault: action,
      moveStatePosition: action,
    });
    this.stateService = new ProjectStateService();
    this.router = _rootStore.router;
    this.rootStore = _rootStore;
  }

  private sortSubStates = (subStates: ISubState[]) => subStates.slice().sort((a, b) => a.sequence - b.sequence);

  private syncSubStatesFromState = (state: IState) => {
    const incomingSubStates = state.sub_states ?? [];
    const incomingSubStateIds = new Set(incomingSubStates.map((subState) => subState.id));

    Object.values(this.subStateMap).forEach((subState) => {
      if (subState.state_id === state.id && !incomingSubStateIds.has(subState.id)) delete this.subStateMap[subState.id];
    });

    incomingSubStates.forEach((subState) => {
      set(this.subStateMap, [subState.id], subState);
    });
  };

  private syncSubStateToParentState = (subState: ISubState) => {
    const parentState = this.stateMap[subState.state_id];
    if (!parentState) return;

    const subStates = parentState.sub_states ?? [];
    set(
      this.stateMap,
      [subState.state_id, "sub_states"],
      this.sortSubStates([...subStates.filter((stateSubState) => stateSubState.id !== subState.id), subState])
    );
  };

  private removeSubStateFromParentState = (stateId: string, subStateId: string) => {
    const parentState = this.stateMap[stateId];
    if (!parentState?.sub_states) return;

    set(
      this.stateMap,
      [stateId, "sub_states"],
      parentState.sub_states.filter((subState) => subState.id !== subStateId)
    );
  };

  /**
   * Returns the stateMap belongs to a specific workspace
   */
  get workspaceStates() {
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!workspaceSlug || !this.fetchedMap[workspaceSlug]) return;
    return sortStates(Object.values(this.stateMap));
  }

  /**
   * Returns the stateMap belongs to a specific project
   */
  get projectStates() {
    const projectId = this.router.projectId;
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug])) return;
    return sortStates(Object.values(this.stateMap).filter((state) => state.project_id === projectId));
  }

  get subStates() {
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!workspaceSlug || !this.fetchedMap[workspaceSlug]) return;
    return this.sortSubStates(Object.values(this.subStateMap));
  }

  get projectSubStates() {
    const projectId = this.router.projectId;
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug])) return;
    return this.sortSubStates(Object.values(this.subStateMap).filter((subState) => subState.project_id === projectId));
  }

  /**
   * Returns the stateMap belongs to a specific project grouped by group
   */
  get groupedProjectStates() {
    if (!this.router.projectId) return;

    // First group the existing states
    const groupedStates = groupBy(this.projectStates, "group") as Record<string, IState[]>;

    // Ensure all STATE_GROUPS are present
    const allGroups = Object.keys(STATE_GROUPS).reduce(
      (acc, group) => {
        acc[group] = groupedStates[group] || [];
        return acc;
      },
      {} as Record<string, IState[]>
    );

    return allGroups;
  }

  /**
   * @description returns state details using state id
   * @param stateId
   */
  getStateById = computedFn((stateId: string | null | undefined) => {
    if (!this.stateMap || !stateId) return;
    return this.stateMap[stateId] ?? undefined;
  });

  /**
   * @description returns sub-state details using sub-state id
   * @param subStateId
   */
  getSubStateById = computedFn((subStateId: string | null | undefined) => {
    if (!this.subStateMap || !subStateId) return;
    return this.subStateMap[subStateId] ?? undefined;
  });

  /**
   * Returns the sub-states for a state by stateId
   * @param stateId
   * @returns ISubState[]
   */
  getSubStatesByStateId = computedFn((stateId: string | null | undefined) => {
    if (!stateId) return [];
    return this.sortSubStates(Object.values(this.subStateMap).filter((subState) => subState.state_id === stateId));
  });

  /**
   * @description returns intake state details using intake state id
   * @param intakeStateId
   */
  getIntakeStateById = computedFn((intakeStateId: string | null | undefined) => {
    if (!this.intakeStateMap || !intakeStateId) return;
    return this.intakeStateMap[intakeStateId] ?? undefined;
  });

  /**
   * Returns the stateMap belongs to a project by projectId
   * @param projectId
   * @returns IState[]
   */
  getProjectStates = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug || "";
    if (!projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug])) return;
    return sortStates(Object.values(this.stateMap).filter((state) => state.project_id === projectId));
  });

  /**
   * Returns the intake state for a project by projectId
   * @param projectId
   * @returns IIntakeState | undefined
   */
  getProjectIntakeState = computedFn((projectId: string | null | undefined) => {
    if (!projectId || !this.fetchedIntakeMap[projectId]) return;
    return Object.values(this.intakeStateMap).find((state) => state.project_id === projectId);
  });

  /**
   * Returns the state ids for a project by projectId
   * @param projectId
   * @returns string[]
   */
  getProjectStateIds = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug;
    if (!workspaceSlug || !projectId || !(this.fetchedMap[projectId] || this.fetchedMap[workspaceSlug]))
      return undefined;
    const projectStates = this.getProjectStates(projectId);
    return projectStates?.map((state) => state.id) ?? [];
  });

  /**
   * Returns the intake state ids for a project by projectId
   * @param projectId
   * @returns string[]
   */
  getProjectIntakeStateIds = computedFn((projectId: string | null | undefined) => {
    const workspaceSlug = this.router.workspaceSlug;
    if (!workspaceSlug || !projectId || !this.fetchedIntakeMap[projectId]) return undefined;
    const projectIntakeState = this.getProjectIntakeState(projectId);
    return projectIntakeState?.id ? [projectIntakeState.id] : [];
  });

  /**
   * Returns the default state id for a project
   * @param projectId
   * @returns string | undefined
   */
  getProjectDefaultStateId = computedFn((projectId: string | null | undefined) => {
    const projectStates = this.getProjectStates(projectId);
    return projectStates?.find((state) => state.default)?.id;
  });

  /**
   * fetches the stateMap of a project
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  fetchProjectStates = async (workspaceSlug: string, projectId: string) => {
    const statesResponse = await this.stateService.getStates(workspaceSlug, projectId);
    runInAction(() => {
      statesResponse.forEach((state) => {
        set(this.stateMap, [state.id], state);
        this.syncSubStatesFromState(state);
      });
      set(this.fetchedMap, projectId, true);
    });
    return statesResponse;
  };

  /**
   * fetches the intakeStateMap of a project
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  fetchProjectIntakeState = async (workspaceSlug: string, projectId: string) => {
    const intakeStateResponse = await this.stateService.getIntakeState(workspaceSlug, projectId);
    runInAction(() => {
      set(this.intakeStateMap, [intakeStateResponse.id], intakeStateResponse);
      set(this.fetchedIntakeMap, projectId, true);
    });
    return intakeStateResponse;
  };

  /**
   * fetches the stateMap of all the states in workspace
   * @param workspaceSlug
   * @returns
   */
  fetchWorkspaceStates = async (workspaceSlug: string) => {
    const statesResponse = await this.stateService.getWorkspaceStates(workspaceSlug);
    runInAction(() => {
      statesResponse.forEach((state) => {
        set(this.stateMap, [state.id], state);
        this.syncSubStatesFromState(state);
      });
      set(this.fetchedMap, workspaceSlug, true);
    });
    return statesResponse;
  };

  /**
   * creates a new state in a project and adds it to the store
   * @param workspaceSlug
   * @param projectId
   * @param data
   * @returns
   */
  createState = async (workspaceSlug: string, projectId: string, data: Partial<IState>) =>
    await this.stateService.createState(workspaceSlug, projectId, data).then((response) => {
      runInAction(() => {
        set(this.stateMap, [response?.id], response);
        this.syncSubStatesFromState(response);
      });
      return response;
    });

  /**
   * Updates the state details in the store, in case of failure reverts back to original state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   * @param data
   * @returns
   */
  updateState = async (workspaceSlug: string, projectId: string, stateId: string, data: Partial<IState>) => {
    const originalState = this.stateMap[stateId];
    try {
      runInAction(() => {
        set(this.stateMap, [stateId], { ...this.stateMap?.[stateId], ...data });
      });
      const response = await this.stateService.patchState(workspaceSlug, projectId, stateId, data);
      runInAction(() => {
        set(this.stateMap, [stateId], { ...this.stateMap?.[stateId], ...response });
        this.syncSubStatesFromState(this.stateMap[stateId]);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.stateMap = {
          ...this.stateMap,
          [stateId]: originalState,
        };
      });
      throw error;
    }
  };

  /**
   * deletes the state from the store, in case of failure reverts back to original state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   */
  deleteState = async (workspaceSlug: string, projectId: string, stateId: string) => {
    if (!this.stateMap?.[stateId]) return;
    const stateSubStateIds = this.stateMap[stateId].sub_states?.map((subState) => subState.id) ?? [];
    await this.stateService.deleteState(workspaceSlug, projectId, stateId);
    runInAction(() => {
      stateSubStateIds.forEach((subStateId) => delete this.subStateMap[subStateId]);
      delete this.stateMap[stateId];
    });
  };

  /**
   * marks a state as default in a project
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   */
  markStateAsDefault = async (workspaceSlug: string, projectId: string, stateId: string) => {
    const originalStates = this.stateMap;
    const currentDefaultState = Object.values(this.stateMap).find(
      (state) => state.project_id === projectId && state.default
    );
    try {
      runInAction(() => {
        if (currentDefaultState) set(this.stateMap, [currentDefaultState.id, "default"], false);
        set(this.stateMap, [stateId, "default"], true);
      });
      await this.stateService.markDefault(workspaceSlug, projectId, stateId);
    } catch (error) {
      // reverting back to old state group if api fails
      runInAction(() => {
        this.stateMap = originalStates;
      });
      throw error;
    }
  };

  /**
   * updates the sort order of a state and updates the state information using API, in case of failure reverts back to original state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   * @param direction
   * @param groupIndex
   */
  moveStatePosition = async (workspaceSlug: string, projectId: string, stateId: string, payload: Partial<IState>) => {
    const originalStates = this.stateMap;
    try {
      Object.entries(payload).forEach(([key, value]) => {
        runInAction(() => {
          set(this.stateMap, [stateId, key], value);
        });
      });
      // updating using api
      await this.stateService.patchState(workspaceSlug, projectId, stateId, payload);
    } catch {
      // reverting back to old state group if api fails
      runInAction(() => {
        this.stateMap = originalStates;
      });
    }
  };

  /**
   * creates a new sub-state in a state and adds it to the store
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   * @param data
   * @returns
   */
  createSubState = async (workspaceSlug: string, projectId: string, stateId: string, data: Partial<ISubState>) =>
    await this.stateService.createSubState(workspaceSlug, projectId, stateId, data).then((response) => {
      runInAction(() => {
        set(this.subStateMap, [response.id], response);
        this.syncSubStateToParentState(response);
      });
      return response;
    });

  /**
   * Updates the sub-state details in the store, in case of failure reverts back to original sub-state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   * @param subStateId
   * @param data
   * @returns
   */
  updateSubState = async (
    workspaceSlug: string,
    projectId: string,
    stateId: string,
    subStateId: string,
    data: Partial<ISubState>
  ) => {
    const originalSubState = this.subStateMap[subStateId];
    const originalParentSubStates = this.stateMap[stateId]?.sub_states;

    try {
      runInAction(() => {
        const updatedSubState = { ...this.subStateMap[subStateId], ...data } as ISubState;
        set(this.subStateMap, [subStateId], updatedSubState);
        this.syncSubStateToParentState(updatedSubState);
      });

      const response = await this.stateService.patchSubState(workspaceSlug, projectId, stateId, subStateId, data);
      runInAction(() => {
        set(this.subStateMap, [response.id], response);
        this.syncSubStateToParentState(response);
      });
      return response;
    } catch (error) {
      runInAction(() => {
        if (originalSubState) set(this.subStateMap, [subStateId], originalSubState);
        else delete this.subStateMap[subStateId];

        if (this.stateMap[stateId]) set(this.stateMap, [stateId, "sub_states"], originalParentSubStates);
      });
      throw error;
    }
  };

  /**
   * deletes the sub-state from the store, in case of failure reverts back to original sub-state
   * @param workspaceSlug
   * @param projectId
   * @param stateId
   * @param subStateId
   */
  deleteSubState = async (workspaceSlug: string, projectId: string, stateId: string, subStateId: string) => {
    const originalSubState = this.subStateMap[subStateId];
    const originalParentSubStates = this.stateMap[stateId]?.sub_states;

    try {
      runInAction(() => {
        delete this.subStateMap[subStateId];
        this.removeSubStateFromParentState(stateId, subStateId);
      });
      await this.stateService.deleteSubState(workspaceSlug, projectId, stateId, subStateId);
    } catch (error) {
      runInAction(() => {
        if (originalSubState) set(this.subStateMap, [subStateId], originalSubState);
        if (this.stateMap[stateId]) set(this.stateMap, [stateId, "sub_states"], originalParentSubStates);
      });
      throw error;
    }
  };

  /**
   * Returns the percentage position of a state within its group based on sequence
   * @param stateId The ID of the state to find the percentage for
   * @returns The percentage position of the state in its group (0-100), or -1 if not found
   */
  getStatePercentageInGroup = computedFn((stateId: string | null | undefined) => {
    if (!stateId || !this.stateMap[stateId]) return -1;

    const state = this.stateMap[stateId];
    const group = state.group;

    if (!group || !this.groupedProjectStates || !this.groupedProjectStates[group]) return -1;

    // Get all states in the same group
    const statesInGroup = this.groupedProjectStates[group];
    const stateIndex = statesInGroup.findIndex((s) => s.id === stateId);

    if (stateIndex === -1) return undefined;

    // Calculate percentage: ((index + 1) / totalLength) * 100
    return ((stateIndex + 1) / statesInGroup.length) * 100;
  });
}
