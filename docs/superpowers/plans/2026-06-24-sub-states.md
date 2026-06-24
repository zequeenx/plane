# Project Sub-States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project state sub-states that admins can manage and issues can optionally select, display, edit, and filter by.

**Architecture:** Add `SubState` as a project-owned child of `State`, then add nullable `Issue.sub_state` with backend validation that it belongs to the selected `Issue.state`. Return nested sub-states with state data, normalize them in the web state store, and reuse one `SubStateDropdown` across creation, properties, spreadsheet, and filters. Do not add sub-state to grouping, sub-grouping, or drag-to-change behavior.

**Tech Stack:** Django REST Framework, Django migrations, pytest, React, React Hook Form, MobX, TypeScript, `@plane/ui`, Plane rich filter utilities, Docker Compose test stack, in-app Browser plugin.

---

## File Structure

- Modify `apps/api/plane/db/models/state.py`: add `SubState` model under `State`.
- Modify `apps/api/plane/db/models/issue.py`: add nullable `sub_state` foreign key and default filter/display metadata.
- Modify `apps/api/plane/db/models/__init__.py`: export `SubState`.
- Create migration `apps/api/plane/db/migrations/0122_sub_state_issue_sub_state.py`: create `sub_states` table and add `issues.sub_state_id`.
- Modify `apps/api/plane/app/serializers/state.py`: add `SubStateSerializer`, `SubStateLiteSerializer`, and nested `sub_states`.
- Modify `apps/api/plane/api/serializers/state.py`: add matching public API sub-state serialization to public project state responses.
- Modify `apps/api/plane/app/views/state/base.py`: add `SubStateViewSet`, nested prefetching, admin mutation, and delete-in-use guard.
- Modify `apps/api/plane/app/urls/state.py`: add nested sub-state routes.
- Modify `apps/api/plane/app/views/workspace/state.py`: return sub-states with workspace-level state data.
- Modify `apps/api/plane/app/serializers/issue.py`: add `sub_state_id` field and state/sub-state validation.
- Modify `apps/api/plane/api/serializers/issue.py`: add the same public API issue `sub_state_id` field and validation used by the app serializer.
- Modify `apps/api/plane/app/views/issue/base.py`: include `sub_state_id` in issue create/update response paths and list projections.
- Modify `apps/api/plane/utils/grouper.py` and `apps/api/plane/space/utils/grouper.py`: include `sub_state_id` in required issue result fields.
- Modify `apps/api/plane/utils/filters/filterset.py`: add rich filters for `sub_state_id` and `sub_state_id__in`.
- Modify `apps/api/plane/utils/filters/converters.py`: map legacy `sub_state` to `sub_state_id`.
- Modify `apps/api/plane/utils/issue_filters.py`: add legacy query parameter support for `sub_state`.
- Modify `apps/web/core/constants/fetch-keys.ts`: include sub-state in issue params cache keys.
- Modify `packages/types/src/state.ts`: add `ISubState`, nested state data, and sub-state operations callbacks.
- Modify `packages/types/src/issues/issue.ts`: add `sub_state_id: string | null`.
- Modify `packages/types/src/view-props.ts`: add `sub_state_id` filter property and `sub_state` display property, without adding grouping options.
- Modify `packages/constants/src/issue/common.ts`: add display property and spreadsheet property entries for sub-state.
- Modify `packages/constants/src/issue/filter.ts`: add sub-state filter to issue pages that already expose `state_id`.
- Modify `packages/constants/src/issue/modal.ts`: default `sub_state_id` to `null`.
- Modify `packages/constants/src/tab-indices.ts`: add `sub_state_id` beside `state_id` for keyboard order.
- Modify `packages/utils/src/work-item/base.ts`: include `sub_state` in computed display properties.
- Modify `packages/utils/src/work-item/modal.ts`: preserve `sub_state_id` through modal default value helpers.
- Modify `packages/utils/src/work-item-filters/configs/filters/state.ts`: add sub-state filter config that shows parent state labels.
- Modify `apps/web/ce/hooks/work-item-filters/use-work-item-filters-config.tsx`: enable sub-state filter only when selected state filters exist.
- Modify `apps/web/core/services/project/project-state.service.ts`: add nested sub-state API methods.
- Modify `apps/web/core/store/state.store.ts`: normalize and mutate sub-states.
- Verify `apps/web/core/hooks/store/use-project-state.ts`: it returns `IStateStore`, so no code change is needed after `IStateStore` includes sub-state methods.
- Create `apps/web/core/components/dropdowns/sub-state/dropdown.tsx`, `base.tsx`, and `index.ts`: reusable work item sub-state dropdown.
- Create `apps/web/core/components/project-states/sub-state-list.tsx`, `sub-state-item.tsx`, and `sub-state-form.tsx`: inline sub-state management under each state.
- Modify `apps/web/core/components/project-states/state-item.tsx`, `state-list.tsx`, and exports: render sub-state management with state operation callbacks.
- Modify `apps/web/core/components/issues/issue-modal/components/default-properties.tsx` and `apps/web/core/components/issues/issue-modal/form.tsx`: add parallel `Sub-state` field and clearing behavior.
- Modify `apps/web/core/components/issues/issue-detail/sidebar.tsx`: add detail Properties `Sub-state`.
- Modify `apps/web/core/components/issues/peek-overview/properties.tsx`: add peek Properties `Sub-state`.
- Modify `apps/web/core/components/issues/issue-layouts/properties/all-properties.tsx`: render `Sub-state` when display is enabled.
- Create `apps/web/core/components/issues/issue-layouts/spreadsheet/columns/sub-state-column.tsx` and modify spreadsheet column exports.
- Modify `apps/web/ce/components/issues/issue-layouts/utils.tsx`: register `sub_state` in `SPREADSHEET_COLUMNS` and `SpreadSheetPropertyIconMap`.
- Modify `packages/i18n/src/locales/*/common.json` and `packages/i18n/src/locales/*/issue.json` only after invoking the `translate` skill in the implementation session.
- Create backend tests:
  - `apps/api/plane/tests/contract/app/test_project_sub_state_app.py`
  - `apps/api/plane/tests/contract/app/test_issue_sub_state_app.py`

## Task 1: Backend Sub-State API Contract Tests

**Files:**

- Create: `apps/api/plane/tests/contract/app/test_project_sub_state_app.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/plane/tests/contract/app/test_project_sub_state_app.py`:

