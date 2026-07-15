# Module Custom Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independent module-scoped custom fields for work items, including management in the module edit form, module-context filters/display/grouping, source-module saved views, detail-page editors, and confirmed deletion of values when an issue leaves a module.

**Architecture:** Reuse the established project custom field contract where it helps, but keep module field definitions and values in independent models keyed by `module_id`. Backend services enforce module visibility and issue-module membership; frontend stores load module fields only in module-aware contexts and keep module values separate from project `field_values`.

**Tech Stack:** Django, Django REST Framework, PostgreSQL, pytest, Next.js/React, MobX, TypeScript, Plane rich filters, pnpm, OxLint/oxfmt.

---

## Reference Documents

- Spec: `docs/superpowers/specs/2026-07-09-module-custom-fields-design.md`
- Existing project field model/service/API: `apps/api/plane/db/models/issue_field.py`, `apps/api/plane/app/services/issue_field.py`, `apps/api/plane/app/views/issue_field.py`
- Existing project field frontend store/components: `apps/web/core/store/project/project-issue-field.store.ts`, `apps/web/core/components/project-fields`
- Module visibility helper: `apps/api/plane/db/utils/module_visibility.py`
- Backend test guide: `apps/api/tests/RUNNING_TESTS.md`
- Repo commands: `AGENTS.md`

## File Structure

Backend models, services, and routes:

- Modify `apps/api/plane/db/models/issue_field.py`: add module-scoped field, option, value, value option, and value user models below the project field models.
- Modify `apps/api/plane/db/models/__init__.py`: export new module field models.
- Create migration `apps/api/plane/db/migrations/0126_module_issue_fields.py`.
- Create `apps/api/plane/app/services/module_issue_field.py`: module field value validation, serialization, attachment helpers, and cleanup helpers.
- Modify `apps/api/plane/app/serializers/issue_field.py`: add module field and option serializers.
- Modify `apps/api/plane/app/serializers/__init__.py`: export module field serializers.
- Modify `apps/api/plane/app/views/issue_field.py`: add module field/option/value endpoints.
- Modify `apps/api/plane/app/views/__init__.py`: export module field views.
- Modify `apps/api/plane/app/urls/module.py`: register module field routes.
- Modify `apps/api/plane/app/views/module/issue.py`: attach module field values to module issue lists and enforce confirmed cleanup on module removal.
- Modify `apps/api/plane/app/views/issue/base.py`: attach visible module field metadata and values to issue detail/list responses used by work item details.

Backend filtering, grouping, and saved views:

- Modify `apps/api/plane/utils/filters/filterset.py`: add `modulecustomproperty` filter placeholder.
- Modify `apps/api/plane/utils/filters/filter_backend.py`: parse and build `modulecustomproperty_<id>__<operator>` Q objects.
- Modify `apps/api/plane/utils/grouper.py`: resolve, annotate, and list group values for module custom fields.
- Modify `apps/api/plane/app/views/view/base.py`: use `IssueView.source_module` as module field context for project view issues.
- Modify `apps/api/plane/db/models/view.py`: add nullable `source_module`.
- Modify `apps/api/plane/app/serializers/view.py`: expose writable `source_module`.

Backend tests:

- Create `apps/api/plane/tests/contract/app/test_module_issue_fields_app.py`.
- Create `apps/api/plane/tests/unit/filters/test_module_issue_field_filters.py`.

Shared frontend types and filter utilities:

- Modify `packages/types/src/issues/issue-fields.ts`: add module field id/key/value map types while retaining project field types.
- Modify `packages/types/src/issues/issue.ts`: add `module_field_values`.
- Modify `packages/types/src/view-props.ts`: include `modulecustomproperty_${string}` in work item filter/display property types.
- Modify `packages/utils/src/work-item-filters/configs/filters/custom-property.ts`: accept a configurable key prefix or add a module-specific config wrapper.
- Modify `packages/utils/src/work-item/base.ts`: preserve module custom display properties when computing display props.
- Modify `packages/constants/src/issue/filter.ts`: allow `modulecustomproperty_` in project-scoped module/view layouts.

Frontend data layer:

- Create `apps/web/core/services/module/issue-field.service.ts`.
- Modify `apps/web/core/services/module/index.ts`: export the service.
- Create `apps/web/core/store/module/module-issue-field.store.ts`.
- Modify `apps/web/core/store/root.store.ts`: expose module issue fields on `CoreRootStore`.
- Create `apps/web/core/hooks/store/use-module-issue-fields.ts`.
- Modify `apps/web/core/hooks/work-item-filters/use-work-item-filters-config.tsx`: load current/source module fields and register module custom filter configs.

Frontend UI:

- Modify `apps/web/core/components/modules/form.tsx`: render module field management at the bottom.
- Create `apps/web/core/components/module-fields/settings/root.tsx`.
- Create `apps/web/core/components/module-fields/settings/field-row.tsx`.
- Create `apps/web/core/components/module-fields/settings/field-form-modal.tsx`.
- Create `apps/web/core/components/module-fields/settings/disabled-fields.tsx`.
- Modify or wrap `apps/web/core/components/project-fields/value-editors/*`: support module field option create/delete with the module field store.
- Modify display filters in `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx`.
- Modify spreadsheet columns in `apps/web/core/components/issues/issue-layouts/spreadsheet/*`.
- Modify `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/group-by.tsx` and `sub-group-by.tsx` if their option source requires dynamic module field labels.
- Create `apps/web/core/components/issues/issue-detail/module-fields/root.tsx`.
- Modify `apps/web/core/components/issues/issue-detail/main-content.tsx`: insert module field section before `IssueActivity`.
- Modify module removal call sites under `apps/web/core/store/issue` and UI components that remove modules: pass the confirmation flag after user confirmation.
- Modify `apps/web/core/components/views/form.tsx` and project view creation flow: include `source_module` when creating a view from a module page.

Validation:

- Backend: run focused Docker pytest files after backend tasks.
- Frontend: run focused `pnpm check:types` or package-specific typecheck after TypeScript tasks.
- Final: run `pnpm check:types` and the backend focused test suite. Run `pnpm check:lint` if frontend files changed substantially.

---

### Task 1: Backend Models And Migration

**Files:**

- Modify: `apps/api/plane/db/models/issue_field.py`
- Modify: `apps/api/plane/db/models/__init__.py`
- Create: `apps/api/plane/db/migrations/0126_module_issue_fields.py`
- Test: `apps/api/plane/tests/contract/app/test_module_issue_fields_app.py`

- [ ] **Step 1: Write failing model tests**

Create `apps/api/plane/tests/contract/app/test_module_issue_fields_app.py` with this initial test block:

```python
import pytest

from plane.db.models import (
    Issue,
    Module,
    ModuleIssue,
    ModuleIssueField,
    ModuleIssueFieldOption,
    ModuleIssueFieldValue,
    ModuleIssueFieldValueOption,
)


pytestmark = pytest.mark.django_db


def create_issue_in_module(workspace, project, module, name="Issue with module field"):
    issue = Issue.objects.create(workspace=workspace, project=project, name=name)
    ModuleIssue.objects.create(workspace=workspace, project=project, module=module, issue=issue)
    return issue


def test_module_issue_field_defaults(workspace, project):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")

    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )

    assert field.module_id == module.id
    assert field.field_type == ModuleIssueField.FieldType.SINGLE_SELECT
    assert field.is_disabled is False
    assert field.disabled_at is None


def test_module_issue_field_names_are_unique_per_module(workspace, project):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    other_module = Module.objects.create(workspace=workspace, project=project, name="Growth")
    ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )

    ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=other_module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )

    with pytest.raises(Exception):
        ModuleIssueField.objects.create(
            workspace=workspace,
            project=project,
            module=module,
            name="Risk",
            field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
        )


def test_module_field_hard_delete_erases_options_and_values(workspace, project):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    option = ModuleIssueFieldOption.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        field=field,
        value="High",
    )
    value = ModuleIssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
        field=field,
    )
    ModuleIssueFieldValueOption.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        value=value,
        option=option,
    )

    field.delete()

    assert not ModuleIssueField.objects.filter(pk=field.pk).exists()
    assert not ModuleIssueFieldOption.objects.filter(pk=option.pk).exists()
    assert not ModuleIssueFieldValue.objects.filter(pk=value.pk).exists()
    assert not ModuleIssueFieldValueOption.objects.filter(value_id=value.id).exists()
```

- [ ] **Step 2: Run tests and confirm imports fail**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_module_issue_fields_app.py -q
```

Expected: FAIL because `ModuleIssueField` and related models are not importable.

- [ ] **Step 3: Add module field models**

In `apps/api/plane/db/models/issue_field.py`, append module-scoped models. Reuse `_add_update_fields` and `_full_clean_issue_field_model` from the same file:

```python
class ModuleIssueField(BaseModel):
    class FieldType(models.TextChoices):
        SINGLE_SELECT = "single_select", "Single-select text"
        MULTI_SELECT = "multi_select", "Multi-select text"
        SINGLE_MEMBER = "single_member", "Single-select member"
        MULTI_MEMBER = "multi_member", "Multi-select member"
        DATE = "date", "Date"
        DATE_RANGE = "date_range", "Date range"
        PLAIN_TEXT = "plain_text", "Plain text"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="module_issue_fields")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="module_issue_fields")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="issue_fields")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    field_type = models.CharField(max_length=32, choices=FieldType.choices)
    sort_order = models.FloatField(default=65535)
    is_disabled = models.BooleanField(default=False)
    disabled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "module_issue_fields"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["module", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="module_issue_field_unique_module_name_when_not_deleted",
            )
        ]

    def save(self, *args, **kwargs):
        if self.module_id:
            if self.project_id != self.module.project_id:
                self.project_id = self.module.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != self.module.workspace_id:
                self.workspace_id = self.module.workspace_id
                _add_update_fields(kwargs, "workspace")
        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class ModuleIssueFieldOption(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="module_issue_field_options")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="module_issue_field_options")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="issue_field_options")
    field = models.ForeignKey(ModuleIssueField, on_delete=models.CASCADE, related_name="options")
    value = models.CharField(max_length=255)
    sort_order = models.FloatField(default=65535)

    class Meta:
        db_table = "module_issue_field_options"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["field", "value"],
                condition=models.Q(deleted_at__isnull=True),
                name="module_issue_field_option_unique_field_value_when_not_deleted",
            )
        ]

    def save(self, *args, **kwargs):
        if self.field_id:
            field = self.field
            if self.module_id != field.module_id:
                self.module_id = field.module_id
                _add_update_fields(kwargs, "module")
            if self.project_id != field.project_id:
                self.project_id = field.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != field.workspace_id:
                self.workspace_id = field.workspace_id
                _add_update_fields(kwargs, "workspace")
        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)
```

Add value models after the option model:

```python
class ModuleIssueFieldValue(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="module_issue_field_values")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="module_issue_field_values")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="issue_field_values")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="module_field_value_rows")
    field = models.ForeignKey(ModuleIssueField, on_delete=models.CASCADE, related_name="issue_values")
    text_value = models.TextField(blank=True, null=True)
    date_value = models.DateField(null=True, blank=True)
    date_range_start = models.DateField(null=True, blank=True)
    date_range_end = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "module_issue_field_values"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "field"],
                condition=models.Q(deleted_at__isnull=True),
                name="module_issue_field_value_unique_issue_field_when_not_deleted",
            )
        ]

    def clean(self):
        errors = {}
        if self.issue_id and self.field_id:
            issue = self.issue
            field = self.field
            if issue.project_id != field.project_id:
                errors["field"] = "Field must belong to the issue project."
            if issue.workspace_id != field.workspace_id:
                errors["field"] = "Field must belong to the issue workspace."
            if self.module_id and self.module_id != field.module_id:
                errors["module"] = "Module must match the field module."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.issue_id:
            issue = self.issue
            if self.project_id != issue.project_id:
                self.project_id = issue.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != issue.workspace_id:
                self.workspace_id = issue.workspace_id
                _add_update_fields(kwargs, "workspace")
        if self.field_id and self.module_id != self.field.module_id:
            self.module_id = self.field.module_id
            _add_update_fields(kwargs, "module")
        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class ModuleIssueFieldValueOption(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="module_issue_field_value_options")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="module_issue_field_value_options")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="module_issue_field_value_options")
    value = models.ForeignKey(ModuleIssueFieldValue, on_delete=models.CASCADE, related_name="selected_options")
    option = models.ForeignKey(ModuleIssueFieldOption, on_delete=models.CASCADE, related_name="selected_values")

    class Meta:
        db_table = "module_issue_field_value_options"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["value", "option"],
                condition=models.Q(deleted_at__isnull=True),
                name="module_issue_field_value_option_unique_value_option_when_not_deleted",
            )
        ]


