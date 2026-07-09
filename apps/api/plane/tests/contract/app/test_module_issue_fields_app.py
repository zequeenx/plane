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
