# Table Column Ordering Design

## Summary

Users can reorder display properties from **Display > Display properties** whenever the active work-item layout is Table. The reordered properties immediately change the Table column order and participate in the existing display-filter preference, Save as view, and Update view flows.

The fixed Work item column, including the optional work-item ID, remains first and cannot be reordered. Both visible and hidden properties participate in ordering so that re-enabling a hidden property restores it to its chosen position.

## Scope

The feature applies to every work-item surface that supports the Table layout, including project, cycle, module, workspace/global, project-view, workspace-view, and view create/edit surfaces.

The feature includes:

- system display properties supported by Table;
- project custom properties;
- module custom properties;
- immediate Table preview after a reorder;
- personal display-filter persistence on ordinary work-item pages;
- project-view and workspace-view creation and update persistence;
- existing changed/applied indicators and Save as view actions.

The feature does not:

- reorder properties in List, Kanban, Calendar, or Gantt layouts;
- move the Work item title or ID column;
- add a separate save action or a separate backend persistence model;
- add a reset-order command.

## Data Model

Extend `IIssueDisplayFilterOptions` with a Table-specific configuration:

```ts
interface IIssueDisplayFilterOptions {
  // existing properties
  spreadsheet?: {
    column_order?: (keyof IIssueDisplayProperties)[];
  };
}
```

The product calls this layout Table while the existing internal enum and component names use `spreadsheet`; the persisted key follows the existing internal naming to avoid introducing a second identifier for the same layout.

`column_order` contains every currently known reorderable Table property, including hidden properties. It excludes `key`, because ID remains part of the fixed Work item column.

The configuration remains inside the existing `display_filters` JSON. Project, cycle, module, user-property, project-view, and workspace-view APIs already persist this JSON, so no database migration or new serializer field is required.

`getComputedDisplayFilters` must preserve and validate the nested `spreadsheet` configuration instead of dropping it during filter normalization.

## Column Order Resolution

A pure resolver produces the effective property order from:

1. the saved `spreadsheet.column_order` array;
2. the ordered list of Table properties available on the current surface.

The available list starts with the existing system Table order, filtered for surface capabilities such as cycle and module support, followed by project custom fields and module custom fields in their existing source order. It includes hidden fields and excludes the fixed `key` property.

The resolver:

- keeps the first occurrence of each valid saved key;
- removes duplicates, deleted fields, and fields unsupported by the current surface;
- appends every available key missing from the saved order;
- returns the available default order when no saved order exists.

This makes old views backward-compatible and ensures fields created after a view was saved appear at the end without disturbing the user's existing order. Loading custom-field metadata only changes the derived effective order; it does not trigger a persistence request.

The Table derives visible columns by filtering the effective order with `displayProperties`. The Table header and every issue row consume the same resulting array so their cells cannot diverge.

## Display Properties Interaction

The current compact, wrapping property chips remain in place. In Table layout, each reorderable chip gains a `GripVertical` drag handle:

- the handle starts drag interactions;
- the chip label continues to toggle visibility;
- selected and unselected styling remains unchanged;
- a drop indicator shows insertion before or after the target chip;
- the dragged chip becomes partially transparent;
- hidden chips remain draggable;
- the fixed ID option can still be toggled but has no drag handle;
- non-Table layouts show the existing chips without drag handles.

The handle is focusable, has an accessible label and tooltip, and supports moving the property left or right with the keyboard. Reordering uses logical array order, so keyboard movement remains predictable when chips wrap across visual rows.

## Shared Sortable Primitive

The repository already provides `@plane/ui/Sortable`, backed by Atlaskit Pragmatic Drag and Drop. Its current behavior is vertical and makes the complete item draggable.

Extend it in a backward-compatible way to support:

- vertical behavior as the unchanged default;
- a horizontal mode using left and right closest-edge hitboxes;
- an optional dedicated drag-handle element supplied by the render callback;
- correctly oriented drop indicators.