class ModuleIssueFieldValueUser(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="module_issue_field_value_users")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="module_issue_field_value_users")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="module_issue_field_value_users")
    value = models.ForeignKey(ModuleIssueFieldValue, on_delete=models.CASCADE, related_name="selected_users")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="module_issue_field_values")

    class Meta:
        db_table = "module_issue_field_value_users"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["value", "user"],
                condition=models.Q(deleted_at__isnull=True),
                name="module_issue_field_value_user_unique_value_user_when_not_deleted",
            )
        ]
```

At the top of `issue_field.py`, ensure `ValidationError` is still imported:

```python
from django.core.exceptions import ValidationError
```

- [ ] **Step 4: Export new models**

In `apps/api/plane/db/models/__init__.py`, add the new model names to the existing import from `.issue_field`:

```python
from .issue_field import (
    IssueFieldValue,
    IssueFieldValueOption,
    IssueFieldValueUser,
    ModuleIssueField,
    ModuleIssueFieldOption,
    ModuleIssueFieldValue,
    ModuleIssueFieldValueOption,
    ModuleIssueFieldValueUser,
    ProjectIssueField,
    ProjectIssueFieldOption,
)
```

- [ ] **Step 5: Add migration**

Create `apps/api/plane/db/migrations/0126_module_issue_fields.py` by running:

```bash
cd apps/api
python manage.py makemigrations db --name module_issue_fields
```

Then inspect the migration and verify it creates five tables with the `db_table` names from Step 3 and depends on migration `0125_module_visibility`.

- [ ] **Step 6: Run model tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_module_issue_fields_app.py -q
```

Expected: the model tests from Step 1 pass.

- [ ] **Step 7: Commit backend models**

Run:

```bash
git add apps/api/plane/db/models/issue_field.py apps/api/plane/db/models/__init__.py apps/api/plane/db/migrations/0126_module_issue_fields.py apps/api/plane/tests/contract/app/test_module_issue_fields_app.py
git commit -m "feat: add module issue field models"
```

---

### Task 2: Backend Service, Serializers, And CRUD APIs

**Files:**

- Create: `apps/api/plane/app/services/module_issue_field.py`
- Modify: `apps/api/plane/app/serializers/issue_field.py`
- Modify: `apps/api/plane/app/serializers/__init__.py`
- Modify: `apps/api/plane/app/views/issue_field.py`
- Modify: `apps/api/plane/app/views/__init__.py`
- Modify: `apps/api/plane/app/urls/module.py`
- Test: `apps/api/plane/tests/contract/app/test_module_issue_fields_app.py`

- [ ] **Step 1: Add failing CRUD and value API tests**

Append these tests to `apps/api/plane/tests/contract/app/test_module_issue_fields_app.py`:

```python
from rest_framework import status

from plane.db.models import ProjectMember


def test_module_field_crud_api(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    api_client.force_authenticate(project_member)

    create_response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issue-fields/",
        {"name": "Risk", "field_type": ModuleIssueField.FieldType.SINGLE_SELECT},
        format="json",
    )

    assert create_response.status_code == status.HTTP_201_CREATED
    field_id = create_response.data["id"]
    assert create_response.data["module"] == str(module.id)

    option_response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issue-fields/{field_id}/options/",
        {"value": "High"},
        format="json",
    )

    assert option_response.status_code == status.HTTP_201_CREATED
    assert option_response.data["value"] == "High"

    list_response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issue-fields/"
    )

    assert list_response.status_code == status.HTTP_200_OK
    assert list_response.data[0]["options"][0]["value"] == "High"


def test_module_field_value_update_requires_issue_in_module(api_client, workspace, project, issue, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    api_client.force_authenticate(project_member)

    response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/{issue.id}/field-values/",
        {"field_values": {str(field.id): "High"}},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "module" in str(response.data).lower()


def test_module_field_value_update_serializes_values(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    api_client.force_authenticate(project_member)

    response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/{issue.id}/field-values/",
        {"field_values": {str(field.id): "Needs QA"}},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["module_field_values"][str(module.id)][str(field.id)] == "Needs QA"
```

- [ ] **Step 2: Run tests and confirm endpoint failures**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_module_issue_fields_app.py -q
```

Expected: FAIL with 404s for the new module field routes or import errors for the missing service/serializers.

- [ ] **Step 3: Add serializers**

In `apps/api/plane/app/serializers/issue_field.py`, add module serializers below the project serializers:

```python
from plane.db.models import ModuleIssueField, ModuleIssueFieldOption, ProjectIssueField, ProjectIssueFieldOption


class ModuleIssueFieldOptionSerializer(BaseSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ModuleIssueFieldOption
        fields = ["id", "value", "sort_order", "field", "module", "project", "workspace", "created_at", "updated_at"]
        read_only_fields = ["id", "field", "module", "project", "workspace", "created_at", "updated_at"]

    def validate_value(self, value):
        if not value.strip():
            raise serializers.ValidationError("Option value is required")
        return value.strip()


class ModuleIssueFieldSerializer(BaseSerializer):
    id = serializers.UUIDField(read_only=True)
    options = ModuleIssueFieldOptionSerializer(many=True, read_only=True)

    class Meta:
        model = ModuleIssueField
        fields = [
            "id",
            "name",
            "description",
            "field_type",
            "sort_order",
            "is_disabled",
            "disabled_at",
            "options",
            "module",
            "project",
            "workspace",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "disabled_at", "module", "project", "workspace", "created_at", "updated_at", "options"]

    def validate_field_type(self, value):
        if self.instance and value != self.instance.field_type:
            raise serializers.ValidationError("Field type cannot be changed")
        return value

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Field name is required")
        module_id = self.instance.module_id if self.instance else self.context.get("module_id")
        if module_id:
            fields = ModuleIssueField.objects.filter(module_id=module_id, name=name)
            if self.instance:
                fields = fields.exclude(pk=self.instance.pk)
            if fields.exists():
                raise serializers.ValidationError("Field name already exists")
        return name

    def create(self, validated_data):
        validated_data["is_disabled"] = False
        validated_data["disabled_at"] = None
        return super().create(validated_data)

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

In `apps/api/plane/app/serializers/__init__.py`, extend the existing issue field export:

```python
from .issue_field import (
    ModuleIssueFieldOptionSerializer,
    ModuleIssueFieldSerializer,
    ProjectIssueFieldOptionSerializer,
    ProjectIssueFieldSerializer,
)
```

- [ ] **Step 5: Add module field service**

Create `apps/api/plane/app/services/module_issue_field.py` with this public surface:

```python
from django.db import transaction
from rest_framework import serializers

from plane.app.services.issue_field import IssueFieldValueService
from plane.db.models import ModuleIssue, ModuleIssueField, ModuleIssueFieldValue, ModuleIssueFieldValueOption, ModuleIssueFieldValueUser, ModuleIssueFieldOption, ProjectMember


class ModuleIssueFieldValueService(IssueFieldValueService):
    value_model = ModuleIssueFieldValue
    option_value_model = ModuleIssueFieldValueOption
    user_value_model = ModuleIssueFieldValueUser
    field_model = ModuleIssueField
    option_model = ModuleIssueFieldOption

    @classmethod
    def serialize_values(cls, issue_ids, module_ids=None):
        values = cls.value_model.objects.filter(issue_id__in=issue_ids, field__is_disabled=False).select_related("field", "module").prefetch_related("selected_options", "selected_users")
        if module_ids is not None:
            values = values.filter(module_id__in=module_ids)

        serialized = {str(issue_id): {} for issue_id in issue_ids}
        for value in values:
            issue_values = serialized.setdefault(str(value.issue_id), {})
            module_values = issue_values.setdefault(str(value.module_id), {})
            module_values[str(value.field_id)] = cls._serialize_value(value)
        return serialized

    @classmethod
    def serialize_issue_value_map(cls, issue_id, module_ids=None):
        return cls.serialize_values([issue_id], module_ids=module_ids).get(str(issue_id), {})

    @classmethod
    def attach_module_field_values_to_issue_dicts(cls, issue_dicts, module_ids=None):
        issue_ids = [issue_dict.get("id") for issue_dict in issue_dicts if issue_dict.get("id") is not None]
        values_by_issue_id = cls.serialize_values(issue_ids, module_ids=module_ids)
        for issue_dict in issue_dicts:
            issue_id = issue_dict.get("id")
            issue_dict["module_field_values"] = values_by_issue_id.get(str(issue_id), {}) if issue_id is not None else {}
        return issue_dicts

    @classmethod
    @transaction.atomic
    def update_issue_values(cls, issue, module, raw_values):
        if raw_values is None:
            return
        if not ModuleIssue.objects.filter(issue=issue, module=module, deleted_at__isnull=True).exists():
            raise serializers.ValidationError({"module": "Issue must belong to the module."})
        if not isinstance(raw_values, dict):
            raise serializers.ValidationError({"field_values": "Expected an object keyed by field id."})

        normalized_values = {
            cls._normalize_id(field_id, f"Field {field_id} is not valid."): submitted_value
            for field_id, submitted_value in raw_values.items()
        }
        fields = {
            str(field.id): field
            for field in cls.field_model.objects.filter(
                module=module,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                id__in=normalized_values.keys(),
            )
        }

        for field_id, submitted_value in normalized_values.items():
            field = fields.get(field_id)
            if field is None:
                raise serializers.ValidationError({"field_values": f"Field {field_id} is not valid."})
            if field.is_disabled:
                raise serializers.ValidationError({"field_values": f"Field {field_id} is disabled."})
            cls._validate_submitted_value(field, submitted_value)
            cls._upsert_value(issue, module, field, submitted_value)

    @classmethod
    def _upsert_value(cls, issue, module, field, submitted_value):
        if submitted_value is None:
            cls.value_model.objects.filter(issue=issue, module=module, field=field).delete(soft=False)
            return None
        value, _ = cls.value_model.objects.get_or_create(
            issue=issue,
            module=module,
            field=field,
            defaults={"workspace_id": issue.workspace_id, "project_id": issue.project_id},
        )
        cls._clear_value(value)
        return cls._write_typed_value(value, field, submitted_value)

    @classmethod
    def _write_typed_value(cls, value, field, submitted_value):
        field_type = field.field_type
        if field_type == cls.field_model.FieldType.SINGLE_SELECT:
            option = cls._get_option(field, submitted_value)
            cls.option_value_model.objects.create(
                workspace_id=value.workspace_id,
                project_id=value.project_id,
                module_id=value.module_id,
                value=value,
                option=option,
            )
        elif field_type == cls.field_model.FieldType.MULTI_SELECT:
            options = cls._get_options(field, submitted_value)
            cls.option_value_model.objects.bulk_create(
                [
                    cls.option_value_model(
                        workspace_id=value.workspace_id,
                        project_id=value.project_id,
                        module_id=value.module_id,
                        value=value,
                        option=option,
                    )
                    for option in options
                ],
                batch_size=10,
            )
        elif field_type == cls.field_model.FieldType.SINGLE_MEMBER:
            user_id = cls._get_member_id(field, submitted_value)
            cls.user_value_model.objects.create(
                workspace_id=value.workspace_id,
                project_id=value.project_id,
                module_id=value.module_id,
                value=value,
                user_id=user_id,
            )
        elif field_type == cls.field_model.FieldType.MULTI_MEMBER:
            user_ids = cls._get_member_ids(field, submitted_value)
            cls.user_value_model.objects.bulk_create(
                [
                    cls.user_value_model(
                        workspace_id=value.workspace_id,
                        project_id=value.project_id,
                        module_id=value.module_id,
                        value=value,
                        user_id=user_id,
                    )
                    for user_id in user_ids
                ],
                batch_size=10,
            )
        elif field_type == cls.field_model.FieldType.DATE:
            value.date_value = cls._parse_date(submitted_value)
            value.save(update_fields=["date_value", "updated_at"])
        elif field_type == cls.field_model.FieldType.DATE_RANGE:
            start, end = cls._parse_date_range(submitted_value)
            value.date_range_start = start
            value.date_range_end = end
            value.save(update_fields=["date_range_start", "date_range_end", "updated_at"])
        elif field_type == cls.field_model.FieldType.PLAIN_TEXT:
            if not isinstance(submitted_value, str):
                raise serializers.ValidationError({"field_values": "Text field value must be a string."})
            value.text_value = submitted_value
            value.save(update_fields=["text_value", "updated_at"])
        else:
            raise serializers.ValidationError({"field_values": "Field type is not supported."})
        return value

    @classmethod
    def _get_option(cls, field, option_id):
        option_id = cls._normalize_id(option_id, "Option is not valid for the field.")
        option = cls.option_model.objects.filter(field=field, id=option_id).first()
        if option is None:
            raise serializers.ValidationError({"field_values": "Option is not valid for the field."})
        return option

    @classmethod
    def _get_options(cls, field, option_ids):
        option_ids = cls._ensure_list(option_ids)
        unique_option_ids = list(
            dict.fromkeys(
                [
                    cls._normalize_id(option_id, "One or more options are not valid for the field.")
                    for option_id in option_ids
                ]
            )
        )
        options = list(cls.option_model.objects.filter(field=field, id__in=unique_option_ids))
        if len(options) != len(unique_option_ids):
            raise serializers.ValidationError({"field_values": "One or more options are not valid for the field."})
        return options

    @classmethod
    def _get_member_id(cls, field, user_id):
        user_id = cls._normalize_id(user_id, "User is not an active project member.")
        if not ProjectMember.objects.filter(project=field.project, member_id=user_id, is_active=True).exists():
            raise serializers.ValidationError({"field_values": "User is not an active project member."})
        return user_id

    @classmethod
    def _get_member_ids(cls, field, user_ids):
        user_ids = cls._ensure_list(user_ids)
        unique_user_ids = list(
            dict.fromkeys(
                [
                    cls._normalize_id(user_id, "One or more users are not active project members.")
                    for user_id in user_ids
                ]
            )
        )
        valid_user_ids = set(
            str(user_id)
            for user_id in ProjectMember.objects.filter(
                project=field.project,
                member_id__in=unique_user_ids,
                is_active=True,
            ).values_list("member_id", flat=True)
        )
        if len(valid_user_ids) != len(unique_user_ids):
            raise serializers.ValidationError({"field_values": "One or more users are not active project members."})
        return unique_user_ids
```

- [ ] **Step 6: Add API views**

In `apps/api/plane/app/views/issue_field.py`, import module serializers, service, module models, and visibility helper:

```python
from plane.app.serializers import ModuleIssueFieldOptionSerializer, ModuleIssueFieldSerializer, ProjectIssueFieldOptionSerializer, ProjectIssueFieldSerializer
from plane.app.services.module_issue_field import ModuleIssueFieldValueService
from plane.db.models import Issue, IssueFieldValueOption, Module, ModuleIssueField, ModuleIssueFieldOption, ModuleIssueFieldValueOption, ProjectIssueField, ProjectIssueFieldOption
from plane.db.utils.module_visibility import filter_visible_modules
```

Add these view classes:

```python
MODULE_TEXT_OPTION_FIELD_TYPES = {
    ModuleIssueField.FieldType.SINGLE_SELECT,
    ModuleIssueField.FieldType.MULTI_SELECT,
}


class ModuleIssueFieldViewSet(BaseViewSet):
    serializer_class = ModuleIssueFieldSerializer

    def _get_module(self, slug, project_id, module_id):
        return filter_visible_modules(
            Module.objects.filter(workspace__slug=slug, project_id=project_id, pk=module_id),
            self.request.user,
        ).get()

    def get_queryset(self):
        return (
            ModuleIssueField.objects.filter(
                workspace__slug=self.kwargs["slug"],
                project_id=self.kwargs["project_id"],
                module_id=self.kwargs["module_id"],
            )
            .prefetch_related("options")
            .order_by("sort_order", "created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, module_id):
        self._get_module(slug, project_id, module_id)
        fields = self.get_queryset().filter(is_disabled=False)
        return Response(self.serializer_class(fields, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, module_id):
        module = self._get_module(slug, project_id, module_id)
        serializer = self.serializer_class(data=request.data, context={"module_id": module_id})
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace_id=module.workspace_id, project_id=module.project_id, module=module)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, module_id, pk=None):
        self._get_module(slug, project_id, module_id)
        field = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(field, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, module_id, pk=None):
        self._get_module(slug, project_id, module_id)
        field = self.get_queryset().get(pk=pk)
        if not field.is_disabled:
            return Response({"error": "Disable the field before deleting it"}, status=status.HTTP_400_BAD_REQUEST)
        field.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

Add disabled, option, and value endpoints:

```python
class DisabledModuleIssueFieldsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, module_id):
        module = filter_visible_modules(
            Module.objects.filter(workspace__slug=slug, project_id=project_id, pk=module_id),
            request.user,
        ).get()
        fields = ModuleIssueField.objects.filter(module=module, is_disabled=True).prefetch_related("options")
        return Response(ModuleIssueFieldSerializer(fields, many=True).data, status=status.HTTP_200_OK)


