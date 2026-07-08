import json

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import (
    Issue,
    Module,
    ModuleIssue,
    ModuleLink,
    ModuleMember,
    ModuleUserProperties,
    Project,
    ProjectMember,
    State,
    StateGroup,
    User,
    UserFavorite,
    WorkspaceMember,
)
from plane.db.utils.module_visibility import (
    filter_visible_module_relations,
    filter_visible_modules,
    is_module_visible_to_user,
)


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(workspace, create_user):
    project = Project.objects.create(
        name="Private Modules",
        identifier="PM",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=20, is_active=True)
    return project


@pytest.fixture
def project_member(create_user):
    return create_user


def make_project_member(workspace, project, email):
    user = User.objects.create(email=email, username=email.split("@")[0], first_name="Test", last_name="User")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15, is_active=True)
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=15, is_active=True)
    return user


def make_created_private_module(workspace, project, name, creator):
    module = Module(
        workspace=workspace,
        project=project,
        name=name,
        visibility=Module.ModuleVisibility.PRIVATE,
    )
    module.save(created_by_id=creator.id)
    return module


def collect_nested_values(data):
    if isinstance(data, dict):
        values = set(data.keys())
        for value in data.values():
            values.update(collect_nested_values(value))
        return values
    if isinstance(data, list):
        values = set()
        for item in data:
            values.update(collect_nested_values(item))
        return values
    return {str(data)}


def test_existing_modules_default_to_public(workspace, project):
    module = Module.objects.create(workspace=workspace, project=project, name="Public by default")

    assert module.visibility == Module.ModuleVisibility.PUBLIC


def test_filter_visible_modules_includes_public_and_related_private_modules(workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-private-modules@example.com")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public")
    created_private_module = make_created_private_module(workspace, project, "Created Private", project_member)
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
    hidden_private_module = make_created_private_module(workspace, project, "Hidden Private", unrelated_user)

    visible_ids = set(filter_visible_modules(Module.objects.filter(project=project), project_member).values_list("id", flat=True))

    assert public_module.id in visible_ids
    assert created_private_module.id in visible_ids
    assert lead_private_module.id in visible_ids
    assert member_private_module.id in visible_ids
    assert hidden_private_module.id not in visible_ids


def test_is_module_visible_to_user_matches_creator_lead_member_rules(workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-predicate@example.com")
    module = make_created_private_module(workspace, project, "Private", project_member)

    assert is_module_visible_to_user(module, project_member) is True
    assert is_module_visible_to_user(module, unrelated_user) is False


def test_is_module_visible_to_user_allows_private_module_lead(workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-lead-predicate@example.com")
    module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Lead Private",
        visibility=Module.ModuleVisibility.PRIVATE,
        lead=project_member,
    )

    assert is_module_visible_to_user(module, project_member) is True
    assert is_module_visible_to_user(module, unrelated_user) is False


def test_is_module_visible_to_user_allows_private_module_member(workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-member-predicate@example.com")
    module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Member Private",
        visibility=Module.ModuleVisibility.PRIVATE,
    )
    ModuleMember.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        member=project_member,
    )

    assert is_module_visible_to_user(module, project_member) is True
    assert is_module_visible_to_user(module, unrelated_user) is False


def test_filter_visible_module_relations_filters_hidden_private_module_issues(workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-module-issue@example.com")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Relation")
    created_private_module = make_created_private_module(workspace, project, "Created Private Relation", project_member)
    hidden_private_module = make_created_private_module(workspace, project, "Hidden Private Relation", unrelated_user)
    issue = Issue.objects.create(workspace=workspace, project=project, name="Module relation issue")
    public_module_issue = ModuleIssue.objects.create(
        workspace=workspace,
        project=project,
        module=public_module,
        issue=issue,
    )
    created_private_module_issue = ModuleIssue.objects.create(
        workspace=workspace,
        project=project,
        module=created_private_module,
        issue=issue,
    )
    hidden_private_module_issue = ModuleIssue.objects.create(
        workspace=workspace,
        project=project,
        module=hidden_private_module,
        issue=issue,
    )

    visible_relation_ids = set(
        filter_visible_module_relations(ModuleIssue.objects.filter(project=project), project_member).values_list(
            "id", flat=True
        )
    )

    assert public_module_issue.id in visible_relation_ids
    assert created_private_module_issue.id in visible_relation_ids
    assert hidden_private_module_issue.id not in visible_relation_ids


def test_filter_visible_module_relations_supports_custom_module_prefix_from_issues(workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-module-prefix@example.com")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Prefix Relation")
    created_private_module = make_created_private_module(workspace, project, "Created Private Prefix Relation", project_member)
    hidden_private_module = make_created_private_module(workspace, project, "Hidden Private Prefix Relation", unrelated_user)
    public_issue = Issue.objects.create(workspace=workspace, project=project, name="Public module issue")
    created_private_issue = Issue.objects.create(workspace=workspace, project=project, name="Created private module issue")
    hidden_private_issue = Issue.objects.create(workspace=workspace, project=project, name="Hidden private module issue")
    ModuleIssue.objects.create(
        workspace=workspace,
        project=project,
        module=public_module,
        issue=public_issue,
    )
    ModuleIssue.objects.create(
        workspace=workspace,
        project=project,
        module=created_private_module,
        issue=created_private_issue,
    )
    ModuleIssue.objects.create(
        workspace=workspace,
        project=project,
        module=hidden_private_module,
        issue=hidden_private_issue,
    )

    visible_issue_ids = set(
        filter_visible_module_relations(
            Issue.objects.filter(project=project),
            project_member,
            module_prefix="issue_module__module__",
        ).values_list("id", flat=True)
    )

    assert public_issue.id in visible_issue_ids
    assert created_private_issue.id in visible_issue_ids
    assert hidden_private_issue.id not in visible_issue_ids


