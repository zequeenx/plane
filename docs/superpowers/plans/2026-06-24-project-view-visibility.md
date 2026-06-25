# Project View Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public/private creation for project views and enforce the confirmed visibility, update, and delete rules in API and UI.

**Architecture:** Keep using the existing `IssueView.access` field. Make the project view API the source of truth for visibility and permissions, then mirror those rules in CE UI controls and MobX store updates. Use backend contract tests for permission guarantees, with frontend type/lint checks and browser QA for the interactive flow.

**Tech Stack:** Django REST Framework, pytest, React Router app, React Hook Form, MobX, `@plane/ui` `CustomSelect`, Docker Compose test stack, in-app Browser plugin.

---

## File Structure

- Modify `apps/api/plane/app/views/view/base.py`: project view queryset, retrieve, update transition guard, and delete permission guard.
- Modify `apps/api/plane/app/serializers/view.py`: allow project view access to be supplied by API payloads.
- Create `apps/api/plane/tests/contract/app/test_project_view_app.py`: backend contract tests for create/list/retrieve/update/delete rules.
- Modify `apps/web/ce/components/views/access-controller.tsx`: implement the generic access selector used by CE project and workspace view forms.
- Modify `apps/web/core/components/views/form.tsx`: pass a restriction when editing public project views so they cannot be changed to private.
- Modify `apps/web/core/components/common/quick-actions-helper.tsx`: encode the private/public delete UI rule.
- Modify `apps/web/core/components/views/quick-actions.tsx`: pass access-aware delete flags into menu helper.
- Modify `apps/web/core/store/project-view.store.ts`: merge the server response after updating a view.
- Verify with backend tests, web type/lint checks, and browser QA.

## Task 1: Backend Contract Tests

**Files:**

- Create: `apps/api/plane/tests/contract/app/test_project_view_app.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/plane/tests/contract/app/test_project_view_app.py` with tests that exercise the API directly:

