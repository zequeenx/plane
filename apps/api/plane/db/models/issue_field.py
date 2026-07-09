from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from .base import BaseModel


def _add_update_fields(kwargs, *field_names):
    update_fields = kwargs.get("update_fields")
    if update_fields is not None:
        kwargs["update_fields"] = set(update_fields).union(field_names)


def _full_clean_issue_field_model(instance):
    instance.full_clean(
        exclude=["created_by", "updated_by"],
        validate_unique=False,
        validate_constraints=False,
    )


class ProjectIssueField(BaseModel):
    class FieldType(models.TextChoices):
        SINGLE_SELECT = "single_select", "Single-select text"
        MULTI_SELECT = "multi_select", "Multi-select text"
        SINGLE_MEMBER = "single_member", "Single-select member"
        MULTI_MEMBER = "multi_member", "Multi-select member"
        DATE = "date", "Date"
        DATE_RANGE = "date_range", "Date range"
        PLAIN_TEXT = "plain_text", "Plain text"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="project_issue_fields")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_fields")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    field_type = models.CharField(max_length=32, choices=FieldType.choices)
    sort_order = models.FloatField(default=65535)
    is_disabled = models.BooleanField(default=False)
    disabled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "project_issue_fields"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_issue_field_unique_project_name_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.name} <{self.project_id}>"

    def save(self, *args, **kwargs):
        if self.project_id:
            workspace_id = self.project.workspace_id
            if self.workspace_id != workspace_id:
                self.workspace_id = workspace_id
                _add_update_fields(kwargs, "workspace")

        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class ProjectIssueFieldOption(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="project_issue_field_options")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_field_options")
    field = models.ForeignKey(ProjectIssueField, on_delete=models.CASCADE, related_name="options")
    value = models.CharField(max_length=255)
    sort_order = models.FloatField(default=65535)

    class Meta:
        db_table = "project_issue_field_options"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["field", "value"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_issue_field_option_unique_field_value_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.value} <{self.field_id}>"

    def save(self, *args, **kwargs):
        if self.field_id:
            field = self.field
            if self.project_id != field.project_id:
                self.project_id = field.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != field.workspace_id:
                self.workspace_id = field.workspace_id
                _add_update_fields(kwargs, "workspace")
        elif self.project_id:
            workspace_id = self.project.workspace_id
            if self.workspace_id != workspace_id:
                self.workspace_id = workspace_id
                _add_update_fields(kwargs, "workspace")

        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class IssueFieldValue(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="issue_field_values")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_field_values")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="field_value_rows")
    field = models.ForeignKey(ProjectIssueField, on_delete=models.CASCADE, related_name="issue_values")
    text_value = models.TextField(blank=True, null=True)
    date_value = models.DateField(null=True, blank=True)
    date_range_start = models.DateField(null=True, blank=True)
    date_range_end = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "issue_field_values"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "field"],
                condition=models.Q(deleted_at__isnull=True),
                name="issue_field_value_unique_issue_field_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.issue_id}::{self.field_id}"

    def clean(self):
        errors = {}

        if self.issue_id and self.field_id:
            issue = self.issue
            field = self.field

            if issue.project_id != field.project_id:
                errors["field"] = "Field must belong to the issue project."
            if issue.workspace_id != field.workspace_id:
                errors["field"] = "Field must belong to the issue workspace."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.issue_id:
            issue = self.issue
            if self.project_id != issue.project_id:
                self.project_id = issue.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != issue.workspace_id:
                self.workspace_id = issue.workspace_id
                _add_update_fields(kwargs, "workspace")

        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class IssueFieldValueOption(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="issue_field_value_options")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_field_value_options")
    value = models.ForeignKey(IssueFieldValue, on_delete=models.CASCADE, related_name="selected_options")
    option = models.ForeignKey(ProjectIssueFieldOption, on_delete=models.CASCADE, related_name="selected_values")

    class Meta:
        db_table = "issue_field_value_options"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["value", "option"],
                condition=models.Q(deleted_at__isnull=True),
                name="issue_field_value_option_unique_value_option_when_not_deleted",
            )
        ]

    def clean(self):
        errors = {}

        if self.value_id and self.option_id:
            value = self.value
            option = self.option

            if option.field_id != value.field_id:
                errors["option"] = "Option must belong to the value field."
            if option.project_id != value.project_id:
                errors["option"] = "Option must belong to the value project."
            if option.workspace_id != value.workspace_id:
                errors["option"] = "Option must belong to the value workspace."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.value_id:
            value = self.value
            if self.project_id != value.project_id:
                self.project_id = value.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != value.workspace_id:
                self.workspace_id = value.workspace_id
                _add_update_fields(kwargs, "workspace")

        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class IssueFieldValueUser(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="issue_field_value_users")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="issue_field_value_users")
    value = models.ForeignKey(IssueFieldValue, on_delete=models.CASCADE, related_name="selected_users")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="issue_field_values")

    class Meta:
        db_table = "issue_field_value_users"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["value", "user"],
                condition=models.Q(deleted_at__isnull=True),
                name="issue_field_value_user_unique_value_user_when_not_deleted",
            )
        ]

    def clean(self):
        errors = {}

        if self.value_id:
            value = self.value
            if self.project_id and self.project_id != value.project_id:
                errors["project"] = "Project must match the field value project."
            if self.workspace_id and self.workspace_id != value.workspace_id:
                errors["workspace"] = "Workspace must match the field value workspace."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.value_id:
            value = self.value
            if self.project_id != value.project_id:
                self.project_id = value.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != value.workspace_id:
                self.workspace_id = value.workspace_id
                _add_update_fields(kwargs, "workspace")

        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class ModuleIssueField(BaseModel):
    class FieldType(models.TextChoices):
        SINGLE_SELECT = "single_select", "Single-select text"
        MULTI_SELECT = "multi_select", "Multi-select text"
        SINGLE_MEMBER = "single_member", "Single-select member"
        MULTI_MEMBER = "multi_member", "Multi-select member"
        DATE = "date", "Date"
        DATE_RANGE = "date_range", "Date range"
        PLAIN_TEXT = "plain_text", "Plain text"

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="module_issue_fields")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="module_issue_fields")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="issue_fields")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    field_type = models.CharField(max_length=32, choices=FieldType.choices)
    sort_order = models.FloatField(default=65535)
    is_disabled = models.BooleanField(default=False)
    disabled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "module_issue_fields"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["module", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="module_issue_field_unique_module_name_when_not_deleted",
            )
        ]

    def save(self, *args, **kwargs):
        if self.module_id:
            if self.project_id != self.module.project_id:
                self.project_id = self.module.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != self.module.workspace_id:
                self.workspace_id = self.module.workspace_id
                _add_update_fields(kwargs, "workspace")
        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class ModuleIssueFieldOption(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="module_issue_field_options")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="module_issue_field_options")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="issue_field_options")
    field = models.ForeignKey(ModuleIssueField, on_delete=models.CASCADE, related_name="options")
    value = models.CharField(max_length=255)
    sort_order = models.FloatField(default=65535)

    class Meta:
        db_table = "module_issue_field_options"
        ordering = ("sort_order", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["field", "value"],
                condition=models.Q(deleted_at__isnull=True),
                name="module_issue_field_option_unique_field_value_when_not_deleted",
            )
        ]

    def save(self, *args, **kwargs):
        if self.field_id:
            field = self.field
            if self.module_id != field.module_id:
                self.module_id = field.module_id
                _add_update_fields(kwargs, "module")
            if self.project_id != field.project_id:
                self.project_id = field.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != field.workspace_id:
                self.workspace_id = field.workspace_id
                _add_update_fields(kwargs, "workspace")
        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class ModuleIssueFieldValue(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="module_issue_field_values")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="module_issue_field_values")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="issue_field_values")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="module_field_value_rows")
    field = models.ForeignKey(ModuleIssueField, on_delete=models.CASCADE, related_name="issue_values")
    text_value = models.TextField(blank=True, null=True)
    date_value = models.DateField(null=True, blank=True)
    date_range_start = models.DateField(null=True, blank=True)
    date_range_end = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "module_issue_field_values"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "field"],
                condition=models.Q(deleted_at__isnull=True),
                name="module_issue_field_value_unique_issue_field_when_not_deleted",
            )
        ]

    def clean(self):
        errors = {}
        if self.issue_id and self.field_id:
            from .module import ModuleIssue

            issue = self.issue
            field = self.field
            if issue.project_id != field.project_id:
                errors["field"] = "Field must belong to the issue project."
            if issue.workspace_id != field.workspace_id:
                errors["field"] = "Field must belong to the issue workspace."
            if self.module_id and self.module_id != field.module_id:
                errors["module"] = "Module must match the field module."
            if not ModuleIssue.objects.filter(module_id=field.module_id, issue_id=issue.id).exists():
                errors["issue"] = "Issue must belong to the field module."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.issue_id:
            issue = self.issue
            if self.project_id != issue.project_id:
                self.project_id = issue.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != issue.workspace_id:
                self.workspace_id = issue.workspace_id
                _add_update_fields(kwargs, "workspace")
        if self.field_id and self.module_id != self.field.module_id:
            self.module_id = self.field.module_id
            _add_update_fields(kwargs, "module")
        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class ModuleIssueFieldValueOption(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="module_issue_field_value_options")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="module_issue_field_value_options")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="module_issue_field_value_options")
    value = models.ForeignKey(ModuleIssueFieldValue, on_delete=models.CASCADE, related_name="selected_options")
    option = models.ForeignKey(ModuleIssueFieldOption, on_delete=models.CASCADE, related_name="selected_values")

    class Meta:
        db_table = "module_issue_field_value_options"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["value", "option"],
                condition=models.Q(deleted_at__isnull=True),
                name="module_issue_field_value_option_unique_value_option_when_not_deleted",
            )
        ]

    def clean(self):
        errors = {}

        if self.value_id:
            value = self.value
            if self.project_id and self.project_id != value.project_id:
                errors["project"] = "Project must match the field value project."
            if self.workspace_id and self.workspace_id != value.workspace_id:
                errors["workspace"] = "Workspace must match the field value workspace."
            if self.module_id and self.module_id != value.module_id:
                errors["module"] = "Module must match the field value module."

        if self.value_id and self.option_id:
            value = self.value
            option = self.option

            if option.field_id != value.field_id:
                errors["option"] = "Option must belong to the value field."
            if option.project_id != value.project_id:
                errors["option"] = "Option must belong to the value project."
            if option.workspace_id != value.workspace_id:
                errors["option"] = "Option must belong to the value workspace."
            if option.module_id != value.module_id:
                errors["option"] = "Option must belong to the value module."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.value_id:
            value = self.value
            if self.module_id != value.module_id:
                self.module_id = value.module_id
                _add_update_fields(kwargs, "module")
            if self.project_id != value.project_id:
                self.project_id = value.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != value.workspace_id:
                self.workspace_id = value.workspace_id
                _add_update_fields(kwargs, "workspace")

        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)


