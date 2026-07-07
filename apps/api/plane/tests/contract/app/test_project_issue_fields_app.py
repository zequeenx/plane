import pytest
from django.utils import timezone

from plane.db.models import (
    Issue,
    IssueFieldValue,
    IssueFieldValueOption,
    IssueFieldValueUser,
    Project,
    ProjectIssueField,
    ProjectIssueFieldOption,
)


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(workspace):
    return Project.objects.create(workspace=workspace, name="Issue Field Project", identifier="IFP")


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