```python
import uuid

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State, StateGroup, User, WorkspaceMember


class TestProjectSubStateBase:
    def create_project(self, workspace, owner):
        project = Project.objects.create(name="Sub State Project", identifier="SSP", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=project, member=owner, role=20, is_active=True)
        started = State.objects.create(
            workspace=workspace,
            project=project,
            name="Art Assets In Production",
            color="#F59E0B",
            group=StateGroup.STARTED.value,
            sequence=35000,
        )
        review = State.objects.create(
            workspace=workspace,
            project=project,
            name="Review",
            color="#46A758",
            group=StateGroup.COMPLETED.value,
            sequence=45000,
        )
        return project, started, review

    def create_member(self, workspace, project, email: str, role: int = 15):
        user = User.objects.create_user(email=email, username=email.split("@")[0])
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role, is_active=True)
        ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role, is_active=True)
        return user

    def sub_state_url(
        self,
        workspace_slug: str,
        project_id: uuid.UUID,
        state_id: uuid.UUID,
        sub_state_id: uuid.UUID | None = None,
    ) -> str:
        base_url = f"/api/workspaces/{workspace_slug}/projects/{project_id}/states/{state_id}/sub-states/"
        return f"{base_url}{sub_state_id}/" if sub_state_id else base_url

    def state_list_url(self, workspace_slug: str, project_id: uuid.UUID) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/states/"


@pytest.mark.contract
class TestProjectSubStateAPI(TestProjectSubStateBase):
    @pytest.mark.django_db
    def test_admin_can_create_and_list_sub_states(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)

        create_response = session_client.post(
            self.sub_state_url(workspace.slug, project.id, state.id),
            {"name": "Not Started", "color": "#60646C", "icon": "0", "sequence": 10000},
            format="json",
        )
        list_response = session_client.get(self.sub_state_url(workspace.slug, project.id, state.id))

        assert create_response.status_code == status.HTTP_200_OK
        assert create_response.json()["name"] == "Not Started"
        assert create_response.json()["state_id"] == str(state.id)
        assert create_response.json()["project_id"] == str(project.id)
        assert list_response.status_code == status.HTTP_200_OK
        assert [item["name"] for item in list_response.json()] == ["Not Started"]

    @pytest.mark.django_db
    def test_member_can_list_but_cannot_create_sub_states(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        member = self.create_member(workspace, project, "sub-state-member@example.com", role=15)
        session_client.force_authenticate(user=member)

        list_response = session_client.get(self.sub_state_url(workspace.slug, project.id, state.id))
        create_response = session_client.post(
            self.sub_state_url(workspace.slug, project.id, state.id),
            {"name": "In Progress", "color": "#F59E0B", "icon": "", "sequence": 20000},
            format="json",
        )

        assert list_response.status_code == status.HTTP_200_OK
        assert create_response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_duplicate_name_is_rejected_under_same_state(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        payload = {"name": "In Progress", "color": "#F59E0B", "icon": "", "sequence": 20000}

        first_response = session_client.post(self.sub_state_url(workspace.slug, project.id, state.id), payload, format="json")
        second_response = session_client.post(self.sub_state_url(workspace.slug, project.id, state.id), payload, format="json")

        assert first_response.status_code == status.HTTP_200_OK
        assert second_response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_same_name_is_allowed_under_different_states(self, session_client, workspace, create_user):
        project, started, review = self.create_project(workspace, create_user)
        payload = {"name": "In Progress", "color": "#F59E0B", "icon": "", "sequence": 20000}

        started_response = session_client.post(self.sub_state_url(workspace.slug, project.id, started.id), payload, format="json")
        review_response = session_client.post(self.sub_state_url(workspace.slug, project.id, review.id), payload, format="json")

        assert started_response.status_code == status.HTTP_200_OK
        assert review_response.status_code == status.HTTP_200_OK
        assert started_response.json()["state_id"] != review_response.json()["state_id"]

    @pytest.mark.django_db
    def test_admin_can_update_sub_state_fields(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        created = session_client.post(
            self.sub_state_url(workspace.slug, project.id, state.id),
            {"name": "Started", "color": "#F59E0B", "icon": "", "sequence": 20000},
            format="json",
        ).json()

        response = session_client.patch(
            self.sub_state_url(workspace.slug, project.id, state.id, created["id"]),
            {"name": "Started Work", "color": "#46A758", "icon": "go", "sequence": 30000},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "Started Work"
        assert response.json()["color"] == "#46A758"
        assert response.json()["icon"] == "go"
        assert response.json()["sequence"] == 30000

    @pytest.mark.django_db
    def test_admin_can_delete_unused_sub_state(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        created = session_client.post(
            self.sub_state_url(workspace.slug, project.id, state.id),
            {"name": "Unused", "color": "#60646C", "icon": "", "sequence": 10000},
            format="json",
        ).json()

        response = session_client.delete(self.sub_state_url(workspace.slug, project.id, state.id, created["id"]))

        assert response.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_delete_used_sub_state_is_rejected(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        created = session_client.post(
            self.sub_state_url(workspace.slug, project.id, state.id),
            {"name": "Used", "color": "#60646C", "icon": "", "sequence": 10000},
            format="json",
        ).json()
        Issue.objects.create(project=project, workspace=workspace, name="Uses sub-state", state=state, sub_state_id=created["id"])

        response = session_client.delete(self.sub_state_url(workspace.slug, project.id, state.id, created["id"]))

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["error"] == "The sub-state is not empty, only empty sub-states can be deleted"

    @pytest.mark.django_db
    def test_project_state_list_includes_nested_sub_states(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        created = session_client.post(
            self.sub_state_url(workspace.slug, project.id, state.id),
            {"name": "Ready", "color": "#46A758", "icon": "", "sequence": 30000},
            format="json",
        ).json()

        response = session_client.get(self.state_list_url(workspace.slug, project.id))
        state_payload = next(item for item in response.json() if item["id"] == str(state.id))

        assert response.status_code == status.HTTP_200_OK
        assert state_payload["sub_states"][0]["id"] == created["id"]
        assert state_payload["sub_states"][0]["state_id"] == str(state.id)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_sub_state_app.py -q
```

Expected: tests fail because `SubState`, `Issue.sub_state`, and nested sub-state routes do not exist.

- [ ] **Step 3: Commit the failing tests**

```bash
git add apps/api/plane/tests/contract/app/test_project_sub_state_app.py
git commit -m "test: add project sub-state api contract"
```

## Task 2: Backend Sub-State Model And State API

**Files:**

- Modify: `apps/api/plane/db/models/state.py`
- Modify: `apps/api/plane/db/models/__init__.py`
- Create: `apps/api/plane/db/migrations/0122_sub_state_issue_sub_state.py`
- Modify: `apps/api/plane/app/serializers/state.py`
- Modify: `apps/api/plane/app/views/state/base.py`
- Modify: `apps/api/plane/app/urls/state.py`
- Modify: `apps/api/plane/app/views/workspace/state.py`

- [ ] **Step 1: Add the model**

In `apps/api/plane/db/models/state.py`, add this model below `State`:

