# Project Issue Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build optional project-level custom fields shared by all work items in a project, including field management, field values, filtering, display properties, grouping, sorting, and spreadsheet support.

**Architecture:** Add structured backend models for field definitions, options, and values, then expose project-scoped APIs and issue `field_values`. Extend the existing rich-filter pipeline with dynamic `customproperty_<field_id>` keys, then wire frontend types, services, stores, project settings, work item editors, layout display, and spreadsheet columns around that contract.

**Tech Stack:** Django, Django REST Framework, PostgreSQL, pytest, TypeScript, React, MobX, React Router, Plane rich filters, pnpm, OxLint/oxfmt.

---

## Reference Documents

- Spec: `docs/superpowers/specs/2026-07-07-project-issue-fields-design.md`
- Backend test guide: `apps/api/tests/RUNNING_TESTS.md`
- Backend conventions: `apps/api/tests/TESTING_GUIDE.md`
- Project commands: `AGENTS.md`

## File Structure

Backend model and service layer:

- Create `apps/api/plane/db/models/issue_field.py` for `ProjectIssueField`, `ProjectIssueFieldOption`, `IssueFieldValue`, `IssueFieldValueOption`, and `IssueFieldValueUser`.
- Modify `apps/api/plane/db/models/__init__.py` to export the new models.
- Create `apps/api/plane/app/serializers/issue_field.py` for field, option, and value serializers.
- Modify `apps/api/plane/app/serializers/__init__.py` to export the new serializers.
- Create `apps/api/plane/app/views/issue_field.py` for project field and option endpoints plus issue field value updates.
- Modify `apps/api/plane/app/views/__init__.py` to export the new views.
- Modify `apps/api/plane/app/urls/project.py` and `apps/api/plane/app/urls/issue.py` to register routes.
- Create `apps/api/plane/app/services/issue_field.py` for validation, value upsert, option cleanup, serialization helpers, and query helpers.
- Modify `apps/api/plane/app/views/issue/base.py` to attach `field_values` to issue list/detail/create responses.
- Modify `apps/api/plane/utils/filters/filterset.py` and `apps/api/plane/utils/filters/filter_backend.py` to support dynamic custom-property filters.
- Modify `apps/api/plane/utils/grouper.py` and `apps/api/plane/utils/order_queryset.py` to support allowed custom field grouping and ordering.

Backend tests:

- Create `apps/api/plane/tests/contract/app/test_project_issue_fields_app.py` for API behavior and permissions.
- Create `apps/api/plane/tests/unit/filters/test_project_issue_field_filters.py` for filter, grouping, and sorting query behavior.
- Add fixtures inside the two new test files.

Shared frontend types and constants:

- Create `packages/types/src/issues/issue-fields.ts` for field definition, option, value, and dynamic key types.
- Modify `packages/types/src/issues/issue.ts` to add `field_values` to `TBaseIssue`.
- Modify `packages/types/src/issues/issue-property-values.ts` to replace loose values with the new field value map types.
- Modify `packages/types/src/index.ts` to export `issues/issue-fields`.
- Modify `packages/types/src/view-props.ts` so `TWorkItemFilterProperty` includes dynamic custom property keys.
- Modify `packages/types/src/settings.ts`, `packages/constants/src/settings/project.ts`, and `apps/web/core/components/settings/project/sidebar/item-icon.tsx` to add the project fields settings tab.

Frontend data layer:

- Create `apps/web/core/services/project/issue-field.service.ts`.
- Create `apps/web/core/store/project/project-issue-field.store.ts`.
- Modify `apps/web/core/store/project/index.ts` to expose `projectIssueFields` under `projectRoot`.
- Create `apps/web/core/hooks/store/use-project-issue-fields.ts`.
- Modify `apps/web/core/hooks/work-item-filters/use-work-item-filters-config.tsx` to register custom field filter configs.
- Create `packages/utils/src/work-item-filters/configs/filters/custom-property.ts` and export it from `packages/utils/src/work-item-filters/configs/filters/index.ts`.

Frontend UI:

- Create `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/fields/page.tsx`.
- Create `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/fields/header.tsx`.
- Create `apps/web/core/components/project-fields/settings/root.tsx`.
- Create `apps/web/core/components/project-fields/settings/field-row.tsx`.
- Create `apps/web/core/components/project-fields/settings/field-form-modal.tsx`.
- Create `apps/web/core/components/project-fields/settings/disabled-fields.tsx`.
- Create `apps/web/core/components/project-fields/value-editors/root.tsx`.
- Create one focused editor per field family: `text-select.tsx`, `member-select.tsx`, `date.tsx`, `date-range.tsx`, and `plain-text.tsx`.
- Replace CE no-op additional-property components in:
  - `apps/web/ce/components/issues/issue-modal/modal-additional-properties.tsx`
  - `apps/web/ce/components/issues/issue-details/additional-properties.tsx`
  - `apps/web/ce/components/issues/issue-layouts/additional-properties.tsx`
- Modify spreadsheet column plumbing under `apps/web/core/components/issues/issue-layouts/spreadsheet`.

Validation:

- Run backend subset tests through Docker for API/filter changes.
- Run frontend typecheck/lint for touched packages.
- Run focused manual browser QA only after implementation, not while writing this plan.

---

### Task 1: Backend Models and Migration

**Files:**

- Create: `apps/api/plane/db/models/issue_field.py`
- Modify: `apps/api/plane/db/models/__init__.py`
- Generate: `apps/api/plane/db/migrations/0124_project_issue_fields.py`
- Test: `apps/api/plane/tests/contract/app/test_project_issue_fields_app.py`

- [ ] **Step 1: Write failing model tests**

Add `apps/api/plane/tests/contract/app/test_project_issue_fields_app.py` with these first tests:

```python
import pytest
from django.utils import timezone

from plane.db.models import (
    IssueFieldValue,
    IssueFieldValueOption,
    IssueFieldValueUser,
    ProjectIssueField,
    ProjectIssueFieldOption,
)


pytestmark = pytest.mark.django_db


def test_project_issue_field_defaults(workspace, project):
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Severity",
        field_type=ProjectIssueField.FieldType.SINGLE_SELECT,
    )

    assert field.name == "Severity"
    assert field.field_type == ProjectIssueField.FieldType.SINGLE_SELECT
    assert field.is_disabled is False
    assert field.disabled_at is None


def test_disabled_field_keeps_values(workspace, project, issue):
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Release date",
        field_type=ProjectIssueField.FieldType.DATE,
    )
    value = IssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        issue=issue,
        field=field,
        date_value="2026-07-07",
    )

    field.is_disabled = True
    field.disabled_at = timezone.now()
    field.save(update_fields=["is_disabled", "disabled_at", "updated_at"])

    assert IssueFieldValue.objects.filter(pk=value.pk).exists()


def test_hard_deleted_field_erases_options_and_values(workspace, project, issue):
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Team",
        field_type=ProjectIssueField.FieldType.MULTI_SELECT,
    )
    option = ProjectIssueFieldOption.objects.create(
        workspace=workspace,
        project=project,
        field=field,
        value="Backend",
    )
    value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field)
    IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=value, option=option)

    field.delete()

    assert not ProjectIssueField.objects.filter(pk=field.pk).exists()
    assert not ProjectIssueFieldOption.objects.filter(pk=option.pk).exists()
    assert not IssueFieldValue.objects.filter(pk=value.pk).exists()


def test_single_select_value_is_unique_per_issue_and_field(workspace, project, issue):
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Priority reason",
        field_type=ProjectIssueField.FieldType.PLAIN_TEXT,
    )
    IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field, text_value="first")

    with pytest.raises(Exception):
        IssueFieldValue.objects.create(
            workspace=workspace,
            project=project,
            issue=issue,
            field=field,
            text_value="second",
        )
```

- [ ] **Step 2: Run tests and verify model imports fail**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_issue_fields_app.py -q
```

Expected: fails because `ProjectIssueField` and related models are not importable.

- [ ] **Step 3: Add models**

Create `apps/api/plane/db/models/issue_field.py`:

```python
from django.conf import settings
from django.db import models

from .base import BaseModel


class ProjectIssueField(BaseModel):
    class FieldType(models.TextChoices):
        SINGLE_SELECT = "single_select", "Single-select text"
        MULTI_SELECT = "multi_select", "Multi-select text"
        SINGLE_MEMBER = "single_member", "Single-select member"
        MULTI_MEMBER = "multi_member", "Multi-select member"
        DATE = "date", "Date"
        DATE_RANGE = "date_range", "Date range"
        PLAIN_TEXT = "plain_text", "Plain text"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="project_issue_fields")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_fields")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    field_type = models.CharField(max_length=32, choices=FieldType.choices)
    sort_order = models.FloatField(default=65535)
    is_disabled = models.BooleanField(default=False)
    disabled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "project_issue_fields"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_issue_field_unique_project_name_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.name} <{self.project_id}>"


class ProjectIssueFieldOption(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="project_issue_field_options")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_field_options")
    field = models.ForeignKey(ProjectIssueField, on_delete=models.CASCADE, related_name="options")
    value = models.CharField(max_length=255)
    sort_order = models.FloatField(default=65535)

    class Meta:
        db_table = "project_issue_field_options"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["field", "value"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_issue_field_option_unique_field_value_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.value} <{self.field_id}>"


class IssueFieldValue(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="issue_field_values")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_field_values")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="field_value_rows")
    field = models.ForeignKey(ProjectIssueField, on_delete=models.CASCADE, related_name="issue_values")
    text_value = models.TextField(blank=True, null=True)
    date_value = models.DateField(null=True, blank=True)
    date_range_start = models.DateField(null=True, blank=True)
    date_range_end = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "issue_field_values"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "field"],
                condition=models.Q(deleted_at__isnull=True),
                name="issue_field_value_unique_issue_field_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.issue_id}::{self.field_id}"


class IssueFieldValueOption(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="issue_field_value_options")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_field_value_options")
    value = models.ForeignKey(IssueFieldValue, on_delete=models.CASCADE, related_name="selected_options")
    option = models.ForeignKey(ProjectIssueFieldOption, on_delete=models.CASCADE, related_name="selected_values")

    class Meta:
        db_table = "issue_field_value_options"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["value", "option"],
                condition=models.Q(deleted_at__isnull=True),
                name="issue_field_value_option_unique_value_option_when_not_deleted",
            )
        ]


