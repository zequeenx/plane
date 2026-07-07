import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from plane.db.models import (
    Issue,
    IssueFieldValue,
    IssueFieldValueOption,
    IssueFieldValueUser,
    Project,
    ProjectIssueField,
    ProjectIssueFieldOption,
    ProjectMember,
    User,
)
from plane.utils.filters import ComplexFilterBackend, IssueFilterSet


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


def _sub_issues_url(workspace, project, issue):
    return f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/{issue.id}/sub-issues/"


def _issue_names(response):
    return {issue["name"] for issue in response.data["results"]}


def _group_result_names(response):
    results = response.data["results"]
    if isinstance(results, list):
        return {issue["name"] for issue in results}
    return {
        issue["name"]
        for group_data in results.values()
        for issue in group_data.get("results", [])
    }


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
    medium = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="Medium")
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


@pytest.mark.parametrize(
    "field_type",
    [
        ProjectIssueField.FieldType.PLAIN_TEXT,
        ProjectIssueField.FieldType.MULTI_SELECT,
        ProjectIssueField.FieldType.DATE,
        ProjectIssueField.FieldType.DATE_RANGE,
    ],
)
def test_unsupported_custom_field_grouping_does_not_activate(
    api_client,
    workspace,
    project,
    project_member,
    field_type,
):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name=f"Unsupported {field_type}",
        field_type=field_type,
    )
    issue = Issue.objects.create(workspace=workspace, project=project, name="Ungrouped issue")

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"group_by": f"customproperty_{field.id}"},
    )

    assert response.status_code == 200
    assert _group_result_names(response) == {"Ungrouped issue"}
    assert str(None) not in response.data["results"]


def test_cross_project_custom_field_grouping_does_not_activate(
    api_client,
    workspace,
    project,
    project_member,
):
    api_client.force_authenticate(project_member)
    other_project = Project.objects.create(workspace=workspace, name="Other Filter Field Project", identifier="OFF")
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=other_project,
        name="Other severity",
        field_type=ProjectIssueField.FieldType.SINGLE_SELECT,
    )
    option = ProjectIssueFieldOption.objects.create(workspace=workspace, project=other_project, field=field, value="High")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Current project issue")

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"group_by": f"customproperty_{field.id}"},
    )

    assert response.status_code == 200
    assert _group_result_names(response) == {"Current project issue"}
    assert str(option.id) not in response.data["results"]


def test_invalid_custom_field_grouping_id_does_not_error(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    issue = Issue.objects.create(workspace=workspace, project=project, name="Current project issue")

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"group_by": "customproperty_not-a-uuid"},
    )

    assert response.status_code == 200
    assert _group_result_names(response) == {"Current project issue"}


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


def test_cross_project_custom_field_sorting_does_not_activate(
    api_client,
    workspace,
    project,
    project_member,
):
    api_client.force_authenticate(project_member)
    other_project = Project.objects.create(workspace=workspace, name="Other Sort Field Project", identifier="OSF")
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=other_project,
        name="Other release date",
        field_type=ProjectIssueField.FieldType.DATE,
    )
    newer_issue = Issue.objects.create(workspace=workspace, project=project, name="Newer issue")
    older_issue = Issue.objects.create(workspace=workspace, project=project, name="Older issue")
    newer_issue.created_at = datetime(2026, 7, 2, tzinfo=timezone.utc)
    newer_issue.save(update_fields=["created_at"])
    older_issue.created_at = datetime(2026, 7, 1, tzinfo=timezone.utc)
    older_issue.save(update_fields=["created_at"])

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"order_by": f"customproperty_{field.id}"},
    )

    assert response.status_code == 200
    assert [issue["name"] for issue in response.data["results"]] == ["Newer issue", "Older issue"]


def test_invalid_custom_field_sorting_id_does_not_error(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    newer_issue = Issue.objects.create(workspace=workspace, project=project, name="Newer issue")
    older_issue = Issue.objects.create(workspace=workspace, project=project, name="Older issue")
    newer_issue.created_at = datetime(2026, 7, 2, tzinfo=timezone.utc)
    newer_issue.save(update_fields=["created_at"])
    older_issue.created_at = datetime(2026, 7, 1, tzinfo=timezone.utc)
    older_issue.save(update_fields=["created_at"])

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"order_by": "customproperty_not-a-uuid"},
    )

    assert response.status_code == 200
    assert [issue["name"] for issue in response.data["results"]] == ["Newer issue", "Older issue"]


def test_sub_issues_support_project_scoped_custom_field_sorting(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    parent = Issue.objects.create(workspace=workspace, project=project, name="Parent issue")
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Release date",
        field_type=ProjectIssueField.FieldType.DATE,
    )
    earlier_issue = Issue.objects.create(workspace=workspace, project=project, parent=parent, name="Earlier sub issue")
    later_issue = Issue.objects.create(workspace=workspace, project=project, parent=parent, name="Later sub issue")
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
        _sub_issues_url(workspace, project, parent),
        {"order_by": f"customproperty_{field.id}"},
    )

    assert response.status_code == 200
    assert [issue["name"] for issue in response.data["sub_issues"]] == ["Earlier sub issue", "Later sub issue"]


def test_multi_select_contains_any_filter_does_not_duplicate_matching_issue(
    api_client,
    workspace,
    project,
    project_member,
):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Components",
        field_type=ProjectIssueField.FieldType.MULTI_SELECT,
    )
    api = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="API")
    web = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="Web")
    issue = Issue.objects.create(workspace=workspace, project=project, name="Multi match issue")
    value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field)
    IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=value, option=api)
    IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=value, option=web)

    response = api_client.get(
        _issue_list_url(workspace, project),
        {
            "filters": json.dumps(
                {f"customproperty_{field.id}__contains_any": [str(api.id), str(web.id)]}
            )
        },
    )

    assert response.status_code == 200
    assert [issue["name"] for issue in response.data["results"]] == ["Multi match issue"]


