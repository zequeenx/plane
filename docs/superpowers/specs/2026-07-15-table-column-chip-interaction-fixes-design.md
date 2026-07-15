# Table Column Chip Interaction Fixes

## Goal

Fix two regressions in the Table Layout display-property control:

1. The reorder tooltip must close as soon as a drag starts and become available again after the drag ends.
2. Clicking a display-property label must immediately switch the chip between enabled and disabled colors.

The behavior remains limited to Table Layout. List and Kanban behavior must not change.

## Design

### Drag tooltip lifecycle

`Sortable` already owns the authoritative dragging state inside `Draggable`. Extend `TSortableRenderHelpers` with an `isDragging` boolean and pass the current state to render callbacks. `FilterDisplayProperties` forwards this value to `DisplayPropertyChip`, which disables its reorder `Tooltip` while dragging.

This keeps pointer, keyboard, and tooltip concerns separate: the drag adapter controls the lifecycle, the chip only decides whether its tooltip may render, and keyboard reordering remains unchanged.

### Enabled-color reactivity

The sortable render callback currently reads `displayProperties[property.key]` outside the MobX-observed parent render. As a result, Table Layout does not subscribe to those nested values even though non-sortable layouts do.

Add `isEnabled` to each `TDisplayPropertyOption` while `FilterDisplayProperties` builds its option list. This snapshots the observable value inside the parent `observer` render. The sortable callback then renders from `property.isEnabled`, and toggling uses that same snapshot to calculate the next value.

The ordered key list and persisted `column_order` remain unchanged; `isEnabled` is view-only metadata and is never serialized.

## Testing

- Verify a sortable render helper marked as dragging produces a disabled reorder tooltip, while the idle state leaves it enabled.
- Verify sortable option data contains the current enabled state for selected and unselected fields.
- Verify clicking an unselected field requests `true`, and clicking a selected field requests `false`.
- Run the focused display-property and Sortable tests, UI/Web type checks, targeted lint/format, and React Doctor.
- Rebuild `@plane/ui` and restart or refresh the Web dev server so its runtime bundle contains the updated helper contract.

## Non-Goals

- Changing tooltip text, delay, or placement.
- Changing drag-and-drop ordering or persistence.
- Changing colors or behavior in List and Kanban layouts.
- Refactoring unrelated display-property stores or filters.