class IssueFieldValueUser(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="issue_field_value_users")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_field_value_users")
    value = models.ForeignKey(IssueFieldValue, on_delete=models.CASCADE, related_name="selected_users")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="issue_field_values")

    class Meta:
        db_table = "issue_field_value_users"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["value", "user"],
                condition=models.Q(deleted_at__isnull=True),
                name="issue_field_value_user_unique_value_user_when_not_deleted",
            )
        ]
```

- [ ] **Step 4: Export models**

Modify `apps/api/plane/db/models/__init__.py`:

```python
from .issue_field import (
    IssueFieldValue,
    IssueFieldValueOption,
    IssueFieldValueUser,
    ProjectIssueField,
    ProjectIssueFieldOption,
)
```

- [ ] **Step 5: Generate migration**

Run:

```bash
cd apps/api
python manage.py makemigrations db
```

Expected: a migration creating the five new tables and constraints.

- [ ] **Step 6: Run model tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_issue_fields_app.py -q
```

Expected: model tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/api/plane/db/models/issue_field.py apps/api/plane/db/models/__init__.py apps/api/plane/db/migrations apps/api/plane/tests/contract/app/test_project_issue_fields_app.py
git commit -m "feat: add project issue field models"
```

---

### Task 2: Backend Field and Option APIs

**Files:**

- Create: `apps/api/plane/app/serializers/issue_field.py`
- Create: `apps/api/plane/app/views/issue_field.py`
- Modify: `apps/api/plane/app/serializers/__init__.py`
- Modify: `apps/api/plane/app/views/__init__.py`
- Modify: `apps/api/plane/app/urls/project.py`
- Test: `apps/api/plane/tests/contract/app/test_project_issue_fields_app.py`

- [ ] **Step 1: Add failing API tests**

Append these tests:

```python
from rest_framework import status


def test_admin_can_create_and_list_project_issue_field(api_client, workspace, project, project_admin):
    api_client.force_authenticate(project_admin)

    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/",
        {"name": "Severity", "field_type": ProjectIssueField.FieldType.SINGLE_SELECT},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["name"] == "Severity"
    assert response.data["field_type"] == ProjectIssueField.FieldType.SINGLE_SELECT

    list_response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/")

    assert list_response.status_code == status.HTTP_200_OK
    assert [item["id"] for item in list_response.data] == [response.data["id"]]


def test_member_cannot_create_project_issue_field(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)

    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/",
        {"name": "Severity", "field_type": ProjectIssueField.FieldType.SINGLE_SELECT},
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_admin_can_disable_restore_and_hard_delete_field(api_client, workspace, project, project_admin):
    api_client.force_authenticate(project_admin)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Release date",
        field_type=ProjectIssueField.FieldType.DATE,
    )

    disabled = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/",
        {"is_disabled": True},
        format="json",
    )

    assert disabled.status_code == status.HTTP_200_OK
    assert disabled.data["is_disabled"] is True
    assert disabled.data["disabled_at"] is not None

    disabled_list = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/disabled/")
    assert disabled_list.status_code == status.HTTP_200_OK
    assert [item["id"] for item in disabled_list.data] == [str(field.id)]

    restored = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/",
        {"is_disabled": False},
        format="json",
    )

    assert restored.status_code == status.HTTP_200_OK
    assert restored.data["is_disabled"] is False
    assert restored.data["disabled_at"] is None

    enabled_delete = api_client.delete(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/")
    assert enabled_delete.status_code == status.HTTP_400_BAD_REQUEST

    api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/",
        {"is_disabled": True},
        format="json",
    )
    deleted = api_client.delete(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/")

    assert deleted.status_code == status.HTTP_204_NO_CONTENT
    assert not ProjectIssueField.objects.filter(id=field.id).exists()


def test_work_item_editor_can_create_and_delete_text_option(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Area",
        field_type=ProjectIssueField.FieldType.MULTI_SELECT,
    )

    created = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/options/",
        {"value": "API"},
        format="json",
    )

    assert created.status_code == status.HTTP_201_CREATED
    assert created.data["value"] == "API"

    deleted = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/options/{created.data['id']}/"
    )

    assert deleted.status_code == status.HTTP_204_NO_CONTENT
```

- [ ] **Step 2: Run tests and verify endpoint failure**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_issue_fields_app.py -q
```

Expected: fails with 404 for the new endpoints.

- [ ] **Step 3: Add serializers**

Create `apps/api/plane/app/serializers/issue_field.py`:

```python
from django.utils import timezone
from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.db.models import ProjectIssueField, ProjectIssueFieldOption


class ProjectIssueFieldOptionSerializer(BaseSerializer):
    class Meta:
        model = ProjectIssueFieldOption
        fields = ["id", "value", "sort_order", "field", "project", "workspace", "created_at", "updated_at"]
        read_only_fields = ["id", "field", "project", "workspace", "created_at", "updated_at"]


class ProjectIssueFieldSerializer(BaseSerializer):
    options = ProjectIssueFieldOptionSerializer(many=True, read_only=True)

    class Meta:
        model = ProjectIssueField
        fields = [
            "id",
            "name",
            "description",
            "field_type",
            "sort_order",
            "is_disabled",
            "disabled_at",
            "options",
            "project",
            "workspace",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "disabled_at", "project", "workspace", "created_at", "updated_at", "options"]

    def validate_field_type(self, value):
        if self.instance and value != self.instance.field_type:
            raise serializers.ValidationError("Field type cannot be changed")
        return value

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Field name is required")
        return value.strip()

    def update(self, instance, validated_data):
        if "is_disabled" in validated_data:
            is_disabled = validated_data["is_disabled"]
            if is_disabled and not instance.is_disabled:
                validated_data["disabled_at"] = timezone.now()
            if not is_disabled:
                validated_data["disabled_at"] = None
        return super().update(instance, validated_data)
```

- [ ] **Step 4: Export serializers**

Modify `apps/api/plane/app/serializers/__init__.py`:

```python
from .issue_field import ProjectIssueFieldOptionSerializer, ProjectIssueFieldSerializer
```

- [ ] **Step 5: Add views**

Create `apps/api/plane/app/views/issue_field.py`:

```python
from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectIssueFieldOptionSerializer, ProjectIssueFieldSerializer
from plane.db.models import IssueFieldValueOption, ProjectIssueField, ProjectIssueFieldOption

from .base import BaseAPIView, BaseViewSet


TEXT_OPTION_FIELD_TYPES = {
    ProjectIssueField.FieldType.SINGLE_SELECT,
    ProjectIssueField.FieldType.MULTI_SELECT,
}


class ProjectIssueFieldViewSet(BaseViewSet):
    serializer_class = ProjectIssueFieldSerializer

    def get_queryset(self):
        return (
            ProjectIssueField.objects.filter(
                workspace__slug=self.kwargs["slug"],
                project_id=self.kwargs["project_id"],
            )
            .prefetch_related("options")
            .order_by("sort_order", "created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        fields = self.get_queryset().filter(is_disabled=False)
        return Response(self.serializer_class(fields, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace_id=request.workspace.id, project_id=project_id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk=None):
        field = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(field, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk=None):
        field = self.get_queryset().get(pk=pk)
        if not field.is_disabled:
            return Response({"error": "Disable the field before deleting it"}, status=status.HTTP_400_BAD_REQUEST)
        field.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DisabledProjectIssueFieldsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id):
        fields = (
            ProjectIssueField.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                is_disabled=True,
            )
            .prefetch_related("options")
            .order_by("sort_order", "created_at")
        )
        return Response(ProjectIssueFieldSerializer(fields, many=True).data, status=status.HTTP_200_OK)


class ProjectIssueFieldOptionViewSet(BaseViewSet):
    serializer_class = ProjectIssueFieldOptionSerializer

    def _get_field(self, slug, project_id, field_id):
        return ProjectIssueField.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            pk=field_id,
            is_disabled=False,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, field_id):
        field = self._get_field(slug, project_id, field_id)
        if field.field_type not in TEXT_OPTION_FIELD_TYPES:
            return Response({"error": "Options are only supported for text select fields"}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace_id=field.workspace_id, project_id=field.project_id, field=field)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, field_id, pk=None):
        field = self._get_field(slug, project_id, field_id)
        option = ProjectIssueFieldOption.objects.get(field=field, pk=pk)
        with transaction.atomic():
            IssueFieldValueOption.objects.filter(option=option).delete()
            option.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 6: Export views**

Modify `apps/api/plane/app/views/__init__.py`:

```python
from .issue_field import DisabledProjectIssueFieldsEndpoint, ProjectIssueFieldOptionViewSet, ProjectIssueFieldViewSet
```

- [ ] **Step 7: Register project routes**

Modify `apps/api/plane/app/urls/project.py` imports and `urlpatterns`:

```python
from plane.app.views import (
    DisabledProjectIssueFieldsEndpoint,
    ProjectIssueFieldOptionViewSet,
    ProjectIssueFieldViewSet,
)

urlpatterns += [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-fields/",
        ProjectIssueFieldViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-fields",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-fields/disabled/",
        DisabledProjectIssueFieldsEndpoint.as_view(),
        name="project-issue-fields-disabled",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-fields/<uuid:pk>/",
        ProjectIssueFieldViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="project-issue-field",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-fields/<uuid:field_id>/options/",
        ProjectIssueFieldOptionViewSet.as_view({"post": "create"}),
        name="project-issue-field-options",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-fields/<uuid:field_id>/options/<uuid:pk>/",
        ProjectIssueFieldOptionViewSet.as_view({"delete": "destroy"}),
        name="project-issue-field-option",
    ),
]
```

- [ ] **Step 8: Run API tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_issue_fields_app.py -q
```

