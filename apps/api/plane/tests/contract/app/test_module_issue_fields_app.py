import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework import status

from plane.db.models import (
    Issue,
    Module,
    ModuleIssue,
    ModuleIssueField,
    ModuleIssueFieldOption,
    ModuleIssueFieldValue,
    ModuleIssueFieldValueOption,
    ModuleIssueFieldValueUser,
    Project,
    ProjectMember,
    User,
    WorkspaceMember,
)


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(workspace):
    return Project.objects.create(workspace=workspace, name="Module Issue Field Project", identifier="MIF")


@pytest.fixture
def project_member(workspace, project):
    user = User.objects.create_user(email="module-issue-field-member@example.com", username="module-issue-field-member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15, is_active=True)
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=15, is_active=True)
    return user


@pytest.fixture
def issue(workspace, project):
    return Issue.objects.create(workspace=workspace, project=project, name="Module Issue Field Issue")


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

    with pytest.raises(IntegrityError), transaction.atomic():
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

    field.delete(soft=False)

    assert not ModuleIssueField.objects.filter(pk=field.pk).exists()
    assert not ModuleIssueFieldOption.objects.filter(pk=option.pk).exists()
    assert not ModuleIssueFieldValue.objects.filter(pk=value.pk).exists()
    assert not ModuleIssueFieldValueOption.objects.filter(value_id=value.id).exists()


def test_module_issue_field_value_rejects_issue_not_in_module(workspace, project):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Issue outside module")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )

    with pytest.raises(ValidationError):
        ModuleIssueFieldValue.objects.create(
            workspace=workspace,
            project=project,
            module=module,
            issue=issue,
            field=field,
            text_value="Needs review",
        )


def test_module_issue_field_value_rejects_soft_deleted_module_issue(workspace, project):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    ModuleIssue.objects.get(module=module, issue=issue).delete()
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )

    with pytest.raises(ValidationError):
        ModuleIssueFieldValue.objects.create(
            workspace=workspace,
            project=project,
            module=module,
            issue=issue,
            field=field,
            text_value="Needs review",
        )


def test_module_issue_field_value_is_unique_per_issue_and_field(workspace, project):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    ModuleIssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
        field=field,
        text_value="first",
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        ModuleIssueFieldValue.objects.create(
            workspace=workspace,
            project=project,
            module=module,
            issue=issue,
            field=field,
            text_value="second",
        )


def test_module_issue_field_value_option_rejects_option_from_another_field(workspace, project):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    value_field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    option_field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Component",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    option = ModuleIssueFieldOption.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        field=option_field,
        value="API",
    )
    value = ModuleIssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
        field=value_field,
    )

    with pytest.raises(ValidationError):
        ModuleIssueFieldValueOption.objects.create(
            workspace=workspace,
            project=project,
            module=module,
            value=value,
            option=option,
        )


def test_module_issue_field_value_option_aligns_ownership_from_value(workspace, project):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    other_module = Module.objects.create(workspace=workspace, project=project, name="Growth")
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

    selected_option = ModuleIssueFieldValueOption.objects.create(
        workspace=workspace,
        project=project,
        module=other_module,
        value=value,
        option=option,
    )

    assert selected_option.workspace_id == value.workspace_id
    assert selected_option.project_id == value.project_id
    assert selected_option.module_id == value.module_id


def test_module_issue_field_value_option_is_unique_per_value_and_option(workspace, project):
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

    with pytest.raises(IntegrityError), transaction.atomic():
        ModuleIssueFieldValueOption.objects.create(
            workspace=workspace,
            project=project,
            module=module,
            value=value,
            option=option,
        )


def test_module_issue_field_value_user_save_aligns_mismatched_module_from_value(workspace, project, create_user):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    other_module = Module.objects.create(workspace=workspace, project=project, name="Growth")
    issue = create_issue_in_module(workspace, project, module)
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Reviewer",
        field_type=ModuleIssueField.FieldType.SINGLE_MEMBER,
    )
    value = ModuleIssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
        field=field,
    )

    selected_user = ModuleIssueFieldValueUser.objects.create(
        workspace=workspace,
        project=project,
        module=other_module,
        value=value,
        user=create_user,
    )

    assert selected_user.workspace_id == value.workspace_id
    assert selected_user.project_id == value.project_id
    assert selected_user.module_id == value.module_id


def test_module_issue_field_value_user_is_unique_per_value_and_user(workspace, project, create_user):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Reviewer",
        field_type=ModuleIssueField.FieldType.SINGLE_MEMBER,
    )
    value = ModuleIssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
        field=field,
    )
    ModuleIssueFieldValueUser.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        value=value,
        user=create_user,
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        ModuleIssueFieldValueUser.objects.create(
            workspace=workspace,
            project=project,
            module=module,
            value=value,
            user=create_user,
        )


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


