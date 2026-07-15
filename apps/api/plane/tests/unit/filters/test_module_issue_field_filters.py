import json

import pytest
from rest_framework import status

from plane.db.models import (
    Issue,
    IssueView,
    Module,
    ModuleIssue,
    ModuleIssueField,
    ModuleIssueFieldOption,
    ModuleIssueFieldValue,
    ModuleIssueFieldValueOption,
    ModuleIssueFieldValueUser,
    Project,
    ProjectMember,
)


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(workspace):
    return Project.objects.create(workspace=workspace, name="Module Field Project", identifier="MFP")


@pytest.fixture
def project_member(workspace, project, create_user):
    ProjectMember.objects.create(workspace=workspace, project=project, member=create_user, role=15, is_active=True)
    return create_user


def create_issue_with_module_value(workspace, project, module, field, option=None, text_value=None):
    issue = Issue.objects.create(workspace=workspace, project=project, name="Issue")
    ModuleIssue.objects.create(workspace=workspace, project=project, module=module, issue=issue)
    value = ModuleIssueFieldValue.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        issue=issue,
        field=field,
        text_value=text_value,
    )
    if option:
        ModuleIssueFieldValueOption.objects.create(
            workspace=workspace,
            project=project,
            module=module,
            value=value,
            option=option,
        )
    return issue


def test_module_custom_property_filter_works_in_module_context(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    high = ModuleIssueFieldOption.objects.create(
        workspace=workspace, project=project, module=module, field=field, value="High"
    )
    matching_issue = create_issue_with_module_value(workspace, project, module, field, option=high)
    other_issue = Issue.objects.create(workspace=workspace, project=project, name="Other")
    ModuleIssue.objects.create(workspace=workspace, project=project, module=module, issue=other_issue)
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/",
        {"filters": json.dumps({f"modulecustomproperty_{field.id}__in": str(high.id)})},
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert [str(issue["id"]) for issue in results] == [str(matching_issue.id)]


def test_module_custom_property_filter_outside_module_context_returns_empty(
    api_client, workspace, project, project_member
):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    create_issue_with_module_value(workspace, project, module, field, text_value="Only in module")
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"filters": json.dumps({f"modulecustomproperty_{field.id}__contains": "Only"})},
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert len(results) == 0


def test_module_custom_property_filter_outside_module_context_not_returns_empty(
    api_client, workspace, project, project_member
):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    create_issue_with_module_value(workspace, project, module, field, text_value="Only in module")
    Issue.objects.create(workspace=workspace, project=project, name="Other")
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {"filters": json.dumps({"not": {f"modulecustomproperty_{field.id}__contains": "Only"}})},
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert len(results) == 0


def test_module_custom_property_filter_outside_module_context_or_returns_empty(
    api_client, workspace, project, project_member
):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    create_issue_with_module_value(workspace, project, module, field, text_value="Only in module")
    Issue.objects.create(workspace=workspace, project=project, name="High priority", priority="high")
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {
            "filters": json.dumps(
                {
                    "or": [
                        {f"modulecustomproperty_{field.id}__contains": "Only"},
                        {"priority": "high"},
                    ]
                }
            )
        },
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert len(results) == 0


def test_module_custom_property_filter_wrong_module_field_returns_empty(
    api_client, workspace, project, project_member
):
    source_module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    other_module = Module.objects.create(workspace=workspace, project=project, name="Growth")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=source_module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    other_issue = Issue.objects.create(workspace=workspace, project=project, name="Other module issue")
    ModuleIssue.objects.create(workspace=workspace, project=project, module=other_module, issue=other_issue)
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{other_module.id}/issues/",
        {"filters": json.dumps({f"modulecustomproperty_{field.id}__is_empty": True})},
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert len(results) == 0


def test_module_custom_property_filter_disabled_field_returns_empty(
    api_client, workspace, project, project_member
):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
        is_disabled=True,
    )
    create_issue_with_module_value(workspace, project, module, field, text_value="Hidden")
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/",
        {"filters": json.dumps({f"modulecustomproperty_{field.id}__contains": "Hidden"})},
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert len(results) == 0