def test_soft_deleted_module_member_does_not_grant_private_module_visibility(workspace, project, project_member):
    module = Module.objects.create(
        workspace=workspace,
        project=project,
        name="Soft deleted member private",
        visibility=Module.ModuleVisibility.PRIVATE,
    )
    module_member = ModuleMember.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        member=project_member,
    )
    issue = Issue.objects.create(workspace=workspace, project=project, name="Soft deleted member issue")
    module_issue = ModuleIssue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
    )
    module_member.delete()
    module_member.refresh_from_db()

    visible_module_ids = set(
        filter_visible_modules(Module.objects.filter(project=project), project_member).values_list("id", flat=True)
    )
    visible_relation_ids = set(
        filter_visible_module_relations(ModuleIssue.objects.filter(project=project), project_member).values_list(
            "id", flat=True
        )
    )

    assert module_member.deleted_at is not None
    assert is_module_visible_to_user(module, project_member) is False
    assert module.id not in visible_module_ids
    assert module_issue.id not in visible_relation_ids


def test_app_module_list_hides_private_modules_from_unrelated_members(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-list@example.com")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public")
    private_module = make_created_private_module(workspace, project, "Private", project_member)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/")

    assert response.status_code == status.HTTP_200_OK
    module_ids = {str(item["id"]) for item in response.data}
    assert str(public_module.id) in module_ids
    assert str(private_module.id) not in module_ids


def test_app_workspace_module_list_hides_private_modules_from_unrelated_members(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-workspace-list@example.com")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Workspace Public")
    private_module = make_created_private_module(workspace, project, "Workspace Private", project_member)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/modules/")

    assert response.status_code == status.HTTP_200_OK
    module_ids = {str(item["id"]) for item in response.data}
    assert str(public_module.id) in module_ids
    assert str(private_module.id) not in module_ids


def test_app_module_list_includes_private_modules_for_creator(api_client, workspace, project, project_member):
    private_module = make_created_private_module(workspace, project, "Creator Private", project_member)

    api_client.force_authenticate(project_member)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/")

    assert response.status_code == status.HTTP_200_OK
    module = next(item for item in response.data if str(item["id"]) == str(private_module.id))
    assert module["visibility"] == Module.ModuleVisibility.PRIVATE