def test_module_field_option_duplicate_returns_validation_error(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    ModuleIssueFieldOption.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        field=field,
        value="High",
    )
    api_client.force_authenticate(project_member)

    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issue-fields/{field.id}/options/",
        {"value": "High"},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "already exists" in str(response.data).lower()


def test_disabled_module_field_lists_rejects_values_and_can_be_deleted(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    first_field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Later",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
        sort_order=20,
    )
    second_field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Earlier",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
        sort_order=10,
    )
    api_client.force_authenticate(project_member)

    for field in [first_field, second_field]:
        disabled = api_client.patch(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issue-fields/{field.id}/",
            {"is_disabled": True},
            format="json",
        )
        assert disabled.status_code == status.HTTP_200_OK

    disabled_list = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issue-fields/disabled/"
    )
    value_update = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/{issue.id}/field-values/",
        {"field_values": {str(first_field.id): "Blocked"}},
        format="json",
    )
    deleted = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issue-fields/{first_field.id}/"
    )

    assert disabled_list.status_code == status.HTTP_200_OK
    assert [item["name"] for item in disabled_list.data] == ["Earlier", "Later"]
    assert value_update.status_code == status.HTTP_400_BAD_REQUEST
    assert "disabled" in str(value_update.data).lower()
    assert deleted.status_code == status.HTTP_204_NO_CONTENT
    assert not ModuleIssueField.objects.filter(pk=first_field.pk).exists()


def test_module_select_and_date_values_serialize_through_api(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    select_field = ModuleIssueField.objects.create(
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
        field=select_field,
        value="High",
    )
    date_field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Review date",
        field_type=ModuleIssueField.FieldType.DATE,
    )
    date_range_field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Review window",
        field_type=ModuleIssueField.FieldType.DATE_RANGE,
    )
    api_client.force_authenticate(project_member)

    response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/{issue.id}/field-values/",
        {
            "field_values": {
                str(select_field.id): str(option.id),
                str(date_field.id): "2026-07-09",
                str(date_range_field.id): {"start": "2026-07-10", "end": "2026-07-12"},
            }
        },
        format="json",
    )

    values = response.data["module_field_values"][str(module.id)]
    assert response.status_code == status.HTTP_200_OK
    assert values[str(select_field.id)] == str(option.id)
    assert values[str(date_field.id)] == "2026-07-09"
    assert values[str(date_range_field.id)] == {"start": "2026-07-10", "end": "2026-07-12"}


def test_module_member_value_accepts_active_and_rejects_inactive_member(
    api_client, workspace, project, project_member
):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    member_field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Reviewer",
        field_type=ModuleIssueField.FieldType.SINGLE_MEMBER,
    )
    inactive_user = User.objects.create_user(
        email="inactive-module-field-member@example.com",
        username="inactive-module-field-member",
    )
    WorkspaceMember.objects.create(workspace=workspace, member=inactive_user, role=15, is_active=True)
    ProjectMember.objects.create(
        workspace=workspace,
        project=project,
        member=inactive_user,
        role=15,
        is_active=False,
    )
    api_client.force_authenticate(project_member)

    accepted = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/{issue.id}/field-values/",
        {"field_values": {str(member_field.id): str(project_member.id)}},
        format="json",
    )
    rejected = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/{issue.id}/field-values/",
        {"field_values": {str(member_field.id): str(inactive_user.id)}},
        format="json",
    )

    assert accepted.status_code == status.HTTP_200_OK
    assert accepted.data["module_field_values"][str(module.id)][str(member_field.id)] == str(project_member.id)
    assert rejected.status_code == status.HTTP_400_BAD_REQUEST
    assert "active project member" in str(rejected.data).lower()


def test_module_field_routes_hide_private_module_from_unrelated_member(api_client, workspace, project):
    creator = User.objects.create_user(email="module-field-creator@example.com", username="module-field-creator")
    unrelated_user = User.objects.create_user(
        email="module-field-unrelated@example.com",
        username="module-field-unrelated",
    )
    for user in [creator, unrelated_user]:
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=15, is_active=True)
        ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=15, is_active=True)
    module = Module(
        workspace=workspace,
        project=project,
        name="Private Launch",
        visibility=Module.ModuleVisibility.PRIVATE,
    )
    module.save(created_by_id=creator.id)
    api_client.force_authenticate(unrelated_user)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issue-fields/"
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


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


def test_module_field_value_update_rejects_null_payload(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    issue = create_issue_in_module(workspace, project, module)
    api_client.force_authenticate(project_member)

    response = api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/{issue.id}/field-values/",
        {"field_values": None},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "field_values" in str(response.data)


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