Expected: API tests pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add apps/api/plane/app/serializers apps/api/plane/app/views apps/api/plane/app/urls/project.py apps/api/plane/tests/contract/app/test_project_issue_fields_app.py
git commit -m "feat: add project issue field APIs"
```

---

### Task 3: Backend Field Value Service and Issue Value API

**Files:**

- Create: `apps/api/plane/app/services/issue_field.py`
- Modify: `apps/api/plane/app/views/issue_field.py`
- Modify: `apps/api/plane/app/urls/issue.py`
- Modify: `apps/api/plane/app/serializers/issue_field.py`
- Test: `apps/api/plane/tests/contract/app/test_project_issue_fields_app.py`

- [ ] **Step 1: Add failing field value tests**

Append:

```python
def test_member_can_update_issue_field_values(api_client, workspace, project, issue, project_member):
    api_client.force_authenticate(project_member)
    text_field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Customer note",
        field_type=ProjectIssueField.FieldType.PLAIN_TEXT,
    )
    date_field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Launch",
        field_type=ProjectIssueField.FieldType.DATE,
    )

    response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/field-values/",
        {
            "field_values": {
                str(text_field.id): "Needs migration",
                str(date_field.id): "2026-07-07",
            }
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["field_values"][str(text_field.id)] == "Needs migration"
    assert response.data["field_values"][str(date_field.id)] == "2026-07-07"


def test_single_select_value_replaces_existing_option(api_client, workspace, project, issue, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Severity",
        field_type=ProjectIssueField.FieldType.SINGLE_SELECT,
    )
    low = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="Low")
    high = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="High")

    first = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/field-values/",
        {"field_values": {str(field.id): str(low.id)}},
        format="json",
    )
    second = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/field-values/",
        {"field_values": {str(field.id): str(high.id)}},
        format="json",
    )

    assert first.status_code == status.HTTP_200_OK
    assert second.status_code == status.HTTP_200_OK
    assert second.data["field_values"][str(field.id)] == str(high.id)


def test_disabled_field_rejects_value_update(api_client, workspace, project, issue, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Blocked reason",
        field_type=ProjectIssueField.FieldType.PLAIN_TEXT,
        is_disabled=True,
        disabled_at=timezone.now(),
    )

    response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/field-values/",
        {"field_values": {str(field.id): "Waiting on vendor"}},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_create_issue_accepts_field_values(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Customer note",
        field_type=ProjectIssueField.FieldType.PLAIN_TEXT,
    )

    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {
            "name": "New work item",
            "field_values": {
                str(field.id): "Created with custom value",
            },
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["field_values"][str(field.id)] == "Created with custom value"
```

- [ ] **Step 2: Run tests and verify value endpoint fails**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_issue_fields_app.py -q
```

Expected: field value tests fail with 404.

- [ ] **Step 3: Add value service**

Create `apps/api/plane/app/services/issue_field.py`:

```python
from django.db import transaction
from rest_framework import serializers

from plane.db.models import (
    Issue,
    IssueFieldValue,
    IssueFieldValueOption,
    IssueFieldValueUser,
    ProjectIssueField,
    ProjectIssueFieldOption,
    ProjectMember,
)


class IssueFieldValueService:
    @classmethod
    def serialize_values(cls, issue_ids):
        rows = (
            IssueFieldValue.objects.filter(issue_id__in=issue_ids, field__is_disabled=False)
            .select_related("field")
            .prefetch_related("selected_options__option", "selected_users__user")
        )
        values = {str(issue_id): {} for issue_id in issue_ids}
        for row in rows:
            field_id = str(row.field_id)
            issue_id = str(row.issue_id)
            field_type = row.field.field_type
            if field_type == ProjectIssueField.FieldType.PLAIN_TEXT:
                values[issue_id][field_id] = row.text_value
            elif field_type == ProjectIssueField.FieldType.DATE:
                values[issue_id][field_id] = row.date_value.isoformat() if row.date_value else None
            elif field_type == ProjectIssueField.FieldType.DATE_RANGE:
                values[issue_id][field_id] = {
                    "start": row.date_range_start.isoformat() if row.date_range_start else None,
                    "end": row.date_range_end.isoformat() if row.date_range_end else None,
                }
            elif field_type == ProjectIssueField.FieldType.SINGLE_SELECT:
                selected = [str(item.option_id) for item in row.selected_options.all()]
                values[issue_id][field_id] = selected[0] if selected else None
            elif field_type == ProjectIssueField.FieldType.MULTI_SELECT:
                values[issue_id][field_id] = [str(item.option_id) for item in row.selected_options.all()]
            elif field_type == ProjectIssueField.FieldType.SINGLE_MEMBER:
                selected = [str(item.user_id) for item in row.selected_users.all()]
                values[issue_id][field_id] = selected[0] if selected else None
            elif field_type == ProjectIssueField.FieldType.MULTI_MEMBER:
                values[issue_id][field_id] = [str(item.user_id) for item in row.selected_users.all()]
        return values

    @classmethod
    def serialize_issue_value_map(cls, issue_id):
        return cls.serialize_values([issue_id]).get(str(issue_id), {})

    @classmethod
    @transaction.atomic
    def update_issue_values(cls, issue, raw_values):
        fields = {
            str(field.id): field
            for field in ProjectIssueField.objects.filter(
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                id__in=raw_values.keys(),
            )
        }
        missing = set(raw_values.keys()) - set(fields.keys())
        if missing:
            raise serializers.ValidationError({"field_values": "One or more fields are invalid"})

        for field_id, submitted_value in raw_values.items():
            field = fields[field_id]
            if field.is_disabled:
                raise serializers.ValidationError({"field_values": "One or more fields are disabled"})
            cls._upsert_value(issue, field, submitted_value)

        return cls.serialize_issue_value_map(issue.id)

    @classmethod
    def _upsert_value(cls, issue, field, submitted_value):
        value, _ = IssueFieldValue.objects.get_or_create(
            workspace_id=issue.workspace_id,
            project_id=issue.project_id,
            issue=issue,
            field=field,
        )
        value.text_value = None
        value.date_value = None
        value.date_range_start = None
        value.date_range_end = None
        value.save(update_fields=["text_value", "date_value", "date_range_start", "date_range_end", "updated_at"])
        value.selected_options.all().delete()
        value.selected_users.all().delete()

        if submitted_value in (None, "", []):
            return value

        if field.field_type == ProjectIssueField.FieldType.PLAIN_TEXT:
            value.text_value = str(submitted_value)
            value.save(update_fields=["text_value", "updated_at"])
            return value

        if field.field_type == ProjectIssueField.FieldType.DATE:
            value.date_value = submitted_value
            value.save(update_fields=["date_value", "updated_at"])
            return value

        if field.field_type == ProjectIssueField.FieldType.DATE_RANGE:
            value.date_range_start = submitted_value.get("start")
            value.date_range_end = submitted_value.get("end")
            value.save(update_fields=["date_range_start", "date_range_end", "updated_at"])
            return value

        if field.field_type in [ProjectIssueField.FieldType.SINGLE_SELECT, ProjectIssueField.FieldType.MULTI_SELECT]:
            option_ids = submitted_value if isinstance(submitted_value, list) else [submitted_value]
            if field.field_type == ProjectIssueField.FieldType.SINGLE_SELECT:
                option_ids = option_ids[:1]
            valid_options = ProjectIssueFieldOption.objects.filter(field=field, id__in=option_ids)
            if valid_options.count() != len(set(option_ids)):
                raise serializers.ValidationError({"field_values": "One or more options are invalid"})
            IssueFieldValueOption.objects.bulk_create(
                [
                    IssueFieldValueOption(
                        workspace_id=issue.workspace_id,
                        project_id=issue.project_id,
                        value=value,
                        option=option,
                    )
                    for option in valid_options
                ]
            )
            return value

        if field.field_type in [ProjectIssueField.FieldType.SINGLE_MEMBER, ProjectIssueField.FieldType.MULTI_MEMBER]:
            user_ids = submitted_value if isinstance(submitted_value, list) else [submitted_value]
            if field.field_type == ProjectIssueField.FieldType.SINGLE_MEMBER:
                user_ids = user_ids[:1]
            valid_user_ids = list(
                ProjectMember.objects.filter(
                    project_id=issue.project_id,
                    member_id__in=user_ids,
                    is_active=True,
                ).values_list("member_id", flat=True)
            )
            if len(valid_user_ids) != len(set(user_ids)):
                raise serializers.ValidationError({"field_values": "One or more members are invalid"})
            IssueFieldValueUser.objects.bulk_create(
                [
                    IssueFieldValueUser(
                        workspace_id=issue.workspace_id,
                        project_id=issue.project_id,
                        value=value,
                        user_id=user_id,
                    )
                    for user_id in valid_user_ids
                ]
            )
            return value

        raise serializers.ValidationError({"field_values": "Unsupported field type"})
```

- [ ] **Step 4: Add endpoint**

Append to `apps/api/plane/app/views/issue_field.py`:

```python
from plane.app.services.issue_field import IssueFieldValueService
from plane.db.models import Issue


class IssueFieldValueEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], creator=True, model=Issue)
    def patch(self, request, slug, project_id, issue_id):
        issue = Issue.objects.get(workspace__slug=slug, project_id=project_id, pk=issue_id)
        field_values = request.data.get("field_values", {})
        if not isinstance(field_values, dict):
            return Response({"field_values": "Expected an object"}, status=status.HTTP_400_BAD_REQUEST)
        updated_values = IssueFieldValueService.update_issue_values(issue, field_values)
        return Response({"field_values": updated_values}, status=status.HTTP_200_OK)
```

- [ ] **Step 5: Persist field values during issue creation**

Modify `apps/api/plane/app/views/issue/base.py` in `IssueViewSet.create` after `serializer.save()`:

```python
created_issue = Issue.objects.get(pk=serializer.data["id"], project_id=project_id, workspace_id=project.workspace_id)
created_field_values = {}
if isinstance(request.data.get("field_values"), dict):
    created_field_values = IssueFieldValueService.update_issue_values(created_issue, request.data["field_values"])
```

After building the `issue` dict and timezone conversion, attach the created values:

```python
issue["field_values"] = created_field_values or IssueFieldValueService.serialize_issue_value_map(issue["id"])
```

- [ ] **Step 6: Export endpoint**

Modify `apps/api/plane/app/views/__init__.py`:

```python
from .issue_field import IssueFieldValueEndpoint
```

- [ ] **Step 7: Register issue route**

Modify `apps/api/plane/app/urls/issue.py` imports and `urlpatterns`:

```python
from plane.app.views import IssueFieldValueEndpoint

urlpatterns += [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/field-values/",
        IssueFieldValueEndpoint.as_view(),
        name="issue-field-values",
    ),
]
```

- [ ] **Step 8: Run field value tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_issue_fields_app.py -q
```

Expected: field value tests pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add apps/api/plane/app/services/issue_field.py apps/api/plane/app/views/issue_field.py apps/api/plane/app/views/issue/base.py apps/api/plane/app/views/__init__.py apps/api/plane/app/urls/issue.py apps/api/plane/tests/contract/app/test_project_issue_fields_app.py
git commit -m "feat: add issue custom field values API"
```

---

### Task 4: Include Field Values in Issue Responses

**Files:**

- Modify: `apps/api/plane/app/views/issue/base.py`
- Modify: `apps/api/plane/app/services/issue_field.py`
- Modify: `apps/api/plane/app/serializers/issue.py`
- Test: `apps/api/plane/tests/contract/app/test_project_issue_fields_app.py`

- [ ] **Step 1: Add failing response tests**

Append:

```python
def test_issue_list_includes_field_values(api_client, workspace, project, issue, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Customer note",
        field_type=ProjectIssueField.FieldType.PLAIN_TEXT,
    )
    IssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        issue=issue,
        field=field,
        text_value="Needs migration",
    )

    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/")

    assert response.status_code == status.HTTP_200_OK
    first_issue = response.data["results"][0]
    assert first_issue["field_values"][str(field.id)] == "Needs migration"


def test_issue_retrieve_includes_field_values(api_client, workspace, project, issue, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Launch",
        field_type=ProjectIssueField.FieldType.DATE,
    )
    IssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        issue=issue,
        field=field,
        date_value="2026-07-07",
    )

    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["field_values"][str(field.id)] == "2026-07-07"
```

- [ ] **Step 2: Run tests and verify missing `field_values`**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_issue_fields_app.py -q
```

Expected: fails because issue responses do not include `field_values`.

- [ ] **Step 3: Add helper to attach field values**

Append to `IssueFieldValueService` in `apps/api/plane/app/services/issue_field.py`:

```python
    @classmethod
    def attach_field_values_to_issue_dicts(cls, issue_dicts):
        issue_ids = [item["id"] for item in issue_dicts if item.get("id")]
        values = cls.serialize_values(issue_ids)
        for item in issue_dicts:
            item["field_values"] = values.get(str(item.get("id")), {})
        return issue_dicts

    @classmethod
    def attach_field_values_to_issue_dict(cls, issue_dict):
        if not issue_dict:
            return issue_dict
        issue_dict["field_values"] = cls.serialize_issue_value_map(issue_dict["id"])
        return issue_dict
```

- [ ] **Step 4: Attach values in issue list/create/retrieve**

Modify `apps/api/plane/app/views/issue/base.py`:

```python
from plane.app.services.issue_field import IssueFieldValueService
```

In `IssueListEndpoint.get`, after timezone conversion:

```python
issues = IssueFieldValueService.attach_field_values_to_issue_dicts(list(issues))
```

In `IssueViewSet.create`, after timezone conversion:

```python
issue = IssueFieldValueService.attach_field_values_to_issue_dict(issue)
```

In `IssueViewSet.retrieve`, before returning serialized response:

```python
data = IssueSerializer(issue).data
data["field_values"] = IssueFieldValueService.serialize_issue_value_map(issue.id)
return Response(data, status=status.HTTP_200_OK)
```

- [ ] **Step 5: Add serializer field for expanded serializer paths**

Modify `apps/api/plane/app/serializers/issue.py` in `IssueSerializer` and `IssueDetailSerializer` if those classes are used for expanded detail paths:

```python
from plane.app.services.issue_field import IssueFieldValueService


field_values = serializers.SerializerMethodField()


def get_field_values(self, obj):
    return IssueFieldValueService.serialize_issue_value_map(obj.id)
```

- [ ] **Step 6: Run response tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_issue_fields_app.py -q
```

Expected: response tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/api/plane/app/views/issue/base.py apps/api/plane/app/services/issue_field.py apps/api/plane/app/serializers/issue.py apps/api/plane/tests/contract/app/test_project_issue_fields_app.py
git commit -m "feat: include custom field values in issues"
```

---

### Task 5: Backend Rich Filters, Grouping, and Sorting

**Files:**

- Modify: `apps/api/plane/utils/filters/filter_backend.py`
- Modify: `apps/api/plane/utils/filters/filterset.py`
- Modify: `apps/api/plane/utils/grouper.py`
- Modify: `apps/api/plane/utils/order_queryset.py`
- Test: `apps/api/plane/tests/unit/filters/test_project_issue_field_filters.py`

- [ ] **Step 1: Add failing filter tests**

Create `apps/api/plane/tests/unit/filters/test_project_issue_field_filters.py`:

```python
import pytest

from plane.db.models import IssueFieldValue, IssueFieldValueOption, ProjectIssueField, ProjectIssueFieldOption


pytestmark = pytest.mark.django_db


def test_plain_text_custom_field_contains_filter(api_client, workspace, project, issue, issue_factory, project_member):
    other_issue = issue_factory(project=project, workspace=workspace, name="Other")
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Customer note",
        field_type=ProjectIssueField.FieldType.PLAIN_TEXT,
    )
    IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field, text_value="migration needed")
    IssueFieldValue.objects.create(workspace=workspace, project=project, issue=other_issue, field=field, text_value="billing")
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"filters": {f"customproperty_{field.id}__contains": "migration"}},
        format="json",
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [str(issue.id)]