```python
import uuid

import pytest
from rest_framework import status

from plane.db.models import IssueView, Project, ProjectMember, User, WorkspaceMember


class TestProjectViewBase:
    def get_project_view_url(self, workspace_slug: str, project_id: uuid.UUID, view_id: uuid.UUID | None = None) -> str:
        base_url = f"/api/workspaces/{workspace_slug}/projects/{project_id}/views/"
        return f"{base_url}{view_id}/" if view_id else base_url

    def create_project(self, workspace, owner):
        project = Project.objects.create(name="Project Views", identifier="PV", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=project, member=owner, role=20, is_active=True)
        return project

    def create_member(self, workspace, project, email: str, role: int = 15):
        user = User.objects.create_user(email=email, username=email.split("@")[0])
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role, is_active=True)
        ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role, is_active=True)
        return user

    def create_view(self, workspace, project, owner, access: int, name: str = "View"):
        return IssueView.objects.create(
            workspace=workspace,
            project=project,
            owned_by=owner,
            created_by=owner,
            updated_by=owner,
            name=name,
            description="",
            filters={},
            query={},
            access=access,
        )

    def payload(self, name: str = "Saved view", access: int = 1):
        return {
            "name": name,
            "description": "",
            "access": access,
            "filters": {},
            "rich_filters": {},
            "display_filters": {"layout": "list", "group_by": "state", "order_by": "-created_at"},
            "display_properties": {"assignee": True, "state": True},
        }


@pytest.mark.contract
class TestProjectViewAPI(TestProjectViewBase):
    @pytest.mark.django_db
    def test_create_public_project_view_stores_public_access(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        response = session_client.post(self.get_project_view_url(workspace.slug, project.id), self.payload(access=1), format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["access"] == 1
        assert IssueView.objects.get(id=response.json()["id"]).access == 1

    @pytest.mark.django_db
    def test_create_private_project_view_stores_private_access(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        response = session_client.post(self.get_project_view_url(workspace.slug, project.id), self.payload(access=0), format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["access"] == 0
        assert IssueView.objects.get(id=response.json()["id"]).access == 0

    @pytest.mark.django_db
    def test_member_can_list_and_retrieve_another_users_public_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        public_view = self.create_view(workspace, project, create_user, access=1, name="Public")
        member = self.create_member(workspace, project, "member-public@example.com")
        session_client.force_authenticate(user=member)

        list_response = session_client.get(self.get_project_view_url(workspace.slug, project.id))
        retrieve_response = session_client.get(self.get_project_view_url(workspace.slug, project.id, public_view.id))

        assert list_response.status_code == status.HTTP_200_OK
        assert str(public_view.id) in [view["id"] for view in list_response.json()]
        assert retrieve_response.status_code == status.HTTP_200_OK
        assert retrieve_response.json()["id"] == str(public_view.id)

    @pytest.mark.django_db
    def test_member_cannot_list_or_retrieve_another_users_private_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        private_view = self.create_view(workspace, project, create_user, access=0, name="Private")
        member = self.create_member(workspace, project, "member-private@example.com")
        session_client.force_authenticate(user=member)

        list_response = session_client.get(self.get_project_view_url(workspace.slug, project.id))
        retrieve_response = session_client.get(self.get_project_view_url(workspace.slug, project.id, private_view.id))

        assert list_response.status_code == status.HTTP_200_OK
        assert str(private_view.id) not in [view["id"] for view in list_response.json()]
        assert retrieve_response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_admin_equivalent_cannot_list_or_retrieve_another_users_private_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        private_view = self.create_view(workspace, project, create_user, access=0, name="Private")
        admin = self.create_member(workspace, project, "project-admin@example.com", role=20)
        session_client.force_authenticate(user=admin)

        list_response = session_client.get(self.get_project_view_url(workspace.slug, project.id))
        retrieve_response = session_client.get(self.get_project_view_url(workspace.slug, project.id, private_view.id))

        assert list_response.status_code == status.HTTP_200_OK
        assert str(private_view.id) not in [view["id"] for view in list_response.json()]
        assert retrieve_response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_non_owner_cannot_update_public_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        public_view = self.create_view(workspace, project, create_user, access=1, name="Public")
        member = self.create_member(workspace, project, "member-update@example.com")
        session_client.force_authenticate(user=member)

        response = session_client.patch(
            self.get_project_view_url(workspace.slug, project.id, public_view.id),
            {"name": "Changed by non-owner"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        public_view.refresh_from_db()
        assert public_view.name == "Public"

    @pytest.mark.django_db
    def test_owner_can_update_public_view_without_changing_access(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        public_view = self.create_view(workspace, project, create_user, access=1, name="Public")

        response = session_client.patch(
            self.get_project_view_url(workspace.slug, project.id, public_view.id),
            {"name": "Renamed public"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        public_view.refresh_from_db()
        assert public_view.name == "Renamed public"
        assert public_view.access == 1

    @pytest.mark.django_db
    def test_owner_cannot_change_public_view_to_private(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        public_view = self.create_view(workspace, project, create_user, access=1, name="Public")

        response = session_client.patch(
            self.get_project_view_url(workspace.slug, project.id, public_view.id),
            {"access": 0},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        public_view.refresh_from_db()
        assert public_view.access == 1

    @pytest.mark.django_db
    def test_owner_can_change_private_view_to_public(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        private_view = self.create_view(workspace, project, create_user, access=0, name="Private")

        response = session_client.patch(
            self.get_project_view_url(workspace.slug, project.id, private_view.id),
            {"access": 1},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        private_view.refresh_from_db()
        assert private_view.access == 1

    @pytest.mark.django_db
    def test_admin_equivalent_can_delete_another_users_public_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        public_view = self.create_view(workspace, project, create_user, access=1, name="Public")
        admin = self.create_member(workspace, project, "delete-admin@example.com", role=20)
        session_client.force_authenticate(user=admin)

        response = session_client.delete(self.get_project_view_url(workspace.slug, project.id, public_view.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueView.objects.filter(id=public_view.id).exists()

    @pytest.mark.django_db
    def test_admin_equivalent_cannot_delete_another_users_private_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        private_view = self.create_view(workspace, project, create_user, access=0, name="Private")
        admin = self.create_member(workspace, project, "delete-private-admin@example.com", role=20)
        session_client.force_authenticate(user=admin)

        response = session_client.delete(self.get_project_view_url(workspace.slug, project.id, private_view.id))

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert IssueView.objects.filter(id=private_view.id).exists()

    @pytest.mark.django_db
    def test_owner_can_delete_private_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        private_view = self.create_view(workspace, project, create_user, access=0, name="Private")

        response = session_client.delete(self.get_project_view_url(workspace.slug, project.id, private_view.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueView.objects.filter(id=private_view.id).exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_view_app.py -q
```

