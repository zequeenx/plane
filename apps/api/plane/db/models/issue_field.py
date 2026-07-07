from django.conf import settings
from django.db import models

from .base import BaseModel


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
