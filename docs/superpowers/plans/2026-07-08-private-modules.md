# Private Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public/private module visibility so private modules are visible only to their creator, lead, and members while linked work items remain visible under existing work item permissions.

**Architecture:** Store visibility on `Module`, centralize backend visibility predicates in one helper, and apply that helper anywhere module records, module IDs, or module names leave the backend. Frontend changes are thin: expose a visibility selector in the existing module form and rely on backend-filtered module lists for dropdowns.

**Tech Stack:** Django, Django REST Framework, PostgreSQL, pytest, Next.js/React, MobX stores, TypeScript, `@plane/i18n`, `@plane/ui`, `@plane/propel`.

---

## File Structure

- Create `apps/api/plane/db/utils/module_visibility.py`: shared `Q` builders, queryset filters, and instance predicate for module visibility.
- Modify `apps/api/plane/db/models/module.py`: add `ModuleVisibility` and `Module.visibility`.
- Create `apps/api/plane/db/migrations/0125_module_visibility.py`: backward-compatible public default.
- Create `apps/api/plane/tests/contract/app/test_private_modules_app.py`: app API contract coverage for visibility, assignment, and work item serialization.
- Modify `apps/api/plane/app/serializers/module.py`: accept and return `visibility`.
- Modify `apps/api/plane/app/serializers/issue.py`: filter `module_ids` using request user.
- Modify `apps/api/plane/app/views/module/base.py`: filter module list/detail/create/update return payloads by visible modules and include `visibility`.
- Modify `apps/api/plane/app/views/module/archive.py`: filter archived modules and include `visibility`.
- Modify `apps/api/plane/app/views/module/issue.py`: gate module issue list/add/remove routes by visible modules.
- Modify `apps/api/plane/api/serializers/module.py`: accept and return `visibility` in legacy API serializers.
- Modify `apps/api/plane/api/serializers/issue.py`: filter expanded module data when request context is present.
- Modify `apps/api/plane/api/views/module.py`: apply visible-module filtering and gate module issue routes.
- Modify `apps/api/plane/space/views/module.py`: exclude private modules from anonymous module list.
- Modify `apps/api/plane/space/views/issue.py` and `apps/api/plane/space/utils/grouper.py`: exclude private module IDs in public/anonymous issue responses and grouping.
- Modify `packages/types/src/module/modules.ts`: add `TModuleVisibility` and `IModule.visibility`.
- Modify `apps/web/core/components/modules/form.tsx`: add visibility selector to create/update module form.
- Modify `apps/web/core/components/modules/module-list-item.tsx`: show a lock icon for private modules in list rows.
- Modify `apps/web/core/components/modules/module-card-item.tsx`: show a lock icon for private modules in card rows.
- Modify `packages/i18n/src/locales/en/module.json` and run the translation workflow for other locales or add reviewed English fallbacks according to repo i18n practice.

## Task 1: Backend Model And Visibility Helper

**Files:**

- Modify: `apps/api/plane/db/models/module.py`
- Create: `apps/api/plane/db/utils/module_visibility.py`
- Create: `apps/api/plane/db/migrations/0125_module_visibility.py`
- Test: `apps/api/plane/tests/contract/app/test_private_modules_app.py`

- [ ] **Step 1: Write failing model/helper tests**

Create `apps/api/plane/tests/contract/app/test_private_modules_app.py` with these imports and tests:

```python
import pytest
from rest_framework import status

from django.utils import timezone

from plane.db.models import Issue, Module, ModuleIssue, ModuleMember, ProjectMember, User
from plane.db.utils.module_visibility import filter_visible_modules, is_module_visible_to_user


pytestmark = pytest.mark.django_db


def make_project_member(workspace, project, email):
    user = User.objects.create(email=email, first_name="Test", last_name="User")
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=15, is_active=True)
    return user


def test_existing_modules_default_to_public(workspace, project):
    module = Module.objects.create(workspace=workspace, project=project, name="Public by default")

    assert module.visibility == Module.ModuleVisibility.PUBLIC


def test_filter_visible_modules_includes_public_and_related_private_modules(workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-private-modules@example.com")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public")
    created_private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Created Private",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=project_member,
    )
    lead_private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Lead Private",
        visibility=Module.ModuleVisibility.PRIVATE,
        lead=project_member,
    )
    member_private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Member Private",
        visibility=Module.ModuleVisibility.PRIVATE,
    )
    ModuleMember.objects.create(
        workspace=workspace,
        project=project,
        module=member_private_module,
        member=project_member,
    )
    hidden_private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Hidden Private",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=unrelated_user,
    )

    visible_ids = set(filter_visible_modules(Module.objects.filter(project=project), project_member).values_list("id", flat=True))

    assert public_module.id in visible_ids
    assert created_private_module.id in visible_ids
    assert lead_private_module.id in visible_ids
    assert member_private_module.id in visible_ids
    assert hidden_private_module.id not in visible_ids


def test_is_module_visible_to_user_matches_creator_lead_member_rules(workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-predicate@example.com")
    module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Private",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=project_member,
    )

    assert is_module_visible_to_user(module, project_member) is True
    assert is_module_visible_to_user(module, unrelated_user) is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_private_modules_app.py -q
```

Expected: FAIL with import/model errors such as `No module named 'plane.db.utils.module_visibility'` or `type object 'Module' has no attribute 'ModuleVisibility'`.

- [ ] **Step 3: Add module visibility model field**

In `apps/api/plane/db/models/module.py`, add the choices class inside `Module` so tests can use `Module.ModuleVisibility`:

```python
class Module(ProjectBaseModel):
    class ModuleVisibility(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"

    name = models.CharField(max_length=255, verbose_name="Module Name")
    description = models.TextField(verbose_name="Module Description", blank=True)
    description_text = models.JSONField(verbose_name="Module Description RT", blank=True, null=True)
    description_html = models.JSONField(verbose_name="Module Description HTML", blank=True, null=True)
    start_date = models.DateField(null=True)
    target_date = models.DateField(null=True)
    visibility = models.CharField(
        choices=ModuleVisibility.choices,
        default=ModuleVisibility.PUBLIC,
        max_length=20,
    )
```

- [ ] **Step 4: Add the migration**

Create `apps/api/plane/db/migrations/0125_module_visibility.py`:

```python
# Generated by Codex for private module visibility

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0124_project_issue_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="module",
            name="visibility",
            field=models.CharField(
                choices=[("public", "Public"), ("private", "Private")],
                default="public",
                max_length=20,
            ),
        ),
    ]
```

- [ ] **Step 5: Add visibility helper**

Create `apps/api/plane/db/utils/module_visibility.py`:

```python
from django.db.models import Q

from plane.db.models import Module


def module_visible_to_user_q(user, prefix=""):
    visibility_key = f"{prefix}visibility"

    if not user or not getattr(user, "is_authenticated", False):
        return Q(**{visibility_key: Module.ModuleVisibility.PUBLIC})

    return (
        Q(**{visibility_key: Module.ModuleVisibility.PUBLIC})
        | Q(**{f"{prefix}created_by_id": user.id})
        | Q(**{f"{prefix}lead_id": user.id})
        | Q(**{f"{prefix}members__id": user.id})
    )


def filter_visible_modules(queryset, user):
    return queryset.filter(module_visible_to_user_q(user)).distinct()


def filter_visible_module_relations(queryset, user, module_prefix="module__"):
    return queryset.filter(module_visible_to_user_q(user, prefix=module_prefix)).distinct()


def is_module_visible_to_user(module, user):
    if module.visibility == Module.ModuleVisibility.PUBLIC:
        return True

    if not user or not getattr(user, "is_authenticated", False):
        return False

    if module.created_by_id == user.id or module.lead_id == user.id:
        return True

    prefetched_members = getattr(module, "_prefetched_objects_cache", {}).get("members")
    if prefetched_members is not None:
        return any(member.id == user.id for member in prefetched_members)

    return module.members.filter(id=user.id).exists()
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_private_modules_app.py -q
```