def test_single_select_custom_field_exact_filter(api_client, workspace, project, issue, issue_factory, project_member):
    other_issue = issue_factory(project=project, workspace=workspace, name="Other")
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Severity",
        field_type=ProjectIssueField.FieldType.SINGLE_SELECT,
    )
    high = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="High")
    low = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="Low")
    high_value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field)
    low_value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=other_issue, field=field)
    IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=high_value, option=high)
    IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=low_value, option=low)
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"filters": {f"customproperty_{field.id}__exact": str(high.id)}},
        format="json",
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.data["results"]] == [str(issue.id)]


def test_disabled_custom_field_filter_is_ignored(api_client, workspace, project, issue, project_member):
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Disabled",
        field_type=ProjectIssueField.FieldType.PLAIN_TEXT,
        is_disabled=True,
    )
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"filters": {f"customproperty_{field.id}__contains": "value"}},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["total_count"] >= 1
```

- [ ] **Step 2: Run tests and verify filters fail**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/unit/filters/test_project_issue_field_filters.py -q
```

Expected: tests fail because custom field filters are not translated to `Q` objects.

- [ ] **Step 3: Add custom filter helper**

Add to `apps/api/plane/utils/filters/filterset.py`:

```python
from uuid import UUID

from plane.db.models import ProjectIssueField


def build_custom_property_q(project_id, property_name, operator, value):
    if not property_name.startswith("customproperty_"):
        return None
    field_id = property_name.replace("customproperty_", "", 1)
    try:
        UUID(field_id)
    except ValueError:
        return Q(pk__in=[])

    field = ProjectIssueField.objects.filter(project_id=project_id, id=field_id, is_disabled=False).first()
    if field is None:
        return Q()

    base = Q(field_value_rows__field_id=field.id, field_value_rows__deleted_at__isnull=True)
    if field.field_type == ProjectIssueField.FieldType.PLAIN_TEXT:
        if operator == "contains":
            return base & Q(field_value_rows__text_value__icontains=value)
        if operator == "not_contains":
            return ~Q(field_value_rows__field_id=field.id, field_value_rows__text_value__icontains=value)
        if operator == "is_empty":
            return Q(field_value_rows__field_id=field.id, field_value_rows__text_value__isnull=True) | ~Q(field_value_rows__field_id=field.id)
        if operator == "is_not_empty":
            return base & Q(field_value_rows__text_value__isnull=False)

    if field.field_type in [ProjectIssueField.FieldType.SINGLE_SELECT, ProjectIssueField.FieldType.MULTI_SELECT]:
        option_values = str(value).split(",") if isinstance(value, str) else value
        if operator in ["exact", "in", "contains_any"]:
            return base & Q(field_value_rows__selected_options__option_id__in=option_values)
        if operator in ["not_exact", "not_in", "not_contains_any"]:
            return ~Q(field_value_rows__field_id=field.id, field_value_rows__selected_options__option_id__in=option_values)
        if operator == "is_empty":
            return Q(field_value_rows__field_id=field.id, field_value_rows__selected_options__isnull=True) | ~Q(field_value_rows__field_id=field.id)
        if operator == "is_not_empty":
            return base & Q(field_value_rows__selected_options__isnull=False)

    if field.field_type in [ProjectIssueField.FieldType.SINGLE_MEMBER, ProjectIssueField.FieldType.MULTI_MEMBER]:
        user_values = str(value).split(",") if isinstance(value, str) else value
        if operator in ["exact", "in", "contains_any"]:
            return base & Q(field_value_rows__selected_users__user_id__in=user_values)
        if operator in ["not_exact", "not_in", "not_contains_any"]:
            return ~Q(field_value_rows__field_id=field.id, field_value_rows__selected_users__user_id__in=user_values)
        if operator == "is_empty":
            return Q(field_value_rows__field_id=field.id, field_value_rows__selected_users__isnull=True) | ~Q(field_value_rows__field_id=field.id)
        if operator == "is_not_empty":
            return base & Q(field_value_rows__selected_users__isnull=False)

    if field.field_type == ProjectIssueField.FieldType.DATE:
        if operator == "exact":
            return base & Q(field_value_rows__date_value=value)
        if operator == "range":
            start, end = str(value).split(",", 1)
            return base & Q(field_value_rows__date_value__gte=start, field_value_rows__date_value__lte=end)
        if operator == "is_empty":
            return Q(field_value_rows__field_id=field.id, field_value_rows__date_value__isnull=True) | ~Q(field_value_rows__field_id=field.id)
        if operator == "is_not_empty":
            return base & Q(field_value_rows__date_value__isnull=False)

    if field.field_type == ProjectIssueField.FieldType.DATE_RANGE:
        if operator == "overlaps":
            start, end = str(value).split(",", 1)
            return base & Q(field_value_rows__date_range_start__lte=end, field_value_rows__date_range_end__gte=start)
        if operator == "not_overlaps":
            start, end = str(value).split(",", 1)
            return ~Q(field_value_rows__field_id=field.id, field_value_rows__date_range_start__lte=end, field_value_rows__date_range_end__gte=start)
        if operator == "is_empty":
            return Q(field_value_rows__field_id=field.id, field_value_rows__date_range_start__isnull=True, field_value_rows__date_range_end__isnull=True) | ~Q(field_value_rows__field_id=field.id)
        if operator == "is_not_empty":
            return base & (Q(field_value_rows__date_range_start__isnull=False) | Q(field_value_rows__date_range_end__isnull=False))

    return Q()
```

- [ ] **Step 4: Wire helper into complex filter backend**