class ModuleIssueFieldValueUser(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="module_issue_field_value_users")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="module_issue_field_value_users")
    module = models.ForeignKey("db.Module", on_delete=models.CASCADE, related_name="module_issue_field_value_users")
    value = models.ForeignKey(ModuleIssueFieldValue, on_delete=models.CASCADE, related_name="selected_users")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="module_issue_field_values")

    class Meta:
        db_table = "module_issue_field_value_users"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["value", "user"],
                condition=models.Q(deleted_at__isnull=True),
                name="module_issue_field_value_user_unique_value_user_when_not_deleted",
            )
        ]

    def clean(self):
        errors = {}

        if self.value_id:
            value = self.value
            if self.project_id and self.project_id != value.project_id:
                errors["project"] = "Project must match the field value project."
            if self.workspace_id and self.workspace_id != value.workspace_id:
                errors["workspace"] = "Workspace must match the field value workspace."
            if self.module_id and self.module_id != value.module_id:
                errors["module"] = "Module must match the field value module."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.value_id:
            value = self.value
            if self.module_id != value.module_id:
                self.module_id = value.module_id
                _add_update_fields(kwargs, "module")
            if self.project_id != value.project_id:
                self.project_id = value.project_id
                _add_update_fields(kwargs, "project")
            if self.workspace_id != value.workspace_id:
                self.workspace_id = value.workspace_id
                _add_update_fields(kwargs, "workspace")

        _full_clean_issue_field_model(self)
        return super().save(*args, **kwargs)
