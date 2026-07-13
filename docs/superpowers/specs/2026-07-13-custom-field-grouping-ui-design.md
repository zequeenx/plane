# Custom Field Grouping UI Improvements Design

Date: 2026-07-13

## Goal

Make project and module custom fields visually consistent in spreadsheet layouts and fully usable as interactive grouping dimensions in list and kanban layouts.

## Scope

This change covers two improvements:

1. Project and module custom field cells in spreadsheet layouts use the same horizontal row separators as built-in columns.
2. Enabled single-select and single-member project and module custom fields appear in the existing `Group by` list, with source-aware labels, working group columns, cross-group drag and drop, and in-group quick creation.

Custom fields are added only to the primary `Group by` list. This change does not add custom fields to `Sub-group by`.

## Product Decisions

- Project custom field keys remain `customproperty_<fieldId>`.
- Module custom field keys remain `modulecustomproperty_<fieldId>`.
- Only `single_select` and `single_member` fields can participate in grouping.
- Project field menu labels use `Field name (Project)` with the localized project domain label.
- Module field menu labels use `Field name (Module ABC)` with the localized module domain label and source module name.
- A module page exposes the current module's groupable fields.
- A project view with `source_module` exposes that source module's groupable fields.
- Project fields remain available in all project-scoped list and kanban contexts where project field definitions are already available.
- Module fields are not inferred from modules attached to individual result work items.
- Disabled, deleted, unsupported, or unavailable fields do not appear as new grouping choices.
- The existing backend grouping contract remains unchanged.

## Architecture

Introduce a shared custom-field grouping adapter in the frontend. It centralizes the behavior that is currently missing from the static grouping pipeline:

- Parse project and module custom property keys.
- Resolve the active project and optional source module context.
- Resolve enabled field definitions and supported field types.
- Build source-aware group menu options.
- Build group columns from select options or project members.
- Read and prepare custom field group values for local grouping state.
- Describe the correct persistence operation for project and module field values.
- Prepare custom field data for quick creation.

The adapter keeps project and module grouping behavior aligned while preserving their separate persistence APIs. Existing static group options continue through the current path.

## Group Menu

The existing group menu combines:

1. Static group options allowed by the current layout configuration.
2. Groupable project custom fields for the current project.
3. Groupable module custom fields for the current or source module.

Dynamic options use their custom property key as the selected `group_by` value. They are passed to the backend unchanged. Project custom property keys must therefore join module custom property keys in the shared `TIssueGroupByOptions` type and in request parameter mapping.

The menu renders static option titles through translation keys and dynamic option titles as resolved display strings. Loading custom fields must not block static group options.

The module name must be resolved before a module field is exposed in the menu so the source label is complete and unambiguous.

## Group Columns

The frontend grouping adapter builds columns for a selected custom field:

- `single_select`: one column per enabled field option, using the option ID as the group ID and option value as the title.
- `single_member`: one column per active project member, using the member ID as the group ID and member display name/avatar in the header.
- Both types include a `None` column for work items without a field value.

The current backend already returns grouped pagination keyed by option or member ID. Frontend group state must also recognize custom property keys so optimistic updates, local additions, counts, and subsequent pagination remain in the same group structure.

## Spreadsheet Separators

Project and module custom field cells currently render their editor inside a full-height wrapper without the bottom border used by built-in spreadsheet column components.

Both custom field branches will use the same `border-b-[0.5px] border-subtle` row separator treatment as built-in columns. The fix applies to every supported custom field editor without changing editor sizing or interaction behavior.

## Cross-Group Drag And Drop

Custom field groupings participate in the existing list and kanban drag interactions.

Dragging to a populated group sets the custom field to that option or member ID. Dragging to `None` clears the field with `null`.

The frontend performs an optimistic update that:

- Moves the work item from the source group to the destination group.
- Updates group counts.
- Updates the work item's custom field value and dynamic grouping value in the shared issue map.
- Preserves the existing manual `sort_order` behavior when applicable.

