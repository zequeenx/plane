# Project Issue Fields Design

Date: 2026-07-07

## Goal

Allow project admins to define additional project-level fields for all work items in a project. These fields should appear in work item creation, detail, layouts, filters, views, grouping, sorting, and spreadsheet columns according to the rules below.

## Scope

This design applies to project-level custom fields shared by every work item in a project. Fields are not tied to work item types.

Supported field types:

- Single-select text
- Multi-select text
- Single-select member
- Multi-select member
- Date
- Date range
- Plain text

All fields are optional. Required fields are out of scope.

## Product Rules

Project admins can create, rename, reorder, disable, restore, and delete fields from project settings.

Field lifecycle:

- Enabled fields appear in work item editing, details, display properties, filters, views, grouping, sorting, and spreadsheet columns where supported.
- Disabled fields are soft-deleted. Their definitions, options, and values remain stored, but they are hidden from normal editing and view configuration surfaces.
- Disabled fields appear in a disabled-fields section in project settings.
- Disabled fields can be restored by project admins.
- Disabled fields can be hard-deleted by project admins.
- Hard deletion removes the field definition and erases all values for that field.

Single-select and multi-select text options:

- Any user who can edit work items in the project can create options from the field selector.
- Any user who can edit work items in the project can delete options.
- Deleting a text option removes it from all work item values.
- For single-select text fields, deleting the selected option clears the field.
- For multi-select text fields, deleting an option removes only that option and keeps other selected options.

Member fields:

- Candidate members come from project members only.
- If a member leaves the project, existing values remain visible as historical values.
- Removed project members cannot be selected as new values.

Date fields:

- Date and date range fields use the same date-level semantics as existing work item start and target dates.
- No time-of-day or timezone-specific behavior is introduced.

## Data Model

Use a structured relational model rather than storing custom values directly in an issue JSON field.

### ProjectIssueField

Stores the project-level field definition.

Suggested fields:

- `workspace`
- `project`
- `name`
- `description`
- `field_type`
- `sort_order`
- `is_disabled`
- `disabled_at`

`field_type` values should map to the supported field types listed in scope.

### ProjectIssueFieldOption

Stores options for single-select and multi-select text fields.

Suggested fields:

- `workspace`
- `project`
- `field`
- `value`
- `sort_order`

Options are only valid for text select fields. The API should reject options for member, date, date range, and plain text fields.

### IssueFieldValue

Stores the base value row for an issue and field.

Suggested fields:

- `workspace`
- `project`
- `issue`
- `field`
- `text_value`
- `date_value`
- `date_range_start`
- `date_range_end`

There should be at most one value row per `issue + field`.

### IssueFieldValueOption

Stores selected text options for single-select and multi-select text fields.

Using the same relation for single-select and multi-select keeps option cleanup consistent. Single-select fields enforce at most one selected option at the serializer/service layer and with a database constraint if practical.

### IssueFieldValueUser

Stores selected members for single-select and multi-select member fields.

Single-select member fields enforce at most one selected user at the serializer/service layer and with a database constraint if practical.

## Backend API

Add project-scoped field APIs:

- `GET /api/workspaces/:slug/projects/:project_id/issue-fields/`
  Returns enabled fields and options.
- `GET /api/workspaces/:slug/projects/:project_id/issue-fields/disabled/`
  Returns disabled fields and options for project settings.
- `POST /api/workspaces/:slug/projects/:project_id/issue-fields/`
  Creates a field. Project admin only.
- `PATCH /api/workspaces/:slug/projects/:project_id/issue-fields/:field_id/`
  Updates name, description, sort order, disabled state, and restore behavior. Project admin only.
- `DELETE /api/workspaces/:slug/projects/:project_id/issue-fields/:field_id/`
  Hard-deletes a disabled field and all values. Project admin only. The API rejects hard deletion for enabled fields; admins must disable a field before deleting it.
- `POST /api/workspaces/:slug/projects/:project_id/issue-fields/:field_id/options/`
  Creates a text option. Any user who can edit work items in the project.
- `DELETE /api/workspaces/:slug/projects/:project_id/issue-fields/:field_id/options/:option_id/`
  Deletes a text option and removes it from all work item values. Any user who can edit work items in the project.
- `PATCH /api/workspaces/:slug/projects/:project_id/issues/:issue_id/field-values/`
  Updates custom field values for one issue. Any user who can edit that issue.

Issue responses:

- Issue list, detail, peek, and spreadsheet APIs should include a `field_values` map keyed by field id.
- Field definitions and option metadata should come from the project field API, not be repeated for every issue.
- Disabled fields should not be included in normal work item UI payloads.

Validation:

- A field must belong to the issue's project.
- A field option must belong to the submitted field.
- A member value must be an active project member when submitted as a new value.
- Removed members may remain in existing values.
- Disabled fields cannot accept new value updates from normal work item APIs.
- Hard-deleted fields and options should be treated as invalid input.

## Filtering

Filtering should extend the existing rich filters and work item filters pipeline.

Use the existing custom property key prefix accepted by the frontend adapter:

```text
customproperty_<field_id>
```

Supported filter operators:

- Single-select text: equals, not equals, is empty, is not empty
- Multi-select text: contains any, does not contain any, is empty, is not empty
- Single-select member: equals, not equals, is empty, is not empty
- Multi-select member: contains any, does not contain any, is empty, is not empty
- Date: equals, range, is empty, is not empty
- Date range: overlaps range, does not overlap range, is empty, is not empty
- Plain text: contains, does not contain, is empty, is not empty

