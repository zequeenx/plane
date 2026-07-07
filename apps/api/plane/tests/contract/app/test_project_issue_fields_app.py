import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status

from plane.db.models import (
    Issue,
    IssueFieldValue,
    IssueFieldValueOption,
    IssueFieldValueUser,
    Project,
    ProjectMember,
    ProjectIssueField,
    ProjectIssueFieldOption,
    User,
    WorkspaceMember,
)


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(workspace):
    return Project.objects.create(workspace=workspace, name="Issue Field Project", identifier="IFP")


@pytest.fixture
def project_admin(workspace, project, create_user):
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=20, is_active=True)
    return create_user


@pytest.fixture
def project_member(workspace, project):
    user = User.objects.create_user(email="issue-field-member@example.com", username="issue-field-member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15, is_active=True)
    ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=15, is_active=True)
    return user


@pytest.fixture
def issue(workspace, project):
    return Issue.objects.create(workspace=workspace, project=project, name="Issue Field Issue")


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
    selected_option = IssueFieldValueOption.objects.create(
        workspace=workspace, project=project, value=value, option=option
    )

    field.delete(soft=False)

    assert not ProjectIssueField.objects.filter(pk=field.pk).exists()
    assert not ProjectIssueFieldOption.objects.filter(pk=option.pk).exists()
    assert not IssueFieldValue.objects.filter(pk=value.pk).exists()
    assert not IssueFieldValueOption.objects.filter(pk=selected_option.pk).exists()


def test_single_select_value_is_unique_per_issue_and_field(workspace, project, issue):
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Priority reason",
        field_type=ProjectIssueField.FieldType.SINGLE_SELECT,
    )
    IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field, text_value="first")

    with pytest.raises(IntegrityError), transaction.atomic():
        IssueFieldValue.objects.create(
            workspace=workspace,
            project=project,
            issue=issue,
            field=field,
            text_value="second",
        )


def test_selected_user_is_unique_per_value_and_user(workspace, project, issue, create_user):
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Reviewer",
        field_type=ProjectIssueField.FieldType.SINGLE_MEMBER,
    )
    value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field)
    IssueFieldValueUser.objects.create(workspace=workspace, project=project, value=value, user=create_user)

    with pytest.raises(IntegrityError), transaction.atomic():
        IssueFieldValueUser.objects.create(workspace=workspace, project=project, value=value, user=create_user)


def test_issue_field_value_rejects_cross_project_field(workspace, project, issue):
    other_project = Project.objects.create(workspace=workspace, name="Other Issue Field Project", identifier="OIF")
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=other_project,
        name="Other Severity",
        field_type=ProjectIssueField.FieldType.SINGLE_SELECT,
    )

    with pytest.raises(ValidationError):
        IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field)


def test_issue_field_value_option_rejects_option_from_another_field(workspace, project, issue):
    value_field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Team",
        field_type=ProjectIssueField.FieldType.MULTI_SELECT,
    )
    option_field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Component",
        field_type=ProjectIssueField.FieldType.MULTI_SELECT,
    )
    option = ProjectIssueFieldOption.objects.create(
        workspace=workspace,
        project=project,
        field=option_field,
        value="API",
    )
    value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=value_field)

    with pytest.raises(ValidationError):
        IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=value, option=option)


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

    enabled_delete = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/"
    )
    assert enabled_delete.status_code == status.HTTP_400_BAD_REQUEST

    api_client.patch(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/",
        {"is_disabled": True},
        format="json",
    )
    deleted = api_client.delete(f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/")

    assert deleted.status_code == status.HTTP_204_NO_CONTENT
    assert not ProjectIssueField.objects.filter(id=field.id).exists()


def test_work_item_editor_can_create_and_delete_text_option(api_client, workspace, project, project_member, issue):
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

    option = ProjectIssueFieldOption.objects.get(id=created.data["id"])
    value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field)
    selected_option = IssueFieldValueOption.objects.create(
        workspace=workspace,
        project=project,
        value=value,
        option=option,
    )

    deleted = api_client.delete(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issue-fields/{field.id}/options/{created.data['id']}/"
    )

    assert deleted.status_code == status.HTTP_204_NO_CONTENT
    assert not ProjectIssueFieldOption.objects.filter(id=option.id).exists()
    assert not IssueFieldValueOption.objects.filter(id=selected_option.id).exists()
    assert not ProjectIssueFieldOption.all_objects.filter(id=option.id).exists()
    assert not IssueFieldValueOption.all_objects.filter(id=selected_option.id).exists()