class ModuleIssueFieldOptionViewSet(BaseViewSet):
    serializer_class = ModuleIssueFieldOptionSerializer

    def _get_field(self, slug, project_id, module_id, field_id):
        module = filter_visible_modules(
            Module.objects.filter(workspace__slug=slug, project_id=project_id, pk=module_id),
            self.request.user,
        ).get()
        return ModuleIssueField.objects.get(module=module, pk=field_id, is_disabled=False)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, module_id, field_id):
        field = self._get_field(slug, project_id, module_id, field_id)
        if field.field_type not in MODULE_TEXT_OPTION_FIELD_TYPES:
            return Response({"error": "Options are only supported for text select fields"}, status=status.HTTP_400_BAD_REQUEST)
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace_id=field.workspace_id, project_id=field.project_id, module_id=field.module_id, field=field)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, module_id, field_id, pk=None):
        field = self._get_field(slug, project_id, module_id, field_id)
        option = ModuleIssueFieldOption.objects.get(field=field, pk=pk)
        with transaction.atomic():
            ModuleIssueFieldValueOption.objects.filter(option=option).delete(soft=False)
            option.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ModuleIssueFieldValueEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], creator=True, model=Issue)
    def patch(self, request, slug, project_id, module_id, issue_id):
        module = filter_visible_modules(
            Module.objects.filter(workspace__slug=slug, project_id=project_id, pk=module_id),
            request.user,
        ).get()
        issue = Issue.objects.get(workspace__slug=slug, project_id=project_id, pk=issue_id)
        raw_values = request.data.get("field_values", request.data)
        with transaction.atomic():
            ModuleIssueFieldValueService.update_issue_values(issue, module, raw_values)
        return Response(
            {"module_field_values": ModuleIssueFieldValueService.serialize_issue_value_map(issue.id, module_ids=[module.id])},
            status=status.HTTP_200_OK,
        )
```

- [ ] **Step 7: Export views and register routes**

In `apps/api/plane/app/views/__init__.py`, export:

```python
from .issue_field import (
    DisabledModuleIssueFieldsEndpoint,
    DisabledProjectIssueFieldsEndpoint,
    IssueFieldValueEndpoint,
    ModuleIssueFieldOptionViewSet,
    ModuleIssueFieldValueEndpoint,
    ModuleIssueFieldViewSet,
    ProjectIssueFieldOptionViewSet,
    ProjectIssueFieldViewSet,
)
```

In `apps/api/plane/app/urls/module.py`, import the new views and add routes before `module-links`:

```python
path(
    "workspaces/<str:slug>/projects/<uuid:project_id>/modules/<uuid:module_id>/issue-fields/",
    ModuleIssueFieldViewSet.as_view({"get": "list", "post": "create"}),
    name="module-issue-fields",
),
path(
    "workspaces/<str:slug>/projects/<uuid:project_id>/modules/<uuid:module_id>/issue-fields/disabled/",
    DisabledModuleIssueFieldsEndpoint.as_view(),
    name="module-issue-fields-disabled",
),
path(
    "workspaces/<str:slug>/projects/<uuid:project_id>/modules/<uuid:module_id>/issue-fields/<uuid:pk>/",
    ModuleIssueFieldViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
    name="module-issue-fields",
),
path(
    "workspaces/<str:slug>/projects/<uuid:project_id>/modules/<uuid:module_id>/issue-fields/<uuid:field_id>/options/",
    ModuleIssueFieldOptionViewSet.as_view({"post": "create"}),
    name="module-issue-field-options",
),
path(
    "workspaces/<str:slug>/projects/<uuid:project_id>/modules/<uuid:module_id>/issue-fields/<uuid:field_id>/options/<uuid:pk>/",
    ModuleIssueFieldOptionViewSet.as_view({"delete": "destroy"}),
    name="module-issue-field-options",
),
path(
    "workspaces/<str:slug>/projects/<uuid:project_id>/modules/<uuid:module_id>/issues/<uuid:issue_id>/field-values/",
    ModuleIssueFieldValueEndpoint.as_view(),
    name="module-issue-field-values",
),
```

- [ ] **Step 8: Run API tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_module_issue_fields_app.py -q
```

Expected: all tests in that file pass.

- [ ] **Step 9: Commit CRUD APIs**

Run:

```bash
git add apps/api/plane/app/services/module_issue_field.py apps/api/plane/app/serializers/issue_field.py apps/api/plane/app/serializers/__init__.py apps/api/plane/app/views/issue_field.py apps/api/plane/app/views/__init__.py apps/api/plane/app/urls/module.py apps/api/plane/tests/contract/app/test_module_issue_fields_app.py
git commit -m "feat: add module issue field APIs"
```

---

### Task 3: Module Field Values In Issue Responses And Module Removal Cleanup

**Files:**

- Modify: `apps/api/plane/app/services/module_issue_field.py`
- Modify: `apps/api/plane/app/views/module/issue.py`
- Modify: `apps/api/plane/app/views/issue/base.py`
- Test: `apps/api/plane/tests/contract/app/test_module_issue_fields_app.py`

- [ ] **Step 1: Add failing response and cleanup tests**

Append:

```python
def test_module_issue_list_includes_module_field_values(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    ModuleIssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
        field=field,
        text_value="Needs QA",
    )
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/"
    )

    assert response.status_code == status.HTTP_200_OK
    first_issue = response.data["results"][0] if "results" in response.data else response.data[0]
    assert first_issue["module_field_values"][str(module.id)][str(field.id)] == "Needs QA"


def test_remove_issue_from_module_requires_confirmation_when_values_exist(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    ModuleIssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
        field=field,
        text_value="Delete me",
    )
    api_client.force_authenticate(project_member)

    response = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/{issue.id}/"
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert ModuleIssue.objects.filter(module=module, issue=issue).exists()
    assert ModuleIssueFieldValue.objects.filter(module=module, issue=issue).exists()


def test_confirmed_remove_issue_from_module_deletes_values(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    ModuleIssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
        field=field,
        text_value="Delete me",
    )
    api_client.force_authenticate(project_member)

    response = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/{issue.id}/",
        {"delete_module_field_values_confirmed": True},
        format="json",
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not ModuleIssue.objects.filter(module=module, issue=issue).exists()
    assert not ModuleIssueFieldValue.objects.filter(module=module, issue=issue).exists()
```