def test_module_custom_property_grouping(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    high = ModuleIssueFieldOption.objects.create(
        workspace=workspace, project=project, module=module, field=field, value="High"
    )
    matching_issue = create_issue_with_module_value(workspace, project, module, field, option=high)
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/",
        {"group_by": f"modulecustomproperty_{field.id}"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert [str(issue["id"]) for issue in response.data["results"][str(high.id)]["results"]] == [
        str(matching_issue.id)
    ]


def test_project_issue_list_uses_module_filter_for_single_select_grouping(
    api_client, workspace, project, project_member
):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    high = ModuleIssueFieldOption.objects.create(
        workspace=workspace, project=project, module=module, field=field, value="High"
    )
    matching_issue = create_issue_with_module_value(workspace, project, module, field, option=high)
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {
            "group_by": f"modulecustomproperty_{field.id}",
            "module": str(module.id),
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert [str(issue["id"]) for issue in response.data["results"][str(high.id)]["results"]] == [
        str(matching_issue.id)
    ]


def test_project_issue_list_uses_module_filter_for_single_member_grouping(
    api_client, workspace, project, project_member
):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Owner",
        field_type=ModuleIssueField.FieldType.SINGLE_MEMBER,
    )
    issue = Issue.objects.create(workspace=workspace, project=project, name="Owned issue")
    ModuleIssue.objects.create(workspace=workspace, project=project, module=module, issue=issue)
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
        user=project_member,
    )
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {
            "group_by": f"modulecustomproperty_{field.id}",
            "module": str(module.id),
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert [str(row["id"]) for row in response.data["results"][str(project_member.id)]["results"]] == [str(issue.id)]


def test_project_issue_list_uses_module_filter_for_module_custom_property_filter(
    api_client, workspace, project, project_member
):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    high = ModuleIssueFieldOption.objects.create(
        workspace=workspace, project=project, module=module, field=field, value="High"
    )
    matching_issue = create_issue_with_module_value(workspace, project, module, field, option=high)
    other_issue = Issue.objects.create(workspace=workspace, project=project, name="Other")
    ModuleIssue.objects.create(workspace=workspace, project=project, module=module, issue=other_issue)
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/issues/",
        {
            "filters": json.dumps({f"modulecustomproperty_{field.id}__exact": str(high.id)}),
            "module": str(module.id),
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert [str(issue["id"]) for issue in response.data["results"]] == [str(matching_issue.id)]


def test_project_view_uses_source_module_context_for_grouping(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    high = ModuleIssueFieldOption.objects.create(
        workspace=workspace, project=project, module=module, field=field, value="High"
    )
    create_issue_with_module_value(workspace, project, module, field, option=high)
    view = IssueView.objects.create(
        workspace=workspace,
        project=project,
        owned_by=project_member,
        name="Module View",
        filters={},
        rich_filters={},
        source_module=module,
    )
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/views/{view.id}/issues/",
        {"group_by": f"modulecustomproperty_{field.id}"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert str(high.id) in str(response.data)


def test_project_view_source_module_is_empty_filter_excludes_outside_module_issues(
    api_client, workspace, project, project_member
):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    in_module_issue = Issue.objects.create(workspace=workspace, project=project, name="In module empty")
    ModuleIssue.objects.create(workspace=workspace, project=project, module=module, issue=in_module_issue)
    Issue.objects.create(workspace=workspace, project=project, name="Outside module")
    view = IssueView.objects.create(
        workspace=workspace,
        project=project,
        owned_by=project_member,
        name="Module View",
        filters={},
        rich_filters={},
        source_module=module,
    )
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/views/{view.id}/issues/",
        {"filters": json.dumps({f"modulecustomproperty_{field.id}__is_empty": True})},
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert [str(row["id"]) for row in results] == [str(in_module_issue.id)]


def test_project_view_source_module_grouping_excludes_outside_module_none_bucket(
    api_client, workspace, project, project_member
):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Risk",
        field_type=ModuleIssueField.FieldType.SINGLE_SELECT,
    )
    high = ModuleIssueFieldOption.objects.create(
        workspace=workspace, project=project, module=module, field=field, value="High"
    )
    create_issue_with_module_value(workspace, project, module, field, option=high)
    in_module_empty = Issue.objects.create(workspace=workspace, project=project, name="In module empty")
    ModuleIssue.objects.create(workspace=workspace, project=project, module=module, issue=in_module_empty)
    outside_issue = Issue.objects.create(workspace=workspace, project=project, name="Outside module")
    view = IssueView.objects.create(
        workspace=workspace,
        project=project,
        owned_by=project_member,
        name="Module View",
        filters={},
        rich_filters={},
        source_module=module,
    )
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/views/{view.id}/issues/",
        {"group_by": f"modulecustomproperty_{field.id}"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert str(high.id) in str(response.data)
    assert str(in_module_empty.id) in str(response.data)
    assert str(outside_issue.id) not in str(response.data)
    assert "Outside module" not in str(response.data)


def test_project_view_rejects_source_module_from_another_project(api_client, workspace, project, project_member):
    other_project = Project.objects.create(workspace=workspace, name="Other Module Field Project", identifier="OMF")
    other_module = Module.objects.create(workspace=workspace, project=other_project, name="Other launch")
    api_client.force_authenticate(project_member)

    response = api_client.post(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/views/",
        {
            "name": "Invalid module view",
            "filters": {},
            "source_module": str(other_module.id),
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


def test_project_view_uses_source_module_context(api_client, workspace, project, project_member):
    module = Module.objects.create(workspace=workspace, project=project, name="Launch")
    field = ModuleIssueField.objects.create(
        workspace=workspace,
        project=project,
        module=module,
        name="Notes",
        field_type=ModuleIssueField.FieldType.PLAIN_TEXT,
    )
    issue = create_issue_with_module_value(workspace, project, module, field, text_value="Visible in source view")
    view = IssueView.objects.create(
        workspace=workspace,
        project=project,
        owned_by=project_member,
        name="Module View",
        filters={},
        rich_filters={f"modulecustomproperty_{field.id}__contains": "Visible"},
        source_module=module,
    )
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/views/{view.id}/issues/",
        {"filters": json.dumps(view.rich_filters)},
    )

    assert response.status_code == status.HTTP_200_OK
    results = response.data["results"] if "results" in response.data else response.data
    assert [str(row["id"]) for row in results] == [str(issue.id)]
