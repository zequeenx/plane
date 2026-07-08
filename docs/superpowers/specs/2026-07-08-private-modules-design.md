# Private Modules Design

## Goal

Add module visibility so users can create public or private project modules. Public modules keep the current behavior. Private modules are visible only to their creator, lead, and members, while work items linked to private modules remain visible and editable under existing work item permissions.

## Scope

This feature keeps modules scoped to a single project. "Adding a private module to other work items" means assigning the private module to other work items in the same project.

In scope:

- Create and update modules with `public` or `private` visibility.
- Hide private modules from unrelated users in module lists, detail views, archived module views, dropdowns, and anonymous Space module endpoints.
- Allow related users to add private modules to work items in the same project.
- Hide private module relationships from unrelated users when work items are serialized.
- Preserve existing public module behavior and existing work item visibility/editing behavior.
- Leave a clear extension point for future private-module-specific field customization.

Out of scope:

- Cross-project modules.
- Custom fields for private modules.
- Changing work item permissions, activity permissions, or project membership roles.
- Migrating existing modules to private.

## Definitions

A module has a `visibility` value:

- `public`: visible anywhere the module is currently visible.
- `private`: visible only when the requesting user is the module creator, module lead, or an active module member.

A user is "module-related" when any of these are true:

- `Module.created_by_id == user.id`
- `Module.lead_id == user.id`
- A non-deleted `ModuleMember` row exists for the module and user.

## Recommended Approach

Add a `visibility` field to `Module` and centralize visibility filtering in backend helper functions. Every endpoint that returns module records or module IDs should call the helper instead of repeating ad hoc query logic.

This is preferred over frontend-only filtering because API responses must not leak private module IDs or names. It is preferred over a separate ACL model because current module ownership data already captures the required audience, and a helper-based boundary leaves enough room for later private module domain features.

## Backend Data Model

Add a module visibility choice to `apps/api/plane/db/models/module.py`.

Suggested model shape:

```python
class ModuleVisibility(models.TextChoices):
    PUBLIC = "public", "Public"
    PRIVATE = "private", "Private"


class Module(ProjectBaseModel):
    visibility = models.CharField(
        choices=ModuleVisibility.choices,
        default=ModuleVisibility.PUBLIC,
        max_length=20,
    )
```

Create a migration after `0124_project_issue_fields.py`. Existing rows receive the default `public` value, preserving current behavior.

## Backend Visibility Helpers

Create a focused helper near the module domain, for example `apps/api/plane/db/utils/module_visibility.py`.

Responsibilities:

- Build a reusable `Q` object for modules visible to a user.
- Filter module querysets.
- Filter module relation querysets through `module__...` fields.
- Provide a small predicate for serializer-level checks when an instance is already loaded.

Expected semantics:

```python
def module_visible_to_user_q(user, prefix="") -> Q:
    if not user or not user.is_authenticated:
        return Q(**{f"{prefix}visibility": "public"})

    return (
        Q(**{f"{prefix}visibility": "public"})
        | Q(**{f"{prefix}created_by_id": user.id})
        | Q(**{f"{prefix}lead_id": user.id})
        | Q(**{f"{prefix}members__id": user.id})
    )
```

Callers that join through `members` must use `distinct()` when duplicate rows are possible.

## Backend API Behavior

Module list/detail/archive endpoints:

- Apply visible-module filtering to `ModuleListCreateAPIEndpoint.get_queryset`.
- Apply visible-module filtering to `ModuleDetailAPIEndpoint.get_queryset`.
- Apply visible-module filtering to app module viewsets in `apps/api/plane/app/views/module/base.py` and `archive.py`.
- Apply visible-module filtering to workspace-level module listing endpoints.
- Exclude private modules from anonymous Space endpoints unless a future authenticated Space flow exists.

Module create/update:

- Accept `visibility` in module write serializers.
- Default to `public` when omitted.
- Validate `visibility` against model choices.
- Preserve current member and lead validation.