Persistence differs by scope:

- Project field: call the project issue field value update endpoint.
- Module field: call the module issue field value update endpoint with the active/source module ID.

When manual ordering also requires a standard issue update, both operations are awaited. If one operation fails after the other succeeds, the client refetches the current grouped view instead of assuming that a local rollback matches server state. Other failures restore the previous local value/group and show the existing error toast pattern.

## In-Group Quick Creation

Quick creation prepopulates both the optimistic grouping value and the persisted custom field value.

Project field grouping:

- A populated group adds the field ID and group ID to `field_values` in the issue create payload.
- The `None` group does not create a field value.
- The existing issue create endpoint persists project field values transactionally with issue creation.

Module field grouping on a module page:

1. Create the issue through the existing module quick-create flow.
2. Ensure the issue is attached to the current module through that flow.
3. For a populated group, update the module field value through the module field endpoint.

Module field grouping in a project view with `source_module`:

1. Create the issue.
2. Attach it to `source_module` so it belongs to the view's module context.
3. For a populated group, update the module field value through the module field endpoint.

The `None` group still attaches a newly created issue to the current/source module, but does not create a module field value.

Module quick creation is necessarily a multi-request operation under the existing API contract. If issue creation succeeds but module attachment or field persistence fails, the created issue is retained. The UI reports that the work item was created but its grouping field could not be set, then refetches the current view to reconcile the final server state.

## Saved And Stale Configuration

Saved `group_by` values remain unchanged when a referenced custom field becomes disabled, deleted, unauthorized, or temporarily unavailable.

- The field is omitted from the menu.
- The backend safely resolves an invalid grouping key to ungrouped behavior.
- The frontend does not silently rewrite the saved view.
- Restoring an eligible field allows the saved group key to work again.

## Error Handling

- Failed field definition loads leave static group options usable and follow existing console error reporting.
- Failed drag persistence restores local state when no partial server write occurred.
- Partial drag persistence triggers a grouped-view refetch and an error toast.
- Failed project quick creation follows the existing create error path.
- Partially failed module quick creation retains the created issue, reports the partial result explicitly, and refetches.
- Missing module context prevents module field options and mutations from being offered.

## Testing

Automated frontend tests cover:

- Project and module custom property key parsing.
- Eligibility of `single_select` and `single_member`, and exclusion of all other field types.
- Source-aware project and module menu labels.
- Select option, member, and `None` group column construction.
- Request mapping that passes both custom property key forms to the backend unchanged.
- Project field drag assignment and clearing.
- Module field drag assignment and clearing with the correct module context.
- Optimistic group movement, count updates, failure rollback, and partial-failure refetch.
- Project quick-create payloads for populated and `None` groups.
- Module page and source-module view quick-create sequencing.
- Exclusion of disabled, deleted, unsupported, and unavailable fields.
- Spreadsheet custom field cells using the built-in row separator style.

Existing backend grouping tests for project and module custom fields remain the contract check. No backend behavior change is planned.

Manual QA covers:

- Project fields in project list and kanban layouts.
- Project and current-module fields together on a module page.
- Project and source-module fields together in a saved module-source project view.
- Single-select and single-member group headers and counts.
- Dragging between populated groups and to/from `None`.
- Quick creation inside populated and `None` groups.
- Correct behavior after disabling or deleting the selected field.
- Spreadsheet separators for both project and module custom field columns.

Before completion, run the focused frontend tests, relevant TypeScript and lint checks, React Doctor, and browser QA for list, kanban, and spreadsheet layouts.

## Out Of Scope

- Custom field sub-grouping.
- Grouping by multi-select, multi-member, date, date-range, or plain-text fields.
- Changing the backend custom field grouping query contract.
- Making module issue creation and module field persistence a new single backend transaction.
- Grouping by fields from every module attached to a work item.