Modify `apps/api/plane/utils/filters/filter_backend.py` where leaf conditions are transformed:

```python
from plane.utils.filters.filterset import build_custom_property_q


custom_q = build_custom_property_q(
    project_id=getattr(view, "kwargs", {}).get("project_id"),
    property_name=field_name,
    operator=operator,
    value=value,
)
if custom_q is not None:
    combined_q &= custom_q
    continue
```

- [ ] **Step 5: Add grouping and sorting support**

Modify `apps/api/plane/utils/grouper.py` so `customproperty_<field_id>` group keys are accepted only for single-select text and single-select member fields:

```python
def is_supported_custom_group_by(field):
    return field.field_type in [
        ProjectIssueField.FieldType.SINGLE_SELECT,
        ProjectIssueField.FieldType.SINGLE_MEMBER,
    ]
```

Modify `apps/api/plane/utils/order_queryset.py` so `customproperty_<field_id>` order keys are accepted only for date and plain text fields:

```python
def is_supported_custom_order_by(field):
    return field.field_type in [
        ProjectIssueField.FieldType.DATE,
        ProjectIssueField.FieldType.PLAIN_TEXT,
    ]
```

Use subqueries from `IssueFieldValue` to annotate sortable values:

```python
custom_value = IssueFieldValue.objects.filter(issue=OuterRef("id"), field=field, deleted_at__isnull=True)
if field.field_type == ProjectIssueField.FieldType.DATE:
    queryset = queryset.annotate(custom_order_value=Subquery(custom_value.values("date_value")[:1]))
if field.field_type == ProjectIssueField.FieldType.PLAIN_TEXT:
    queryset = queryset.annotate(custom_order_value=Subquery(custom_value.values("text_value")[:1]))
queryset = queryset.order_by("-custom_order_value" if is_desc else "custom_order_value")
```

- [ ] **Step 6: Run filter tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/unit/filters/test_project_issue_field_filters.py -q
```

Expected: filter tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/api/plane/utils/filters apps/api/plane/utils/grouper.py apps/api/plane/utils/order_queryset.py apps/api/plane/tests/unit/filters/test_project_issue_field_filters.py
git commit -m "feat: support custom field issue filters"
```

---

### Task 6: Shared TypeScript Types and Dynamic Filter Keys

**Files:**

- Create: `packages/types/src/issues/issue-fields.ts`
- Modify: `packages/types/src/issues/issue.ts`
- Modify: `packages/types/src/issues/issue-property-values.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/types/src/view-props.ts`

- [ ] **Step 1: Add field types**

Create `packages/types/src/issues/issue-fields.ts`:

```ts
export enum EProjectIssueFieldType {
  SINGLE_SELECT = "single_select",
  MULTI_SELECT = "multi_select",
  SINGLE_MEMBER = "single_member",
  MULTI_MEMBER = "multi_member",
  DATE = "date",
  DATE_RANGE = "date_range",
  PLAIN_TEXT = "plain_text",
}

export type TProjectIssueFieldId = string;
export type TCustomPropertyKey = `customproperty_${TProjectIssueFieldId}`;

export type TProjectIssueFieldOption = {
  id: string;
  value: string;
  sort_order: number;
  field: string;
  project: string;
  workspace: string;
  created_at: string;
  updated_at: string;
};

export type TProjectIssueField = {
  id: string;
  name: string;
  description: string;
  field_type: EProjectIssueFieldType;
  sort_order: number;
  is_disabled: boolean;
  disabled_at: string | null;
  options: TProjectIssueFieldOption[];
  project: string;
  workspace: string;
  created_at: string;
  updated_at: string;
};

export type TIssueFieldDateRangeValue = {
  start: string | null;
  end: string | null;
};

export type TIssueFieldValue = string | string[] | TIssueFieldDateRangeValue | null;
export type TIssueFieldValues = Record<string, TIssueFieldValue>;

export type TProjectIssueFieldPayload = {
  name: string;
  field_type: EProjectIssueFieldType;
  description?: string;
  sort_order?: number;
};

export type TProjectIssueFieldUpdatePayload = Partial<
  Pick<TProjectIssueField, "name" | "description" | "sort_order" | "is_disabled">
>;

export type TIssueFieldValuesUpdatePayload = {
  field_values: TIssueFieldValues;
};
```

- [ ] **Step 2: Replace loose property value types**

Modify `packages/types/src/issues/issue-property-values.ts`:

```ts
import type { TIssueFieldValues } from "./issue-fields";

export type TIssuePropertyValues = TIssueFieldValues;
export type TIssuePropertyValueErrors = Record<string, string>;
```

- [ ] **Step 3: Add values to issues**

Modify `packages/types/src/issues/issue.ts`:

```ts
import type { TIssueFieldValues } from "./issue-fields";

export type TBaseIssue = {
  field_values: TIssueFieldValues;
};
```

Keep every existing `TBaseIssue` property and add only the `field_values` line inside the existing type.

- [ ] **Step 4: Export field types**

Modify `packages/types/src/index.ts`:

```ts
export * from "./issues/issue-fields";
```

- [ ] **Step 5: Extend dynamic filter key typing**

Modify `packages/types/src/view-props.ts`:

```ts
import type { TCustomPropertyKey } from "./issues/issue-fields";

export type TWorkItemSystemFilterProperty = (typeof WORK_ITEM_FILTER_PROPERTY_KEYS)[number];
export type TWorkItemFilterProperty = TWorkItemSystemFilterProperty | TCustomPropertyKey;
export type TWorkItemFilterConditionKey = `${TWorkItemFilterProperty}__${TSupportedOperators}`;
```

- [ ] **Step 6: Run typecheck for types package**

Run:

```bash
pnpm turbo run check:types --filter=@plane/types
```

Expected: TypeScript passes for `@plane/types`.

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/types/src
git commit -m "feat: add project issue field types"
```

---

### Task 7: Frontend Services and Store

**Files:**

- Create: `apps/web/core/services/project/issue-field.service.ts`
- Create: `apps/web/core/store/project/project-issue-field.store.ts`
- Create: `apps/web/core/hooks/store/use-project-issue-fields.ts`
- Modify: `apps/web/core/store/project/index.ts`

- [ ] **Step 1: Create service**

Create `apps/web/core/services/project/issue-field.service.ts`:

```ts
import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueFieldValuesUpdatePayload,
  TProjectIssueField,
  TProjectIssueFieldOption,
  TProjectIssueFieldPayload,
  TProjectIssueFieldUpdatePayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProjectIssueFieldService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<TProjectIssueField[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listDisabled(workspaceSlug: string, projectId: string): Promise<TProjectIssueField[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/disabled/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: TProjectIssueFieldPayload): Promise<TProjectIssueField> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    fieldId: string,
    data: TProjectIssueFieldUpdatePayload
  ): Promise<TProjectIssueField> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/${fieldId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async delete(workspaceSlug: string, projectId: string, fieldId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/${fieldId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createOption(
    workspaceSlug: string,
    projectId: string,
    fieldId: string,
    value: string
  ): Promise<TProjectIssueFieldOption> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/${fieldId}/options/`, {
      value,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteOption(workspaceSlug: string, projectId: string, fieldId: string, optionId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-fields/${fieldId}/options/${optionId}/`
    )
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssueFieldValuesUpdatePayload
  ): Promise<TIssueFieldValuesUpdatePayload> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/field-values/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
```

- [ ] **Step 2: Create store**

Create `apps/web/core/store/project/project-issue-field.store.ts`:

```ts
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import type {
  TIssueFieldValues,
  TProjectIssueField,
  TProjectIssueFieldPayload,
  TProjectIssueFieldUpdatePayload,
} from "@plane/types";
import { ProjectIssueFieldService } from "@/services/project/issue-field.service";

type TProjectFieldKey = `${string}:${string}`;

export class ProjectIssueFieldStore {
  fieldsByProject: Map<TProjectFieldKey, TProjectIssueField[]> = new Map();
  disabledFieldsByProject: Map<TProjectFieldKey, TProjectIssueField[]> = new Map();
  loader: Record<TProjectFieldKey, boolean> = {};
  service = new ProjectIssueFieldService();

  constructor() {
    makeObservable(this, {
      fieldsByProject: observable,
      disabledFieldsByProject: observable,
      loader: observable,
      getFields: action,
      getDisabledFields: action,
      createField: action,
      updateField: action,
      deleteField: action,
      enabledFields: computed,
    });
  }

  get enabledFields() {
    return this.fieldsByProject;
  }

  projectKey(workspaceSlug: string, projectId: string): TProjectFieldKey {
    return `${workspaceSlug}:${projectId}`;
  }

  async getFields(workspaceSlug: string, projectId: string) {
    const key = this.projectKey(workspaceSlug, projectId);
    runInAction(() => {
      this.loader[key] = true;
    });
    const fields = await this.service.list(workspaceSlug, projectId);
    runInAction(() => {
      this.fieldsByProject.set(key, fields);
      this.loader[key] = false;
    });
    return fields;
  }

  async getDisabledFields(workspaceSlug: string, projectId: string) {
    const key = this.projectKey(workspaceSlug, projectId);
    const fields = await this.service.listDisabled(workspaceSlug, projectId);
    runInAction(() => {
      this.disabledFieldsByProject.set(key, fields);
    });
    return fields;
  }

  async createField(workspaceSlug: string, projectId: string, data: TProjectIssueFieldPayload) {
    const field = await this.service.create(workspaceSlug, projectId, data);
    const key = this.projectKey(workspaceSlug, projectId);
    runInAction(() => {
      this.fieldsByProject.set(key, [...(this.fieldsByProject.get(key) ?? []), field]);
    });
    return field;
  }

  async updateField(workspaceSlug: string, projectId: string, fieldId: string, data: TProjectIssueFieldUpdatePayload) {
    const field = await this.service.update(workspaceSlug, projectId, fieldId, data);
    await this.getFields(workspaceSlug, projectId);
    await this.getDisabledFields(workspaceSlug, projectId);
    return field;
  }

  async deleteField(workspaceSlug: string, projectId: string, fieldId: string) {
    await this.service.delete(workspaceSlug, projectId, fieldId);
    await this.getDisabledFields(workspaceSlug, projectId);
  }

  async updateIssueValues(workspaceSlug: string, projectId: string, issueId: string, fieldValues: TIssueFieldValues) {
    return this.service.updateIssueValues(workspaceSlug, projectId, issueId, { field_values: fieldValues });
  }
}
```

- [ ] **Step 3: Add hook**

Create `apps/web/core/hooks/store/use-project-issue-fields.ts`:

```ts
import { useMobxStore } from "@/lib/mobx/store-provider";

export const useProjectIssueFields = () => {
  const store = useMobxStore();
  return store.projectIssueFields;
};
```

- [ ] **Step 4: Register store in project root store**

Modify `apps/web/core/store/project/index.ts`:

```ts
import { ProjectIssueFieldStore } from "@/store/project/project-issue-field.store";

export interface IProjectRootStore {
  project: IProjectStore;
  projectIssueFields: ProjectIssueFieldStore;
}

export class ProjectRootStore {
  project: IProjectStore;
  projectIssueFields: ProjectIssueFieldStore;

  constructor(_root: CoreRootStore) {
    this.project = new ProjectStore(_root);
    this.projectIssueFields = new ProjectIssueFieldStore();
  }
}
```

- [ ] **Step 5: Run frontend typecheck**

Run:

```bash
pnpm check:types
```

Expected: no TypeScript errors from the new service/store/hook.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/web/core/services/project/issue-field.service.ts apps/web/core/store/project/project-issue-field.store.ts apps/web/core/hooks/store/use-project-issue-fields.ts apps/web/core/store apps/web/core/hooks
git commit -m "feat: add project issue field frontend store"
```

---

### Task 8: Project Settings Fields Page

**Files:**

- Modify: `apps/web/app/routes/core.ts`
- Modify: `packages/types/src/settings.ts`
- Modify: `packages/constants/src/settings/project.ts`
- Modify: `apps/web/core/components/settings/project/sidebar/item-icon.tsx`
- Create: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/fields/page.tsx`
- Create: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/fields/header.tsx`
- Create: `apps/web/core/components/project-fields/settings/root.tsx`
- Create: `apps/web/core/components/project-fields/settings/field-row.tsx`
- Create: `apps/web/core/components/project-fields/settings/field-form-modal.tsx`
- Create: `apps/web/core/components/project-fields/settings/disabled-fields.tsx`

- [ ] **Step 1: Add settings tab type and constants**

Modify `packages/types/src/settings.ts`:

```ts
export type TProjectSettingsTabs =
  | "general"
  | "members"
  | "features_cycles"
  | "features_modules"
  | "features_views"
  | "features_pages"
  | "features_intake"
  | "states"
  | "labels"
  | "estimates"
  | "fields"
  | "automations";
```

Modify `packages/constants/src/settings/project.ts`:

```ts
fields: {
  key: "fields",
  i18n_label: "project_settings.fields.title",
  href: `/fields`,
  access: [EUserProjectRoles.ADMIN],
  highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/fields/`,
},
```

Add it to `WORK_STRUCTURE`:

```ts
[PROJECT_SETTINGS_CATEGORY.WORK_STRUCTURE]: [
  PROJECT_SETTINGS["states"],
  PROJECT_SETTINGS["labels"],
  PROJECT_SETTINGS["estimates"],
  PROJECT_SETTINGS["fields"],
],
```

Modify `apps/web/core/components/settings/project/sidebar/item-icon.tsx`:

```ts
import { ListPlus } from "lucide-react";