Module issue assignment:

- Before adding work items to a module, ensure the target module is visible to the acting user.
- Related users can add a private module to any work item they can already edit in the same project.
- Unrelated users cannot assign hidden private modules by manually posting the module ID.
- Removing a private module from a work item should require the module to be visible to the acting user when the route identifies the module directly.

## Work Item Serialization

Work item visibility and editing remain unchanged. Only module relationship fields are filtered.

For app/API/space serializers and issue query annotations:

- `module_ids` should include public modules plus private modules visible to the requesting user.
- Expanded module objects should serialize only when the module is visible to the requesting user.
- If a work item has only hidden private modules, unrelated users should see no module value for that work item.
- If a work item has both public and hidden private modules, unrelated users should see only the public module values.

Serializer methods are preferred where the current implementation reads from prefetched `issue_module` rows, because the serializer has access to `request.user` through context and can filter the already-loaded relation. Query annotations that aggregate module IDs should include the visibility condition directly.

## Activity And Analytics

Activity records should continue to be generated for module changes. User-facing activity serialization must not reveal hidden private module names or IDs to unrelated users. If an activity payload contains module metadata and the viewer is unrelated, the UI/API should omit the module-specific payload or render it as unavailable.

Analytics and grouping endpoints that use `issue_module__module_id` should apply the same visible-module condition before returning module IDs or module names. Public work item counts should not expose hidden private module names through grouping buckets.

## Frontend UX

Add a visibility control to the module create/update form in `apps/web/core/components/modules/form.tsx`.

Behavior:

- Default selection is `public`.
- Users can choose `public` or `private`.
- Private helper copy: "Only the creator, lead, and members can see this module."
- Submit payload includes `visibility`.
- Editing an existing module shows its current visibility.

Display:

- Module list/detail/card items can show a lock icon for private modules.
- Issue module dropdowns rely on backend-filtered module lists, so hidden private modules do not appear.
- Work item module chips render only modules returned by the backend.

Translations:

- Add module visibility strings through the existing i18n flow for module locale files.

## Future Extension Point

Future private-module-specific customization should use the module visibility helper as the access boundary. A later implementation can add module-scoped field definitions and values, for example:

- `ModuleField`: field definitions owned by a module.
- `ModuleFieldValue`: work item values for module-scoped fields.

Those models should validate that private-module fields are attached only to private modules if the product keeps the customization private-only. They should never introduce a separate visibility model unless field access diverges from module access.

## Error Handling

- Creating or updating a module with an invalid visibility returns `400`.
- Fetching a hidden private module by ID returns `404` from filtered querysets.
- Assigning a hidden private module to a work item returns `404` or the existing not-found response shape for module lookups.
- Existing archived-module protections remain unchanged.

## Testing

Backend contract tests should cover:

- Existing modules are public by default.
- Creator can see a private module.
- Lead can see a private module.
- Member can see a private module.
- Unrelated project member cannot see a private module in module list/detail/archive responses.
- Anonymous Space module list excludes private modules.
- Related user can assign a private module to a work item.
- Unrelated user cannot assign a hidden private module by posting the module ID.
- Work item list/detail responses hide private module IDs from unrelated users while preserving the work item itself.
- Work item responses still include public modules for unrelated users.
- Mixed public/private module assignments show only visible module IDs to each viewer.
- Grouping or analytics responses do not expose hidden private module IDs or names.

Frontend tests should cover:

- Module form defaults to public visibility.
- Module form submits private visibility when selected.
- Editing a private module preserves the selected visibility.
- Module dropdown renders only modules present in the store response.

## Rollout Notes

The migration is backward-compatible because all existing modules default to public. The main rollout risk is missing an endpoint that exposes `module_ids` or module names through work item serialization, grouping, analytics, or Space APIs. The implementation should search for `module_ids`, `issue_module__module`, and `issue_module__module_id` and route each usage through the visibility helper.