- [ ] **Step 2: Run tests and confirm failures**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_module_issue_fields_app.py -q
```

Expected: FAIL because lists do not include `module_field_values` and delete does not require confirmation.

- [ ] **Step 3: Add cleanup helpers**

In `apps/api/plane/app/services/module_issue_field.py`, add:

```python
    @classmethod
    def has_values_for_issue_module(cls, issue_id, module_id):
        return cls.value_model.objects.filter(issue_id=issue_id, module_id=module_id).exists()

    @classmethod
    def delete_values_for_issue_module(cls, issue_id, module_id):
        cls.value_model.objects.filter(issue_id=issue_id, module_id=module_id).delete(soft=False)
```

- [ ] **Step 4: Attach module field values in module issue list**

In `apps/api/plane/app/views/module/issue.py`, import the module service:

```python
from plane.app.services.module_issue_field import ModuleIssueFieldValueService
```

Update `attach_field_values_with_visible_modules` so it attaches both project and module field values:

```python
    def attach_field_values_with_visible_modules(self, issues, group_by, sub_group_by, slug, project_id, user):
        visible_module_ids = self.visible_module_ids(slug, project_id, user)
        issue_results = issue_on_results(group_by=group_by, issues=issues, sub_group_by=sub_group_by)
        for issue in issue_results:
            issue["module_ids"] = [
                module_id for module_id in issue.get("module_ids", []) if str(module_id) in visible_module_ids
            ]
        issue_results = IssueFieldValueService.attach_field_values_to_issue_dicts(issue_results)
        return ModuleIssueFieldValueService.attach_module_field_values_to_issue_dicts(
            issue_results,
            module_ids=[self.kwargs.get("module_id")],
        )
```

For each non-grouped paginator branch in `ModuleIssueViewSet.list`, use this helper instead of calling `IssueFieldValueService.attach_field_values_to_issue_dicts` directly:

```python
on_results=lambda issues: self.attach_field_values_with_visible_modules(
    issues,
    group_by,
    sub_group_by,
    slug,
    project_id,
    request.user,
)
```

If the branch is not grouped, `group_by` and `sub_group_by` will already be `None` after normalization; pass those local variables unchanged.

- [ ] **Step 5: Enforce confirmed cleanup in module issue destroy**

In `apps/api/plane/app/views/module/issue.py`, find the `destroy` method. Before deleting the `ModuleIssue`, add:

```python
        confirmation = request.data.get("delete_module_field_values_confirmed") in (True, "true", "True", "1", 1)
        if ModuleIssueFieldValueService.has_values_for_issue_module(issue_id=issue_id, module_id=module_id) and not confirmation:
            return Response(
                {"error": "Removing this work item from the module will delete module custom field values."},
                status=status.HTTP_400_BAD_REQUEST,
            )
```

Wrap value deletion and relation deletion in one transaction:

```python
        with transaction.atomic():
            ModuleIssueFieldValueService.delete_values_for_issue_module(issue_id=issue_id, module_id=module_id)
            module_issue.delete()
```

If the method currently performs activity logging, keep the logging after the transaction succeeds.

- [ ] **Step 6: Attach visible module field values to issue detail responses**

In `apps/api/plane/app/views/issue/base.py`, import:

```python
from plane.app.services.module_issue_field import ModuleIssueFieldValueService
from plane.db.utils.module_visibility import filter_visible_module_relations
```

Add a helper near existing project field attachment logic:

```python
def attach_visible_module_field_values(issue_dicts, user):
    issue_ids = [issue_dict.get("id") for issue_dict in issue_dicts if issue_dict.get("id")]
    if not issue_ids:
        return issue_dicts
    visible_module_ids = set(
        filter_visible_module_relations(
            ModuleIssue.objects.filter(issue_id__in=issue_ids, deleted_at__isnull=True),
            user,
        ).values_list("module_id", flat=True)
    )
    return ModuleIssueFieldValueService.attach_module_field_values_to_issue_dicts(
        issue_dicts,
        module_ids=list(visible_module_ids),
    )
```

Where issue list/detail responses already call `IssueFieldValueService.attach_field_values_to_issue_dicts` or `attach_field_values_to_issue_dict`, call the module helper immediately afterward:

```python
issues = IssueFieldValueService.attach_field_values_to_issue_dicts(issues)
issues = attach_visible_module_field_values(issues, request.user)
```

For a single issue:

```python
issue_data = IssueFieldValueService.attach_field_values_to_issue_dict(issue_data)
issue_data = attach_visible_module_field_values([issue_data], request.user)[0]
```

- [ ] **Step 7: Run tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_module_issue_fields_app.py -q
```

Expected: PASS.

- [ ] **Step 8: Commit response and cleanup behavior**

Run:

```bash
git add apps/api/plane/app/services/module_issue_field.py apps/api/plane/app/views/module/issue.py apps/api/plane/app/views/issue/base.py apps/api/plane/tests/contract/app/test_module_issue_fields_app.py
git commit -m "feat: attach module field values to issues"
```

---

### Task 4: Module Field Filtering, Grouping, And Saved View Context

**Files:**

- Modify: `apps/api/plane/db/models/view.py`
- Create: migration for `IssueView.source_module`
- Modify: `apps/api/plane/app/serializers/view.py`
- Modify: `apps/api/plane/utils/filters/filterset.py`
- Modify: `apps/api/plane/utils/filters/filter_backend.py`
- Modify: `apps/api/plane/utils/grouper.py`
- Modify: `apps/api/plane/app/views/module/issue.py`
- Modify: `apps/api/plane/app/views/view/base.py`
- Test: `apps/api/plane/tests/unit/filters/test_module_issue_field_filters.py`

- [ ] **Step 1: Write failing filter and grouping tests**

Create `apps/api/plane/tests/unit/filters/test_module_issue_field_filters.py`:

```python
import json

import pytest
from rest_framework import status

from plane.db.models import Issue, IssueView, Module, ModuleIssue, ModuleIssueField, ModuleIssueFieldOption, ModuleIssueFieldValue, ModuleIssueFieldValueOption


pytestmark = pytest.mark.django_db


def create_issue_with_module_value(workspace, project, module, field, option=None, text_value=None):
    issue = Issue.objects.create(workspace=workspace, project=project, name="Issue")
    ModuleIssue.objects.create(workspace=workspace, project=project, module=module, issue=issue)
    value = ModuleIssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
        field=field,
        text_value=text_value,
    )
    if option:
        ModuleIssueFieldValueOption.objects.create(
            workspace=workspace,
            project=project,
            module=module,
            value=value,
            option=option,
        )
    return issue


def test_module_custom_property_filter_works_in_module_context(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    high = ModuleIssueFieldOption.objects.create(workspace=workspace, project=project, module=module, field=field, value="High")
    matching_issue = create_issue_with_module_value(workspace, project, module, field, option=high)
    other_issue = Issue.objects.create(workspace=workspace, project=project, name="Other")
    ModuleIssue.objects.create(workspace=workspace, project=project, module=module, issue=other_issue)
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/",
        {"filters": json.dumps({f"modulecustomproperty_{field.id}__in": str(high.id)})},
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert [str(issue["id"]) for issue in results] == [str(matching_issue.id)]


def test_module_custom_property_filter_outside_module_context_returns_empty(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    create_issue_with_module_value(workspace, project, module, field, text_value="Only in module")
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"filters": json.dumps({f"modulecustomproperty_{field.id}__contains": "Only"})},
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert len(results) == 0


def test_module_custom_property_grouping(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    high = ModuleIssueFieldOption.objects.create(workspace=workspace, project=project, module=module, field=field, value="High")
    create_issue_with_module_value(workspace, project, module, field, option=high)
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/",
        {"group_by": f"modulecustomproperty_{field.id}"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert str(high.id) in str(response.data)


def test_project_view_uses_source_module_context(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    issue = create_issue_with_module_value(workspace, project, module, field, text_value="Visible in source view")
    view = IssueView.objects.create(
        workspace=workspace,
        project=project,
        owned_by=project_member,
        name="Module View",
        filters={},
        rich_filters={f"modulecustomproperty_{field.id}__contains": "Visible"},
        source_module=module,
    )
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/views/{view.id}/issues/",
        {"filters": json.dumps(view.rich_filters)},
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert [str(row["id"]) for row in results] == [str(issue.id)]
```

- [ ] **Step 2: Run tests and confirm failures**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/unit/filters/test_module_issue_field_filters.py -q
```

Expected: FAIL because `source_module` and `modulecustomproperty` parsing do not exist.

- [ ] **Step 3: Add `IssueView.source_module`**

In `apps/api/plane/db/models/view.py`, add:

```python
    source_module = models.ForeignKey(
        "db.Module",
        on_delete=models.SET_NULL,
        related_name="source_views",
        null=True,
        blank=True,
    )
```

Create migration:

```bash
cd apps/api
python manage.py makemigrations db --name issue_view_source_module
```

In `apps/api/plane/app/serializers/view.py`, ensure `source_module` is writable by not adding it to `read_only_fields`.

- [ ] **Step 4: Add filterset placeholder**

In `apps/api/plane/utils/filters/filterset.py`, add below `customproperty`:

```python
    modulecustomproperty = filters.CharFilter(method="filter_modulecustomproperty")
```

Add method:

```python
    def filter_modulecustomproperty(self, queryset, name, value):
        return Q()
```

- [ ] **Step 5: Extend filter backend parsing**

In `apps/api/plane/utils/filters/filter_backend.py`, add:

```python
MODULE_CUSTOM_PROPERTY_PREFIX = "modulecustomproperty_"
```

Update `_transform_field_name_for_validation`:

```python
        if self._parse_module_custom_property_filter_key(field_name) is not None:
            return "modulecustomproperty"
```

Add parse and context helpers:

```python
    def _parse_module_custom_property_filter_key(self, field_name):
        if not isinstance(field_name, str) or not field_name.startswith(MODULE_CUSTOM_PROPERTY_PREFIX):
            return None
        raw_key = field_name[len(MODULE_CUSTOM_PROPERTY_PREFIX):]
        field_id, separator, operator = raw_key.partition("__")
        operator = operator if separator else "exact"
        try:
            UUID(str(field_id))
        except (AttributeError, TypeError, ValueError):
            return field_id, operator, False
        return field_id, operator, True

    def _module_custom_property_context_module_id(self, view):
        kwargs = getattr(view, "kwargs", {})
        if kwargs.get("module_id"):
            return kwargs.get("module_id")
        issue_view = getattr(view, "issue_view", None)
        if issue_view and issue_view.source_module_id:
            return issue_view.source_module_id
        return None
```

At the top of `_build_leaf_q`, call `_build_module_custom_property_q` before `_build_custom_property_q`:

```python
            module_custom_filter = self._build_module_custom_property_q(key, value, view)
            if module_custom_filter is not None:
                custom_q &= module_custom_filter
                continue
```

Implement `_build_module_custom_property_q`:

```python
    def _build_module_custom_property_q(self, field_name, value, view):
        parsed = self._parse_module_custom_property_filter_key(field_name)
        if parsed is None:
            return None

        field_id, operator, is_valid_uuid = parsed
        if not is_valid_uuid:
            return Q(pk__in=[])

        context_module_id = self._module_custom_property_context_module_id(view)
        if context_module_id is None:
            return Q(pk__in=[])

        from plane.db.models import ModuleIssueField

        project_id = getattr(view, "kwargs", {}).get("project_id")
        slug = getattr(view, "kwargs", {}).get("slug")
        field_filters = {
            "id": field_id,
            "is_disabled": False,
            "project_id": project_id,
            "module_id": context_module_id,
        }
        if slug:
            field_filters["workspace__slug"] = slug

        field = ModuleIssueField.objects.filter(**field_filters).first()
        if field is None:
            return Q(pk__in=[])

        base_q = Q(
            module_field_value_rows__field_id=field.id,
            module_field_value_rows__module_id=context_module_id,
            module_field_value_rows__deleted_at__isnull=True,
        )
        field_type = field.field_type

        if field_type == ModuleIssueField.FieldType.PLAIN_TEXT:
            return self._build_module_plain_text_custom_property_q(base_q, operator, value)
        if field_type in (ModuleIssueField.FieldType.SINGLE_SELECT, ModuleIssueField.FieldType.MULTI_SELECT):
            return self._build_module_option_custom_property_q(field.id, context_module_id, operator, value)
        if field_type in (ModuleIssueField.FieldType.SINGLE_MEMBER, ModuleIssueField.FieldType.MULTI_MEMBER):
            return self._build_module_member_custom_property_q(field.id, context_module_id, operator, value)
        if field_type == ModuleIssueField.FieldType.DATE:
            return self._build_module_date_custom_property_q(base_q, operator, value)
        if field_type == ModuleIssueField.FieldType.DATE_RANGE:
            return self._build_module_date_range_custom_property_q(base_q, operator, value)

        return Q(pk__in=[])