fields: ListPlus,
```

- [ ] **Step 2: Add route**

Modify `apps/web/app/routes/core.ts` inside the project settings layout:

```ts
route(
  ":workspaceSlug/settings/projects/:projectId/fields",
  "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/fields/page.tsx"
),
```

- [ ] **Step 3: Add page**

Create `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/fields/page.tsx`:

```tsx
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { ProjectFieldsSettingsRoot } from "@/components/project-fields/settings/root";

const ProjectFieldsSettingsPage = observer(function ProjectFieldsSettingsPage() {
  const { workspaceSlug, projectId } = useParams();
  if (!workspaceSlug || !projectId) return null;

  return <ProjectFieldsSettingsRoot workspaceSlug={workspaceSlug} projectId={projectId} />;
});

export default ProjectFieldsSettingsPage;
```

Create `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/fields/header.tsx`:

```tsx
import { PROJECT_SETTINGS_ICONS } from "@/components/settings/project/sidebar/item-icon";

export const ProjectFieldsSettingsHeader = () => {
  const Icon = PROJECT_SETTINGS_ICONS.fields;
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      <h3 className="text-lg font-medium text-primary">Fields</h3>
    </div>
  );
};
```

- [ ] **Step 4: Add settings root**

Create `apps/web/core/components/project-fields/settings/root.tsx`:

```tsx
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/ui";
import type { TProjectIssueField } from "@plane/types";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";
import { DisabledProjectFields } from "./disabled-fields";
import { ProjectFieldFormModal } from "./field-form-modal";
import { ProjectFieldRow } from "./field-row";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const ProjectFieldsSettingsRoot = observer(function ProjectFieldsSettingsRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const store = useProjectIssueFields();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<TProjectIssueField | undefined>();
  const key = store.projectKey(workspaceSlug, projectId);
  const fields = store.fieldsByProject.get(key) ?? [];
  const disabledFields = store.disabledFieldsByProject.get(key) ?? [];

  useEffect(() => {
    store.getFields(workspaceSlug, projectId);
    store.getDisabledFields(workspaceSlug, projectId);
  }, [projectId, store, workspaceSlug]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-primary">Fields</h3>
        <Button size="sm" onClick={() => setIsModalOpen(true)}>
          Add field
        </Button>
      </div>
      <div className="divide-y divide-subtle rounded border border-subtle">
        {fields.map((field) => (
          <ProjectFieldRow
            key={field.id}
            field={field}
            onEdit={() => setEditingField(field)}
            onDisable={() => store.updateField(workspaceSlug, projectId, field.id, { is_disabled: true })}
          />
        ))}
      </div>
      <DisabledProjectFields workspaceSlug={workspaceSlug} projectId={projectId} fields={disabledFields} />
      <ProjectFieldFormModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        field={editingField}
        isOpen={isModalOpen || !!editingField}
        onClose={() => {
          setIsModalOpen(false);
          setEditingField(undefined);
        }}
      />
    </div>
  );
});
```

- [ ] **Step 5: Add row, disabled list, and modal components**

Create simple components that call the store methods:

```tsx
// field-row.tsx
import type { TProjectIssueField } from "@plane/types";
import { Button } from "@plane/ui";

type Props = {
  field: TProjectIssueField;
  onEdit: () => void;
  onDisable: () => void;
};

export const ProjectFieldRow = ({ field, onEdit, onDisable }: Props) => (
  <div className="flex items-center justify-between px-4 py-3">
    <div>
      <div className="text-sm font-medium text-primary">{field.name}</div>
      <div className="text-xs text-secondary">{field.field_type}</div>
    </div>
    <div className="flex gap-2">
      <Button variant="neutral-primary" size="sm" onClick={onEdit}>
        Edit
      </Button>
      <Button variant="danger" size="sm" onClick={onDisable}>
        Disable
      </Button>
    </div>
  </div>
);
```

```tsx
// disabled-fields.tsx
import type { TProjectIssueField } from "@plane/types";
import { Button } from "@plane/ui";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

type Props = {
  workspaceSlug: string;
  projectId: string;
  fields: TProjectIssueField[];
};

