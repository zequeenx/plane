# Project Sub-States Design

Date: 2026-06-24

## Goal

Allow each project state to define ordered child sub-states, and allow issues to optionally reference one of the sub-states that belongs to their current state.

Example: the `Started` state group can contain a state named `Art Assets In Production`; that state can define sub-states such as `Not Started`, `In Progress`, and `Completed`.

## Scope

This design applies to project states and project issues in:

- Project settings `States`.
- Issue create and edit forms.
- Issue property panels.
- Issue layout display properties.
- Issue filters and saved view/user display settings.
- Backend issue serializers, filters, list responses, and state APIs.

The feature is project-scoped. Sub-states are not shared across projects or across parent states.

## Product Rules

Sub-state management:

- Project admins can create, edit, and delete sub-states from Project Settings > States.
- Members and guests can read sub-states wherever they can read project states.
- Each sub-state belongs to exactly one parent state.
- Sub-state fields are `name`, `color`, optional `icon`, and `sequence`.
- No default sub-state is supported.
- No sub-state description is supported.
- The sub-state background uses the selected color.
- Sub-states are shown in ascending `sequence` order.
- Drag-and-drop ordering is out of scope. Sorting is controlled by explicit sequence editing or simple non-drag controls.

Issue behavior:

- `sub_state_id` is optional on issue create and update.
- A selected sub-state must belong to the issue's selected `state_id`.
- When the issue state changes and the current sub-state does not belong to the new state, the UI clears `sub_state_id`.
- The backend validates the same state/sub-state relationship so API clients cannot write invalid pairs.

Deletion:

- Sub-state deletion follows the existing state deletion rule.
- If any issue currently uses a sub-state, deleting that sub-state returns a validation error and the record is not deleted.
- There is no automatic reassignment or migration of issues when a sub-state is deleted.

Out of scope:

- Grouping issues by sub-state.
- Sub-grouping issues by sub-state.
- Dragging issues to change sub-state.
- Default sub-states.
- Sub-state descriptions.

## Backend Design

Add a `SubState` model in the state domain. It should use the same project/workspace ownership pattern as `State`.

Fields:

- `state`: foreign key to `State`.
- `project`: inherited project ownership.
- `workspace`: inherited workspace ownership.
- `name`: string.
- `color`: string.
- `icon`: nullable/blank string.
- `sequence`: float.

Constraints:

- Active sub-state names are unique within the same parent state.
- A sub-state must belong to the same project and workspace as its parent state.
- Default ordering is by `sequence`.

API routes should live next to the existing project state routes:

- `GET /workspaces/<slug>/projects/<project_id>/states/<state_id>/sub-states/`
- `POST /workspaces/<slug>/projects/<project_id>/states/<state_id>/sub-states/`
- `GET /workspaces/<slug>/projects/<project_id>/states/<state_id>/sub-states/<sub_state_id>/`
- `PATCH /workspaces/<slug>/projects/<project_id>/states/<state_id>/sub-states/<sub_state_id>/`
- `DELETE /workspaces/<slug>/projects/<project_id>/states/<state_id>/sub-states/<sub_state_id>/`

Permissions:

- `GET`: admin, member, and guest project roles.
- `POST`, `PATCH`, `DELETE`: project admin role.

State serialization:

- Project state list responses should include each state's `sub_states`.
- Workspace-level state responses should include each sub-state's `id`, `state_id`, `project_id`, `workspace_id`, `name`, `color`, `icon`, and `sequence` for issue filters and project-crossing UI surfaces that already consume workspace states.
- State cache invalidation should include sub-state mutations so clients do not show stale options.

Issue model and serializers:

- Add nullable `sub_state` to `Issue`.
- Include `sub_state_id` in create, update, detail, and list serializers.
- Include `sub_state_id` in issue list `.values(...)` projections and grouped response helper required fields.
- Validate that `sub_state_id` belongs to the same project and the selected `state_id`.
- If an update changes `state_id` without sending `sub_state_id`, the backend should reject stale incompatible data instead of silently keeping an invalid sub-state.

Filtering:

- Add `sub_state_id` and `sub_state_id__in` to issue filter sets.
- Map legacy-style filter keys to `sub_state_id` where the frontend filter converter expects that pattern.
- Add `sub_state_id` to cache keys for issue list requests so changing sub-state filters does not reuse stale list results.

## Frontend Design

State store:

- Extend state types to include `sub_states`.
- Add a sub-state type with `id`, `state_id`, `project_id`, `workspace_id`, `name`, `color`, `icon`, and `sequence`.
- Keep a lookup by sub-state id and a getter for sub-states by parent state.
- Add create, update, and delete actions that call the new nested sub-state endpoints.

Project Settings > States:

