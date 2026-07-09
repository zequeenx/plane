# Module Custom Fields Design

## Summary

Add custom fields that belong to a single module. Module custom fields are independent from project custom fields, use the same seven field types, and appear only in module-aware contexts.

The first version supports:

- Defining fields from the bottom of the existing module create/edit form.
- Filtering, display columns, and grouping by module fields on the module work item page.
- Preserving the same module field context when saving a module page as a project view.
- Showing editable module field sections in work item details for every visible module the work item belongs to.
- Deleting module field values when a work item is removed from the module, with an explicit confirmation requirement.

The first version does not support sorting by module fields and does not record module field value changes in the work item activity stream.

## Product Decisions

- Module fields are fully independent from project fields.
- Field keys use `modulecustomproperty_<fieldId>` to avoid collision with project fields, which continue to use `customproperty_<fieldId>`.
- A module page exposes only the current module's fields in filter, display, and grouping menus.
- A view saved from a module page exposes only the saved source module's fields.
- Work item details show module fields from every module that is visible to the current user, regardless of the page used to open the detail view.
- Removing a work item from a module deletes that module's field values for the work item, but only after explicit confirmation.
- Module field grouping supports only single select and single member fields.
- Module field sorting is out of scope for the first version.

## Data Model

Add module-scoped equivalents of the project custom field models:

- `ModuleIssueField`
- `ModuleIssueFieldOption`
- `ModuleIssueFieldValue`
- `ModuleIssueFieldValueOption`
- `ModuleIssueFieldValueUser`

`ModuleIssueField` belongs to `workspace`, `project`, and `module`.

Field types match `ProjectIssueField.FieldType`:

- `single_select`
- `multi_select`
- `single_member`
- `multi_member`
- `plain_text`
- `date`
- `date_range`

Constraints and lifecycle:

- Field names are unique within a non-deleted module.
- Different modules may define fields with the same name.
- Options are supported only for `single_select` and `multi_select`.
- Field type cannot be changed after creation.
- Disabled fields keep stored values but are excluded from reads, filters, display options, grouping, and editing.
- Deleting a field requires disabling it first and then hard deletes the field, options, and stored values.

`ModuleIssueFieldValue` belongs to `workspace`, `project`, `module`, `issue`, and `field`. It should enforce that:

- The issue and field are in the same workspace and project.
- The field belongs to the value's module.
- The issue currently belongs to the module when writing values.

Value storage mirrors project custom fields:

- Text values in `text_value`.
- Date values in `date_value`.
- Date ranges in `date_range_start` and `date_range_end`.
- Select values through `ModuleIssueFieldValueOption`.
- Member values through `ModuleIssueFieldValueUser`.

## API Design

Add module field definition endpoints under the module:

```text
GET    /api/workspaces/:slug/projects/:projectId/modules/:moduleId/issue-fields/
POST   /api/workspaces/:slug/projects/:projectId/modules/:moduleId/issue-fields/
PATCH  /api/workspaces/:slug/projects/:projectId/modules/:moduleId/issue-fields/:fieldId/
DELETE /api/workspaces/:slug/projects/:projectId/modules/:moduleId/issue-fields/:fieldId/

GET    /api/workspaces/:slug/projects/:projectId/modules/:moduleId/issue-fields/disabled/
POST   /api/workspaces/:slug/projects/:projectId/modules/:moduleId/issue-fields/:fieldId/options/
DELETE /api/workspaces/:slug/projects/:projectId/modules/:moduleId/issue-fields/:fieldId/options/:optionId/
```

Add module field value update endpoint:

```text
PATCH /api/workspaces/:slug/projects/:projectId/modules/:moduleId/issues/:issueId/field-values/
```

The value update payload mirrors project fields:

```json
{
  "field_values": {
    "<fieldId>": "<value>"
  }
}
```

Add or extend an issue-detail aggregation path so the frontend can fetch module fields and values for all visible modules that contain the issue. The response should group by module:

