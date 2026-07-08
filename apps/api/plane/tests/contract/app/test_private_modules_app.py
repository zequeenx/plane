import pytest

from plane.db.models import Issue, Module, ModuleIssue, ModuleMember, Project, ProjectMember, User
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
