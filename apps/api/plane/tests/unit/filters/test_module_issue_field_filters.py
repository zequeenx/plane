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
    create_issue_with_module_value(workspace, project, module, field, option=high)
    api_client.force_authenticate(project_member)

    response = api_client.get(
        f"/api/workspaces/{workspace.slug}/projects/{project.id}/modules/{module.id}/issues/",
        {"group_by": f"modulecustomproperty_{field.id}"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert str(high.id) in str(response.data)


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