- Use the inline nested-list approach selected in the visual companion.
- Each state row displays its sub-states below the state title area.
- Each sub-state row shows color, optional icon, name, sequence, edit action, and delete action.
- The add control is attached to a specific state, so the parent state is always clear.
- Delete shows the same kind of error handling as state deletion when the sub-state is in use.

Issue create form:

- Add `Sub-state` as a property field at the same visual hierarchy as `State`.
- Do not render it as a nested child control under `State`.
- The field remains optional.
- The available options depend on the currently selected `State`.
- If no state is selected, or the selected state has no sub-states, the field is empty or disabled.
- Changing `State` clears `Sub-state` when the current sub-state does not belong to the new state.

Issue properties:

- Add `Sub-state` to the issue details Properties section and edit work item Properties section.
- Use the same option filtering and clearing rules as the create form.
- When displaying a selected sub-state, render it as a color-backed label with optional icon and name.

Issue layouts and Display:

- Add `Sub-state` to display property controls.
- When enabled, list, card, and spreadsheet-style layouts should show the selected sub-state where issue properties are already rendered.
- The display label uses the sub-state color as its background.
- Do not add sub-state to group-by, sub-group-by, sorting-by-default, or drag allowed group logic.

Filters:

- Add a `Sub-state` filter.
- The `Sub-state` filter is hidden or disabled until at least one `State` filter value is selected.
- Once `State` is selected, the `Sub-state` filter only shows sub-states belonging to the selected state values.
- Each sub-state option must show the parent state it belongs to, so duplicated names such as `In Progress` remain distinguishable.
- Saved views and user filter preferences should persist `sub_state_id` in the same format as other multi-select issue filters.

## Data Flow

1. Project states are fetched with nested `sub_states`.
2. The frontend state store normalizes both states and sub-states.
3. Issue responses include `sub_state_id`.
4. Issue property components resolve `sub_state_id` through the state store.
5. Issue create/update payloads can omit `sub_state_id` or send `null`.
6. If a user changes `state_id`, the UI computes whether the current `sub_state_id` still belongs to the new state.
7. If it does not belong, the same issue update sends `sub_state_id: null`.
8. Backend serializers reject any payload where `sub_state_id` does not belong to `state_id`.

## Error Handling

The API should follow existing Plane response patterns:

- Duplicate sub-state name under the same state returns a field-level validation error.
- Creating or updating a sub-state under a state from another project returns an error.
- Assigning a sub-state from another state or project to an issue returns a validation error.
- Deleting a sub-state used by any issue returns a 400 response with a clear message.
- The UI should surface API errors through existing toast/form error patterns.

## Tests

Backend tests should be written first and should cover:

- Creating a sub-state under a state.
- Rejecting duplicate active sub-state names under the same state.
- Allowing the same sub-state name under different states.
- Updating sub-state name, color, icon, and sequence.
- Deleting an unused sub-state.
- Rejecting deletion when an issue uses the sub-state.
- Creating an issue with no sub-state.
- Creating an issue with a sub-state that belongs to the selected state.
- Rejecting issue create/update with a sub-state from another state.
- Filtering issues by `sub_state_id`.
- Filtering issues by `sub_state_id__in`.

Frontend checks should cover:

- State store normalization and sub-state getters.
- Issue create form keeps `State` and `Sub-state` visually parallel.
- Sub-state options change when the selected state changes.
- Changing state clears an incompatible selected sub-state.
- Display properties include `Sub-state`.
- Sub-state filter remains unavailable until a state filter is selected.
- Sub-state filter options show the parent state label.

Manual browser QA should use the local app at `http://localhost:3000`:

- Sign in as `admin@example.com` in workspace `codex-views`.
- Open a project Settings > States page.
- Add, edit, reorder by sequence, and delete an unused sub-state.
- Confirm deletion is blocked after assigning that sub-state to an issue.
- Create an issue with no sub-state.
- Create an issue with a valid sub-state.
- Edit the issue Properties and change sub-state.
- Change the issue state and confirm incompatible sub-state clears.
- Enable `Sub-state` from Display and confirm it appears in issue layouts.
- Open filters, confirm `Sub-state` is unavailable before selecting `State`.
- Select a state, then filter by one of its sub-states and confirm results.

## Risks

- Issue response shapes are manually projected in several backend list endpoints, so missing one projection could make a UI surface lose `sub_state_id`.
- Workspace-level issue pages may need workspace state responses to include sub-states, even though sub-states are project-owned.
- Existing saved view/display preference defaults are duplicated in several models and constants. All defaults must be updated consistently.
- The feature touches both CE and shared packages; type definitions need to stay aligned across `apps/web`, `packages/types`, constants, and shared state utilities.