Add a Storybook example showing wrapping chips in horizontal mode. The work-item feature composes this shared primitive and keeps property availability, visibility, normalization, and persistence rules in the web application.

## Update And Persistence Flow

On a successful drop or keyboard move, the display-properties component emits one complete order update:

```ts
handleDisplayFiltersUpdate({
  spreadsheet: {
    ...displayFilters.spreadsheet,
    column_order: nextOrder,
  },
});
```

The update includes all available reorderable fields, not only visible fields. It does not change `displayProperties` and does not refetch work items because column order does not affect the issue query.

Existing page behavior then applies:

- ordinary project, cycle, module, and workspace pages persist the updated display filters through their current user-property/filter APIs;
- Save as view payloads clone the current `display_filters`, including `spreadsheet.column_order`;
- project and workspace views compare current and saved `display_filters` deeply, so a reorder activates the existing changed state and Update view action;
- switching to another layout retains the Table order but does not apply it until the user returns to Table.

The project-view form also carries the nested configuration through create and edit submissions.

The rich-filter state currently exposes Save as view only when at least one rich-filter condition is active. Extend `TSaveViewOptions` with an optional `hasAdditionalChanges` flag, parallel to the existing Update view option. `canSaveView` becomes true when either rich filters are active or this flag is true, subject to the existing permissions and disabled state.

The project-level and workspace-level filter HOCs set this flag when Table column order differs from the saved view order, or when an explicit Table column order exists on a non-view page. This makes a reorder surface the existing Save as view button without introducing a second action. Existing callers that omit the flag keep their current behavior.

## Error Handling

Persisted arrays are treated as untrusted input and always pass through the order resolver. Invalid values, duplicate keys, stale custom-field keys, and properties unavailable on the current surface are ignored rather than causing a render failure.

Only completed drops emit updates. A cancelled drag leaves the order unchanged. Persistence failures use the existing display-filter store recovery path, which restores server-backed filter state. The feature does not add a separate optimistic cache or error model.

## Testing

### Shared UI tests and Storybook

- Existing vertical `Sortable` behavior remains unchanged.
- Horizontal mode inserts before or after a target from left and right hitboxes.
- A configured drag handle is the only drag initiation surface.
- Drop indicators use the correct orientation.
- Storybook renders wrapping selectable chips with a dedicated handle.

### Order resolver unit tests

- Missing saved order returns the available default.
- Duplicate and unavailable keys are removed.
- Newly available system and custom fields append to the end.
- Hidden properties retain their saved positions.
- `key` is excluded.
- Project and module custom-property keys are retained.
- Surface capability filtering is respected.

### Display-properties component tests

- Drag handles render only for reorderable properties in Table layout.
- ID remains toggleable and is not draggable.
- Clicking a chip changes only visibility.
- Dropping and keyboard movement emit the full next `column_order`.
- Selected and unselected properties can both move.

### Table integration tests

- Header and issue-row cells render in the same resolved order.
- Work item title and ID remain fixed first.
- Custom fields render in saved positions.
- Switching away from and back to Table preserves order.

### Persistence tests

- `getComputedDisplayFilters` retains `spreadsheet.column_order`.
- Project and workspace Save as view payloads include the order.
- Save as view becomes available for a column-order change even when no rich filter is active.
- Existing Save as view behavior is unchanged when `hasAdditionalChanges` is omitted.
- Project and workspace Update view dirty detection notices an order change.
- Relevant API contract tests round-trip the nested display-filter configuration unchanged.

## Acceptance Criteria

1. A user can drag any reorderable checked or unchecked display-property chip while using Table layout.
2. The Table updates immediately and matches the chosen order in both its header and rows.
3. Work item title and ID remain fixed at the left.
4. Reordering surfaces the existing Save as view action even without an active rich filter, and can be saved to or updated on a view.
5. Reloading a saved view restores the order.
6. A newly created custom field appears at the end of an existing saved order.
7. Deleted or unavailable fields do not break the view.
8. Other layouts retain their existing property order and interaction.