Expected: at least the private-create and private-update tests fail because `access` is currently read-only/ignored, and private visibility may not return `404` safely.

- [ ] **Step 3: Commit the failing tests**

```bash
git add apps/api/plane/tests/contract/app/test_project_view_app.py
git commit -m "test: cover project view visibility permissions"
```

## Task 2: Backend API Enforcement

**Files:**

- Modify: `apps/api/plane/app/serializers/view.py`
- Modify: `apps/api/plane/app/views/view/base.py`
- Test: `apps/api/plane/tests/contract/app/test_project_view_app.py`

- [ ] **Step 1: Allow view access payloads**

In `apps/api/plane/app/serializers/view.py`, remove `"access"` from `IssueViewSerializer.Meta.read_only_fields`:

```python
read_only_fields = [
    "workspace",
    "project",
    "query",
    "owned_by",
    "is_locked",
]
```

- [ ] **Step 2: Add project view permission helpers**

In `apps/api/plane/app/views/view/base.py`, inside `IssueViewViewSet`, add helpers:

```python
    def _is_project_admin_or_workspace_admin_member(self, request, slug, project_id):
        project_member_qs = ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=request.user,
            is_active=True,
        )
        return project_member_qs.filter(role=ROLE.ADMIN.value).exists() or (
            project_member_qs.exists()
            and WorkspaceMember.objects.filter(
                workspace__slug=slug,
                member=request.user,
                role=ROLE.ADMIN.value,
                is_active=True,
            ).exists()
        )

    def _is_public_to_private_transition(self, issue_view, request_data):
        requested_access = request_data.get("access", None)
        return issue_view.access == 1 and requested_access is not None and int(requested_access) == 0
```

- [ ] **Step 3: Keep private views owner-only in queryset and retrieve**

Ensure `get_queryset()` keeps:

```python
.filter(Q(owned_by=self.request.user) | Q(access=1))
```

Update `retrieve` to return `404` for hidden views:

```python
issue_view = self.get_queryset().filter(pk=pk, project_id=project_id).first()
if issue_view is None:
    return Response({"error": "The required object does not exist."}, status=status.HTTP_404_NOT_FOUND)
```

Keep the existing guest gate after the null check.

- [ ] **Step 4: Reject public to private updates**

In `partial_update`, after locked and owner checks, add:

```python
if self._is_public_to_private_transition(issue_view, request.data):
    return Response(
        {"error": "Public views cannot be changed to private."},
        status=status.HTTP_400_BAD_REQUEST,
    )
```

- [ ] **Step 5: Enforce private delete owner-only**

In `destroy`, replace the delete permission condition with:

```python
is_owner = project_view.owned_by_id == request.user.id
can_admin_delete = project_view.access == 1 and self._is_project_admin_or_workspace_admin_member(
    request,
    slug,
    project_id,
)

if is_owner or can_admin_delete:
    project_view.delete()
    ...
else:
    return Response(
        {"error": "Only admin or owner can delete the view"},
        status=status.HTTP_400_BAD_REQUEST,
    )
```