```

Add module-specific plain text/date/date range helpers by using the existing project helper bodies with these exact lookup prefixes:

```text
field_value_rows__text_value -> module_field_value_rows__text_value
field_value_rows__date_value -> module_field_value_rows__date_value
field_value_rows__date_range_start -> module_field_value_rows__date_range_start
field_value_rows__date_range_end -> module_field_value_rows__date_range_end
```

Add option and member helpers:

```python
    def _build_module_option_custom_property_q(self, field_id, module_id, operator, value):
        from plane.db.models import ModuleIssueFieldValueOption

        if operator not in ("exact", "in", "contains_any", "not_exact", "not_in", "not_contains_any", "is_empty", "is_not_empty"):
            self._raise_unsupported_custom_filter_operator(operator)

        selected_options = ModuleIssueFieldValueOption.objects.filter(
            value__issue_id=OuterRef("pk"),
            value__module_id=module_id,
            value__field_id=field_id,
            value__deleted_at__isnull=True,
            deleted_at__isnull=True,
            option__deleted_at__isnull=True,
        )
        if operator in ("exact", "in", "contains_any"):
            values = self._ensure_uuid_list_value(value)
            return Exists(selected_options.filter(option_id__in=values))
        if operator in ("not_exact", "not_in", "not_contains_any"):
            values = self._ensure_uuid_list_value(value)
            return ~Exists(selected_options.filter(option_id__in=values))
        if operator == "is_empty":
            return ~Exists(selected_options)
        if operator == "is_not_empty":
            return Exists(selected_options)
        return Q(pk__in=[])

    def _build_module_member_custom_property_q(self, field_id, module_id, operator, value):
        from plane.db.models import ModuleIssueFieldValueUser

        if operator not in ("exact", "in", "contains_any", "not_exact", "not_in", "not_contains_any", "is_empty", "is_not_empty"):
            self._raise_unsupported_custom_filter_operator(operator)

        selected_users = ModuleIssueFieldValueUser.objects.filter(
            value__issue_id=OuterRef("pk"),
            value__module_id=module_id,
            value__field_id=field_id,
            value__deleted_at__isnull=True,
            deleted_at__isnull=True,
        )
        if operator in ("exact", "in", "contains_any"):
            values = self._ensure_uuid_list_value(value)
            return Exists(selected_users.filter(user_id__in=values))
        if operator in ("not_exact", "not_in", "not_contains_any"):
            values = self._ensure_uuid_list_value(value)
            return ~Exists(selected_users.filter(user_id__in=values))
        if operator == "is_empty":
            return ~Exists(selected_users)
        if operator == "is_not_empty":
            return Exists(selected_users)
        return Q(pk__in=[])
```

- [ ] **Step 6: Extend grouping**

In `apps/api/plane/utils/grouper.py`, add:

```python
MODULE_CUSTOM_PROPERTY_PREFIX = "modulecustomproperty_"
```

Add module field parsing helpers that mirror `_custom_property_field_id`:

```python
def _module_custom_property_field_id(field: Optional[str]) -> Optional[str]:
    if not isinstance(field, str) or not field.startswith(MODULE_CUSTOM_PROPERTY_PREFIX):
        return None
    field_id = field[len(MODULE_CUSTOM_PROPERTY_PREFIX):]
    if not field_id:
        return None
    try:
        UUID(str(field_id))
    except (AttributeError, TypeError, ValueError):
        return None
    return field_id
```

Update `resolve_issue_group_by` signature to accept `module_id=None` and check module fields before returning:

```python
    is_module_custom_property = isinstance(field, str) and field.startswith(MODULE_CUSTOM_PROPERTY_PREFIX)
    if is_module_custom_property:
        if _module_custom_property_group_field(field, slug=slug, project_id=project_id, module_id=module_id) is None:
            return None
        return field
```

Add `_module_custom_property_group_field`, `_module_custom_property_group_annotation`, and `_module_custom_property_group_values`:

```python
def _module_custom_property_group_field(
    field: Optional[str],
    slug: Optional[str] = None,
    project_id: Optional[str] = None,
    module_id: Optional[str] = None,
) -> Optional[ModuleIssueField]:
    field_id = _module_custom_property_field_id(field)
    if field_id is None or project_id is None or module_id is None:
        return None
    field_filters = {"id": field_id, "is_disabled": False, "project_id": project_id, "module_id": module_id}
    if slug:
        field_filters["workspace__slug"] = slug
    field = ModuleIssueField.objects.filter(**field_filters).first()
    if field is None:
        return None
    if field.field_type not in (ModuleIssueField.FieldType.SINGLE_SELECT, ModuleIssueField.FieldType.SINGLE_MEMBER):
        return None
    return field


def _module_custom_property_group_annotation(
    field: Optional[str],
    slug: Optional[str] = None,
    project_id: Optional[str] = None,
    module_id: Optional[str] = None,
):
    module_field = _module_custom_property_group_field(field, slug=slug, project_id=project_id, module_id=module_id)
    if module_field is None:
        return None

    value_rows = ModuleIssueFieldValue.objects.filter(
        issue_id=OuterRef("pk"),
        module_id=module_id,
        field=module_field,
        deleted_at__isnull=True,
    )

    if module_field.field_type == ModuleIssueField.FieldType.SINGLE_SELECT:
        return Subquery(
            value_rows.filter(
                selected_options__deleted_at__isnull=True,
                selected_options__option__deleted_at__isnull=True,
            ).values("selected_options__option_id")[:1]
        )

    if module_field.field_type == ModuleIssueField.FieldType.SINGLE_MEMBER:
        return Subquery(
            value_rows.filter(selected_users__deleted_at__isnull=True).values("selected_users__user_id")[:1]
        )

    return None


def _module_custom_property_group_values(
    field: str,
    slug: str,
    project_id: Optional[str],
    module_id: Optional[str],
    queryset: Optional[QuerySet],
) -> Optional[List[Union[str, Any]]]:
    module_field = _module_custom_property_group_field(field, slug=slug, project_id=project_id, module_id=module_id)
    if module_field is None:
        return None

    if module_field.field_type == ModuleIssueField.FieldType.SINGLE_SELECT:
        return list(
            ModuleIssueFieldOption.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                module_id=module_id,
                field=module_field,
            ).values_list("id", flat=True)
        ) + [None]

    if module_field.field_type == ModuleIssueField.FieldType.SINGLE_MEMBER:
        return list(
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                is_active=True,
            ).values_list("member_id", flat=True)
        ) + [None]

    return []
```

Update `issue_queryset_grouper` and `issue_group_values` signatures to accept `module_id=None` and invoke module custom helpers.

- [ ] **Step 7: Pass module context in module and view issue endpoints**

In `apps/api/plane/app/views/module/issue.py`, change the group context calls to:

```python
group_by = resolve_issue_group_by(group_by, slug=slug, project_id=project_id, module_id=module_id)
sub_group_by = resolve_issue_group_by(sub_group_by, slug=slug, project_id=project_id, module_id=module_id)
issue_queryset = issue_queryset_grouper(
    queryset=issue_queryset,
    group_by=group_by,
    sub_group_by=sub_group_by,
    slug=slug,
    project_id=project_id,
    module_id=module_id,
)
group_by_fields = issue_group_values(
    field=group_by,
    slug=slug,
    project_id=project_id,
    filters=filters,
    queryset=total_issue_queryset,
    module_id=module_id,
)
```

In `apps/api/plane/app/views/view/base.py`, set `self.issue_view` before filtering project view issues:

```python
issue_view = IssueView.objects.get(pk=view_id, project_id=project_id, workspace__slug=slug)
self.issue_view = issue_view
```

Use `issue_view.source_module_id` when calling `resolve_issue_group_by`, `issue_queryset_grouper`, and `issue_group_values`.

- [ ] **Step 8: Run filter tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/unit/filters/test_module_issue_field_filters.py -q
```

Expected: PASS.

- [ ] **Step 9: Commit filter/view context**

Run:

```bash
git add apps/api/plane/db/models/view.py apps/api/plane/db/migrations/*issue_view_source_module*.py apps/api/plane/app/serializers/view.py apps/api/plane/utils/filters/filterset.py apps/api/plane/utils/filters/filter_backend.py apps/api/plane/utils/grouper.py apps/api/plane/app/views/module/issue.py apps/api/plane/app/views/view/base.py apps/api/plane/tests/unit/filters/test_module_issue_field_filters.py
git commit -m "feat: support module field filters and grouping"
```

---

### Task 5: Shared Frontend Types, Services, And Store

**Files:**

- Modify: `packages/types/src/issues/issue-fields.ts`
- Modify: `packages/types/src/issues/issue.ts`
- Modify: `packages/types/src/view-props.ts`
- Create: `apps/web/core/services/module/issue-field.service.ts`
- Modify: `apps/web/core/services/module/index.ts`
- Create: `apps/web/core/store/module/module-issue-field.store.ts`
- Modify: `apps/web/core/store/root.store.ts`
- Create: `apps/web/core/hooks/store/use-module-issue-fields.ts`

- [ ] **Step 1: Add TypeScript type tests by running typecheck first**

Run:

```bash
pnpm check:types
```

Expected before changes: current baseline may pass or fail for unrelated reasons. Record unrelated failures in the task notes before editing.

- [ ] **Step 2: Add module field types**

In `packages/types/src/issues/issue-fields.ts`, add:

```ts
export type TModuleIssueFieldId = string;
export type TModuleCustomPropertyKey = `modulecustomproperty_${TModuleIssueFieldId}`;

export type TModuleIssueFieldOption = TProjectIssueFieldOption & {
  module: string;
  field: TModuleIssueFieldId;
};

export type TModuleIssueField = Omit<TProjectIssueField, "id" | "options"> & {
  id: TModuleIssueFieldId;
  module: string;
  options: TModuleIssueFieldOption[];
};

export type TModuleIssueFieldValues = Partial<Record<TModuleIssueFieldId, TIssueFieldValue>>;
export type TIssueModuleFieldValues = Partial<Record<string, TModuleIssueFieldValues>>;

export type TModuleIssueFieldPayload = Partial<Pick<TModuleIssueField, "description" | "sort_order" | "is_disabled">> &
  Pick<TModuleIssueField, "name" | "field_type">;

export type TModuleIssueFieldUpdatePayload = Partial<TModuleIssueFieldPayload>;

export type TModuleIssueFieldValuesUpdatePayload = {
  field_values: TModuleIssueFieldValues;
};
```

- [ ] **Step 3: Add issue response type**

In `packages/types/src/issues/issue.ts`, add `TIssueModuleFieldValues` to the imports from `./issue-fields` and add:

```ts
module_field_values: TIssueModuleFieldValues;
```

to the base issue type next to `field_values`.

- [ ] **Step 4: Add dynamic property type**

In `packages/types/src/view-props.ts`, include `TModuleCustomPropertyKey` wherever `TCustomPropertyKey` is part of `TWorkItemFilterProperty` and display property keys. The resulting union must include:

```ts
| TCustomPropertyKey
| TModuleCustomPropertyKey
```

- [ ] **Step 5: Add module issue field service**

Create `apps/web/core/services/module/issue-field.service.ts`:

```ts
import { API_BASE_URL } from "@plane/constants";
import type {
  TModuleIssueField,
  TModuleIssueFieldOption,
  TModuleIssueFieldPayload,
  TModuleIssueFieldUpdatePayload,
  TModuleIssueFieldValuesUpdatePayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class ModuleIssueFieldService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string, moduleId: string): Promise<TModuleIssueField[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/`).then(
      (response) => response?.data
    );
  }

  async listDisabled(workspaceSlug: string, projectId: string, moduleId: string): Promise<TModuleIssueField[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/disabled/`
    ).then((response) => response?.data);
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    data: TModuleIssueFieldPayload
  ): Promise<TModuleIssueField> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/`,
      data
    ).then((response) => response?.data);
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    data: TModuleIssueFieldUpdatePayload
  ): Promise<TModuleIssueField> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/${fieldId}/`,
      data
    ).then((response) => response?.data);
  }

  async deleteField(workspaceSlug: string, projectId: string, moduleId: string, fieldId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/${fieldId}/`
    ).then(() => undefined);
  }

  async createOption(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    value: string
  ): Promise<TModuleIssueFieldOption> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/${fieldId}/options/`,
      { value }
    ).then((response) => response?.data);
  }

  async deleteOption(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    optionId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issue-fields/${fieldId}/options/${optionId}/`
    ).then(() => undefined);
  }

  async updateIssueValues(
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string,
    data: TModuleIssueFieldValuesUpdatePayload
  ): Promise<{ module_field_values: Record<string, TModuleIssueFieldValuesUpdatePayload["field_values"]> }> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issues/${issueId}/field-values/`,
      data
    ).then((response) => response?.data);
  }
}
```

Export it from `apps/web/core/services/module/index.ts`:

```ts
export * from "./issue-field.service";
```

- [ ] **Step 6: Add module field store**

Create `apps/web/core/store/module/module-issue-field.store.ts` with the same structure as `ProjectIssueFieldStore`, using maps keyed by module id:

```ts
import { set, sortBy } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type {
  TIssueFieldValue,
  TModuleIssueField,
  TModuleIssueFieldOption,
  TModuleIssueFieldPayload,
  TModuleIssueFieldUpdatePayload,
  TModuleIssueFieldValuesUpdatePayload,
} from "@plane/types";
import { ModuleIssueFieldService } from "@/services/module";
import type { CoreRootStore } from "@/store/root.store";

export interface IModuleIssueFieldStore {
  loader: boolean;
  fieldsLoader: Record<string, boolean>;
  disabledFieldsLoader: Record<string, boolean>;
  fieldsMap: Record<string, TModuleIssueField[]>;
  disabledFieldsMap: Record<string, TModuleIssueField[]>;
  getFieldsByModuleId: (moduleId: string) => TModuleIssueField[] | undefined;
  getDisabledFieldsByModuleId: (moduleId: string) => TModuleIssueField[] | undefined;
  getFieldById: (moduleId: string, fieldId: string) => TModuleIssueField | undefined;
  getDisabledFieldById: (moduleId: string, fieldId: string) => TModuleIssueField | undefined;
  getFields: (workspaceSlug: string, projectId: string, moduleId: string) => Promise<TModuleIssueField[]>;
  getDisabledFields: (workspaceSlug: string, projectId: string, moduleId: string) => Promise<TModuleIssueField[]>;
  createField: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    data: TModuleIssueFieldPayload
  ) => Promise<TModuleIssueField>;
  updateField: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    data: TModuleIssueFieldUpdatePayload
  ) => Promise<TModuleIssueField>;
  deleteField: (workspaceSlug: string, projectId: string, moduleId: string, fieldId: string) => Promise<void>;
  createOption: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    value: string
  ) => Promise<TModuleIssueFieldOption>;
  deleteOption: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    optionId: string
  ) => Promise<void>;
  updateIssueValues: (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string,
    data: TModuleIssueFieldValuesUpdatePayload
  ) => Promise<void>;
}

export class ModuleIssueFieldStore implements IModuleIssueFieldStore {
  loader = false;
  fieldsLoader: Record<string, boolean> = {};
  disabledFieldsLoader: Record<string, boolean> = {};
  fieldsMap: Record<string, TModuleIssueField[]> = {};
  disabledFieldsMap: Record<string, TModuleIssueField[]> = {};
  service = new ModuleIssueFieldService();

  constructor(private rootStore: CoreRootStore) {
    makeObservable(this, {
      loader: observable.ref,
      fieldsLoader: observable,
      disabledFieldsLoader: observable,
      fieldsMap: observable,
      disabledFieldsMap: observable,
      getFields: action,
      getDisabledFields: action,
      createField: action,
      updateField: action,
      deleteField: action,
      createOption: action,
      deleteOption: action,
      updateIssueValues: action,
    });
  }

  getFieldsByModuleId = computedFn((moduleId: string) => this.fieldsMap[moduleId]);
  getDisabledFieldsByModuleId = computedFn((moduleId: string) => this.disabledFieldsMap[moduleId]);
  getFieldById = computedFn((moduleId: string, fieldId: string) =>
    this.fieldsMap[moduleId]?.find((field) => field.id === fieldId)
  );
  getDisabledFieldById = computedFn((moduleId: string, fieldId: string) =>
    this.disabledFieldsMap[moduleId]?.find((field) => field.id === fieldId)
  );

  getFields = async (workspaceSlug: string, projectId: string, moduleId: string) => {
    runInAction(() => set(this.fieldsLoader, [moduleId], true));
    try {
      const response = await this.service.list(workspaceSlug, projectId, moduleId);
      runInAction(() => {
        set(this.fieldsMap, [moduleId], sortBy(response, [(field) => field.sort_order]));
        set(this.fieldsLoader, [moduleId], false);
      });
      return response;
    } catch (error) {
      runInAction(() => set(this.fieldsLoader, [moduleId], false));
      throw error;
    }
  };

  getDisabledFields = async (workspaceSlug: string, projectId: string, moduleId: string) => {
    runInAction(() => set(this.disabledFieldsLoader, [moduleId], true));
    try {
      const response = await this.service.listDisabled(workspaceSlug, projectId, moduleId);
      runInAction(() => {
        set(this.disabledFieldsMap, [moduleId], sortBy(response, [(field) => field.sort_order]));
        set(this.disabledFieldsLoader, [moduleId], false);
      });
      return response;
    } catch (error) {
      runInAction(() => set(this.disabledFieldsLoader, [moduleId], false));
      throw error;
    }
  };
  createField = async (workspaceSlug: string, projectId: string, moduleId: string, data: TModuleIssueFieldPayload) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      const response = await this.service.create(workspaceSlug, projectId, moduleId, data);
      runInAction(() => {
        this.upsertField(moduleId, response);
        this.loader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  updateField = async (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    data: TModuleIssueFieldUpdatePayload
  ) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      const response = await this.service.update(workspaceSlug, projectId, moduleId, fieldId, data);
      if (data.is_disabled === true || data.is_disabled === false) {
        await Promise.all([
          this.getFields(workspaceSlug, projectId, moduleId),
          this.getDisabledFields(workspaceSlug, projectId, moduleId),
        ]);
        if (data.is_disabled === true) {
          runInAction(() => {
            this.removeFieldValuesFromCachedIssues(moduleId, fieldId);
          });
        }
      } else {
        runInAction(() => {
          this.upsertField(moduleId, response);
        });
      }
      runInAction(() => {
        this.loader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  deleteField = async (workspaceSlug: string, projectId: string, moduleId: string, fieldId: string) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      await this.service.deleteField(workspaceSlug, projectId, moduleId, fieldId);
      await Promise.all([
        this.getFields(workspaceSlug, projectId, moduleId),
        this.getDisabledFields(workspaceSlug, projectId, moduleId),
      ]);
      runInAction(() => {
        this.removeFieldValuesFromCachedIssues(moduleId, fieldId);
        this.loader = false;
      });
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  createOption = async (workspaceSlug: string, projectId: string, moduleId: string, fieldId: string, value: string) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      const response = await this.service.createOption(workspaceSlug, projectId, moduleId, fieldId, value);
      runInAction(() => {
        this.upsertOption(moduleId, fieldId, response);
        this.loader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  deleteOption = async (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    fieldId: string,
    optionId: string
  ) => {
    try {
      runInAction(() => {
        this.loader = true;
      });
      await this.service.deleteOption(workspaceSlug, projectId, moduleId, fieldId, optionId);
      runInAction(() => {
        this.removeOption(moduleId, fieldId, optionId);
        this.removeOptionValuesFromCachedIssues(moduleId, fieldId, optionId);
        this.loader = false;
      });
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  updateIssueValues = async (
    workspaceSlug: string,
    projectId: string,
    moduleId: string,
    issueId: string,
    data: TModuleIssueFieldValuesUpdatePayload
  ) => {
    const response = await this.service.updateIssueValues(workspaceSlug, projectId, moduleId, issueId, data);
    this.rootStore.issue.issues.updateIssue(issueId, response);
  };

  private orderFields = (fields: TModuleIssueField[]) => sortBy(fields, [(field) => field.sort_order]);

  private upsertField = (moduleId: string, field: TModuleIssueField) => {
    const map = field.is_disabled ? this.disabledFieldsMap : this.fieldsMap;
    const otherMap = field.is_disabled ? this.fieldsMap : this.disabledFieldsMap;
    set(map, [moduleId], this.upsertInList(map[moduleId] ?? [], field));
    set(
      otherMap,
      [moduleId],
      (otherMap[moduleId] ?? []).filter((currentField) => currentField.id !== field.id)
    );
  };

  private upsertOption = (moduleId: string, fieldId: string, option: TModuleIssueFieldOption) => {
    this.upsertFieldOption(this.fieldsMap, moduleId, fieldId, option);
    this.upsertFieldOption(this.disabledFieldsMap, moduleId, fieldId, option);
  };

  private removeOption = (moduleId: string, fieldId: string, optionId: string) => {
    this.removeFieldOption(this.fieldsMap, moduleId, fieldId, optionId);
    this.removeFieldOption(this.disabledFieldsMap, moduleId, fieldId, optionId);
  };

  private removeFieldValuesFromCachedIssues = (moduleId: string, fieldId: string) => {
    const issuesMap = this.rootStore.issue.issues.issuesMap;
    Object.values(issuesMap).forEach((issue) => {
      const moduleFieldValues = issue.module_field_values?.[moduleId];
      if (!moduleFieldValues || !(fieldId in moduleFieldValues)) return;
      const nextValues = Object.assign({}, moduleFieldValues);
      delete nextValues[fieldId];
      set(issuesMap, [issue.id, "module_field_values", moduleId], nextValues);
    });
  };

  private removeOptionValuesFromCachedIssues = (moduleId: string, fieldId: string, optionId: string) => {
    if (!this.isOptionField(moduleId, fieldId)) return;
    const issuesMap = this.rootStore.issue.issues.issuesMap;
    Object.values(issuesMap).forEach((issue) => {
      const moduleFieldValues = issue.module_field_values?.[moduleId];
      if (!moduleFieldValues || !(fieldId in moduleFieldValues)) return;
      const nextValue = this.removeOptionFromValue(moduleFieldValues[fieldId], optionId);
      const nextValues = Object.assign({}, moduleFieldValues);
      if (typeof nextValue === "undefined") delete nextValues[fieldId];
      else nextValues[fieldId] = nextValue;
      set(issuesMap, [issue.id, "module_field_values", moduleId], nextValues);
    });
  };

  private isOptionField = (moduleId: string, fieldId: string) => {
    const field = this.getFieldById(moduleId, fieldId) ?? this.getDisabledFieldById(moduleId, fieldId);
    return field?.field_type === "single_select" || field?.field_type === "multi_select";
  };

  private removeOptionFromValue = (
    fieldValue: TIssueFieldValue | undefined,
    optionId: string
  ): TIssueFieldValue | undefined => {
    if (fieldValue === optionId) return undefined;
    if (Array.isArray(fieldValue)) {
      const filteredValue = fieldValue.filter((currentOptionId) => currentOptionId !== optionId);
      return filteredValue.length > 0 ? filteredValue : undefined;
    }
    return fieldValue;
  };

  private upsertFieldOption = (
    map: Record<string, TModuleIssueField[]>,
    moduleId: string,
    fieldId: string,
    option: TModuleIssueFieldOption
  ) => {
    const fields = map[moduleId];
    if (!fields) return;
    set(
      map,
      [moduleId],
      fields.map((field) => {
        if (field.id !== fieldId) return field;
        return Object.assign({}, field, {
          options: sortBy(this.upsertInList(field.options, option), [(currentOption) => currentOption.sort_order]),
        });
      })
    );
  };

  private removeFieldOption = (
    map: Record<string, TModuleIssueField[]>,
    moduleId: string,
    fieldId: string,
    optionId: string
  ) => {
    const fields = map[moduleId];
    if (!fields) return;
    set(
      map,
      [moduleId],
      fields.map((field) => {
        if (field.id !== fieldId) return field;
        return Object.assign({}, field, {
          options: field.options.filter((option) => option.id !== optionId),
        });
      })
    );
  };

  private upsertInList = <T extends { id: string; sort_order: number }>(list: T[], item: T) => {
    const itemExists = list.some((currentItem) => currentItem.id === item.id);
    const updatedList = itemExists
      ? list.map((currentItem) => (currentItem.id === item.id ? item : currentItem))
      : [...list, item];
    return sortBy(updatedList, [(currentItem) => currentItem.sort_order]);
  };
}
```

