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
