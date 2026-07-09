import pytest

from plane.db.models import (
    Issue,
    Module,
    ModuleIssue,
    ModuleIssueField,
    ModuleIssueFieldOption,
    ModuleIssueFieldValue,
    ModuleIssueFieldValueOption,
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