- [ ] **Step 7: Register store and hook**

In `apps/web/core/store/root.store.ts`, add imports next to the other store imports:

```ts
import type { IModuleIssueFieldStore } from "./module/module-issue-field.store";
import { ModuleIssueFieldStore } from "./module/module-issue-field.store";
```

Add the property next to `module` and `moduleFilter`:

```ts
moduleIssueFields: IModuleIssueFieldStore;
```

Initialize it in the constructor immediately after `this.moduleFilter = new ModuleFilterStore(this);`:

```ts
this.moduleIssueFields = new ModuleIssueFieldStore(this);
```

Initialize it in `resetOnSignOut` immediately after `this.moduleFilter = new ModuleFilterStore(this);`:

```ts
this.moduleIssueFields = new ModuleIssueFieldStore(this);
```

Create `apps/web/core/hooks/store/use-module-issue-fields.ts`:

```ts
import { useContext } from "react";
import { StoreContext } from "@/lib/store-context";
import type { IModuleIssueFieldStore } from "@/store/module/module-issue-field.store";

export const useModuleIssueFields = (): IModuleIssueFieldStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useModuleIssueFields must be used within StoreProvider");
  return context.moduleIssueFields;
};
```

- [ ] **Step 8: Run typecheck**

Run:

```bash
pnpm check:types
```

Expected: no new TypeScript errors from module field types/store. Pre-existing unrelated errors must match the baseline recorded in Step 1.

- [ ] **Step 9: Commit frontend data layer**

Run:

```bash
git add packages/types/src/issues/issue-fields.ts packages/types/src/issues/issue.ts packages/types/src/view-props.ts apps/web/core/services/module/issue-field.service.ts apps/web/core/services/module/index.ts apps/web/core/store/module/module-issue-field.store.ts apps/web/core/store/root.store.ts apps/web/core/hooks/store/use-module-issue-fields.ts
git commit -m "feat: add module field frontend data layer"
```

---

### Task 6: Module Field Management In Module Edit Form

**Files:**

- Create: `apps/web/core/components/module-fields/settings/root.tsx`
- Create: `apps/web/core/components/module-fields/settings/field-row.tsx`
- Create: `apps/web/core/components/module-fields/settings/field-form-modal.tsx`
- Create: `apps/web/core/components/module-fields/settings/disabled-fields.tsx`
- Modify: `apps/web/core/components/modules/form.tsx`
- Modify: `packages/i18n/src/locales/en/module.json`

- [ ] **Step 1: Create module field settings wrapper**

Create `apps/web/core/components/module-fields/settings/root.tsx`:

```tsx
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
import type { TModuleIssueField } from "@plane/types";
import { Button } from "@plane/ui";
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";
import { ModuleFieldFormModal } from "./field-form-modal";
import { ModuleFieldRow } from "./field-row";

type Props = {
  workspaceSlug: string;
  projectId: string;
  moduleId: string | undefined;
  disabled?: boolean;
};

export const ModuleFieldsSettingsRoot = observer(function ModuleFieldsSettingsRoot(props: Props) {
  const { workspaceSlug, projectId, moduleId, disabled = false } = props;
  const { fieldsLoader, getFields, getFieldsByModuleId } = useModuleIssueFields();
  const [selectedField, setSelectedField] = useState<TModuleIssueField | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fields = moduleId ? getFieldsByModuleId(moduleId) : undefined;

  useEffect(() => {
    if (!moduleId || fields || fieldsLoader[moduleId]) return;
    getFields(workspaceSlug, projectId, moduleId);
  }, [fields, fieldsLoader, getFields, moduleId, projectId, workspaceSlug]);

  if (!moduleId) return null;

  return (
    <div className="space-y-3 border-t border-subtle pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Module fields</h3>
        <Button
          variant="neutral-primary"
          size="sm"
          prependIcon={<Plus className="h-3.5 w-3.5" />}
          disabled={disabled}
          onClick={() => {
            setSelectedField(null);
            setIsModalOpen(true);
          }}
        >
          Add field
        </Button>
      </div>
      <div className="space-y-2">
        {(fields ?? []).map((field) => (
          <ModuleFieldRow
            key={field.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            moduleId={moduleId}
            field={field}
            disabled={disabled}
            onEdit={() => {
              setSelectedField(field);
              setIsModalOpen(true);
            }}
          />
        ))}
      </div>
      <ModuleFieldFormModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        moduleId={moduleId}
        field={selectedField}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
});
```

- [ ] **Step 2: Create field form and row components**

Create `field-form-modal.tsx`, `field-row.tsx`, and `disabled-fields.tsx` from the matching project-field settings components. Use these source-to-target pairs:

```text
apps/web/core/components/project-fields/settings/field-form-modal.tsx -> apps/web/core/components/module-fields/settings/field-form-modal.tsx
apps/web/core/components/project-fields/settings/field-row.tsx -> apps/web/core/components/module-fields/settings/field-row.tsx
apps/web/core/components/project-fields/settings/disabled-fields.tsx -> apps/web/core/components/module-fields/settings/disabled-fields.tsx
```

Apply these substitutions in the new module files:

```text
ProjectIssueField -> ModuleIssueField
TProjectIssueField -> TModuleIssueField
TProjectIssueFieldPayload -> TModuleIssueFieldPayload
TProjectIssueFieldUpdatePayload -> TModuleIssueFieldUpdatePayload
useProjectIssueFields -> useModuleIssueFields
projectId-only calls -> workspaceSlug, projectId, moduleId calls
project_settings.fields.* i18n keys -> module.fields.* keys
```

In `field-row.tsx`, option operations must call:

```tsx
createOption(workspaceSlug, projectId, moduleId, field.id, value);
deleteOption(workspaceSlug, projectId, moduleId, field.id, optionId);
```

In `field-form-modal.tsx`, create/update must call:

```tsx
createField(workspaceSlug, projectId, moduleId, payload);
updateField(workspaceSlug, projectId, moduleId, field.id, payload);
```

- [ ] **Step 3: Render at bottom of module form**

In `apps/web/core/components/modules/form.tsx`, import:

```tsx
import { ModuleFieldsSettingsRoot } from "@/components/module-fields/settings/root";
```

At the bottom of the `<form>` content, before submit buttons if the current layout has them outside the scroll area, render:

```tsx
{
  data?.id && workspaceSlug && projectId && (
    <ModuleFieldsSettingsRoot
      workspaceSlug={workspaceSlug.toString()}
      projectId={projectId.toString()}
      moduleId={data.id}
      disabled={isSubmitting}
    />
  );
}
```

Use the existing prop names in `form.tsx`; if the module id is named `data.id`, keep it as shown. If the form only receives `data` after creation, module fields appear only in edit mode for this version.

- [ ] **Step 4: Add English i18n keys**

In `packages/i18n/src/locales/en/module.json`, add:

```json
{
  "fields": {
    "title": "Module fields",
    "add": "Add field",
    "edit": "Edit field",
    "empty": "No module fields yet"
  }
}
```

Merge into the existing JSON object without replacing existing keys.

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm check:types
```

Expected: no new errors from module field form components.

- [ ] **Step 6: Commit module form UI**

Run:

```bash
git add apps/web/core/components/module-fields apps/web/core/components/modules/form.tsx packages/i18n/src/locales/en/module.json
git commit -m "feat: add module field management UI"
```

---

### Task 7: Module Fields In Filters, Display Columns, Grouping, And Saved View Creation

**Files:**

- Modify: `packages/utils/src/work-item-filters/configs/filters/custom-property.ts`
- Modify: `apps/web/core/hooks/work-item-filters/use-work-item-filters-config.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/spreadsheet/spreadsheet-view.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/spreadsheet/issue-column.tsx`
- Modify: `apps/web/core/components/issues/issue-layouts/spreadsheet/spreadsheet-header-column.tsx`
- Modify: `apps/web/core/components/views/form.tsx`
- Modify: `apps/web/core/components/views/modal.tsx`

- [ ] **Step 1: Make custom filter key prefix configurable**

In `packages/utils/src/work-item-filters/configs/filters/custom-property.ts`, change:

```ts
const getCustomPropertyKey = (fieldId: string): TCustomPropertyKey => `customproperty_${fieldId}`;
```

to:

```ts
const getCustomPropertyKey = <TKey extends string>(
  fieldId: string,
  prefix: "customproperty_" | "modulecustomproperty_"
): TKey => `${prefix}${fieldId}` as TKey;
```

Update `TCreateCustomPropertyFilterParams` to accept:

```ts
    keyPrefix?: "customproperty_" | "modulecustomproperty_";
```

Update `createFilterConfig` id:

```ts
      id: getCustomPropertyKey<TCustomPropertyKey>(field.id, params.keyPrefix ?? "customproperty_"),
```

For module fields, callers will cast the return to `TFilterConfig<TWorkItemFilterProperty>`.

- [ ] **Step 2: Load module fields in filter config hook**

In `apps/web/core/hooks/work-item-filters/use-work-item-filters-config.tsx`, import:

```tsx
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";
```

Add optional prop to `TUseWorkItemFiltersConfigProps`:

```ts
  moduleFieldContextId?: string;