```json
{
  "module_field_values": {
    "<moduleId>": {
      "<fieldId>": "<value>"
    }
  },
  "module_fields": [
    {
      "module": {
        "id": "<moduleId>",
        "name": "Launch"
      },
      "fields": []
    }
  ]
}
```

Exact response shape can follow existing store conventions, but it must preserve module grouping.

## Permissions

Reading field definitions, options, and values is gated by module visibility:

- Public module fields are visible to users who can view the work item and project context.
- Private module fields are visible only to users who can view that private module.

Writing field values requires:

- Work item edit permission.
- Visibility of the target module.
- The issue currently belongs to the target module.
- The field belongs to the target module and is not disabled.
- Submitted value matches the field type.
- Select options belong to the field.
- Member values are active project members.

The backend must enforce all permission and visibility rules. Frontend hiding is only a usability layer.

## Removing Work Items From Modules

When removing an issue from a module, the API must check whether module field values exist for that issue and module.

If values exist and the request does not include explicit confirmation, return `400` with a clear error that module field values will be deleted.

Confirmed requests include a flag such as:

```json
{
  "delete_module_field_values_confirmed": true
}
```

After confirmation, perform the following in one transaction:

1. Delete all module field values for the issue and module.
2. Delete the `ModuleIssue` relation.

All frontend removal entry points must show a confirmation dialog before sending the flag:

- Work item detail module picker.
- List and spreadsheet quick actions.
- Bulk remove from module.
- Any module-specific remove action.

## Filtering

Extend the rich filter configuration with module field configs for `modulecustomproperty_<fieldId>`.

Frontend filter operators mirror project custom fields:

- Select and member fields: `in`, `not_in`, `is_empty`, `is_not_empty`.
- Plain text: `contains`, `not_contains`, `is_empty`, `is_not_empty`.
- Date: `exact`, `range`, `is_empty`, `is_not_empty`.
- Date range: `overlaps`, `not_overlaps`, `is_empty`, `is_not_empty`.

Backend `ComplexFilterBackend` should parse `modulecustomproperty_<fieldId>__<operator>`.

Module field filters are active only when the request has a module field context:

- Module work item page: `project_id + module_id`.
- Project view saved from a module page: `project_id + source_module_id`.

Without a valid visible module context, module field filters must not expose data. Explicit `modulecustomproperty_*` filters for invalid, disabled, unauthorized, or wrong-module fields should resolve to an empty result set. Display and grouping options for those fields should be dropped from the response instead of rendered.

## Display Columns

Display properties can store module field keys:

```json
{
  "modulecustomproperty_<fieldId>": true
}
```

Module work item pages and source-module project views load only the current/source module's fields. Other modules attached to the result issues do not add columns.

Spreadsheet and list column renderers can reuse the existing project field value renderer, with a module-aware field lookup and module field value source.

## Grouping

Module field grouping supports:

- `single_select`
- `single_member`

Backend grouping should mirror project custom field grouping:

- Annotate issues with the selected option or member value for the requested module field.
- Include `None` for issues without a value.
- Validate that the grouped field belongs to the current/source module and is visible to the user.

If the module layout supports `sub_group_by`, module field sub-grouping follows the same support matrix: `single_select` and `single_member` only. Sorting by module field is out of scope.

## Saved Views

Add nullable source module context to `IssueView`:

```text
source_module -> Module, null=True, blank=True, on_delete=SET_NULL
```

Ordinary project views keep `source_module` empty.

When saving a module page as a view:

- Store the current `moduleId` in `source_module`.
- Store `modulecustomproperty_*` keys as-is in `rich_filters`, `display_properties`, and `display_filters`.

When opening a project view:

- If `source_module` is empty, behavior stays unchanged and no module fields load.
- If `source_module` is set and visible to the user, load only that module's fields and use it as the backend module field context.
- If `source_module` is set but not visible, omit module field definitions and values. Module field display, filter, and group settings must be ignored or safely downgraded.

## Work Item Details

Work item details display module fields in the main content between the existing property area and the activity stream.