```python
class SubState(ProjectBaseModel):
    state = models.ForeignKey(
        State,
        on_delete=models.CASCADE,
        related_name="state_sub_states",
    )
    name = models.CharField(max_length=255, verbose_name="Sub-State Name")
    color = models.CharField(max_length=255, verbose_name="Sub-State Color")
    icon = models.CharField(max_length=255, blank=True, null=True)
    sequence = models.FloatField(default=65535)

    def __str__(self):
        return f"{self.name} <{self.state.name}>"

    class Meta:
        unique_together = ["name", "state", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "state"],
                condition=Q(deleted_at__isnull=True),
                name="sub_state_unique_name_state_when_deleted_at_null",
            )
        ]
        verbose_name = "Sub-State"
        verbose_name_plural = "Sub-States"
        db_table = "sub_states"
        ordering = ("sequence",)

    def save(self, *args, **kwargs):
        if self.state_id and self.project_id and self.state.project_id != self.project_id:
            raise ValueError("Sub-state parent state must belong to the same project")
        if self._state.adding:
            last_sequence = SubState.objects.filter(state=self.state).aggregate(largest=models.Max("sequence"))["largest"]
            if last_sequence is not None:
                self.sequence = last_sequence + 10000
        return super().save(*args, **kwargs)
```

In `apps/api/plane/db/models/__init__.py`, change the state import to:

```python
from .state import State, StateGroup, SubState, DEFAULT_STATES
```

- [ ] **Step 2: Create the migration**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests python manage.py makemigrations db --name sub_state_issue_sub_state
```

Expected: Django creates a migration that creates `SubState`. If the generated migration only creates `SubState`, keep it and add the `Issue.sub_state` field in Task 4 with a second migration.

- [ ] **Step 3: Add serializers**

In `apps/api/plane/app/serializers/state.py`, import `SubState`, add these serializers, and add `sub_states` to `StateSerializer.fields`:

```python
from plane.db.models import State, StateGroup, SubState


class SubStateLiteSerializer(BaseSerializer):
    class Meta:
        model = SubState
        fields = ["id", "state_id", "project_id", "workspace_id", "name", "color", "icon", "sequence"]
        read_only_fields = fields


class SubStateSerializer(BaseSerializer):
    class Meta:
        model = SubState
        fields = ["id", "state_id", "project_id", "workspace_id", "name", "color", "icon", "sequence"]
        read_only_fields = ["workspace", "project", "state"]