Expected: PASS for the three helper/model tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/plane/db/models/module.py apps/api/plane/db/migrations/0125_module_visibility.py apps/api/plane/db/utils/module_visibility.py apps/api/plane/tests/contract/app/test_private_modules_app.py
git commit -m "feat: add module visibility model"
```

## Task 2: App Module API Visibility

**Files:**

- Modify: `apps/api/plane/app/serializers/module.py`
- Modify: `apps/api/plane/app/views/module/base.py`
- Modify: `apps/api/plane/app/views/module/archive.py`
- Test: `apps/api/plane/tests/contract/app/test_private_modules_app.py`

- [ ] **Step 1: Add failing app module endpoint tests**

Append these tests to `apps/api/plane/tests/contract/app/test_private_modules_app.py`:

```python
def test_app_module_list_hides_private_modules_from_unrelated_members(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-list@example.com")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public")
    private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Private",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=project_member,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/")

    assert response.status_code == status.HTTP_200_OK
    module_ids = {item["id"] for item in response.data}
    assert str(public_module.id) in module_ids
    assert str(private_module.id) not in module_ids


def test_app_module_list_includes_private_modules_for_creator(api_client, workspace, project, project_member):
    private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Creator Private",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=project_member,
    )

    api_client.force_authenticate(project_member)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/")

    assert response.status_code == status.HTTP_200_OK
    module = next(item for item in response.data if item["id"] == str(private_module.id))
    assert module["visibility"] == Module.ModuleVisibility.PRIVATE


