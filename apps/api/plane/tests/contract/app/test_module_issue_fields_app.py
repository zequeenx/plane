import pytest
from django.core.exceptions import ValidationError

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
)


pytestmark = pytest.mark.django_db


@pytest.fixture
def project(workspace):
    return Project.objects.create(workspace=workspace, name="Module Issue Field Project", identifier="MIF")


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

    with pytest.raises(Exception):
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


def test_module_issue_field_value_user_aligns_ownership_from_value(workspace, project, create_user):
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


def test_module_issue_field_value_user_rejects_mismatched_module(workspace, project, create_user):
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
    selected_user = ModuleIssueFieldValueUser(
        workspace=workspace,
        project=project,
        module=other_module,
        value=value,
        user=create_user,
    )

    with pytest.raises(ValidationError):
        selected_user.clean()