```

Add this field inside `StateSerializer`:

```python
sub_states = SubStateLiteSerializer(source="state_sub_states", many=True, read_only=True)
```

Add `"sub_states"` to `StateSerializer.Meta.fields`.

In `apps/api/plane/app/serializers/__init__.py`, export `SubStateSerializer` and `SubStateLiteSerializer`.

- [ ] **Step 4: Add the viewset**

In `apps/api/plane/app/views/state/base.py`, import `SubState` and `SubStateSerializer`. Add `SubStateViewSet` below `StateViewSet`:

```python
class SubStateViewSet(BaseViewSet):
    serializer_class = SubStateSerializer
    model = SubState

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(state_id=self.kwargs.get("state_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("state", "project", "workspace")
            .distinct()
        )

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, state_id):
        state = State.objects.get(pk=state_id, project_id=project_id, workspace__slug=slug)
        serializer = SubStateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(project_id=project_id, state=state)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, state_id):
        serializer = SubStateSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, state_id, pk):
        sub_state = self.get_queryset().get(pk=pk)
        return Response(SubStateSerializer(sub_state).data, status=status.HTTP_200_OK)

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, state_id, pk):
        sub_state = SubState.objects.get(pk=pk, state_id=state_id, project_id=project_id, workspace__slug=slug)
        serializer = SubStateSerializer(sub_state, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @invalidate_cache(path="workspaces/:slug/states/", url_params=True, user=False)
    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, state_id, pk):
        sub_state = SubState.objects.get(pk=pk, state_id=state_id, project_id=project_id, workspace__slug=slug)
        issue_exists = Issue.objects.filter(sub_state=pk).exists()
        if issue_exists:
            return Response(
                {"error": "The sub-state is not empty, only empty sub-states can be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sub_state.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 5: Add routes and nested state prefetching**

In `apps/api/plane/app/urls/state.py`, import `SubStateViewSet` and add routes before `intake-state`:

```python
path(
    "workspaces/<str:slug>/projects/<uuid:project_id>/states/<uuid:state_id>/sub-states/",
    SubStateViewSet.as_view({"get": "list", "post": "create"}),
    name="project-sub-states",
),
path(
    "workspaces/<str:slug>/projects/<uuid:project_id>/states/<uuid:state_id>/sub-states/<uuid:pk>/",
    SubStateViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
    name="project-sub-state",
),
```

In `StateViewSet.get_queryset()`, add:

```python
.prefetch_related("state_sub_states")
```

In `apps/api/plane/app/views/workspace/state.py`, add the same prefetch to the state queryset used by `WorkspaceStatesEndpoint`.

- [ ] **Step 6: Run sub-state API tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_sub_state_app.py -q
```

Expected: the tests that require `Issue.sub_state` still fail until Task 4; route, list, create, update, and nested serialization tests pass.

- [ ] **Step 7: Commit the passing state API work**

```bash
git add apps/api/plane/db/models/state.py apps/api/plane/db/models/__init__.py apps/api/plane/db/migrations apps/api/plane/app/serializers/state.py apps/api/plane/app/serializers/__init__.py apps/api/plane/app/views/state/base.py apps/api/plane/app/urls/state.py apps/api/plane/app/views/workspace/state.py
git commit -m "feat: add project sub-state api"
```

## Task 3: Backend Issue Sub-State Contract Tests

**Files:**

- Create: `apps/api/plane/tests/contract/app/test_issue_sub_state_app.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/plane/tests/contract/app/test_issue_sub_state_app.py`:

```python
import uuid

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State, StateGroup, SubState


class TestIssueSubStateBase:
    def create_project_state_data(self, workspace, owner):
        project = Project.objects.create(name="Issue Sub State Project", identifier="ISS", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=project, member=owner, role=20, is_active=True)
        todo = State.objects.create(
            workspace=workspace,
            project=project,
            name="Todo",
            color="#60646C",
            group=StateGroup.UNSTARTED.value,
            sequence=25000,
            default=True,
        )
        started = State.objects.create(
            workspace=workspace,
            project=project,
            name="Started",
            color="#F59E0B",
            group=StateGroup.STARTED.value,
            sequence=35000,
        )
        todo_ready = SubState.objects.create(project=project, workspace=workspace, state=todo, name="Ready", color="#60646C", sequence=10000)
        started_working = SubState.objects.create(project=project, workspace=workspace, state=started, name="Working", color="#F59E0B", sequence=10000)
        return project, todo, started, todo_ready, started_working

    def issues_url(self, workspace_slug: str, project_id: uuid.UUID, issue_id: uuid.UUID | None = None) -> str:
        base_url = f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/"
        return f"{base_url}{issue_id}/" if issue_id else base_url


@pytest.mark.contract
class TestIssueSubStateAPI(TestIssueSubStateBase):
    @pytest.mark.django_db
    def test_create_issue_without_sub_state(self, session_client, workspace, create_user):
        project, todo, _, _, _ = self.create_project_state_data(workspace, create_user)

        response = session_client.post(
            self.issues_url(workspace.slug, project.id),
            {"name": "No sub-state", "state_id": str(todo.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["sub_state_id"] is None

    @pytest.mark.django_db
    def test_create_issue_with_valid_sub_state(self, session_client, workspace, create_user):
        project, todo, _, todo_ready, _ = self.create_project_state_data(workspace, create_user)

        response = session_client.post(
            self.issues_url(workspace.slug, project.id),
            {"name": "With sub-state", "state_id": str(todo.id), "sub_state_id": str(todo_ready.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["sub_state_id"] == str(todo_ready.id)
        assert Issue.objects.get(id=response.json()["id"]).sub_state_id == todo_ready.id

    @pytest.mark.django_db
    def test_create_issue_rejects_sub_state_from_another_state(self, session_client, workspace, create_user):
        project, todo, _, _, started_working = self.create_project_state_data(workspace, create_user)

        response = session_client.post(
            self.issues_url(workspace.slug, project.id),
            {"name": "Invalid sub-state", "state_id": str(todo.id), "sub_state_id": str(started_working.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_update_issue_rejects_stale_sub_state_when_state_changes_without_clearing(self, session_client, workspace, create_user):
        project, todo, started, todo_ready, _ = self.create_project_state_data(workspace, create_user)
        issue = Issue.objects.create(project=project, workspace=workspace, name="Move me", state=todo, sub_state=todo_ready)

        response = session_client.patch(
            self.issues_url(workspace.slug, project.id, issue.id),
            {"state_id": str(started.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        issue.refresh_from_db()
        assert issue.state_id == todo.id
        assert issue.sub_state_id == todo_ready.id

    @pytest.mark.django_db
    def test_update_issue_can_change_state_and_clear_sub_state(self, session_client, workspace, create_user):
        project, todo, started, todo_ready, _ = self.create_project_state_data(workspace, create_user)
        issue = Issue.objects.create(project=project, workspace=workspace, name="Clear me", state=todo, sub_state=todo_ready)

        response = session_client.patch(
            self.issues_url(workspace.slug, project.id, issue.id),
            {"state_id": str(started.id), "sub_state_id": None},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.state_id == started.id
        assert issue.sub_state_id is None

    @pytest.mark.django_db
    def test_filter_issues_by_sub_state_id(self, session_client, workspace, create_user):
        project, todo, _, todo_ready, _ = self.create_project_state_data(workspace, create_user)
        included = Issue.objects.create(project=project, workspace=workspace, name="Included", state=todo, sub_state=todo_ready)
        Issue.objects.create(project=project, workspace=workspace, name="Excluded", state=todo, sub_state=None)

        response = session_client.get(
            self.issues_url(workspace.slug, project.id),
            {"sub_state_id": str(todo_ready.id)},
        )

        assert response.status_code == status.HTTP_200_OK
        result_ids = {issue["id"] for issue in response.json()["results"]}
        assert str(included.id) in result_ids
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_issue_sub_state_app.py -q
```

Expected: tests fail because issue serializers, issue model, response projections, and filters do not support `sub_state_id`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add apps/api/plane/tests/contract/app/test_issue_sub_state_app.py
git commit -m "test: add issue sub-state contract"
```

## Task 4: Backend Issue Model, Serializers, Filtering, And Projections

**Files:**

- Modify: `apps/api/plane/db/models/issue.py`
- Create or modify: `apps/api/plane/db/migrations/0122_sub_state_issue_sub_state.py` or the next generated migration
- Modify: `apps/api/plane/app/serializers/issue.py`
- Modify: `apps/api/plane/api/serializers/issue.py`
- Modify: `apps/api/plane/app/views/issue/base.py`
- Modify: `apps/api/plane/utils/grouper.py`
- Modify: `apps/api/plane/space/utils/grouper.py`
- Modify: `apps/api/plane/utils/filters/filterset.py`
- Modify: `apps/api/plane/utils/filters/converters.py`
- Modify: `apps/api/plane/utils/issue_filters.py`
- Modify: `apps/api/plane/db/models/project.py`
- Modify: `apps/api/plane/db/models/view.py`, `apps/api/plane/db/models/cycle.py`, and `apps/api/plane/db/models/module.py`

- [ ] **Step 1: Add the issue field**

In `apps/api/plane/db/models/issue.py`, import `SubState` through the string model reference and add the field immediately after `state`:

```python
sub_state = models.ForeignKey(
    "db.SubState",
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="sub_state_issue",
)
```

Change:

```python
TRACKED_FIELDS = ["state_id"]
```

to:

```python
TRACKED_FIELDS = ["state_id", "sub_state_id"]
```

- [ ] **Step 2: Generate or update the migration**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests python manage.py makemigrations db --name sub_state_issue_sub_state
```

Expected: the migration adds `Issue.sub_state`. If Task 2 already created `0122_sub_state_issue_sub_state.py`, Django may create `0123_issue_sub_state.py`; keep the generated dependency order.

- [ ] **Step 3: Add serializer field and validation**

In `apps/api/plane/app/serializers/issue.py`, import `SubState` and add this field beside `state_id` in `IssueCreateSerializer`:

```python
sub_state_id = serializers.PrimaryKeyRelatedField(
    source="sub_state",
    queryset=SubState.objects.all(),
    required=False,
    allow_null=True,
)
```

Inside `IssueCreateSerializer.validate`, after the existing state validation, add:

```python
state = attrs.get("state", getattr(self.instance, "state", None))
sub_state = attrs.get("sub_state", getattr(self.instance, "sub_state", None))
state_was_sent = "state" in attrs
sub_state_was_sent = "sub_state" in attrs

if sub_state and not state:
    raise serializers.ValidationError({"sub_state_id": "A state_id is required when sub_state_id is provided"})

if sub_state and (
    sub_state.project_id != self.context.get("project_id")
    or not state
    or sub_state.state_id != state.id
):
    raise serializers.ValidationError({"sub_state_id": "Sub-state is not valid for the selected state"})

if (
    self.instance
    and state_was_sent
    and not sub_state_was_sent
    and self.instance.sub_state_id
    and state
    and self.instance.sub_state.state_id != state.id
):
    raise serializers.ValidationError({"sub_state_id": "Clear sub_state_id when changing to a state that does not own it"})
```

Apply the same field and validation shape in `apps/api/plane/api/serializers/issue.py` inside the public API issue create/update serializer that already declares `state_id`.

- [ ] **Step 4: Add filters**

In `apps/api/plane/utils/filters/filterset.py`, add beside `state_id`:

```python
sub_state_id = filters.UUIDFilter(field_name="sub_state_id")
sub_state_id__in = UUIDInFilter(field_name="sub_state_id", lookup_expr="in")
```

In `apps/api/plane/utils/issue_filters.py`, add:

```python
def filter_sub_state(params, issue_filter, method, prefix=""):
    if method == "GET":
        sub_states = [item for item in params.get("sub_state").split(",") if item != "null"]
        sub_states = filter_valid_uuids(sub_states)
        if len(sub_states) and "" not in sub_states:
            issue_filter[f"{prefix}sub_state__in"] = sub_states
    else:
        if params.get("sub_state", None) and len(params.get("sub_state")) and params.get("sub_state") != "null":
            issue_filter[f"{prefix}sub_state__in"] = params.get("sub_state")
    return issue_filter
```

Add this entry to the `issue_filters` map:

```python
"sub_state": filter_sub_state,
```

In `apps/api/plane/utils/filters/converters.py`, map `sub_state` to `sub_state_id` and include `sub_state_id` in UUID field handling.

- [ ] **Step 5: Add response projections**

Run this search:

```bash
rg -n "state_id|state__group|state_detail" apps/api/plane/app/views/issue apps/api/plane/space plane/utils apps/api/plane/utils -g '*.py'
```

For every issue row projection that already emits `state_id`, add `"sub_state_id"` to the same `.values(...)` or result field list. In `apps/api/plane/utils/grouper.py` and `apps/api/plane/space/utils/grouper.py`, add `"sub_state_id"` to the required issue fields used to serialize grouped issue results.

- [ ] **Step 6: Add default filter/display metadata**

In default issue filter helpers in `apps/api/plane/db/models/issue.py`, `project.py`, `view.py`, `cycle.py`, and `module.py`, add:

```python
"sub_state": None
```

to legacy filter defaults where `"state"` already appears, and add:

```python
"sub_state": False
```

to display properties where `"state"` already appears. Do not add sub-state to any `group_by`, `sub_group_by`, or ordering defaults.

- [ ] **Step 7: Run backend tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_sub_state_app.py apps/api/plane/tests/contract/app/test_issue_sub_state_app.py -q
```

Expected: all sub-state backend contract tests pass.

- [ ] **Step 8: Commit backend issue work**

```bash
git add apps/api/plane/db/models apps/api/plane/db/migrations apps/api/plane/app/serializers apps/api/plane/api/serializers apps/api/plane/app/views/issue apps/api/plane/utils apps/api/plane/space/utils apps/api/plane/tests/contract/app/test_issue_sub_state_app.py
git commit -m "feat: add issue sub-state support"
```

## Task 5: Frontend Types, Constants, Services, And Store

**Files:**

- Modify: `packages/types/src/state.ts`
- Modify: `packages/types/src/issues/issue.ts`
- Modify: `packages/types/src/view-props.ts`
- Modify: `packages/constants/src/issue/common.ts`
- Modify: `packages/constants/src/issue/filter.ts`
- Modify: `packages/constants/src/issue/modal.ts`
- Modify: `packages/constants/src/tab-indices.ts`
- Modify: `packages/utils/src/work-item/base.ts`
- Modify: `packages/utils/src/work-item/modal.ts`
- Modify: `apps/web/core/constants/fetch-keys.ts`
- Modify: `apps/web/core/services/project/project-state.service.ts`
- Modify: `apps/web/core/store/state.store.ts`
- Modify: `apps/web/core/hooks/store/use-project-state.ts`

- [ ] **Step 1: Add shared types**

In `packages/types/src/state.ts`, add:

```typescript
export interface ISubState {
  readonly id: string;
  state_id: string;
  project_id: string;
  workspace_id: string;
  name: string;
  color: string;
  icon: string | null;
  sequence: number;
}
```

Add this field to `IState`:

```typescript
sub_states?: ISubState[];
```

Extend `TStateOperationsCallbacks` with:

```typescript
createSubState: (stateId: string, data: Partial<ISubState>) => Promise<ISubState>;
updateSubState: (stateId: string, subStateId: string, data: Partial<ISubState>) => Promise<ISubState | undefined>;
deleteSubState: (stateId: string, subStateId: string) => Promise<void>;
```

In `packages/types/src/issues/issue.ts`, add `sub_state_id: string | null;` beside `state_id`.

- [ ] **Step 2: Add filter/display type keys without grouping**

In `packages/types/src/view-props.ts`:

Add `"sub_state"` to `TIssueParams`.

Add `"sub_state_id"` to `WORK_ITEM_FILTER_PROPERTY_KEYS`.

Add to `IIssueFilterOptions`:

```typescript
sub_state?: string[] | null;
```

Add to `IIssueDisplayProperties`:

```typescript
sub_state?: boolean;
```

Do not add sub-state to `TIssueGroupByOptions`, `TIssueOrderByOptions`, or `TIssueKanbanFilters`.

- [ ] **Step 3: Add constants and cache keys**

In `packages/constants/src/issue/common.ts`, add `"sub_state"` immediately after `"state"` in `ISSUE_DISPLAY_PROPERTIES_KEYS`, `SUB_ISSUES_DISPLAY_PROPERTIES_KEYS`, and `SPREADSHEET_PROPERTY_LIST`. Add this display property entry:

```typescript
{ key: "sub_state", titleTranslationKey: "common.sub_state" },
```

In `packages/constants/src/issue/filter.ts`, add `"sub_state_id"` immediately after `"state_id"` on pages that already include `"state_id"` in their filters. Do not add it to group-by arrays.

In `packages/constants/src/issue/modal.ts`, add:

```typescript
sub_state_id: null,
```

In `packages/constants/src/tab-indices.ts`, add `"sub_state_id"` immediately after `"state_id"` in work item form tab order arrays.

In `apps/web/core/constants/fetch-keys.ts`, update `paramsToKey` by destructuring `sub_state`, sorting it, and adding it to the returned key:

```typescript
const { state, sub_state, state_group } = params;
let subStateKey = sub_state ? sub_state.split(",") : [];
subStateKey = subStateKey.sort().join("_");
return `${layoutKey}_${projectKey}_${stateGroupKey}_${stateKey}_${subStateKey}_${priorityKey}_${assigneesKey}_${mentionsKey}_${createdByKey}_${type}_${groupBy}_${orderBy}_${labelsKey}_${startDateKey}_${targetDateKey}_${sub_issue}_${subscriberKey}`;
```

- [ ] **Step 4: Add service methods**

In `apps/web/core/services/project/project-state.service.ts`, import `ISubState` and add:

```typescript
async createSubState(
  workspaceSlug: string,
  projectId: string,
  stateId: string,
  data: Partial<ISubState>
): Promise<ISubState> {
  return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/states/${stateId}/sub-states/`, data)
    .then((response) => response?.data)
    .catch((error) => {
      throw error?.response;
    });
}

async patchSubState(
  workspaceSlug: string,
  projectId: string,
  stateId: string,
  subStateId: string,
  data: Partial<ISubState>
): Promise<ISubState> {
  return this.patch(
    `/api/workspaces/${workspaceSlug}/projects/${projectId}/states/${stateId}/sub-states/${subStateId}/`,
    data
  )
    .then((response) => response?.data)
    .catch((error) => {
      throw error?.response?.data;
    });
}

async deleteSubState(workspaceSlug: string, projectId: string, stateId: string, subStateId: string): Promise<void> {
  return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/states/${stateId}/sub-states/${subStateId}/`)
    .then((response) => response?.data)
    .catch((error) => {
      throw error?.response;
    });
}
```

- [ ] **Step 5: Normalize sub-states in the state store**

In `apps/web/core/store/state.store.ts`, add `subStateMap: Record<string, ISubState> = {};`, make it observable, and add these methods to the interface and class:

```typescript
getSubStateById: (subStateId: string | null | undefined) => ISubState | undefined;
getSubStatesByStateId: (stateId: string | null | undefined) => ISubState[];
createSubState: (workspaceSlug: string, projectId: string, stateId: string, data: Partial<ISubState>) => Promise<ISubState>;
updateSubState: (
  workspaceSlug: string,
  projectId: string,
  stateId: string,
  subStateId: string,
  data: Partial<ISubState>
) => Promise<ISubState | undefined>;
deleteSubState: (workspaceSlug: string, projectId: string, stateId: string, subStateId: string) => Promise<void>;
```

Use this helper inside the store:

```typescript
private syncSubStatesFromState = (state: IState) => {
  state.sub_states?.forEach((subState) => {
    set(this.subStateMap, [subState.id], subState);
  });
};
```

Call `this.syncSubStatesFromState(state)` in `fetchProjectStates`, `fetchWorkspaceStates`, `createState`, and after any state update response that contains `sub_states`.

Add computed getters:

```typescript
getSubStateById = computedFn((subStateId: string | null | undefined) => {
  if (!subStateId) return;
  return this.subStateMap[subStateId] ?? undefined;
});

getSubStatesByStateId = computedFn((stateId: string | null | undefined) => {
  if (!stateId) return [];
  return Object.values(this.subStateMap)
    .filter((subState) => subState.state_id === stateId)
    .sort((a, b) => a.sequence - b.sequence);
});
```

Add CRUD actions that call the service and update both `subStateMap` and the parent state's `sub_states` array.

- [ ] **Step 6: Run frontend type check for the touched packages**

Run:

```bash
pnpm check:types
```

Expected: no type errors from the data layer changes. If a type error references a UI surface scheduled in Tasks 6-8, add the minimal prop/type bridge in this task before committing.

- [ ] **Step 7: Commit data layer work**

```bash
git add packages/types packages/constants packages/utils apps/web/core/constants/fetch-keys.ts apps/web/core/services/project/project-state.service.ts apps/web/core/store/state.store.ts apps/web/core/hooks/store/use-project-state.ts
git commit -m "feat: add sub-state frontend data layer"
```

## Task 6: Project Settings Sub-State Management UI

**Files:**

- Create: `apps/web/core/components/project-states/sub-state-form.tsx`
- Create: `apps/web/core/components/project-states/sub-state-item.tsx`
- Create: `apps/web/core/components/project-states/sub-state-list.tsx`
- Modify: `apps/web/core/components/project-states/state-item.tsx`
- Modify: `apps/web/core/components/project-states/state-list.tsx`
- Modify: `apps/web/core/components/project-states/root.tsx`
- Modify: `apps/web/core/components/project-states/index.ts`

- [ ] **Step 1: Create the sub-state form**

Create `sub-state-form.tsx` modeled after `StateForm`, but with only name, color, icon, and sequence:

```tsx
import { useEffect, useState } from "react";
import { TwitterPicker } from "react-color";
import { Button } from "@plane/propel/button";
import type { ISubState } from "@plane/types";
import { Input, Popover } from "@plane/ui";

type TSubStateFormProps = {
  data: Partial<ISubState>;
  onSubmit: (formData: Partial<ISubState>) => Promise<void>;
  onCancel: () => void;
  buttonDisabled: boolean;
  buttonTitle: string;
};

function ColorButton({ color }: { color?: string }) {
  return <div className="h-5 w-5 rounded-sm" style={{ backgroundColor: color ?? "#60646C" }} />;
}

export function SubStateForm(props: TSubStateFormProps) {
  const { data, onSubmit, onCancel, buttonDisabled, buttonTitle } = props;
  const [formData, setFormData] = useState<Partial<ISubState>>();
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    if (!formData) setFormData(data);
  }, [data, formData]);

  const updateFormData = <T extends keyof ISubState>(key: T, value: ISubState[T]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (key === "name") setNameError("");
  };

  const submitForm = async () => {
    if (!formData?.name?.trim()) {
      setNameError("Name is required");
      return;
    }
    await onSubmit({
      ...formData,
      name: formData.name.trim(),
      color: formData.color ?? "#60646C",
      icon: formData.icon ?? "",
      sequence: Number(formData.sequence ?? 65535),
    });
  };

  return (
    <div className="flex items-start gap-2 rounded-sm bg-surface-2 p-2">
      <Popover button={<ColorButton color={formData?.color} />} panelClassName="mt-2">
        <TwitterPicker color={formData?.color} onChange={(value) => updateFormData("color", value.hex)} />
      </Popover>
      <Input
        id="sub-state-icon"
        name="icon"
        placeholder="Icon"
        value={formData?.icon ?? ""}
        onChange={(event) => updateFormData("icon", event.target.value)}
        className="w-20"
        maxLength={16}
      />
      <Input
        id="sub-state-name"
        name="name"
        placeholder="Name"
        value={formData?.name ?? ""}
        onChange={(event) => updateFormData("name", event.target.value)}
        hasError={Boolean(nameError)}
        className="min-w-40 flex-1"
        maxLength={100}
        autoFocus
      />
      <Input
        id="sub-state-sequence"
        name="sequence"
        type="number"
        placeholder="Sequence"
        value={String(formData?.sequence ?? "")}
        onChange={(event) => updateFormData("sequence", Number(event.target.value) as ISubState["sequence"])}
        className="w-28"
      />
      <Button onClick={submitForm} variant="primary" size="sm" disabled={buttonDisabled}>
        {buttonTitle}
      </Button>
      <Button type="button" variant="secondary" size="sm" disabled={buttonDisabled} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create list and item components**

Create `sub-state-item.tsx` to show color-backed name, optional icon, sequence, edit, and delete. Create `sub-state-list.tsx` to render sorted sub-states and an inline add form under the parent state.

The list component props should be:

```typescript
type TSubStateListProps = {
  state: IState;
  disabled: boolean;
  createSubState: (stateId: string, data: Partial<ISubState>) => Promise<ISubState>;
  updateSubState: (stateId: string, subStateId: string, data: Partial<ISubState>) => Promise<ISubState | undefined>;
  deleteSubState: (stateId: string, subStateId: string) => Promise<void>;
};
```

The list must sort with:

```typescript
const subStates = [...(state.sub_states ?? [])].sort((a, b) => a.sequence - b.sequence);
```

- [ ] **Step 3: Render the nested list below each state**

In `state-item.tsx`, render:

```tsx
<SubStateList
  state={state}
  disabled={disabled}
  createSubState={stateOperationsCallbacks.createSubState}
  updateSubState={stateOperationsCallbacks.updateSubState}
  deleteSubState={stateOperationsCallbacks.deleteSubState}
/>
```

inside the existing state card below `StateItemTitle`.

In `root.tsx`, add sub-state callbacks by binding store methods with current `workspaceSlug` and `projectId`.

- [ ] **Step 4: Verify UI type/lint checks**

Run:

```bash
pnpm check:types
pnpm check:lint
```

Expected: no type or lint errors from project state components.

- [ ] **Step 5: Commit settings UI**

```bash
git add apps/web/core/components/project-states
git commit -m "feat: manage sub-states in project settings"
```

## Task 7: Sub-State Dropdown And Work Item Properties

**Files:**

- Create: `apps/web/core/components/dropdowns/sub-state/base.tsx`
- Create: `apps/web/core/components/dropdowns/sub-state/dropdown.tsx`
- Create: `apps/web/core/components/dropdowns/sub-state/index.ts`
- Modify: `apps/web/core/components/issues/issue-modal/form.tsx`
- Modify: `apps/web/core/components/issues/issue-modal/components/default-properties.tsx`
- Modify: `apps/web/core/components/issues/issue-detail/sidebar.tsx`
- Modify: `apps/web/core/components/issues/peek-overview/properties.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/properties/all-properties.tsx`

- [ ] **Step 1: Create reusable dropdown**

Create a `SubStateDropdown` that mirrors the state dropdown structure and accepts:

```typescript
type TSubStateDropdownProps = TDropdownProps & {
  value: string | null | undefined;
  stateId: string | null | undefined;
  projectId: string | undefined;
  onChange: (subStateId: string | null) => void;
  button?: ReactNode;
  disabled?: boolean;
  showTooltip?: boolean;
};
```

The dropdown must get options from:

```typescript
const { getSubStateById, getSubStatesByStateId } = useProjectState();
const subStates = getSubStatesByStateId(stateId);
```

It must disable itself when `!stateId || subStates.length === 0 || disabled`, and include a clear option that calls `onChange(null)`.

- [ ] **Step 2: Add parallel field in issue create form**

In `issue-modal/form.tsx`, pass `stateId={watch("state_id")}`, `subStateId={watch("sub_state_id")}`, and `setValue={setValue}` to `IssueDefaultProperties`.

In `default-properties.tsx`, add props:

```typescript
stateId: string | null | undefined;
subStateId: string | null | undefined;
setValue: UseFormSetValue<TIssue>;
```

Modify the `StateDropdown` `onChange` to clear an incompatible sub-state:

```typescript
onChange={(stateId) => {
  onChange(stateId);
  const currentSubState = subStateId ? getSubStateById(subStateId) : undefined;
  if (currentSubState && currentSubState.state_id !== stateId) setValue("sub_state_id", null, { shouldDirty: true });
  handleFormChange();
}}
```

Add a sibling `Controller` for `sub_state_id` immediately after the `state_id` controller. It must be at the same JSX hierarchy as `StateDropdown`, not nested inside it:

```tsx
<Controller
  control={control}
  name="sub_state_id"
  render={({ field: { value, onChange } }) => (
    <div className="h-7">
      <SubStateDropdown
        value={value}
        stateId={stateId}
        projectId={projectId ?? undefined}
        onChange={(subStateId) => {
          onChange(subStateId);
          handleFormChange();
        }}
        buttonVariant="border-with-text"
        tabIndex={getIndex("sub_state_id")}
      />
    </div>
  )}
/>
```

- [ ] **Step 3: Add properties controls**

In detail sidebar, peek overview, and layout properties, render `SubStateDropdown` beside existing state properties. State change handlers must send `sub_state_id: null` when the current selected sub-state does not belong to the new state:

```typescript
const buildStatePayload = (stateId: string): Partial<TIssue> => {
  const currentSubState = issue.sub_state_id ? getSubStateById(issue.sub_state_id) : undefined;
  return currentSubState && currentSubState.state_id !== stateId
    ? { state_id: stateId, sub_state_id: null }
    : { state_id: stateId };
};
```

Use `updateIssue(issue.project_id, issue.id, buildStatePayload(stateId))` in every state update handler touched in this task.

- [ ] **Step 4: Run type/lint checks**

Run:

```bash
pnpm check:types
pnpm check:lint
```

Expected: no errors from dropdown or issue property components.

- [ ] **Step 5: Commit dropdown and properties work**

```bash
git add apps/web/core/components/dropdowns/sub-state apps/web/core/components/issues/issue-modal apps/web/core/components/issues/issue-detail apps/web/core/components/issues/peek-overview apps/web/core/components/issues/issue-layouts/properties
git commit -m "feat: add sub-state issue property controls"
```

## Task 8: Display Properties, Spreadsheet Column, And Filters

**Files:**

- Create: `apps/web/core/components/issues/issue-layouts/spreadsheet/columns/sub-state-column.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/spreadsheet/columns/index.ts`
- Modify: `apps/web/ce/components/issues/issue-layouts/utils.tsx`
- Modify: `packages/utils/src/work-item-filters/configs/filters/state.ts`
- Modify: `apps/web/ce/hooks/work-item-filters/use-work-item-filters-config.tsx`

- [ ] **Step 1: Add spreadsheet column**

Create `sub-state-column.tsx`:

```tsx
import { observer } from "mobx-react";
import type { TSpreadsheetColumn } from "@plane/types";
import { SubStateDropdown } from "@/components/dropdowns/sub-state";

export const SubStateColumn: TSpreadsheetColumn = observer(function SubStateColumn(props) {
  const { issue, onChange, disabled } = props;

  return (
    <SubStateDropdown
      value={issue.sub_state_id}
      stateId={issue.state_id}
      projectId={issue.project_id ?? undefined}
      onChange={(subStateId) =>
        onChange(issue, { sub_state_id: subStateId }, { changed_property: "sub_state", change_details: subStateId })
      }
      disabled={disabled}
      buttonVariant="transparent-with-text"
    />
  );
});
```

Export the column from `apps/web/core/components/issues/issue-layouts/spreadsheet/columns/index.ts`.

In `apps/web/ce/components/issues/issue-layouts/utils.tsx`, import `SpreadsheetSubStateColumn`, add a sub-state icon entry, and register the column:

```typescript
SubStateIcon: StatePropertyIcon,
sub_state: SpreadsheetSubStateColumn,
```

- [ ] **Step 2: Add sub-state filter config**

In `packages/utils/src/work-item-filters/configs/filters/state.ts`, import `ISubState` and add:

```typescript
export type TSubStateFilterOption = ISubState & {
  parentStateName: string;
};

export type TCreateSubStateFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<TSubStateFilterOption> & {
    subStates: TSubStateFilterOption[];
  };

export const getSubStateMultiSelectConfig = (
  params: TCreateSubStateFilterParams,
  singleValueOperator: TSupportedOperators
) =>
  getMultiSelectConfig<TSubStateFilterOption, string, TSubStateFilterOption>(
    {
      items: params.subStates,
      getId: (subState) => subState.id,
      getLabel: (subState) => `${subState.name} (${subState.parentStateName})`,
      getValue: (subState) => subState.id,
      getIconData: (subState) => subState,
    },
    {
      singleValueOperator,
      ...params,
    },
    {
      ...params,
    }
  );

export const getSubStateFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateSubStateFilterParams> =>
  (params: TCreateSubStateFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "Sub-state",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getSubStateMultiSelectConfig(updatedParams, EQUALITY_OPERATOR.EXACT)
        ),
      ]),
    });
```

- [ ] **Step 3: Enable sub-state filter only after state selection**

In `apps/web/ce/hooks/work-item-filters/use-work-item-filters-config.tsx`, derive selected state ids from current rich filter expression. Use the existing adapter helpers in the file if present; otherwise add this local helper:

```typescript
const selectedStateIds = useMemo(() => {
  const values: string[] = [];
  const walkExpression = (expression: unknown) => {
    if (!expression || typeof expression !== "object") return;
    Object.entries(expression as Record<string, unknown>).forEach(([key, value]) => {
      if (key === "state_id__in" && Array.isArray(value)) values.push(...value.map(String));
      else if (key === "state_id__exact" && value) values.push(String(value));
      else if (Array.isArray(value)) value.forEach(walkExpression);
      else walkExpression(value);
    });
  };
  walkExpression(richFilters);
  return Array.from(new Set(values));
}, [richFilters]);
```

Build options only from selected states:

```typescript
const subStateOptions = useMemo(
  () =>
    selectedStateIds.flatMap((stateId) => {
      const state = getStateById(stateId);
      return getSubStatesByStateId(stateId).map((subState) => ({
        ...subState,
        parentStateName: state?.name ?? "",
      }));
    }),
  [selectedStateIds, getStateById, getSubStatesByStateId]
);
```

Create config:

```typescript
const subStateFilterConfig = useMemo(
  () =>
    getSubStateFilterConfig<TWorkItemFilterProperty>("sub_state_id")({
      isEnabled: isFilterEnabled("sub_state_id") && selectedStateIds.length > 0 && subStateOptions.length > 0,
      filterIcon: StatePropertyIcon,
      getOptionIcon: (subState) => (
        <span className="flex size-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: subState.color }} />
      ),
      subStates: subStateOptions,
      ...operatorConfigs,
    }),
  [isFilterEnabled, selectedStateIds.length, subStateOptions, operatorConfigs]
);
```

Insert `subStateFilterConfig` after `stateFilterConfig` in `configs`, and add `sub_state_id: subStateFilterConfig` to `configMap`.

- [ ] **Step 4: Verify display property and filter behavior**

Run:

```bash
pnpm check:types
pnpm check:lint
```

Expected: no type or lint errors.

- [ ] **Step 5: Commit display and filter work**

```bash
git add apps/web/core/components/issues/issue-layouts/spreadsheet packages/utils/src/work-item-filters/configs/filters/state.ts apps/web/ce/hooks/work-item-filters/use-work-item-filters-config.tsx packages/shared-state/src/store/work-item-filters/adapter.ts apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx
git commit -m "feat: display and filter issue sub-states"
```

## Task 9: I18n, Full Verification, And Browser QA

**Files:**

- Modify: `packages/i18n/src/locales/*/common.json`
- Modify: `packages/i18n/src/locales/*/issue.json`

- [ ] **Step 1: Invoke translate skill before locale edits**

Read and follow `translate` skill instructions before modifying locale JSON. Add keys for:

```json
{
  "sub_state": "Sub-state",
  "sub_states": "Sub-states"
}
```

Use the existing locale structure and exact key naming conventions in `common.json` and `issue.json`.

- [ ] **Step 2: Run backend tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_sub_state_app.py apps/api/plane/tests/contract/app/test_issue_sub_state_app.py -q
```

Expected: all tests pass.

- [ ] **Step 3: Run frontend checks**

Run:

```bash
pnpm check:types
pnpm check:lint
```

Expected: both commands exit with code 0.

- [ ] **Step 4: Run migration check**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests python manage.py migrate --check
```

Expected: migrations apply cleanly in the test stack.

- [ ] **Step 5: Browser QA as admin**

Use the in-app Browser plugin against `http://localhost:3000`.

Sign in:

- Email: `admin@example.com`
- Password: `PlaneTest@12345`
- Workspace: `codex-views`

Verify:

- Project Settings > States shows nested sub-state controls under each state.
- Add sub-states named `未开始`, `开始中`, and `已完成` under a Started-group state.
- Edit a sub-state name, color, icon, and sequence; confirm order changes by sequence.
- Create a work item with no sub-state; confirm it saves.
- Create a work item with a valid sub-state; confirm it saves and appears in Properties.
- Change the work item's state to one that does not own the sub-state; confirm `Sub-state` clears.
- Enable `Sub-state` in Display; confirm list/card/spreadsheet surfaces show the color-backed label.
- Open filters before selecting State; confirm `Sub-state` is hidden or disabled.
- Select a State filter; confirm `Sub-state` appears with options labeled by parent state.
- Filter by a sub-state; confirm results only include issues using that sub-state.
- Attempt to delete a sub-state used by an issue; confirm the UI shows the backend error and the sub-state remains.

- [ ] **Step 6: Browser QA as member**

Sign out and sign in:

- Email: `member@example.com`
- Password: `PlaneTest@12345`
- Workspace: `codex-views`

Verify:

- Member can see sub-state labels and filters.
- Member cannot create, edit, or delete sub-states in Project Settings > States.
- Member can select allowed sub-states while creating or editing work items if their project role allows issue mutation.

- [ ] **Step 7: Commit verification and i18n**

```bash
git add packages/i18n
git commit -m "chore: add sub-state translations"
```

If locale files did not require changes because existing keys already covered the UI, skip this commit and record the reason in the final implementation summary.

## Task 10: Final Review And Handoff

**Files:**

- Review: all files changed on the branch

- [ ] **Step 1: Inspect branch changes**

Run:

```bash
git status --short
git diff --stat main...HEAD
git diff --check
```

Expected: only intentional files are modified, and `git diff --check` reports no whitespace errors.

- [ ] **Step 2: Run final verification**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_sub_state_app.py apps/api/plane/tests/contract/app/test_issue_sub_state_app.py -q
pnpm check:types
pnpm check:lint
```

Expected: all commands exit with code 0.

- [ ] **Step 3: Request code review**

Use `superpowers:requesting-code-review` before claiming implementation is complete. Ask the reviewer to focus on:

- Backend state/sub-state validation.
- Issue response projections that may have missed `sub_state_id`.
- Frontend filter dependency on selected State.
- Accidental addition of sub-state to grouping or drag logic.

- [ ] **Step 4: Fix review findings and re-run verification**

For each valid finding, add or update a failing test first when the finding is behavioral, implement the fix, and rerun the relevant backend tests or frontend checks. Commit fixes with focused messages.

- [ ] **Step 5: Final user summary**

Report:

- Backend tests run and result.
- Frontend checks run and result.
- Browser QA flows completed.
- Any remaining risk, especially if a broad issue projection endpoint could not be exercised manually.