def test_app_module_detail_returns_404_for_hidden_private_module(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-detail@example.com")
    private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Private Detail",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=project_member,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/")

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_app_archived_module_list_hides_private_modules_from_unrelated_members(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-archive@example.com")
    private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Private Archived",
        visibility=Module.ModuleVisibility.PRIVATE,
        archived_at=timezone.now(),
        created_by=project_member,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/archived-modules/")

    assert response.status_code == status.HTTP_200_OK
    module_ids = {item["id"] for item in response.data}
    assert str(private_module.id) not in module_ids
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_private_modules_app.py -q
```

Expected: FAIL because private modules are still returned to unrelated users or `visibility` is missing from response dictionaries.

- [ ] **Step 3: Return visibility in app module serializers**

In `apps/api/plane/app/serializers/module.py`, add `"visibility"` to `ModuleSerializer.Meta.fields` immediately after `"status"`:

```python
"status",
"visibility",
"lead_id",
```

`ModuleWriteSerializer` uses `fields = "__all__"`, so DRF will accept and validate `visibility` after Task 1.

- [ ] **Step 4: Filter app module queryset**

In `apps/api/plane/app/views/module/base.py`, add the helper import:

```python
from plane.db.utils.module_visibility import filter_visible_modules
```

In `ModuleViewSet.get_queryset`, apply filtering before annotations:

```python
        return (
            filter_visible_modules(
                super()
                .get_queryset()
                .filter(project_id=self.kwargs.get("project_id"))
                .filter(workspace__slug=self.kwargs.get("slug")),
                self.request.user,
            )
            .annotate(is_favorite=Exists(favorite_subquery))
```

Add `"visibility"` to all `.values(...)` payloads in `create`, `list`, and `partial_update`:

```python
"status",
"visibility",
"lead_id",
```

- [ ] **Step 5: Filter app archived module queryset**

In `apps/api/plane/app/views/module/archive.py`, add the helper import:

```python
from plane.db.utils.module_visibility import filter_visible_modules
```

Wrap the base module queryset in `get_queryset`:

```python
        return (
            filter_visible_modules(
                Module.objects.filter(workspace__slug=self.kwargs.get("slug"))
                .filter(project_id=self.kwargs.get("project_id"))
                .filter(archived_at__isnull=False),
                self.request.user,
            )
            .annotate(is_favorite=Exists(favorite_subquery))
```

Add `"visibility"` to archived module `.values(...)` responses wherever module model fields are enumerated.

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_private_modules_app.py -q
```

Expected: PASS for model/helper and app module endpoint tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/plane/app/serializers/module.py apps/api/plane/app/views/module/base.py apps/api/plane/app/views/module/archive.py apps/api/plane/tests/contract/app/test_private_modules_app.py
git commit -m "feat: filter app modules by visibility"
```

## Task 3: App Work Item Module Assignment And Serialization

**Files:**

- Modify: `apps/api/plane/app/serializers/issue.py`
- Modify: `apps/api/plane/app/views/module/issue.py`
- Test: `apps/api/plane/tests/contract/app/test_private_modules_app.py`

- [ ] **Step 1: Add failing assignment and serialization tests**

Append these tests:

```python
def test_related_user_can_assign_private_module_to_work_item(api_client, workspace, project, project_member, issue):
    private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Assignable Private",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=project_member,
    )

    api_client.force_authenticate(project_member)
    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/modules/",
        {"modules": [str(private_module.id)]},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert ModuleIssue.objects.filter(module=private_module, issue=issue).exists()


def test_unrelated_user_cannot_assign_hidden_private_module_to_work_item(api_client, workspace, project, project_member, issue):
    unrelated_user = make_project_member(workspace, project, "unrelated-assign@example.com")
    private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Hidden Assign",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=project_member,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/modules/",
        {"modules": [str(private_module.id)]},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert not ModuleIssue.objects.filter(module=private_module, issue=issue).exists()


def test_issue_list_hides_private_module_ids_from_unrelated_members(api_client, workspace, project, project_member, issue):
    unrelated_user = make_project_member(workspace, project, "unrelated-issue-list@example.com")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Visible Public")
    private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Hidden Issue Module",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=project_member,
    )
    ModuleIssue.objects.create(workspace=workspace, project=project, module=public_module, issue=issue)
    ModuleIssue.objects.create(workspace=workspace, project=project, module=private_module, issue=issue)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/")

    assert response.status_code == status.HTTP_200_OK
    response_issue = next(item for item in response.data["results"] if item["id"] == issue.id)
    assert response_issue["module_ids"] == [public_module.id]
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_private_modules_app.py -q
```

Expected: FAIL because unrelated users can post hidden private module IDs or issue responses include hidden module IDs.

- [ ] **Step 3: Filter `IssueListDetailSerializer.get_module_ids`**

In `apps/api/plane/app/serializers/issue.py`, import:

```python
from plane.db.utils.module_visibility import is_module_visible_to_user
```

Replace `get_module_ids`:

```python
    def get_module_ids(self, obj):
        request = self.context.get("request")
        user = request.user if request else None

        return [
            module_issue.module_id
            for module_issue in obj.issue_module.all()
            if module_issue.module and is_module_visible_to_user(module_issue.module, user)
        ]
```

- [ ] **Step 4: Pass request context when app issue serializers are constructed**

Search for app issue serializer construction:

```bash
rg -n "IssueListDetailSerializer\\(" apps/api/plane/app
```

For each call that serializes request-facing issue data, pass request context:

```python
IssueListDetailSerializer(issues, many=True, context={"request": request}).data
```

When serialization is routed through helper functions such as `issue_on_results`, update the helper signature to accept `request=None` and pass the context into `IssueListDetailSerializer`.

- [ ] **Step 5: Gate app module issue route targets**

In `apps/api/plane/app/views/module/issue.py`, add imports:

```python
from plane.db.models import Module
from plane.db.utils.module_visibility import filter_visible_modules
```

Add a small lookup helper inside `ModuleIssueViewSet`:

```python
    def get_visible_module_or_404(self, slug, project_id, module_id):
        module = (
            filter_visible_modules(
                Module.objects.filter(workspace__slug=slug, project_id=project_id, pk=module_id),
                self.request.user,
            )
            .first()
        )
        if module is None:
            return None
        return module
```

At the start of `list`, `create_module_issues`, `retrieve`, `destroy`, and any method that receives `module_id`, return 404 when hidden:

```python
        if self.get_visible_module_or_404(slug, project_id, module_id) is None:
            return Response({"error": "Module not found"}, status=status.HTTP_404_NOT_FOUND)
```

In `create_issue_modules`, validate all added and removed modules before creating or deleting rows:

```python
        module_ids = [str(module_id) for module_id in modules + removed_modules]
        visible_module_ids = set(
            filter_visible_modules(
                Module.objects.filter(workspace__slug=slug, project_id=project_id, id__in=module_ids),
                request.user,
            ).values_list("id", flat=True)
        )
        hidden_module_ids = set(module_ids) - {str(module_id) for module_id in visible_module_ids}
        if hidden_module_ids:
            return Response({"error": "Module not found"}, status=status.HTTP_404_NOT_FOUND)
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_private_modules_app.py -q
```

Expected: PASS for assignment and issue serialization tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/plane/app/serializers/issue.py apps/api/plane/app/views/module/issue.py apps/api/plane/tests/contract/app/test_private_modules_app.py
git commit -m "feat: hide private modules on app work items"
```

## Task 4: Legacy API And Space API Coverage

**Files:**

- Modify: `apps/api/plane/api/serializers/module.py`
- Modify: `apps/api/plane/api/serializers/issue.py`
- Modify: `apps/api/plane/api/views/module.py`
- Modify: `apps/api/plane/space/views/module.py`
- Modify: `apps/api/plane/space/views/issue.py`
- Modify: `apps/api/plane/space/utils/grouper.py`
- Test: `apps/api/plane/tests/contract/app/test_private_modules_app.py`

- [ ] **Step 1: Add failing legacy API and Space tests**

Append these tests:

```python
def test_legacy_module_list_hides_private_modules_from_unrelated_members(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-legacy-list@example.com")
    private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Legacy Hidden",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=project_member,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/v1/workspaces/{workspace.slug}/projects/{project.id}/modules/")

    assert response.status_code == status.HTTP_200_OK
    module_ids = {item["id"] for item in response.data["results"]}
    assert str(private_module.id) not in module_ids


def test_space_module_list_excludes_private_modules(api_client, workspace, project, project_member):
    from plane.db.models import DeployBoard

    DeployBoard.objects.create(
        workspace=workspace,
        project=project,
        anchor="private-modules-space",
        entity_name="project",
        entity_identifier=project.id,
    )
    public_module = Module.objects.create(workspace=workspace, project=project, name="Space Public")
    private_module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Space Hidden",
        visibility=Module.ModuleVisibility.PRIVATE,
        created_by=project_member,
    )

    response = api_client.get("/api/public/anchor/private-modules-space/modules/")

    assert response.status_code == status.HTTP_200_OK
    module_ids = {str(item["id"]) for item in response.data}
    assert str(public_module.id) in module_ids
    assert str(private_module.id) not in module_ids
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_private_modules_app.py -q
```

Expected: FAIL because legacy API or Space still returns hidden private modules.

- [ ] **Step 3: Update legacy module serializers**

In `apps/api/plane/api/serializers/module.py`, add `"visibility"` to `ModuleCreateSerializer.Meta.fields`:

```python
"status",
"visibility",
"lead",
```

`ModuleSerializer` uses `fields = "__all__"`, so it will return `visibility` automatically.

- [ ] **Step 4: Filter legacy module querysets and gate module issue routes**

In `apps/api/plane/api/views/module.py`, import:

```python
from plane.db.utils.module_visibility import filter_visible_modules
```

Wrap base `Module.objects.filter(...)` querysets in `ModuleListCreateAPIEndpoint.get_queryset`, `ModuleDetailAPIEndpoint.get_queryset`, and `ModuleArchiveUnarchiveAPIEndpoint.get_queryset`:

```python
            filter_visible_modules(
                Module.objects.filter(project_id=self.kwargs.get("project_id")).filter(workspace__slug=self.kwargs.get("slug")),
                self.request.user,
            )
```

In `ModuleIssueListCreateAPIEndpoint.post`, replace direct module lookup:

```python
        module = (
            filter_visible_modules(
                Module.objects.filter(workspace__slug=slug, project_id=project_id, pk=module_id),
                request.user,
            )
            .first()
        )
        if module is None:
            return Response({"error": "Module not found"}, status=status.HTTP_404_NOT_FOUND)
```

Apply the same visibility lookup before listing or deleting module issue rows by `module_id`.

- [ ] **Step 5: Filter legacy expanded issue module serialization**

In `apps/api/plane/api/serializers/issue.py`, import:

```python
from plane.db.utils.module_visibility import is_module_visible_to_user
```

Replace `IssueExpandSerializer.module` with a method field:

```python
    module = serializers.SerializerMethodField()

    def get_module(self, obj):
        module_issue = getattr(obj, "issue_module", None)
        module = getattr(module_issue, "module", None)
        request = self.context.get("request")
        user = request.user if request else None
        if module is None or not is_module_visible_to_user(module, user):
            return None
        return ModuleLiteSerializer(module).data
```

- [ ] **Step 6: Exclude private modules from Space module list**

In `apps/api/plane/space/views/module.py`, change the queryset:

```python
        modules = Module.objects.filter(
            workspace__slug=deploy_board.workspace.slug,
            project_id=deploy_board.project_id,
            visibility=Module.ModuleVisibility.PUBLIC,
        ).values("id", "name")
```

- [ ] **Step 7: Filter Space issue `module_ids` and grouping**

In `apps/api/plane/space/views/issue.py`, add `issue_module__module__visibility=Module.ModuleVisibility.PUBLIC` to every `ArrayAgg("issue_module__module_id", ...)` filter.

In `apps/api/plane/space/utils/grouper.py`, add the public visibility condition to module grouping filters:

```python
"issue_module__module_id": Q(
    issue_module__deleted_at__isnull=True,
    issue_module__module__visibility=Module.ModuleVisibility.PUBLIC,
),
```

Import `Module` in that file if it is not already imported.

- [ ] **Step 8: Run tests to verify they pass**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_private_modules_app.py -q
```

Expected: PASS for legacy API and Space tests.

- [ ] **Step 9: Commit**

```bash
git add apps/api/plane/api/serializers/module.py apps/api/plane/api/serializers/issue.py apps/api/plane/api/views/module.py apps/api/plane/space/views/module.py apps/api/plane/space/views/issue.py apps/api/plane/space/utils/grouper.py apps/api/plane/tests/contract/app/test_private_modules_app.py
git commit -m "feat: protect private modules across api surfaces"
```

## Task 5: Frontend Types And Module Form

**Files:**

- Modify: `packages/types/src/module/modules.ts`
- Modify: `apps/web/core/components/modules/form.tsx`
- Modify: `apps/web/core/components/modules/module-list-item.tsx`
- Modify: `apps/web/core/components/modules/module-card-item.tsx`
- Modify: `packages/i18n/src/locales/en/module.json`
- Modify: `packages/i18n/src/locales/*/module.json` through the repo translation workflow

- [ ] **Step 1: Add TypeScript visibility type first**

In `packages/types/src/module/modules.ts`, add:

```typescript
export type TModuleVisibility = "public" | "private";
```

Add to `IModule` near `status`:

```typescript
visibility: TModuleVisibility;
```

Run:

```bash
pnpm check:types
```

Expected: FAIL where module form default values and mocks do not provide `visibility`.

- [ ] **Step 2: Add frontend i18n strings**

Before editing locale JSON, read and follow `/Users/zequeen/Projects/plane/.agents/skills/translate/SKILL.md`.

In `packages/i18n/src/locales/en/module.json`, add keys under the existing module namespace:

```json
{
  "visibility": "Visibility",
  "visibility_public": "Public",
  "visibility_private": "Private",
  "visibility_private_description": "Only the creator, lead, and members can see this module."
}
```

If the file is nested differently, preserve the existing nesting and add equivalent keys under `project_module`. Add matching keys to the other `packages/i18n/src/locales/*/module.json` files using the translate skill terminology and variable/tag preservation rules.

- [ ] **Step 3: Add form defaults and controller**

In `apps/web/core/components/modules/form.tsx`, update defaults:

```typescript
const defaultValues: Partial<IModule> = {
  name: "",
  description: "",
  status: "backlog",
  visibility: "public",
  lead_id: null,
  member_ids: [],
};
```

Update `useForm` defaults:

```typescript
      visibility: data?.visibility || "public",
```

Use two native buttons inside one bordered container as the segmented visibility control:

```tsx
<Controller
  control={control}
  name="visibility"
  render={({ field: { value, onChange } }) => (
    <div className="flex flex-col gap-1">
      <div className="flex h-7 items-center rounded border-[0.5px] border-subtle">
        <button
          type="button"
          className={cn(
            "h-full px-3 text-xs",
            value === "public" ? "bg-custom-primary-100/10 text-custom-primary-100" : "text-secondary"
          )}
          onClick={() => onChange("public")}
        >
          {t("project_module.visibility_public")}
        </button>
        <button
          type="button"
          className={cn(
            "h-full border-l-[0.5px] border-subtle px-3 text-xs",
            value === "private" ? "bg-custom-primary-100/10 text-custom-primary-100" : "text-secondary"
          )}
          onClick={() => onChange("private")}
        >
          {t("project_module.visibility_private")}
        </button>
      </div>
      {value === "private" && (
        <span className="text-11 text-secondary">{t("project_module.visibility_private_description")}</span>
      )}
    </div>
  )}
/>
```

Add `cn` import if this exact control is used:

```typescript
import { cn, getDate, renderFormattedPayloadDate, getTabIndex } from "@plane/utils";
```

- [ ] **Step 4: Show lock indicator for private modules**

In `apps/web/core/components/modules/module-list-item.tsx` and `apps/web/core/components/modules/module-card-item.tsx`, import `Lock` from `lucide-react`:

```typescript
import { Lock } from "lucide-react";
```

Render next to module name:

```tsx
{
  module.visibility === "private" && (
    <Lock className="h-3.5 w-3.5 flex-shrink-0 text-secondary" aria-label={t("project_module.visibility_private")} />
  );
}
```

Apply the indicator next to the module name in both components so list and card layouts expose the same private-module state.

- [ ] **Step 5: Run type and lint checks**

Run:

```bash
pnpm check:types
pnpm check:lint
```

Expected: PASS. If type checking reveals test fixtures or mock module objects missing `visibility`, add `visibility: "public"` to those objects.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/module/modules.ts apps/web/core/components/modules/form.tsx apps/web/core/components/modules/module-list-item.tsx apps/web/core/components/modules/module-card-item.tsx packages/i18n/src/locales/*/module.json
git commit -m "feat: add module visibility controls"
```

## Task 6: Final Verification And Leakage Audit

**Files:**

- Inspect: `apps/api/plane`
- Inspect: `apps/web`
- Inspect: `packages`

- [ ] **Step 1: Search for unfiltered module exposure**

Run:

```bash
rg -n "module_ids|issue_module__module|issue_module__module_id|Module.objects\\.filter|module\\.name" apps/api/plane
```

Expected: Every request-facing use that returns module IDs, names, or module records is either filtered with `filter_visible_modules`, `filter_visible_module_relations`, `module_visible_to_user_q`, or intentionally public-only for Space.

- [ ] **Step 2: Run focused backend tests**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest apps/api/plane/tests/contract/app/test_private_modules_app.py apps/api/plane/tests/contract/app/test_project_issue_fields_app.py -q
```

Expected: PASS.

- [ ] **Step 3: Run backend unit subset**

Run:

```bash
docker compose -f docker-compose-test.yml run --rm api-tests pytest -m unit -q
```

Expected: PASS.

- [ ] **Step 4: Run frontend checks**

Run:

```bash
pnpm check:types
pnpm check:lint
```

Expected: PASS.

- [ ] **Step 5: Run full repository check if time allows**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 6: Commit any final fixes**

If verification required changes:

```bash
git add apps/api/plane apps/web packages
git commit -m "fix: complete private module visibility coverage"
```

If no changes were required, do not create an empty commit.