def test_single_select_in_filter_accepts_comma_separated_string(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Severity",
        field_type=ProjectIssueField.FieldType.SINGLE_SELECT,
    )
    high = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="High")
    low = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="Low")
    medium = ProjectIssueFieldOption.objects.create(workspace=workspace, project=project, field=field, value="Medium")
    matching_issue = Issue.objects.create(workspace=workspace, project=project, name="High issue")
    other_issue = Issue.objects.create(workspace=workspace, project=project, name="Low issue")
    matching_value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=matching_issue, field=field)
    other_value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=other_issue, field=field)
    IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=matching_value, option=high)
    IssueFieldValueOption.objects.create(workspace=workspace, project=project, value=other_value, option=low)

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"filters": json.dumps({f"customproperty_{field.id}__in": f"{high.id},{medium.id}"})},
    )

    assert response.status_code == 200
    assert _issue_names(response) == {"High issue"}


def test_single_select_in_filter_with_invalid_option_value_does_not_error(
    api_client,
    workspace,
    project,
    project_member,
):
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
        {"filters": json.dumps({f"customproperty_{field.id}__in": ["not-a-uuid"]})},
    )

    assert response.status_code == 200
    assert _issue_names(response) == set()


def test_multi_member_contains_any_filter_does_not_duplicate_matching_issue(
    api_client,
    workspace,
    project,
    project_member,
):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Reviewers",
        field_type=ProjectIssueField.FieldType.MULTI_MEMBER,
    )
    issue = Issue.objects.create(workspace=workspace, project=project, name="Multi member issue")
    value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field)
    second_user = User.objects.create_user(email="multi-member-reviewer@example.com", username="multi-member-reviewer")
    IssueFieldValueUser.objects.create(workspace=workspace, project=project, value=value, user=project_member)
    IssueFieldValueUser.objects.create(workspace=workspace, project=project, value=value, user=second_user)

    response = api_client.get(
        _issue_list_url(workspace, project),
        {
            "filters": json.dumps(
                {f"customproperty_{field.id}__contains_any": [str(project_member.id), str(second_user.id)]}
            )
        },
    )

    assert response.status_code == 200
    assert [issue["name"] for issue in response.data["results"]] == ["Multi member issue"]


def test_multi_member_contains_any_filter_accepts_comma_separated_string(
    api_client,
    workspace,
    project,
    project_member,
):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Reviewers",
        field_type=ProjectIssueField.FieldType.MULTI_MEMBER,
    )
    issue = Issue.objects.create(workspace=workspace, project=project, name="Multi member issue")
    value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field)
    second_user = User.objects.create_user(email="string-reviewer@example.com", username="string-reviewer")
    IssueFieldValueUser.objects.create(workspace=workspace, project=project, value=value, user=second_user)

    response = api_client.get(
        _issue_list_url(workspace, project),
        {
            "filters": json.dumps(
                {f"customproperty_{field.id}__contains_any": f"{project_member.id},{second_user.id}"}
            )
        },
    )

    assert response.status_code == 200
    assert [issue["name"] for issue in response.data["results"]] == ["Multi member issue"]


def test_multi_member_contains_any_filter_with_invalid_user_value_does_not_error(
    api_client,
    workspace,
    project,
    project_member,
):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Reviewers",
        field_type=ProjectIssueField.FieldType.MULTI_MEMBER,
    )
    issue = Issue.objects.create(workspace=workspace, project=project, name="Multi member issue")
    value = IssueFieldValue.objects.create(workspace=workspace, project=project, issue=issue, field=field)
    IssueFieldValueUser.objects.create(workspace=workspace, project=project, value=value, user=project_member)

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"filters": json.dumps({f"customproperty_{field.id}__contains_any": "not-a-uuid"})},
    )

    assert response.status_code == 200
    assert _issue_names(response) == set()


def test_date_range_filter_accepts_comma_separated_string(api_client, workspace, project, project_member):
    api_client.force_authenticate(project_member)
    field = ProjectIssueField.objects.create(
        workspace=workspace,
        project=project,
        name="Release date",
        field_type=ProjectIssueField.FieldType.DATE,
    )
    matching_issue = Issue.objects.create(workspace=workspace, project=project, name="Matching issue")
    other_issue = Issue.objects.create(workspace=workspace, project=project, name="Other issue")
    IssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        issue=matching_issue,
        field=field,
        date_value="2026-07-15",
    )
    IssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        issue=other_issue,
        field=field,
        date_value="2026-08-15",
    )

    response = api_client.get(
        _issue_list_url(workspace, project),
        {"filters": json.dumps({f"customproperty_{field.id}__range": "2026-07-01,2026-07-31"})},
    )

    assert response.status_code == 200
    assert _issue_names(response) == {"Matching issue"}


def test_workspace_scoped_filter_context_does_not_activate_project_custom_fields(
    workspace,
    project,
):
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
        text_value="Only this has the value",
    )

    queryset = ComplexFilterBackend().filter_queryset(
        request=None,
        queryset=Issue.objects.filter(workspace=workspace),
        view=SimpleNamespace(kwargs={"slug": workspace.slug}, filterset_class=IssueFilterSet),
        filter_data={f"customproperty_{field.id}__contains": "Only this"},
    )

    assert {issue.name for issue in queryset} == {"Matching issue", "Other issue"}
