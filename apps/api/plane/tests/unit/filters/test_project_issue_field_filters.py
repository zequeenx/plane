import json

import pytest

from plane.db.models import (
    Issue,
    IssueFieldValue,
    IssueFieldValueOption,
    Project,
    ProjectIssueField,
    ProjectIssueFieldOption,
    ProjectMember,
)


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(workspace):
    return Project.objects.create(workspace=workspace, name="Filter Field Project", identifier="FFP")


@pytest.fixture
def project_member(workspace, project, create_user):
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=15, is_active=True)
    return create_user


def _issue_list_url(workspace, project):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/"


def _issue_names(response):
    return {issue["name"] for issue in response.data["results"]}


def test_plain_text_contains_filter_finds_only_matching_issue(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Customer note",
        field_type=ProjectIssueField.FieldType.PLAIN_TEXT,
    )
    matching_issue = Issue.objects.create(workspace=workspace, project=project, name="Matching issue")
    other_issue = Issue.objects.create(workspace=workspace, project=project, name="Other issue")
    IssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        issue=matching_issue,
        field=field,
        text_value="Needs API review",
    )
    IssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        issue=other_issue,
        field=field,
        text_value="Needs design review",
    )

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"filters": json.dumps({f"customproperty_{field.id}__contains": "api"})},
    )

    assert response.status_code == 200
    assert _issue_names(response) == {"Matching issue"}


def test_single_select_in_filter_finds_only_issue_with_selected_option(
    api_client, workspace, project, project_member
):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Severity",
        field_type=ProjectIssueField.FieldType.SINGLE_SELECT,
    )
    high = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="High")
    low = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="Low")
    matching_issue = Issue.objects.create(workspace=workspace, project=project, name="High issue")
    other_issue = Issue.objects.create(workspace=workspace, project=project, name="Low issue")
    matching_value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=matching_issue, field=field)
    other_value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=other_issue, field=field)
    IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=matching_value, option=high)
    IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=other_value, option=low)

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"filters": json.dumps({f"customproperty_{field.id}__in": [str(high.id)]})},
    )

    assert response.status_code == 200
    assert _issue_names(response) == {"High issue"}


def test_disabled_custom_field_filter_is_ignored(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Disabled note",
        field_type=ProjectIssueField.FieldType.PLAIN_TEXT,
        is_disabled=True,
    )
    matching_issue = Issue.objects.create(workspace=workspace, project=project, name="Matching issue")
    other_issue = Issue.objects.create(workspace=workspace, project=project, name="Other issue")
    IssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        issue=matching_issue,
        field=field,
        text_value="Only this has the value",
    )

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"filters": json.dumps({f"customproperty_{field.id}__contains": "Only this"})},
    )

    assert response.status_code == 200
    assert _issue_names(response) == {"Matching issue", "Other issue"}


def test_single_select_custom_field_grouping(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Severity",
        field_type=ProjectIssueField.FieldType.SINGLE_SELECT,
    )
    high = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="High")
    issue = Issue.objects.create(workspace=workspace, project=project, name="High issue")
    value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field)
    IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=value, option=high)

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"group_by": f"customproperty_{field.id}"},
    )

    assert response.status_code == 200
    assert response.data["results"][str(high.id)]["results"][0]["name"] == "High issue"


def test_date_custom_field_sorting(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Release date",
        field_type=ProjectIssueField.FieldType.DATE,
    )
    earlier_issue = Issue.objects.create(workspace=workspace, project=project, name="Earlier issue")
    later_issue = Issue.objects.create(workspace=workspace, project=project, name="Later issue")
    IssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        issue=later_issue,
        field=field,
        date_value="2026-08-01",
    )
    IssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        issue=earlier_issue,
        field=field,
        date_value="2026-07-01",
    )

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"order_by": f"customproperty_{field.id}"},
    )

    assert response.status_code == 200
    assert [issue["name"] for issue in response.data["results"]] == ["Earlier issue", "Later issue"]