- [ ] **Step 6: Run backend tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_view_app.py -q
```

Expected: all project view contract tests pass.

- [ ] **Step 7: Commit backend implementation**

```bash
git add apps/api/plane/app/serializers/view.py apps/api/plane/app/views/view/base.py
git commit -m "fix: enforce project view visibility permissions"
```

## Task 3: Frontend Access Selector

**Files:**

- Modify: `apps/web/ce/components/views/access-controller.tsx`
- Modify: `apps/web/core/components/views/form.tsx`

- [ ] **Step 1: Implement the CE access selector**

Replace the empty `AccessController` with:

```tsx
import { Controller } from "react-hook-form";
import { useTranslation } from "@plane/i18n";
import type { EViewAccess } from "@plane/types";
import { CustomSelect, cn } from "@plane/ui";
import { VIEW_ACCESS_SPECIFIERS } from "@/helpers/views.helper";

type Props = {
  control: any;
  disabledAccesses?: EViewAccess[];
};

export function AccessController(props: Props) {
  const { control, disabledAccesses = [] } = props;
  const { t } = useTranslation();

  return (
    <Controller
      control={control}
      name="access"
      render={({ field: { value, onChange } }) => {
        const selectedAccess =
          VIEW_ACCESS_SPECIFIERS.find((option) => option.key === value) ?? VIEW_ACCESS_SPECIFIERS[0];

        return (
          <CustomSelect
            value={value}
            onChange={onChange}
            label={
              <span className="flex items-center gap-1.5">
                <selectedAccess.icon className="h-3.5 w-3.5" />
                {t(selectedAccess.i18n_label)}
              </span>
            }
            buttonClassName="border-subtle"
            placement="bottom-start"
          >
            {VIEW_ACCESS_SPECIFIERS.filter((option) => !disabledAccesses.includes(option.key)).map((option) => (
              <CustomSelect.Option key={option.key} value={option.key}>
                <div className="flex items-center gap-2">
                  <option.icon className={cn("h-3.5 w-3.5 flex-shrink-0")} />
                  <span>{t(option.i18n_label)}</span>
                </div>
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        );
      }}
    />
  );
}
```

- [ ] **Step 2: Prevent public project views from selecting private**

In `apps/web/core/components/views/form.tsx`, change:

```tsx
<AccessController control={control} />
```

to:

```tsx
<AccessController
  control={control}
  disabledAccesses={data?.access === EViewAccess.PUBLIC ? [EViewAccess.PRIVATE] : undefined}
/>
```

- [ ] **Step 3: Run web typecheck for the touched app**

Run:

```bash
pnpm turbo run check:types --filter=web
```

Expected: typecheck passes.

- [ ] **Step 4: Commit access selector UI**

```bash
git add apps/web/ce/components/views/access-controller.tsx apps/web/core/components/views/form.tsx
git commit -m "feat: add project view access selector"
```

## Task 4: Frontend Delete Rule and Store Sync

**Files:**

- Modify: `apps/web/core/components/common/quick-actions-helper.tsx`
- Modify: `apps/web/core/components/views/quick-actions.tsx`
- Modify: `apps/web/core/store/project-view.store.ts`

- [ ] **Step 1: Add access-aware delete flags**

In `UseViewMenuItemsProps`, replace `isAdmin` with `canDelete`:

```tsx
interface UseViewMenuItemsProps {
  isOwner: boolean;
  canDelete: boolean;
  workspaceSlug: string;
  projectId?: string;
  view: IProjectView | IWorkspaceView;
  handleEdit: () => void;
  handleDelete: () => void;
  handleCopyLink: () => void;
  handleOpenInNewTab: () => void;
}
```

Then update `useViewMenuItems`:

```tsx
const { workspaceSlug, isOwner, canDelete, projectId, view, ...handlers } = props;
...
factory.createDeleteMenuItem(handlers.handleDelete, canDelete),
```

- [ ] **Step 2: Compute project-view delete permission in quick actions**

In `apps/web/core/components/views/quick-actions.tsx`, import `EViewAccess` and compute:

```tsx
const canDelete = view.access === EViewAccess.PRIVATE ? isOwner : isOwner || isAdmin;
```

Then pass `canDelete` to `useViewMenuItems`.

- [ ] **Step 3: Preserve workspace view quick action behavior**

In `apps/web/core/components/workspace/views/quick-action.tsx`, compute:

```tsx
const canDelete = isOwner || isAdmin;
```

Then pass `canDelete` to `useViewMenuItems`.

- [ ] **Step 4: Merge update responses into project view store**

In `apps/web/core/store/project-view.store.ts`, after `patchView` resolves, merge the server response:

```tsx
const response = await this.viewService.patchView(workspaceSlug, projectId, viewId, data);

runInAction(() => {
  set(this.viewMap, [viewId], response);
});

return response;
```

- [ ] **Step 5: Run web lint/type checks**

Run:

```bash
pnpm turbo run check:lint --filter=web
pnpm turbo run check:types --filter=web
```

Expected: both commands pass.

- [ ] **Step 6: Commit frontend permissions**

```bash
git add apps/web/core/components/common/quick-actions-helper.tsx apps/web/core/components/views/quick-actions.tsx apps/web/core/components/workspace/views/quick-action.tsx apps/web/core/store/project-view.store.ts
git commit -m "fix: align project view actions with visibility rules"
```

## Task 5: End-to-End Local Verification

**Files:**

- No source files expected.

- [ ] **Step 1: Run focused backend test once more**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_view_app.py -q
```

Expected: all tests pass.

- [ ] **Step 2: Run relevant web checks**

Run:

```bash
pnpm turbo run check:types --filter=web
pnpm turbo run check:lint --filter=web
```

Expected: both commands pass.

- [ ] **Step 3: Start the project locally**

Run the repository setup if `apps/api/.env` is missing:

```bash
./setup.sh
```

Start the app:

```bash
pnpm dev
```

Expected: web app on `http://localhost:3000`; API available through the configured local stack.

- [ ] **Step 4: Create test users and project**

Using the UI or API/admin shell, create:

- Admin user: `view-admin@example.com`
- Test user: `view-member@example.com`
- Workspace: `View Visibility QA`
- Project: `Visibility`
- Add both users to the project, with admin-equivalent permissions for the admin account and member permissions for the test account.

- [ ] **Step 5: Browser QA with the in-app Browser**

Use the Browser plugin against `http://localhost:3000`:

- Sign in as admin.
- Create one public project view.
- Create one private project view.
- Sign in as test user.
- Confirm the public view appears and opens.
- Modify filters on the public view and confirm `Save as` appears while `Update view` does not.
- Confirm the admin's private view does not appear and direct navigation shows the app's not-found state.
- Sign in as admin again.
- Confirm the public view can be updated.
- Confirm the private view can be changed to public.
- Confirm admin-equivalent deletion of another user's public view works.
- Confirm another user's private view remains hidden and cannot be deleted.

- [ ] **Step 6: Commit any verification-only docs if created**

No commit is needed unless a test fixture or doc was added during verification.

## Self-Review Notes

- Spec coverage: API create/list/retrieve/update/delete rules are covered by Task 1 and Task 2. UI create/edit access selection, action visibility, Save As/Update View behavior, store sync, and browser QA are covered by Tasks 3-5.
- Placeholder scan: no placeholder markers or unspecified test steps are intentionally left in this plan.
- Type consistency: the plan uses existing `IProjectView.access`, `EViewAccess.PUBLIC`, `EViewAccess.PRIVATE`, `IssueView.access`, and project role values already present in the codebase.