export const DisabledProjectFields = ({ workspaceSlug, projectId, fields }: Props) => {
  const store = useProjectIssueFields();

  if (fields.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-medium text-primary">Disabled fields</h4>
      <div className="divide-y divide-subtle rounded border border-subtle">
        {fields.map((field) => (
          <div key={field.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-secondary">{field.name}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => store.updateField(workspaceSlug, projectId, field.id, { is_disabled: false })}
              >
                Restore
              </Button>
              <Button variant="danger" size="sm" onClick={() => store.deleteField(workspaceSlug, projectId, field.id)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

```tsx
// field-form-modal.tsx
import { useEffect, useState } from "react";
import { EProjectIssueFieldType, type TProjectIssueField } from "@plane/types";
import { Button, ModalCore } from "@plane/ui";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

type Props = {
  workspaceSlug: string;
  projectId: string;
  field?: TProjectIssueField;
  isOpen: boolean;
  onClose: () => void;
};

export const ProjectFieldFormModal = ({ workspaceSlug, projectId, field, isOpen, onClose }: Props) => {
  const store = useProjectIssueFields();
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState(EProjectIssueFieldType.PLAIN_TEXT);

  useEffect(() => {
    setName(field?.name ?? "");
    setFieldType(field?.field_type ?? EProjectIssueFieldType.PLAIN_TEXT);
  }, [field]);

  const submit = async () => {
    if (field) await store.updateField(workspaceSlug, projectId, field.id, { name });
    else await store.createField(workspaceSlug, projectId, { name, field_type: fieldType });
    onClose();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose}>
      <div className="flex w-full max-w-md flex-col gap-4 p-5">
        <h3 className="text-lg font-medium text-primary">{field ? "Edit field" : "Add field"}</h3>
        <input
          className="rounded border border-subtle px-3 py-2"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {!field && (
          <select
            className="rounded border border-subtle px-3 py-2"
            value={fieldType}
            onChange={(event) => setFieldType(event.target.value as EProjectIssueFieldType)}
          >
            {Object.values(EProjectIssueFieldType).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="neutral-primary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};
```

- [ ] **Step 6: Run frontend checks**

Run:

```bash
pnpm check:types
pnpm check:lint
```

Expected: no type or lint errors from the settings page.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/web/app apps/web/core/components/project-fields packages/types/src/settings.ts packages/constants/src/settings/project.ts apps/web/core/components/settings/project/sidebar/item-icon.tsx
git commit -m "feat: add project fields settings page"
```

---

### Task 9: Work Item Field Value Editors

**Files:**

- Create: `apps/web/core/components/project-fields/value-editors/root.tsx`
- Create: `apps/web/core/components/project-fields/value-editors/text-select.tsx`
- Create: `apps/web/core/components/project-fields/value-editors/member-select.tsx`
- Create: `apps/web/core/components/project-fields/value-editors/date.tsx`
- Create: `apps/web/core/components/project-fields/value-editors/date-range.tsx`
- Create: `apps/web/core/components/project-fields/value-editors/plain-text.tsx`
- Modify: `apps/web/ce/components/issues/issue-modal/modal-additional-properties.tsx`
- Modify: `apps/web/ce/components/issues/issue-details/additional-properties.tsx`
- Modify: `apps/web/core/components/issues/issue-modal/form.tsx`

- [ ] **Step 1: Add editor root**

Create `apps/web/core/components/project-fields/value-editors/root.tsx`:

```tsx
import {
  EProjectIssueFieldType,
  type TIssueFieldValue,
  type TIssueFieldValues,
  type TProjectIssueField,
} from "@plane/types";
import { DateFieldEditor } from "./date";
import { DateRangeFieldEditor } from "./date-range";
import { MemberFieldEditor } from "./member-select";
import { PlainTextFieldEditor } from "./plain-text";
import { TextSelectFieldEditor } from "./text-select";

type Props = {
  fields: TProjectIssueField[];
  values: TIssueFieldValues;
  disabled?: boolean;
  onChange: (fieldId: string, value: TIssueFieldValue) => void;
};

export const ProjectFieldValueEditors = ({ fields, values, disabled, onChange }: Props) => (
  <div className="flex flex-col gap-3">
    {fields.map((field) => {
      const value = values[field.id] ?? null;
      if (
        field.field_type === EProjectIssueFieldType.SINGLE_SELECT ||
        field.field_type === EProjectIssueFieldType.MULTI_SELECT
      )
        return (
          <TextSelectFieldEditor
            key={field.id}
            field={field}
            value={value}
            disabled={disabled}
            onChange={(nextValue) => onChange(field.id, nextValue)}
          />
        );
      if (
        field.field_type === EProjectIssueFieldType.SINGLE_MEMBER ||
        field.field_type === EProjectIssueFieldType.MULTI_MEMBER
      )
        return (
          <MemberFieldEditor
            key={field.id}
            field={field}
            value={value}
            disabled={disabled}
            onChange={(nextValue) => onChange(field.id, nextValue)}
          />
        );
      if (field.field_type === EProjectIssueFieldType.DATE)
        return (
          <DateFieldEditor
            key={field.id}
            field={field}
            value={value}
            disabled={disabled}
            onChange={(nextValue) => onChange(field.id, nextValue)}
          />
        );
      if (field.field_type === EProjectIssueFieldType.DATE_RANGE)
        return (
          <DateRangeFieldEditor
            key={field.id}
            field={field}
            value={value}
            disabled={disabled}
            onChange={(nextValue) => onChange(field.id, nextValue)}
          />
        );
      return (
        <PlainTextFieldEditor
          key={field.id}
          field={field}
          value={value}
          disabled={disabled}
          onChange={(nextValue) => onChange(field.id, nextValue)}
        />
      );
    })}
  </div>
);
```

- [ ] **Step 2: Add simple editors**

Add `plain-text.tsx`:

```tsx
import type { TIssueFieldValue, TProjectIssueField } from "@plane/types";

type Props = {
  field: TProjectIssueField;
  value: TIssueFieldValue;
  disabled?: boolean;
  onChange: (value: TIssueFieldValue) => void;
};

export const PlainTextFieldEditor = ({ field, value, disabled, onChange }: Props) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-medium text-secondary">{field.name}</span>
    <input
      className="rounded border border-subtle px-3 py-2 text-sm"
      disabled={disabled}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);
```

Add `date.tsx`:

```tsx
import type { TIssueFieldValue, TProjectIssueField } from "@plane/types";

type Props = {
  field: TProjectIssueField;
  value: TIssueFieldValue;
  disabled?: boolean;
  onChange: (value: TIssueFieldValue) => void;
};

export const DateFieldEditor = ({ field, value, disabled, onChange }: Props) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-medium text-secondary">{field.name}</span>
    <input
      type="date"
      className="rounded border border-subtle px-3 py-2 text-sm"
      disabled={disabled}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value || null)}
    />
  </label>
);
```

Add `date-range.tsx`:

```tsx
import type { TIssueFieldDateRangeValue, TIssueFieldValue, TProjectIssueField } from "@plane/types";

type Props = {
  field: TProjectIssueField;
  value: TIssueFieldValue;
  disabled?: boolean;
  onChange: (value: TIssueFieldValue) => void;
};

const normalize = (value: TIssueFieldValue): TIssueFieldDateRangeValue => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return { start: null, end: null };
};

export const DateRangeFieldEditor = ({ field, value, disabled, onChange }: Props) => {
  const normalized = normalize(value);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-secondary">{field.name}</span>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          className="rounded border border-subtle px-3 py-2 text-sm"
          disabled={disabled}
          value={normalized.start ?? ""}
          onChange={(event) => onChange({ ...normalized, start: event.target.value || null })}
        />
        <input
          type="date"
          className="rounded border border-subtle px-3 py-2 text-sm"
          disabled={disabled}
          value={normalized.end ?? ""}
          onChange={(event) => onChange({ ...normalized, end: event.target.value || null })}
        />
      </div>
    </label>
  );
};
```

Add `text-select.tsx` and `member-select.tsx` with native controls first; replace with Plane dropdowns in a polish task:

```tsx
import { EProjectIssueFieldType, type TIssueFieldValue, type TProjectIssueField } from "@plane/types";

type Props = {
  field: TProjectIssueField;
  value: TIssueFieldValue;
  disabled?: boolean;
  onChange: (value: TIssueFieldValue) => void;
};

export const TextSelectFieldEditor = ({ field, value, disabled, onChange }: Props) => {
  const isMulti = field.field_type === EProjectIssueFieldType.MULTI_SELECT;
  const selectedValues = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-secondary">{field.name}</span>
      <select
        multiple={isMulti}
        className="rounded border border-subtle px-3 py-2 text-sm"
        disabled={disabled}
        value={isMulti ? selectedValues : (selectedValues[0] ?? "")}
        onChange={(event) => {
          const nextValues = Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
          onChange(isMulti ? nextValues : nextValues[0] || null);
        }}
      >
        {!isMulti && <option value="">None</option>}
        {field.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.value}
          </option>
        ))}
      </select>
    </label>
  );
};
```

```tsx
import type { TIssueFieldValue, TProjectIssueField } from "@plane/types";

type Props = {
  field: TProjectIssueField;
  value: TIssueFieldValue;
  disabled?: boolean;
  onChange: (value: TIssueFieldValue) => void;
};

export const MemberFieldEditor = ({ field, value, disabled, onChange }: Props) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-medium text-secondary">{field.name}</span>
    <input
      className="rounded border border-subtle px-3 py-2 text-sm"
      disabled={disabled}
      value={Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value ? event.target.value.split(",") : null)}
    />
  </label>
);
```

- [ ] **Step 3: Wire CE modal additional properties**

Modify `apps/web/ce/components/issues/issue-modal/modal-additional-properties.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { TIssueFieldValue, TIssueFieldValues } from "@plane/types";
import { ProjectFieldValueEditors } from "@/components/project-fields/value-editors/root";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

export type TWorkItemModalAdditionalPropertiesProps = {
  isDraft?: boolean;
  projectId: string | null;
  workItemId: string | undefined;
  workspaceSlug: string;
  values?: TIssueFieldValues;
  onChange?: (fieldId: string, value: TIssueFieldValue) => void;
};

export function WorkItemModalAdditionalProperties(props: TWorkItemModalAdditionalPropertiesProps) {
  const { projectId, workItemId, workspaceSlug, values: controlledValues, onChange } = props;
  const store = useProjectIssueFields();
  const [values, setValues] = useState<TIssueFieldValues>({});

  useEffect(() => {
    if (projectId) store.getFields(workspaceSlug, projectId);
  }, [projectId, store, workspaceSlug]);

  if (!projectId) return null;

  const key = store.projectKey(workspaceSlug, projectId);
  const fields = store.fieldsByProject.get(key) ?? [];

  return (
    <ProjectFieldValueEditors
      fields={fields}
      values={controlledValues ?? values}
      onChange={(fieldId, value) => {
        const nextValues = { ...(controlledValues ?? values), [fieldId]: value };
        setValues(nextValues);
        onChange?.(fieldId, value);
        if (workItemId) store.updateIssueValues(workspaceSlug, projectId, workItemId, { [fieldId]: value });
      }}
    />
  );
}
```

- [ ] **Step 4: Store modal field values in the issue form**

Modify `apps/web/core/components/issues/issue-modal/form.tsx` where `WorkItemModalAdditionalProperties` is rendered:

```tsx
<WorkItemModalAdditionalProperties
  isDraft={isDraft}
  workItemId={data?.id ?? data?.sourceIssueId}
  projectId={projectId}
  workspaceSlug={workspaceSlug?.toString()}
  values={watch("field_values") ?? {}}
  onChange={(fieldId, value) => {
    const currentValues = getValues("field_values") ?? {};
    setValue("field_values", { ...currentValues, [fieldId]: value }, { shouldDirty: true });
    handleFormChange(getValues());
  }}
/>
```

This makes new work item creation send `field_values` inside the normal create payload and lets existing work items keep using the immediate field value update API.

- [ ] **Step 5: Wire CE detail additional properties**

Modify `apps/web/ce/components/issues/issue-details/additional-properties.tsx`:

```tsx
import { useEffect } from "react";
import { ProjectFieldValueEditors } from "@/components/project-fields/value-editors/root";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

export function WorkItemAdditionalSidebarProperties(props: TWorkItemAdditionalSidebarProperties) {
  const { workItemId, projectId, workspaceSlug, isEditable } = props;
  const store = useProjectIssueFields();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(workItemId);

  useEffect(() => {
    store.getFields(workspaceSlug, projectId);
  }, [projectId, store, workspaceSlug]);

  const key = store.projectKey(workspaceSlug, projectId);
  const fields = store.fieldsByProject.get(key) ?? [];

  return (
    <ProjectFieldValueEditors
      fields={fields}
      values={issue?.field_values ?? {}}
      disabled={!isEditable}
      onChange={(fieldId, value) => store.updateIssueValues(workspaceSlug, projectId, workItemId, { [fieldId]: value })}
    />
  );
}
```

- [ ] **Step 6: Run frontend checks**

Run:

```bash
pnpm check:types
pnpm check:lint
```

Expected: type and lint pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/web/core/components/project-fields/value-editors apps/web/ce/components/issues/issue-modal/modal-additional-properties.tsx apps/web/ce/components/issues/issue-details/additional-properties.tsx apps/web/core/components/issues/issue-modal/form.tsx
git commit -m "feat: add work item custom field editors"
```

---

### Task 10: Custom Field Filter Configs

**Files:**