Behavior:

- Load module fields and values for every visible module attached to the issue.
- Group fields by module.
- Use the module name as each group title.
- Each module group is collapsible.
- Field rows reuse existing project field editors where possible.
- A work item with multiple visible modules shows multiple groups.
- Private module fields are hidden when the current user cannot view the module.

The details page shows these fields regardless of navigation source:

- All work items page.
- Project work items page.
- Module page.
- Saved view page.
- Peek view, using the same module field section when the current peek layout renders the main issue detail content.

## Frontend Stores And Services

Add a module issue field service and store similar to `ProjectIssueFieldService` and `ProjectIssueFieldStore`.

The store should support:

- Field maps keyed by module id.
- Disabled field maps keyed by module id.
- Lookup by `moduleId + fieldId`.
- Option create/delete.
- Value update for `moduleId + issueId`.
- Cache cleanup when a field is disabled or option is deleted.

Work item issue data should include module field values separately from project field values, for example:

```ts
module_field_values?: Record<ModuleId, Record<FieldId, TIssueFieldValue>>;
```

Keep project `field_values` unchanged.

## UI Details

Module edit form:

- Add a "Custom fields" or "Module fields" section at the bottom of the existing module form.
- Reuse project field form behavior.
- Do not add a separate settings page in the first version.

Module page:

- Load module fields after module context is available.
- Add current module fields to filter and display menus.
- Add single select and single member module fields to group-by choices.

Saved module view:

- Load source module fields when the view has `source_module`.
- Do not infer additional module fields from issue results.

Work item detail:

- Add module field section between properties and activity.
- Use compact collapsible sections, one per visible module.
- Use module names directly in section headers.

## Testing Plan

Backend tests:

- Field and option CRUD under a module.
- Duplicate field names rejected within a module and allowed across modules.
- Field type cannot be changed.
- Value validation for all seven field types.
- Writing values fails when the issue is not in the module.
- Writing values fails for disabled fields.
- Public module field values are visible to allowed project users.
- Private module field values are hidden from users without module visibility.
- Removing an issue from a module without confirmation returns 400 when values exist.
- Confirmed removal deletes values and the module relation in one transaction.
- `modulecustomproperty_*` filters work in module context.
- `modulecustomproperty_*` filters do not leak outside module context.
- Grouping works for single select and single member module fields.
- Saved views use `source_module` as module field context.

Frontend tests:

- Module edit form renders module field management at the bottom.
- Module page loads and displays only current module fields in filter/display/group menus.
- Saved module view loads only source module fields.
- All work items and ordinary project views do not show module fields in filter/display/group menus.
- Work item details show visible module field sections from all attached modules.
- Private module sections are hidden when the user lacks visibility.
- Removing a module with values shows confirmation and sends the confirmation flag.
- Empty multi-select and multi-member values are normalized to `null` where current project field behavior expects removal.

Manual QA:

- Create all seven field types on a public module and edit values from work item detail.
- Create a private module, add fields and values, then verify visibility as module member and non-member.
- Save a module page with module field filters, display columns, and grouping as a view. Reopen the view and verify the same field context.
- Verify a work item that belongs to multiple modules shows multiple collapsible module sections.
- Verify module field values disappear after confirmed module removal.

## Non-Goals

- Sorting by module custom fields.
- Sharing module field definitions across modules.
- Project-level module field management.
- Activity stream entries for module field value changes.
- Notifications for module field value changes.
- Showing module fields from every module in module page or saved module view filter menus.

## Open Implementation Notes

- Prefer extracting shared field value validation and serialization helpers from project fields only when it reduces duplication without obscuring project versus module scope.
- Keep `customproperty_*` behavior unchanged.
- Be conservative when safely ignoring unauthorized module field filter keys. If current project custom field behavior returns an empty result for invalid UUIDs, follow that behavior for module fields.
- Use `source_module` consistently in the model, serializer, API payloads, and frontend view types unless implementation uncovers an existing Plane convention that requires `source_module_id` for writable payloads.