def test_app_module_detail_returns_404_for_hidden_private_module(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-detail@example.com")
    private_module = make_created_private_module(workspace, project, "Private Detail", project_member)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/")

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_app_archived_module_list_hides_private_modules_from_unrelated_members(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-archive@example.com")
    private_module = make_created_private_module(workspace, project, "Private Archived", project_member)
    private_module.archived_at = timezone.now()
    private_module.save()

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/archived-modules/")

    assert response.status_code == status.HTTP_200_OK
    module_ids = {str(item["id"]) for item in response.data}
    assert str(private_module.id) not in module_ids


def test_app_archive_private_module_returns_404_for_unrelated_member(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-archive-mutation@example.com")
    private_module = make_created_private_module(workspace, project, "Private Archive Mutation", project_member)
    Module.objects.filter(pk=private_module.pk).update(status="completed")

    api_client.force_authenticate(unrelated_user)
    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/archive/"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    private_module.refresh_from_db()
    assert private_module.archived_at is None


def test_app_unarchive_private_module_returns_404_for_unrelated_member(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-unarchive-mutation@example.com")
    private_module = make_created_private_module(workspace, project, "Private Unarchive Mutation", project_member)
    Module.objects.filter(pk=private_module.pk).update(status="completed", archived_at=timezone.now())
    private_module.refresh_from_db()

    api_client.force_authenticate(unrelated_user)
    response = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/archive/"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    private_module.refresh_from_db()
    assert private_module.archived_at is not None


def test_app_creator_can_archive_and_unarchive_private_module(api_client, workspace, project, project_member):
    private_module = make_created_private_module(workspace, project, "Creator Archive Mutation", project_member)
    Module.objects.filter(pk=private_module.pk).update(status="completed")

    api_client.force_authenticate(project_member)
    archive_response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/archive/"
    )

    assert archive_response.status_code == status.HTTP_200_OK
    private_module.refresh_from_db()
    assert private_module.archived_at is not None

    unarchive_response = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/archive/"
    )

    assert unarchive_response.status_code == status.HTTP_204_NO_CONTENT
    private_module.refresh_from_db()
    assert private_module.archived_at is None


def test_app_archived_module_detail_returns_404_for_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-archive-detail@example.com")
    private_module = make_created_private_module(workspace, project, "Private Archived Detail", project_member)
    private_module.archived_at = timezone.now()
    private_module.save()

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/archived-modules/{private_module.id}/"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_app_module_list_member_ids_include_all_active_members_for_private_module(
    api_client, workspace, project, project_member
):
    member_one = make_project_member(workspace, project, "module-member-one@example.com")
    member_two = make_project_member(workspace, project, "module-member-two@example.com")
    private_module = make_created_private_module(workspace, project, "Private With Members", project_member)
    ModuleMember.objects.create(workspace=workspace, project=project, module=private_module, member=member_one)
    ModuleMember.objects.create(workspace=workspace, project=project, module=private_module, member=member_two)

    api_client.force_authenticate(member_one)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/")

    assert response.status_code == status.HTTP_200_OK
    module = next(item for item in response.data if str(item["id"]) == str(private_module.id))
    assert {str(member_id) for member_id in module["member_ids"]} == {str(member_one.id), str(member_two.id)}


def test_app_module_links_list_hides_hidden_private_module_links(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-link-list@example.com")
    private_module = make_created_private_module(workspace, project, "Private Link List", project_member)
    ModuleLink.objects.create(
        workspace=workspace,
        project=project,
        module=private_module,
        url="https://example.com/private",
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/module-links/"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data == []


def test_app_module_links_create_returns_404_for_hidden_private_module(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-link-create@example.com")
    private_module = make_created_private_module(workspace, project, "Private Link Create", project_member)

    api_client.force_authenticate(unrelated_user)
    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/module-links/",
        {"url": "https://example.com"},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert not ModuleLink.objects.filter(module=private_module, url="https://example.com").exists()


def test_app_module_favorite_create_returns_404_for_hidden_private_module(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-favorite-create@example.com")
    private_module = make_created_private_module(workspace, project, "Private Favorite Create", project_member)

    api_client.force_authenticate(unrelated_user)
    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/user-favorite-modules/",
        {"module": str(private_module.id)},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert not UserFavorite.objects.filter(
        user=unrelated_user,
        entity_type="module",
        entity_identifier=private_module.id,
    ).exists()


def test_app_module_favorite_list_excludes_hidden_private_modules(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-favorite-list@example.com")
    private_module = make_created_private_module(workspace, project, "Private Favorite List", project_member)
    UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=unrelated_user,
        entity_type="module",
        entity_identifier=private_module.id,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/user-favorite-modules/")

    assert response.status_code == status.HTTP_200_OK
    favorite_ids = {str(item["entity_identifier"]) for item in response.data}
    assert str(private_module.id) not in favorite_ids


def test_app_module_favorite_delete_returns_404_for_hidden_private_module(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-favorite-delete@example.com")
    private_module = make_created_private_module(workspace, project, "Private Favorite Delete", project_member)
    favorite = UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=unrelated_user,
        entity_type="module",
        entity_identifier=private_module.id,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/user-favorite-modules/{private_module.id}/"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert UserFavorite.objects.filter(pk=favorite.pk).exists()


def test_app_module_favorite_related_user_can_delete_private_module(api_client, workspace, project, project_member):
    private_module = make_created_private_module(workspace, project, "Private Favorite Related Delete", project_member)
    favorite = UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=project_member,
        entity_type="module",
        entity_identifier=private_module.id,
    )

    api_client.force_authenticate(project_member)
    response = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/user-favorite-modules/{private_module.id}/"
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not UserFavorite.objects.filter(pk=favorite.pk).exists()


def test_app_module_user_properties_get_returns_404_for_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-properties-get@example.com")
    private_module = make_created_private_module(workspace, project, "Private Properties Get", project_member)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/user-properties/"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert not ModuleUserProperties.objects.filter(module=private_module, user=unrelated_user).exists()


def test_workspace_user_favorites_excludes_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-workspace-favorite-list@example.com")
    private_module = make_created_private_module(workspace, project, "Private Workspace Favorite List", project_member)
    UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=unrelated_user,
        entity_type="module",
        entity_identifier=private_module.id,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/user-favorites/")

    assert response.status_code == status.HTTP_200_OK
    favorite_ids = {str(item["entity_identifier"]) for item in response.data}
    assert str(private_module.id) not in favorite_ids


def test_workspace_user_favorites_create_returns_404_for_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-workspace-favorite-create@example.com")
    private_module = make_created_private_module(workspace, project, "Private Workspace Favorite Create", project_member)

    api_client.force_authenticate(unrelated_user)
    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/user-favorites/",
        {
            "entity_type": "module",
            "entity_identifier": str(private_module.id),
            "project_id": str(project.id),
        },
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert not UserFavorite.objects.filter(
        user=unrelated_user,
        entity_type="module",
        entity_identifier=private_module.id,
    ).exists()


def test_workspace_user_favorites_allow_related_private_module(
    api_client, workspace, project, project_member
):
    private_module = make_created_private_module(workspace, project, "Private Workspace Favorite Allowed", project_member)

    api_client.force_authenticate(project_member)
    create_response = api_client.post(
        f"/api/workspaces/{workspace.slug}/user-favorites/",
        {
            "entity_type": "module",
            "entity_identifier": str(private_module.id),
            "project_id": str(project.id),
        },
        format="json",
    )

    assert create_response.status_code == status.HTTP_200_OK
    assert create_response.data["entity_data"]["id"] == str(private_module.id)

    list_response = api_client.get(f"/api/workspaces/{workspace.slug}/user-favorites/")

    assert list_response.status_code == status.HTTP_200_OK
    favorite_ids = {str(item["entity_identifier"]) for item in list_response.data}
    assert str(private_module.id) in favorite_ids


def test_workspace_user_favorite_group_excludes_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-workspace-favorite-group@example.com")
    private_module = make_created_private_module(workspace, project, "Private Workspace Favorite Group", project_member)
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Workspace Favorite Group")
    parent = UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=unrelated_user,
        entity_type="folder",
        name="Module Favorites",
        is_folder=True,
    )
    hidden_child = UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=unrelated_user,
        entity_type="module",
        entity_identifier=private_module.id,
        parent=parent,
    )
    visible_child = UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=unrelated_user,
        entity_type="module",
        entity_identifier=public_module.id,
        parent=parent,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/user-favorites/{parent.id}/group/")

    assert response.status_code == status.HTTP_200_OK
    favorite_ids = {item["id"] for item in response.data}
    assert str(hidden_child.id) not in favorite_ids
    assert str(visible_child.id) in favorite_ids


def test_app_module_user_properties_patch_returns_404_for_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-properties-patch@example.com")
    private_module = make_created_private_module(workspace, project, "Private Properties Patch", project_member)

    api_client.force_authenticate(unrelated_user)
    response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/user-properties/",
        {"filters": {"priority": ["high"]}},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert not ModuleUserProperties.objects.filter(module=private_module, user=unrelated_user).exists()


def test_app_module_link_detail_returns_404_for_hidden_private_module(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-link-detail@example.com")
    private_module = make_created_private_module(workspace, project, "Private Link Detail", project_member)
    module_link = ModuleLink.objects.create(
        workspace=workspace,
        project=project,
        module=private_module,
        url="https://example.com/detail",
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/module-links/{module_link.id}/"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_app_module_link_update_returns_404_for_hidden_private_module(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-link-update@example.com")
    private_module = make_created_private_module(workspace, project, "Private Link Update", project_member)
    module_link = ModuleLink.objects.create(
        workspace=workspace,
        project=project,
        module=private_module,
        url="https://example.com/update",
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/module-links/{module_link.id}/",
        {"url": "https://example.com/updated"},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    module_link.refresh_from_db()
    assert module_link.url == "https://example.com/update"


def test_app_module_link_delete_returns_404_for_hidden_private_module(api_client, workspace, project, project_member):
    unrelated_user = make_project_member(workspace, project, "unrelated-link-delete@example.com")
    private_module = make_created_private_module(workspace, project, "Private Link Delete", project_member)
    module_link = ModuleLink.objects.create(
        workspace=workspace,
        project=project,
        module=private_module,
        url="https://example.com/delete",
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/module-links/{module_link.id}/"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert ModuleLink.objects.filter(pk=module_link.pk).exists()


def test_workspace_user_favorites_patch_returns_404_for_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-workspace-favorite-patch@example.com")
    private_module = make_created_private_module(workspace, project, "Private Workspace Favorite Patch", project_member)
    favorite = UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=unrelated_user,
        entity_type="module",
        entity_identifier=private_module.id,
        name="Hidden favorite",
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/user-favorites/{favorite.id}/",
        {"name": "Leaked favorite"},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    favorite.refresh_from_db()
    assert favorite.name == "Hidden favorite"


def test_workspace_user_favorites_patch_cannot_change_favorite_to_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-workspace-favorite-patch-target@example.com")
    private_module = make_created_private_module(
        workspace,
        project,
        "Private Workspace Favorite Patch Target",
        project_member,
    )
    favorite = UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=unrelated_user,
        entity_type="project",
        entity_identifier=project.id,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/user-favorites/{favorite.id}/",
        {
            "entity_type": "module",
            "entity_identifier": str(private_module.id),
        },
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    favorite.refresh_from_db()
    assert favorite.entity_type == "project"
    assert favorite.entity_identifier == project.id


def test_workspace_user_favorites_delete_returns_404_for_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-workspace-favorite-delete@example.com")
    private_module = make_created_private_module(workspace, project, "Private Workspace Favorite Delete", project_member)
    favorite = UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=unrelated_user,
        entity_type="module",
        entity_identifier=private_module.id,
    )

    api_client.force_authenticate(unrelated_user)
    response = api_client.delete(f"/api/workspaces/{workspace.slug}/user-favorites/{favorite.id}/")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert UserFavorite.objects.filter(pk=favorite.pk).exists()


def test_workspace_user_favorites_related_user_can_patch_and_delete_private_module(
    api_client, workspace, project, project_member
):
    private_module = make_created_private_module(workspace, project, "Private Workspace Favorite Patch Delete", project_member)
    favorite = UserFavorite.objects.create(
        workspace=workspace,
        project=project,
        user=project_member,
        entity_type="module",
        entity_identifier=private_module.id,
        name="Visible favorite",
    )

    api_client.force_authenticate(project_member)
    patch_response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/user-favorites/{favorite.id}/",
        {"name": "Updated visible favorite"},
        format="json",
    )

    assert patch_response.status_code == status.HTTP_200_OK
    assert patch_response.data["entity_data"]["id"] == str(private_module.id)
    favorite.refresh_from_db()
    assert favorite.name == "Updated visible favorite"

    delete_response = api_client.delete(f"/api/workspaces/{workspace.slug}/user-favorites/{favorite.id}/")

    assert delete_response.status_code == status.HTTP_204_NO_CONTENT
    assert not UserFavorite.objects.filter(pk=favorite.pk).exists()


def test_app_issue_module_assignment_returns_404_for_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-issue-module-assign@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Assign hidden private module")
    private_module = make_created_private_module(workspace, project, "Private Issue Assignment", project_member)

    api_client.force_authenticate(unrelated_user)
    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/modules/",
        {"modules": [str(private_module.id)]},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert not ModuleIssue.objects.filter(issue=issue, module=private_module).exists()


def test_app_issue_module_assignment_allows_related_private_module(
    api_client, workspace, project, project_member
):
    issue = Issue.objects.create(workspace=workspace, project=project, name="Assign related private module")
    private_module = make_created_private_module(workspace, project, "Related Private Issue Assignment", project_member)

    api_client.force_authenticate(project_member)
    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/modules/",
        {"modules": [str(private_module.id)]},
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert ModuleIssue.objects.filter(issue=issue, module=private_module).exists()


def test_app_module_issue_list_returns_404_for_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-module-issue-list@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Hidden module issue list")
    private_module = make_created_private_module(workspace, project, "Private Module Issue List", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{private_module.id}/issues/"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


def test_app_module_issue_list_masks_other_hidden_private_module_ids(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-visible-module-issue-list@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Visible module issue list")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Module Issue List")
    private_module = make_created_private_module(workspace, project, "Hidden Module Issue List", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{public_module.id}/issues/")

    assert response.status_code == status.HTTP_200_OK
    response_issue = next(item for item in response.data["results"] if item["id"] == issue.id)
    assert str(public_module.id) in {str(module_id) for module_id in response_issue["module_ids"]}
    assert str(private_module.id) not in {str(module_id) for module_id in response_issue["module_ids"]}


def test_app_module_issue_list_hidden_private_module_filter_returns_no_matches(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-module-issue-hidden-filter@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Module issue hidden filter")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Module Filter")
    private_module = make_created_private_module(workspace, project, "Hidden Module Filter", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{public_module.id}/issues/"
        f"?module={private_module.id}"
    )

    assert response.status_code == status.HTTP_200_OK
    assert issue.id not in {item["id"] for item in response.data["results"]}


def test_app_module_issue_group_by_module_ids_excludes_hidden_private_modules(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-module-issue-group-by-module@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Module issue grouped hidden modules")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Module Issue Group")
    private_module = make_created_private_module(workspace, project, "Hidden Module Issue Group", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{public_module.id}/issues/"
        "?group_by=module_ids"
    )

    assert response.status_code == status.HTTP_200_OK
    assert str(public_module.id) in collect_nested_values(response.data["results"])
    assert str(private_module.id) not in collect_nested_values(response.data["results"])


def test_app_issue_group_by_state_with_multiple_modules_returns_visible_module_ids(
    api_client, workspace, project, project_member
):
    public_module = Module.objects.create(workspace=workspace, project=project, name="First State Group Module")
    second_public_module = Module.objects.create(workspace=workspace, project=project, name="Second State Group Module")
    state = State.objects.create(
        workspace=workspace,
        project=project,
        name="State grouped modules",
        color="#60646C",
        group=StateGroup.UNSTARTED.value,
        sequence=25000,
    )
    issue = Issue.objects.create(
        workspace=workspace,
        project=project,
        state=state,
        name="Issue with multiple visible modules",
        priority="high",
    )
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=second_public_module)

    api_client.force_authenticate(project_member)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"
        "?group_by=state_id&order_by=-priority&sub_issue=true&filters={}&layout=list&cursor=50:0:0&per_page=50"
    )

    assert response.status_code == status.HTTP_200_OK
    issue_payload = next(
        item for item in response.data["results"][str(state.id)]["results"] if item["id"] == issue.id
    )
    assert {str(module_id) for module_id in issue_payload["module_ids"]} == {
        str(public_module.id),
        str(second_public_module.id),
    }


def test_app_issue_group_by_module_ids_excludes_hidden_private_modules(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-group-by-module@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Grouped hidden modules")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Group Module")
    private_module = make_created_private_module(workspace, project, "Hidden Group Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/?group_by=module_ids")

    assert response.status_code == status.HTTP_200_OK
    assert str(public_module.id) in collect_nested_values(response.data["results"])
    assert str(private_module.id) not in collect_nested_values(response.data["results"])


def test_app_issue_group_by_module_ids_keeps_hidden_only_issues_under_no_visible_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-group-hidden-only-module@example.com")
    hidden_only_issue = Issue.objects.create(workspace=workspace, project=project, name="Hidden only grouped issue")
    public_issue = Issue.objects.create(workspace=workspace, project=project, name="Public grouped issue")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Visible Group Module")
    private_module = make_created_private_module(workspace, project, "Hidden Only Group Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=hidden_only_issue, module=private_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=public_issue, module=public_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/?group_by=module_ids")

    assert response.status_code == status.HTTP_200_OK
    nested_values = collect_nested_values(response.data["results"])
    assert str(hidden_only_issue.id) in nested_values
    assert str(public_issue.id) in nested_values
    assert str(public_module.id) in nested_values
    assert str(private_module.id) not in nested_values
    assert "None" in response.data["results"]


def test_app_issue_group_by_module_ids_deduplicates_multiple_hidden_modules_under_none(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-group-duplicate-hidden-module@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Multiple hidden grouped issue")
    first_private_module = make_created_private_module(workspace, project, "First Hidden Group Module", project_member)
    second_private_module = make_created_private_module(workspace, project, "Second Hidden Group Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=first_private_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=second_private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/?group_by=module_ids")

    assert response.status_code == status.HTTP_200_OK
    none_results = response.data["results"]["None"]["results"]
    issue_ids = [item["id"] for item in none_results]
    assert issue_ids.count(issue.id) == 1
    assert response.data["results"]["None"]["total_results"] == len(none_results)
    nested_values = collect_nested_values(response.data["results"])
    assert str(first_private_module.id) not in nested_values
    assert str(second_private_module.id) not in nested_values


def test_app_issue_group_by_module_ids_uses_migrated_page_count_for_hidden_group_total_results(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-group-hidden-total@example.com")
    private_module = make_created_private_module(workspace, project, "Hidden Total Group Module", project_member)
    first_issue = Issue.objects.create(workspace=workspace, project=project, name="First hidden total issue")
    second_issue = Issue.objects.create(workspace=workspace, project=project, name="Second hidden total issue")
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=first_issue, module=private_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=second_issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/?group_by=module_ids&per_page=1"
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["results"]["None"]["total_results"] == 1
    assert len(response.data["results"]["None"]["results"]) == 1


def test_app_issue_group_by_module_ids_does_not_count_visible_module_issues_under_none(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-group-visible-hidden-total@example.com")
    hidden_only_issue = Issue.objects.create(workspace=workspace, project=project, name="Hidden only total issue")
    visible_issue = Issue.objects.create(workspace=workspace, project=project, name="Visible plus hidden total issue")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Visible Total Module")
    private_module = make_created_private_module(workspace, project, "Hidden Mixed Total Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=hidden_only_issue, module=private_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=visible_issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=visible_issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/?group_by=module_ids&per_page=1"
    )

    assert response.status_code == status.HTTP_200_OK
    none_group = response.data["results"]["None"]
    assert none_group["total_results"] == 0
    assert hidden_only_issue.id not in {item["id"] for item in none_group["results"]}
    assert visible_issue.id not in {item["id"] for item in none_group["results"]}


def test_app_issue_group_by_module_ids_uses_true_visible_modules_when_visible_row_is_off_page(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-group-visible-hidden-off-page@example.com")
    hidden_only_issue = Issue.objects.create(workspace=workspace, project=project, name="Hidden only first page issue")
    visible_issue = Issue.objects.create(workspace=workspace, project=project, name="Visible hidden off page issue")
    competing_public_issue = Issue.objects.create(
        workspace=workspace, project=project, name="Competing public first page issue"
    )
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Off Page Module")
    private_module = make_created_private_module(workspace, project, "Hidden Off Page Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=hidden_only_issue, module=private_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=visible_issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=visible_issue, module=private_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=competing_public_issue, module=public_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/?group_by=module_ids&per_page=1"
    )

    assert response.status_code == status.HTTP_200_OK
    none_group = response.data["results"]["None"]
    assert none_group["total_results"] == 0
    assert hidden_only_issue.id not in {item["id"] for item in none_group["results"]}
    assert visible_issue.id not in {item["id"] for item in none_group["results"]}
    public_group_issue_ids = {item["id"] for item in response.data["results"][str(public_module.id)]["results"]}
    assert competing_public_issue.id in public_group_issue_ids
    assert visible_issue.id not in public_group_issue_ids


def test_app_issue_subgroup_by_state_then_module_ids_excludes_hidden_private_modules(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-state-module-subgroup@example.com")
    state = State.objects.create(
        workspace=workspace,
        project=project,
        name="Todo",
        color="#60646C",
        group=StateGroup.UNSTARTED.value,
        sequence=25000,
        default=True,
    )
    issue = Issue.objects.create(workspace=workspace, project=project, state=state, name="State module subgroup")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public State Subgroup Module")
    private_module = make_created_private_module(workspace, project, "Hidden State Subgroup Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"
        "?group_by=state&sub_group_by=module_ids"
    )

    assert response.status_code == status.HTTP_200_OK
    nested_values = collect_nested_values(response.data["results"])
    assert str(state.id) in nested_values
    assert str(public_module.id) in nested_values
    assert str(private_module.id) not in nested_values


def test_app_issue_subgroup_by_state_then_module_ids_keeps_hidden_only_issues_under_none(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-state-hidden-only-subgroup@example.com")
    state = State.objects.create(
        workspace=workspace,
        project=project,
        name="Hidden Only State",
        color="#60646C",
        group=StateGroup.UNSTARTED.value,
        sequence=25000,
    )
    issue = Issue.objects.create(workspace=workspace, project=project, state=state, name="State hidden only subgroup")
    private_module = make_created_private_module(workspace, project, "Hidden State Only Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"
        "?group_by=state&sub_group_by=module_ids"
    )

    assert response.status_code == status.HTTP_200_OK
    state_group = response.data["results"][str(state.id)]
    none_results = state_group["results"]["None"]["results"]
    assert issue.id in {item["id"] for item in none_results}
    assert str(private_module.id) not in collect_nested_values(response.data["results"])


def test_app_issue_subgroup_by_state_then_module_ids_uses_migrated_page_count_for_hidden_subgroup_total_results(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-subgroup-hidden-total@example.com")
    state = State.objects.create(
        workspace=workspace,
        project=project,
        name="Hidden Total State",
        color="#60646C",
        group=StateGroup.UNSTARTED.value,
        sequence=25000,
    )
    private_module = make_created_private_module(workspace, project, "Hidden Total Subgroup Module", project_member)
    first_issue = Issue.objects.create(workspace=workspace, project=project, state=state, name="First subgroup total issue")
    second_issue = Issue.objects.create(workspace=workspace, project=project, state=state, name="Second subgroup total issue")
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=first_issue, module=private_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=second_issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"
        "?group_by=state&sub_group_by=module_ids&per_page=1"
    )

    assert response.status_code == status.HTTP_200_OK
    state_group = response.data["results"][str(state.id)]
    assert state_group["total_results"] == 1
    assert state_group["results"]["None"]["total_results"] == 1
    assert len(state_group["results"]["None"]["results"]) == 1


def test_app_issue_subgroup_by_state_then_module_ids_does_not_count_visible_module_issues_under_none(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-subgroup-visible-hidden-total@example.com")
    state = State.objects.create(
        workspace=workspace,
        project=project,
        name="Visible Hidden Total State",
        color="#60646C",
        group=StateGroup.UNSTARTED.value,
        sequence=25000,
    )
    hidden_only_issue = Issue.objects.create(workspace=workspace, project=project, state=state, name="Hidden only subgroup total issue")
    visible_issue = Issue.objects.create(workspace=workspace, project=project, state=state, name="Visible hidden subgroup total issue")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Subgroup Total Module")
    private_module = make_created_private_module(workspace, project, "Hidden Mixed Subgroup Total Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=hidden_only_issue, module=private_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=visible_issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=visible_issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"
        "?group_by=state&sub_group_by=module_ids&per_page=1"
    )

    assert response.status_code == status.HTTP_200_OK
    none_subgroup = response.data["results"][str(state.id)]["results"]["None"]
    assert none_subgroup["total_results"] == 0
    assert hidden_only_issue.id not in {item["id"] for item in none_subgroup["results"]}
    assert visible_issue.id not in {item["id"] for item in none_subgroup["results"]}


def test_app_issue_subgroup_by_state_then_module_ids_uses_true_visible_modules_when_visible_row_is_off_page(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-subgroup-visible-hidden-off-page@example.com")
    state = State.objects.create(
        workspace=workspace,
        project=project,
        name="Visible Hidden Off Page State",
        color="#60646C",
        group=StateGroup.UNSTARTED.value,
        sequence=25000,
    )
    hidden_only_issue = Issue.objects.create(workspace=workspace, project=project, state=state, name="Hidden only subgroup first page issue")
    visible_issue = Issue.objects.create(workspace=workspace, project=project, state=state, name="Visible subgroup off page issue")
    competing_public_issue = Issue.objects.create(
        workspace=workspace, project=project, state=state, name="Competing public subgroup first page issue"
    )
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Subgroup Off Page Module")
    private_module = make_created_private_module(workspace, project, "Hidden Subgroup Off Page Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=hidden_only_issue, module=private_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=visible_issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=visible_issue, module=private_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=competing_public_issue, module=public_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"
        "?group_by=state&sub_group_by=module_ids&per_page=1"
    )

    assert response.status_code == status.HTTP_200_OK
    none_subgroup = response.data["results"][str(state.id)]["results"]["None"]
    assert none_subgroup["total_results"] == 0
    assert hidden_only_issue.id not in {item["id"] for item in none_subgroup["results"]}
    assert visible_issue.id not in {item["id"] for item in none_subgroup["results"]}
    public_subgroup_issue_ids = {
        item["id"] for item in response.data["results"][str(state.id)]["results"][str(public_module.id)]["results"]
    }
    assert competing_public_issue.id in public_subgroup_issue_ids
    assert visible_issue.id not in public_subgroup_issue_ids


def test_app_issue_subgroup_by_module_ids_then_state_excludes_hidden_private_modules(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-module-state-subgroup@example.com")
    state = State.objects.create(
        workspace=workspace,
        project=project,
        name="Started",
        color="#F59E0B",
        group=StateGroup.STARTED.value,
        sequence=35000,
    )
    issue = Issue.objects.create(workspace=workspace, project=project, state=state, name="Module state subgroup")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Module Subgroup State")
    private_module = make_created_private_module(workspace, project, "Hidden Module Subgroup State", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"
        "?group_by=module_ids&sub_group_by=state"
    )

    assert response.status_code == status.HTTP_200_OK
    nested_values = collect_nested_values(response.data["results"])
    assert str(public_module.id) in nested_values
    assert str(state.id) in nested_values
    assert str(private_module.id) not in nested_values


def test_app_issue_list_hidden_private_module_filter_returns_no_matches(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-hidden-module-filter@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Hidden module filter")
    private_module = make_created_private_module(workspace, project, "Hidden Filter Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/?module={private_module.id}")

    assert response.status_code == status.HTTP_200_OK
    assert issue.id not in {item["id"] for item in response.data["results"]}


def test_app_issue_list_rich_module_id_filter_hides_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-rich-hidden-module-filter@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Hidden rich module filter")
    private_module = make_created_private_module(workspace, project, "Hidden Rich Filter Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"filters": json.dumps({"module_id": str(private_module.id)})},
    )

    assert response.status_code == status.HTTP_200_OK
    assert issue.id not in {item["id"] for item in response.data["results"]}


def test_app_issue_list_rich_module_id_in_filter_hides_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-rich-hidden-module-in-filter@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Hidden rich module in filter")
    private_module = make_created_private_module(workspace, project, "Hidden Rich In Filter Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"filters": json.dumps({"module_id__in": [str(private_module.id)]})},
    )

    assert response.status_code == status.HTTP_200_OK
    assert issue.id not in {item["id"] for item in response.data["results"]}


def test_app_issue_list_rich_module_filter_allows_public_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-rich-public-module-filter@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Public rich module filter")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Rich Filter Module")
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"filters": json.dumps({"module_id": str(public_module.id)})},
    )

    assert response.status_code == status.HTTP_200_OK
    assert issue.id in {item["id"] for item in response.data["results"]}


def test_app_issue_list_rich_module_in_filter_accepts_comma_separated_public_modules(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-rich-public-module-in-string@example.com")
    first_issue = Issue.objects.create(workspace=workspace, project=project, name="First public rich module in filter")
    second_issue = Issue.objects.create(workspace=workspace, project=project, name="Second public rich module in filter")
    first_public_module = Module.objects.create(workspace=workspace, project=project, name="First Public Rich In Module")
    second_public_module = Module.objects.create(workspace=workspace, project=project, name="Second Public Rich In Module")
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=first_issue, module=first_public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=second_issue, module=second_public_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"filters": json.dumps({"module_id__in": f"{first_public_module.id},{second_public_module.id}"})},
    )

    assert response.status_code == status.HTTP_200_OK
    response_issue_ids = {item["id"] for item in response.data["results"]}
    assert first_issue.id in response_issue_ids
    assert second_issue.id in response_issue_ids


def test_app_issues_detail_rich_module_id_filter_hides_hidden_private_module(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-detail-rich-hidden-module-filter@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Hidden rich module detail filter")
    private_module = make_created_private_module(workspace, project, "Hidden Rich Detail Filter Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues-detail/",
        {"filters": json.dumps({"module_id": str(private_module.id)})},
    )

    assert response.status_code == status.HTTP_200_OK
    assert issue.id not in {item["id"] for item in response.data["results"]}


def test_app_issue_list_invalid_module_filter_does_not_error(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/?module=not-a-uuid")

    assert response.status_code == status.HTTP_200_OK


def test_app_issue_list_module_null_filter_preserves_existing_no_filter_behavior(
    api_client, workspace, project, project_member
):
    issue = Issue.objects.create(workspace=workspace, project=project, name="Module null filter issue")

    api_client.force_authenticate(project_member)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/?module=null")

    assert response.status_code == status.HTTP_200_OK
    assert issue.id in {item["id"] for item in response.data["results"]}


def test_app_issue_module_assignment_validates_adds_and_removes_before_side_effects(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-mixed-module-assignment@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Mixed module assignment")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Mixed Assignment")
    private_module = make_created_private_module(workspace, project, "Hidden Mixed Assignment", project_member)
    hidden_relation = ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/modules/",
        {
            "modules": [str(public_module.id)],
            "removed_modules": [str(private_module.id)],
        },
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert not ModuleIssue.objects.filter(issue=issue, module=public_module).exists()
    assert ModuleIssue.objects.filter(pk=hidden_relation.pk).exists()


def test_app_issue_module_assignment_rejects_invalid_module_ids_before_side_effects(
    api_client, workspace, project, project_member
):
    issue = Issue.objects.create(workspace=workspace, project=project, name="Invalid module assignment")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Invalid Assignment")

    api_client.force_authenticate(project_member)
    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/modules/",
        {
            "modules": [str(public_module.id)],
            "removed_modules": ["not-a-uuid"],
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert not ModuleIssue.objects.filter(issue=issue, module=public_module).exists()


def test_app_issue_list_masks_hidden_private_module_ids_from_unrelated_member(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-issue-list-mask@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Issue list masked modules")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Issue List Module")
    private_module = make_created_private_module(workspace, project, "Private Issue List Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/")

    assert response.status_code == status.HTTP_200_OK
    response_issue = next(item for item in response.data["results"] if item["id"] == issue.id)
    assert str(public_module.id) in {str(module_id) for module_id in response_issue["module_ids"]}
    assert str(private_module.id) not in {str(module_id) for module_id in response_issue["module_ids"]}


def test_app_issue_detail_masks_hidden_private_module_ids_from_unrelated_member(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-issue-detail-mask@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Issue detail masked modules")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public Issue Detail Module")
    private_module = make_created_private_module(workspace, project, "Private Issue Detail Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/")

    assert response.status_code == status.HTTP_200_OK
    assert str(public_module.id) in {str(module_id) for module_id in response.data["module_ids"]}
    assert str(private_module.id) not in {str(module_id) for module_id in response.data["module_ids"]}


def test_app_v2_issue_list_masks_hidden_private_module_ids_from_unrelated_member(
    api_client, workspace, project, project_member
):
    unrelated_user = make_project_member(workspace, project, "unrelated-v2-issue-list-mask@example.com")
    issue = Issue.objects.create(workspace=workspace, project=project, name="V2 issue list masked modules")
    public_module = Module.objects.create(workspace=workspace, project=project, name="Public V2 Issue List Module")
    private_module = make_created_private_module(workspace, project, "Private V2 Issue List Module", project_member)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=public_module)
    ModuleIssue.objects.create(workspace=workspace, project=project, issue=issue, module=private_module)

    api_client.force_authenticate(unrelated_user)
    response = api_client.get(f"/api/workspaces/{workspace.slug}/projects/{project.id}/v2/issues/")

    assert response.status_code == status.HTTP_200_OK
    response_issue = next(item for item in response.data["results"] if item["id"] == issue.id)
    assert str(public_module.id) in {str(module_id) for module_id in response_issue["module_ids"]}
    assert str(private_module.id) not in {str(module_id) for module_id in response_issue["module_ids"]}