- Create: `packages/utils/src/work-item-filters/configs/filters/custom-property.ts`
- Modify: `packages/utils/src/work-item-filters/configs/filters/index.ts`
- Modify: `apps/web/core/hooks/work-item-filters/use-work-item-filters-config.tsx`
- Modify: `packages/shared-state/src/store/work-item-filters/adapter.ts`

- [ ] **Step 1: Add utility config factory**

Create `packages/utils/src/work-item-filters/configs/filters/custom-property.ts`:

```ts
import type { TFilterProperty, TProjectIssueField } from "@plane/types";
import { EProjectIssueFieldType } from "@plane/types";
import type { TCreateFilterConfig, TCreateFilterConfigParams } from "../../../rich-filters";
import {
  createFilterConfig,
  getDatePickerConfig,
  getDateRangePickerConfig,
  getMultiSelectConfig,
  getTextInputConfig,
} from "../../../rich-filters";

export type TCreateCustomPropertyFilterParams = TCreateFilterConfigParams & {
  field: TProjectIssueField;
};

export const getCustomPropertyFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateCustomPropertyFilterParams> =>
  (params) => {
    const { field } = params;
    const operatorConfig =
      field.field_type === EProjectIssueFieldType.DATE
        ? getDatePickerConfig(params)
        : field.field_type === EProjectIssueFieldType.DATE_RANGE
          ? getDateRangePickerConfig(params)
          : field.field_type === EProjectIssueFieldType.PLAIN_TEXT
            ? getTextInputConfig(params)
            : getMultiSelectConfig(
                {
                  items: field.options,
                  getId: (option) => option.id,
                  getLabel: (option) => option.value,
                  getValue: (option) => option.id,
                },
                params,
                params
              );

    return createFilterConfig<P>({
      id: key,
      label: field.name,
      ...params,
      supportedOperatorConfigsMap: operatorConfig instanceof Map ? operatorConfig : new Map(),
    });
  };
```

- [ ] **Step 2: Export factory**

Modify `packages/utils/src/work-item-filters/configs/filters/index.ts`:

```ts
export * from "./custom-property";
```

- [ ] **Step 3: Load fields in filter config hook**

Modify `apps/web/core/hooks/work-item-filters/use-work-item-filters-config.tsx`:

```tsx
import { getCustomPropertyFilterConfig } from "@plane/utils";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

const { fieldsByProject, projectKey } = useProjectIssueFields();
const customFields = projectId ? (fieldsByProject.get(projectKey(workspaceSlug, projectId)) ?? []) : [];

const customFieldFilterConfigs = useMemo(
  () =>
    customFields.map((field) =>
      getCustomPropertyFilterConfig<TWorkItemFilterProperty>(`customproperty_${field.id}`)({
        isEnabled: isFilterEnabled(`customproperty_${field.id}`),
        field,
        filterIcon: TextIcon,
        ...operatorConfigs,
      })
    ),
  [customFields, isFilterEnabled, operatorConfigs]
);
```

Append `customFieldFilterConfigs` to returned `configs` and `configMap`:

```ts
configs: [
  stateFilterConfig,
  subStateFilterConfig,
  stateGroupFilterConfig,
  assigneeFilterConfig,
  priorityFilterConfig,
  projectFilterConfig,
  mentionFilterConfig,
  labelFilterConfig,
  cycleFilterConfig,
  moduleFilterConfig,
  startDateFilterConfig,
  targetDateFilterConfig,
  createdAtFilterConfig,
  updatedAtFilterConfig,
  createdByFilterConfig,
  subscriberFilterConfig,
  ...customFieldFilterConfigs,
],
configMap: {
  project_id: projectFilterConfig,
  state_group: stateGroupFilterConfig,
  state_id: stateFilterConfig,
  sub_state_id: subStateFilterConfig,
  label_id: labelFilterConfig,
  cycle_id: cycleFilterConfig,
  module_id: moduleFilterConfig,
  assignee_id: assigneeFilterConfig,
  mention_id: mentionFilterConfig,
  created_by_id: createdByFilterConfig,
  subscriber_id: subscriberFilterConfig,
  priority: priorityFilterConfig,
  start_date: startDateFilterConfig,
  target_date: targetDateFilterConfig,
  created_at: createdAtFilterConfig,
  updated_at: updatedAtFilterConfig,
  ...Object.fromEntries(customFieldFilterConfigs.map((config) => [config.id, config])),
},
```

- [ ] **Step 4: Tighten adapter validation**

Modify `packages/shared-state/src/store/work-item-filters/adapter.ts`:

```ts
const isCustomProperty = property.startsWith("customproperty_") && property.length > "customproperty_".length;
if (!WORK_ITEM_FILTER_PROPERTY_KEYS.includes(property as any) && !isCustomProperty) {
  return false;
}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm check:types
```

Expected: TypeScript passes. If `getTextInputConfig` does not exist, add it beside the other rich-filter input config helpers before re-running.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/utils/src/work-item-filters packages/shared-state/src/store/work-item-filters/adapter.ts apps/web/core/hooks/work-item-filters/use-work-item-filters-config.tsx
git commit -m "feat: add custom field filter configs"
```

---

### Task 11: Display Properties, Layout Cards, and Spreadsheet Columns

**Files:**

- Modify: `apps/web/ce/components/issues/issue-layouts/additional-properties.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/spreadsheet/spreadsheet-header.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/spreadsheet/issue-row.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/spreadsheet/issue-column.tsx`

- [ ] **Step 1: Render custom fields on layout cards**

Modify `apps/web/ce/components/issues/issue-layouts/additional-properties.tsx`:

```tsx
import { observer } from "mobx-react";
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
import { ProjectFieldValueEditors } from "@/components/project-fields/value-editors/root";
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

export type TWorkItemLayoutAdditionalProperties = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
};

export const WorkItemLayoutAdditionalProperties = observer(function WorkItemLayoutAdditionalProperties(
  props: TWorkItemLayoutAdditionalProperties
) {
  const { displayProperties, issue } = props;
  const store = useProjectIssueFields();
  if (!issue.project_id) return null;

  const matchingKey = Array.from(store.fieldsByProject.keys()).find((key) => key.endsWith(`:${issue.project_id}`));
  const fields = matchingKey ? (store.fieldsByProject.get(matchingKey) ?? []) : [];
  const visibleFields = fields.filter(
    (field) => displayProperties[`customproperty_${field.id}` as keyof IIssueDisplayProperties]
  );

  return (
    <ProjectFieldValueEditors
      fields={visibleFields}
      values={issue.field_values ?? {}}
      disabled
      onChange={() => undefined}
    />
  );
});
```

- [ ] **Step 2: Add custom fields to display properties menu**

Modify `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx`:

```tsx
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

const { fieldsByProject, projectKey } = useProjectIssueFields();
const customFields = projectId ? (fieldsByProject.get(projectKey(workspaceSlug, projectId)) ?? []) : [];

const customDisplayProperties = customFields.map((field) => ({
  key: `customproperty_${field.id}`,
  title: field.name,
}));
```

Render `customDisplayProperties` after system properties using the same toggle component used by existing display properties.

- [ ] **Step 3: Add spreadsheet dynamic columns**

Modify `apps/web/core/components/issues/issue-layouts/spreadsheet/spreadsheet-header.tsx`:

```tsx
const customColumns = customFields
  .filter((field) => displayProperties[`customproperty_${field.id}` as keyof IIssueDisplayProperties])
  .map((field) => `customproperty_${field.id}`);
const spreadsheetColumnsList = [...systemColumnsList, ...customColumns];
```

Modify `apps/web/core/components/issues/issue-layouts/spreadsheet/issue-column.tsx`:

```tsx
if (property.startsWith("customproperty_")) {
  const fieldId = property.replace("customproperty_", "");
  const field = customFields.find((item) => item.id === fieldId);
  if (!field) return null;
  return (
    <ProjectFieldValueEditors
      fields={[field]}
      values={issueDetail.field_values ?? {}}
      onChange={(changedFieldId, value) => updateIssue(issueDetail, { field_values: { [changedFieldId]: value } })}
    />
  );
}
```

- [ ] **Step 4: Add sorting keys for date and plain text fields**

When building spreadsheet header menu options, include:

```ts
const customSortableFields = customFields.filter((field) =>
  [EProjectIssueFieldType.DATE, EProjectIssueFieldType.PLAIN_TEXT].includes(field.field_type)
);
```

Use `customproperty_<field_id>` and `-customproperty_<field_id>` as order keys.

- [ ] **Step 5: Run frontend checks**

Run:

```bash
pnpm check:types
pnpm check:lint
```

Expected: spreadsheet and display property changes pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/web/ce/components/issues/issue-layouts/additional-properties.tsx apps/web/core/components/issues/issue-layouts
git commit -m "feat: show custom fields in issue layouts"
```

---

### Task 12: Final Verification and Cleanup

**Files:**

- Modify files from previous tasks only if verification finds issues.

- [ ] **Step 1: Run backend project issue field tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_issue_fields_app.py apps/api/plane/tests/unit/filters/test_project_issue_field_filters.py -q
```

Expected: all project issue field tests pass.

- [ ] **Step 2: Run broader backend unit subset**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest -m unit -q
```

Expected: unit subset passes.

- [ ] **Step 3: Run frontend checks**

Run:

```bash
pnpm check:types
pnpm check:lint
```

Expected: typecheck and lint pass.

- [ ] **Step 4: Run formatting**

Run:

```bash
pnpm fix:format
```

Expected: formatter completes without errors.

- [ ] **Step 5: Inspect diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only project issue field implementation files are modified.

- [ ] **Step 6: Commit verification fixes**

If verification changed files, run:

```bash
git add apps packages
git commit -m "fix: polish project issue fields implementation"
```

If verification did not change files, record that no final commit was needed in the implementation summary.

---

## Spec Coverage Checklist

- Project-level fields for all work items: Tasks 1, 2, 3, 4.
- Field types: Tasks 1, 3, 6, 9, 10.
- Disable, restore, hard delete: Tasks 1, 2, 8.
- Inline option creation and deletion: Tasks 2, 7, 9.
- Option deletion cleanup: Task 2.
- Project-member-only member fields: Task 3.
- Existing date semantics: Tasks 3, 9.
- Rich filters: Tasks 5, 10.
- Display properties and views: Tasks 10, 11.
- Grouping and sorting boundaries: Tasks 5, 11.
- Spreadsheet columns and editing: Task 11.
- Tests and verification: Tasks 1 through 12.
