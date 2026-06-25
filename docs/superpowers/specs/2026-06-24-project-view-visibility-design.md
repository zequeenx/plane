# Project View Visibility Design

Date: 2026-06-24

## Goal

Allow project view creators to choose whether a project view starts as public or private, and enforce the resulting visibility and mutation rules consistently across API and UI.

## Scope

This design applies to project-level issue views at:

- `/api/workspaces/<slug>/projects/<project_id>/views/`
- `apps/web/core/components/views`
- project-view filter save/update controls

Workspace views are out of scope.

## Product Rules

Project views keep using the existing `access` value:

- `PUBLIC`: visible to project members.
- `PRIVATE`: visible only to the creator.

Visibility:

- Users can list and retrieve their own views.
- Users can list and retrieve other users' public views if they are active members of the project.
- Users cannot list or retrieve other users' private views.
- Project admins and workspace admins do not get special visibility into other users' private views.

Update:

- Only the creator can update a view.
- Public views cannot be changed back to private.
- Private views can be changed to public by the creator.
- Locked views remain non-updatable.

Delete:

- Public views can be deleted by the creator.
- Public views can also be deleted by users allowed by the existing backend admin-equivalent project logic.
- Private views can be deleted only by the creator.

Filter bar actions:

- A user viewing another user's public view can use `Save as` after changing filters, but cannot use `Update view`.
- A user viewing their own public view can use both `Save as` and `Update view`.
- A user viewing their own private view can use both `Save as` and `Update view`.

Create and edit form:

- Creating a project view must allow choosing public or private.
- Editing a private view must allow changing it to public.
- Editing a public view must not allow changing it to private.

## Backend Design

`IssueViewSerializer` should allow `access` in create and update payloads. It should continue to keep system-owned fields read-only, including `workspace`, `project`, `query`, `owned_by`, and `is_locked`.

`IssueViewViewSet.get_queryset()` should keep membership and archived-project constraints, but filter views as:

- `owned_by=request.user`, or
- `access=PUBLIC`

This preserves public discovery and hides other users' private views from everyone, including admins.

`retrieve` should return `404 Not Found` when the requested view is absent from `get_queryset()`. This avoids leaking the existence of another user's private view.

`partial_update` should:

- Fetch the view under lock by workspace, project, and id.
- Reject locked views.
- Reject non-owners.
- Reject a transition from `PUBLIC` to `PRIVATE`.
- Allow a transition from `PRIVATE` to `PUBLIC`.
- Serialize and save valid payloads.

`destroy` should:

- Load the view by workspace, project, and id.
- If the view is private, allow only the owner.
- If the view is public, allow the owner or the existing admin-equivalent backend logic.
- Keep deleting associated favorites and recent visits after successful deletion.

## Frontend Design

Project view form:

- Implement the CE `AccessController` instead of returning `null`.
- Use the existing `VIEW_ACCESS_SPECIFIERS`, icons, and `EViewAccess` values.
- For new views, let users choose public or private.
- For existing private views, let creators choose public.
- For existing public views, disable or hide the private option so the UI cannot request `PUBLIC -> PRIVATE`.

Project view quick actions:

- Keep edit visible only to owners.
- Delete should be visible for public views when the current user is owner or admin-equivalent.
- Delete should be visible for private views only to the owner.
- Because private views are not returned to non-owners, the private delete rule mainly protects owner-facing UI and mirrors backend enforcement.

Project view filter save/update controls:

- Keep `Save as` available to users with project member-level creation permissions.
- Keep `Update view` available only when the current user owns the current view, the view is unlocked, and the user has project member-level permissions.
- This already matches the desired behavior for other users' public views and should be covered by tests/manual QA.

Project view store:

- After `updateView`, merge the server response back into `viewMap`.
- This keeps access changes such as `PRIVATE -> PUBLIC` reflected without requiring a fresh fetch.

## Tests

Backend contract tests should cover:

- Creating a public project view stores `access=PUBLIC`.
- Creating a private project view stores `access=PRIVATE`.
- Regular project members can list and retrieve another user's public view.
- Regular project members cannot list or retrieve another user's private view.
- Admin-equivalent users cannot list or retrieve another user's private view.
- Non-owners cannot update public views.
- Owners can update their public views without changing access.
- Owners cannot change public views to private.
- Owners can change private views to public.
- Admin-equivalent users can delete another user's public view.
- Admin-equivalent users cannot delete another user's private view.
- Owners can delete their private views.

Frontend checks should cover the main UI contract where practical:

- The create view form exposes public/private access choices.
- The edit form for a public view prevents selecting private.
- The edit form for a private view allows selecting public.
- The project-view filter row suppresses `Update view` for another user's public view and still allows `Save as`.

Manual browser QA should deploy the app locally, create an admin account and a test account, and verify:

- Admin creates a public view; test account can open it, modify filters, and only use `Save as`.
- Test account cannot see admin's private view.
- Creator can update their own public view.
- Creator can update their private view and publish it by changing access to public.
- Admin-equivalent user can delete another user's public view.
- Admin-equivalent user cannot see or delete another user's private view.

## Out of Scope

- Workspace views.
- Published view links and public anchor behavior.
- New database fields or migrations.
- Team views or enterprise-only view variants.

## Risks

- Some access UI is CE/EE split through `@/plane-web`; the CE implementation should stay generic and not assume enterprise-only components.
- Existing guests have special project view behavior. The backend visibility rules should continue to respect guest feature gates after applying the public/private filter.
- API behavior must be the source of truth, because front-end hiding alone would not protect private views.