```

Read the store:

```tsx
const {
  fieldsLoader: moduleIssueFieldsLoader,
  getFields: getModuleFields,
  getFieldsByModuleId,
} = useModuleIssueFields();
const moduleIssueFields = moduleFieldContextId ? getFieldsByModuleId(moduleFieldContextId) : undefined;
```

Add an effect:

```tsx
useEffect(() => {
  if (!workspaceSlug || !projectId || !moduleFieldContextId) return;
  if (moduleIssueFields || moduleIssueFieldsLoader[moduleFieldContextId]) return;
  getModuleFields(workspaceSlug, projectId, moduleFieldContextId).catch((error) => {
    console.error("Failed to load module issue fields:", error);
  });
}, [getModuleFields, moduleFieldContextId, moduleIssueFields, moduleIssueFieldsLoader, projectId, workspaceSlug]);
```

Build `moduleCustomPropertyFilterConfigs` next to `customPropertyFilterConfigs` using:

```tsx
const moduleCustomPropertyFilterConfigs = useMemo(() => {
  if (!moduleIssueFields) return [];
  return moduleIssueFields.flatMap((field) => {
    const config = getCustomPropertyFilterConfig(field as any)({
      isEnabled: isCustomPropertyFilterEnabled(`modulecustomproperty_${field.id}` as TWorkItemFilterProperty),
      keyPrefix: "modulecustomproperty_",
      filterIcon: fieldIconMap[field.field_type],
      members: customPropertyMembers,
      getOptionIcon,
      ...operatorConfigs,
    });
    return config ? [config as TFilterConfig<TWorkItemFilterProperty>] : [];
  });
}, [customPropertyMembers, isCustomPropertyFilterEnabled, moduleIssueFields, operatorConfigs]);
```

Add these configs to `configs` and `configMap`.

- [ ] **Step 3: Pass module field context from module and project view roots**

Find the call sites for `useWorkItemFiltersConfig` in filter HOCs and roots. For module issue roots, pass:

```tsx
moduleFieldContextId={moduleId?.toString()}
```

For project view roots, pass:

```tsx
moduleFieldContextId={projectView.source_module ?? undefined}
```

In `packages/types/src/views.ts`, add this property to `IProjectView` next to `project`:

```ts
source_module: string | null;
```

- [ ] **Step 4: Add module display properties**

In `display-properties.tsx`, import `useModuleIssueFields`, read `moduleId` and current view source module if available, and compute:

```tsx
const moduleFieldContextId = moduleId?.toString() ?? viewDetails?.source_module ?? undefined;
const moduleFields = moduleFieldContextId ? getModuleFieldsByModuleId(moduleFieldContextId) : undefined;
```

Load fields with `getModuleFields(workspaceSlug, projectId, moduleFieldContextId)`.

Append:

```tsx
const moduleCustomDisplayProperties =
  moduleFields?.map((field) => ({
    key: `modulecustomproperty_${field.id}` as keyof IIssueDisplayProperties,
    title: field.name,
  })) ?? [];
```

Render them after project custom fields. Do not render them if `moduleFieldContextId` is missing.

- [ ] **Step 5: Spreadsheet columns read module fields**

In `spreadsheet-view.tsx`, load module fields for `moduleId` or `projectView.source_module` and append visible `modulecustomproperty_*` keys to `spreadsheetColumnsList`.

In `issue-column.tsx`, add:

```tsx
const moduleCustomFieldId = property.startsWith("modulecustomproperty_")
  ? property.replace("modulecustomproperty_", "")
  : null;
const moduleIdForField = issue.module_ids?.find((id) => getModuleFieldById(id, moduleCustomFieldId ?? ""));
const moduleCustomField =
  moduleIdForField && moduleCustomFieldId ? getModuleFieldById(moduleIdForField, moduleCustomFieldId) : undefined;
```

Render `ProjectFieldValueEditor` for module fields with:

```tsx
value={issueDetail.module_field_values?.[moduleIdForField]?.[moduleCustomField.id]}
onChange={(fieldId, value) => updateModuleIssueValues(workspaceSlug, issueProjectId, moduleIdForField, issueDetail.id, { field_values: { [fieldId]: value } })}
```

In `spreadsheet-header-column.tsx`, resolve `modulecustomproperty_*` labels from `useModuleIssueFields`.

- [ ] **Step 6: Save source module in view creation**

In `apps/web/core/components/views/form.tsx`, include:

```ts
source_module?: string | null;
```

in the form payload type and submit payload. In `views/modal.tsx`, when opening from a module page, set:

```ts
source_module: moduleId?.toString() ?? null,
```

Keep ordinary project view creation sending `source_module: null` or omitting the field.

- [ ] **Step 7: Run typecheck**

Run:

```bash
pnpm check:types
```

Expected: no new errors from module filter/display/view wiring.

- [ ] **Step 8: Commit module field list/view wiring**

Run:

```bash
git add packages/utils/src/work-item-filters/configs/filters/custom-property.ts apps/web/core/hooks/work-item-filters/use-work-item-filters-config.tsx apps/web/core/components/issues/issue-layouts/filters/header/display-filters/display-properties.tsx apps/web/core/components/issues/issue-layouts/spreadsheet apps/web/core/components/views/form.tsx apps/web/core/components/views/modal.tsx
git commit -m "feat: show module fields in module views"
```

---

### Task 8: Work Item Detail Module Field Sections And Remove Confirmation

**Files:**

- Create: `apps/web/core/components/issues/issue-detail/module-fields/root.tsx`
- Modify: `apps/web/core/components/issues/issue-detail/main-content.tsx`
- Modify: `apps/web/core/components/project-fields/value-editors/types.ts`
- Modify: `apps/web/core/components/project-fields/value-editors/text-select.tsx`
- Modify: module removal stores/call sites under `apps/web/core/store/issue`
- Modify: issue detail module picker/dropdowns that remove modules.

- [ ] **Step 1: Allow value editors to receive option handlers**

In `apps/web/core/components/project-fields/value-editors/types.ts`, add optional handlers:

```ts
  createOption?: (value: string) => Promise<{ id: string; value: string }>;
  deleteOption?: (optionId: string) => Promise<void>;
```

In `text-select.tsx`, use the passed handlers first:

```tsx
const handleCreateOption =
  props.createOption ?? ((value: string) => createOption(workspaceSlug, projectId, field.id, value));
const handleDeleteOption =
  props.deleteOption ?? ((optionId: string) => deleteOption(workspaceSlug, projectId, field.id, optionId));
```

Keep existing project field behavior when handlers are absent.

- [ ] **Step 2: Create module field detail section**

Create `apps/web/core/components/issues/issue-detail/module-fields/root.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TIssueFieldValue } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ProjectFieldValueEditors } from "@/components/project-fields/value-editors/root";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useModule } from "@/hooks/store/use-module";
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

export const IssueModuleFieldsSection = observer(function IssueModuleFieldsSection(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getModuleById } = useModule();
  const { fieldsLoader, getFields, getFieldsByModuleId, updateIssueValues, createOption, deleteOption } =
    useModuleIssueFields();
  const [collapsedModuleIds, setCollapsedModuleIds] = useState<Set<string>>(() => new Set());

  const issue = getIssueById(issueId);
  const moduleIds = issue?.module_ids ?? [];

  useEffect(() => {
    moduleIds.forEach((moduleId) => {
      if (getFieldsByModuleId(moduleId) || fieldsLoader[moduleId]) return;
      getFields(workspaceSlug, projectId, moduleId).catch((error) =>
        console.error("Failed to load module fields:", error)
      );
    });
  }, [fieldsLoader, getFields, getFieldsByModuleId, moduleIds, projectId, workspaceSlug]);

  const sections = useMemo(
    () =>
      moduleIds
        .map((moduleId) => ({
          module: getModuleById(moduleId),
          fields: getFieldsByModuleId(moduleId)?.filter((field) => !field.is_disabled) ?? [],
        }))
        .filter((section) => section.module && section.fields.length > 0),
    [getFieldsByModuleId, getModuleById, moduleIds]
  );

  if (!issue || sections.length === 0) return null;

  const handleChange = async (moduleId: string, fieldId: string, value: TIssueFieldValue) => {
    try {
      await updateIssueValues(workspaceSlug, projectId, moduleId, issueId, {
        field_values: {
          [fieldId]: Array.isArray(value) && value.length === 0 ? null : value,
        },
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update module field." });
    }
  };

  return (
    <div className="space-y-3">
      {sections.map(({ module, fields }) => {
        if (!module) return null;
        const isCollapsed = collapsedModuleIds.has(module.id);
        return (
          <section key={module.id} className="border-t border-subtle pt-3">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left text-sm font-medium"
              onClick={() =>
                setCollapsedModuleIds((current) => {
                  const next = new Set(current);
                  if (next.has(module.id)) next.delete(module.id);
                  else next.add(module.id);
                  return next;
                })
              }
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span>{module.name}</span>
            </button>
            {!isCollapsed && (
              <div className="mt-2">
                <ProjectFieldValueEditors
                  fields={fields as any}
                  values={issue.module_field_values?.[module.id]}
                  disabled={disabled}
                  commitPlainTextOnBlur
                  onChange={(fieldId, value) => handleChange(module.id, fieldId, value)}
                  projectId={projectId}
                  workspaceSlug={workspaceSlug}
                  createOption={(fieldId, value) => createOption(workspaceSlug, projectId, module.id, fieldId, value)}
                  deleteOption={(fieldId, optionId) =>
                    deleteOption(workspaceSlug, projectId, module.id, fieldId, optionId)
                  }
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
});
```

If `ProjectFieldValueEditors` does not accept `createOption/deleteOption` at the list level after Step 1, add those optional props and pass them into each `ProjectFieldValueEditor`.

- [ ] **Step 3: Insert section before activity**

In `apps/web/core/components/issues/issue-detail/main-content.tsx`, import:

```tsx
import { IssueModuleFieldsSection } from "./module-fields/root";
```

Render immediately before `IssueActivity`:

```tsx
<IssueModuleFieldsSection
  workspaceSlug={workspaceSlug}
  projectId={projectId}
  issueId={issueId}
  disabled={!isEditable || isArchived}
/>
```

- [ ] **Step 4: Extend remove APIs to accept confirmation**

Update the relevant store method signatures:

```ts
removeIssueFromModule(workspaceSlug: string, projectId: string, moduleId: string, issueId: string, options?: { deleteModuleFieldValuesConfirmed?: boolean }): Promise<void>
```

When calling the API delete, send:

```ts
{
  delete_module_field_values_confirmed: options?.deleteModuleFieldValuesConfirmed === true;
}
```

- [ ] **Step 5: Add confirmation retry flow in UI**

Where `removeIssueFromModule` is called, catch 400 responses containing the module field deletion message and open the existing confirmation modal pattern. On confirm, call:

```ts
removeIssueFromModule(workspaceSlug, projectId, moduleId, issueId, {
  deleteModuleFieldValuesConfirmed: true,
});
```

For module multi-select changes that remove one or more modules, show one confirmation message:

```text
Removing this work item from selected modules will delete those modules' custom field values.
```

Then pass the confirmation flag for the removal operation.

- [ ] **Step 6: Run typecheck**

Run:

```bash
pnpm check:types
```

Expected: no new errors from detail section or removal signatures.

- [ ] **Step 7: Commit detail and confirmation UX**

Run:

```bash
git add apps/web/core/components/issues/issue-detail apps/web/core/components/project-fields/value-editors apps/web/core/store/issue
git commit -m "feat: edit module fields in work item details"
```

---

### Task 9: Final Verification And Regression Sweep

**Files:**

- Verify all files touched by previous tasks.
- Update tests only if verification reveals a missing assertion.

- [ ] **Step 1: Run backend module field tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_module_issue_fields_app.py apps/api/plane/tests/unit/filters/test_module_issue_field_filters.py -q
```

Expected: PASS.

- [ ] **Step 2: Run project field regression tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_project_issue_fields_app.py apps/api/plane/tests/unit/filters/test_project_issue_field_filters.py -q
```

Expected: PASS. This guards against breaking existing `customproperty_*`.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
pnpm check:types
```

Expected: PASS, or only pre-existing baseline failures recorded in Task 5 Step 1.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm check:lint
```

Expected: PASS.

- [ ] **Step 5: Manual QA in app**

Start dev servers:

```bash
pnpm dev
```

Verify these flows:

- Edit a module and create each field type at the bottom of the module form.
- Open the module work item page and confirm only current module fields appear in filter, display, and grouping menus.
- Save the module page as a view and confirm the view loads only the source module fields.
- Open a work item from the all work items page and confirm visible module field sections appear between the main content and activity.
- Add a work item to two modules with fields and confirm two collapsible sections render.
- Remove a module from a work item with module field values and confirm the warning appears; after confirmation, values are deleted.
- Log in as a user without private module visibility and confirm private module field sections and values are absent.

- [ ] **Step 6: Commit verification fixes**

If verification required fixes, run `git status --short`, stage only the concrete files changed during verification, and commit with:

```bash
git commit -m "fix: stabilize module custom fields"
```

If no fixes were needed, leave the worktree unchanged and do not create an empty commit.