Backend filter handling should validate that each `customproperty_<field_id>` belongs to the queried project scope and is enabled. Disabled fields referenced by saved filters should be ignored rather than breaking issue list loading.

## Views, Display Properties, Grouping, and Sorting

Project views and project user properties continue storing:

- `rich_filters`
- `display_filters`
- `display_properties`

Custom field keys should use `customproperty_<field_id>` in these JSON payloads.

Display properties:

- Enabled fields can be toggled in display properties.
- Disabled fields are hidden from display-property configuration.
- Hard-deleted fields should be removed from saved view/user-property JSON when records are saved again, or ignored and cleaned opportunistically when read.

Grouping:

- Supported only for single-select text fields.
- Supported only for single-select member fields.

Sorting:

- Supported only for date fields.
- Supported only for plain text fields.

Disabled fields in existing views:

- The frontend should hide disabled fields from new filter and display configuration.
- If a saved view references disabled fields, the backend should ignore those conditions.
- The frontend may show a light warning that some saved conditions reference disabled fields.

## Frontend Design

Project settings should add a field management surface at `Project settings -> Fields`.

Enabled fields section:

- Create a field with name and type.
- Rename fields.
- Reorder fields.
- Disable fields.
- Manage text options for single-select and multi-select text fields.

Disabled fields section:

- Show disabled fields below enabled fields.
- Restore disabled fields.
- Hard-delete disabled fields with confirmation that all values will be erased.

Work item creation and editing:

- Show all enabled project fields.
- Fields are always optional.
- Single-select and multi-select text selectors allow users to create options inline.
- Text option deletion requires confirmation because it removes the option from existing work items.
- Member selectors use project members as candidates.
- Removed project members can be rendered in existing values but not selected as new values.

Work item details and peek:

- Show enabled fields in the additional properties area.
- Allow inline editing when the user can edit the work item.

Layouts:

- Display properties should include enabled custom fields.
- List and kanban cards can show selected field summaries.
- Spreadsheet should expose enabled fields as columns and support inline editing.
- Spreadsheet sorting should support date and plain text custom fields.

Filters:

- Enabled fields should appear in the work item filter menu with type-appropriate operators and inputs.
- Disabled fields should not appear as new filter options.
- The frontend work item filter types should explicitly support dynamic `customproperty_<field_id>` keys instead of relying only on unchecked casts.

## Error Handling

Expected user-facing errors:

- Updating a disabled field value should show that the field is no longer available and refresh field definitions.
- Submitting a deleted option should show that the option is unavailable and refresh options.
- Submitting a non-project member as a new member-field value should show that the member cannot be selected.
- Hard-deleting a field should require confirmation that all values will be erased.

## Implementation Plan Outline

1. Add backend models, migrations, constraints, and deletion behavior.
2. Add backend serializers and APIs for fields, options, and issue field values.
3. Include `field_values` in issue list/detail/peek/spreadsheet responses with prefetching to avoid N+1 queries.
4. Extend backend rich filter handling for `customproperty_<field_id>` conditions.
5. Add shared TypeScript types for field definitions, options, values, and dynamic custom property keys.
6. Add frontend services and stores for project fields and options.
7. Add project settings field management UI.
8. Add work item creation, detail, peek, display property, layout, and spreadsheet UI support.
9. Add custom field filter config generation for work item filters.
10. Add view cleanup/ignore behavior for disabled or deleted custom field keys.

## Tests

Backend tests should cover:

- Project admin field create, update, disable, restore, and hard delete.
- Non-admin field management denial.
- Enabled and disabled field listing.
- Text option create and delete by users who can edit work items.
- Option deletion cleanup for single-select and multi-select values.
- Field value updates for each supported type.
- Rejection when a field belongs to a different project.
- Rejection when an option belongs to a different field.
- Rejection when a submitted member is not an active project member.
- Preservation of historical member values after a member leaves a project.
- Filtering for every supported field type and operator.
- Disabled fields in saved filters are ignored safely.

Frontend tests should cover:

- Work item filter adapter round trips `customproperty_<field_id>` keys.
- Dynamic filter config generation for all supported custom field types.
- Field management UI state transitions for enable, disable, restore, and delete.
- Inline option creation and deletion behavior.
- Field value editors for each supported type.
- Spreadsheet field column rendering and editing.

Manual QA should cover:

- Admin creates all field types in project settings.
- Member edits field values on create, detail, peek, and spreadsheet.
- Member creates and deletes text options from a selector.
- Admin disables, restores, and hard-deletes fields.
- Saved views with custom field filters continue loading after fields are disabled.
- Filters, display properties, grouping, sorting, and spreadsheet columns behave as specified.

## Risks

- Issue list payloads can become expensive if field values are fetched per issue. The implementation should prefetch and aggregate field values by issue.
- Rich filter types currently have only partial support for dynamic custom property keys. The type model should be extended deliberately.
- Disabled fields in saved views need a quiet compatibility path so old views keep loading.
- CE and enterprise builds already use additional-property injection points. The implementation should keep CE defaults and enterprise overrides compatible.

## Out of Scope

- Work item type-specific fields.
- Required fields.
- Time-of-day fields.
- Workspace-level reusable fields.
- Analytics dashboards and exports, unless already powered by the same issue list/filter pipeline.
- Public sites and intake forms, unless those surfaces already consume the same work item field payloads.
