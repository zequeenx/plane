# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import Q, UUIDField, Value, QuerySet, OuterRef, Subquery
from django.db.models.functions import Coalesce

# Module imports
from plane.db.models import (
    Cycle,
    Issue,
    IssueFieldValue,
    Label,
    Module,
    Project,
    ProjectIssueField,
    ProjectIssueFieldOption,
    ProjectMember,
    State,
    WorkspaceMember,
    IssueAssignee,
    ModuleIssue,
    IssueLabel,
)
from typing import Optional, Dict, Tuple, Any, Union, List


def issue_queryset_grouper(
    queryset: QuerySet[Issue],
    group_by: Optional[str],
    sub_group_by: Optional[str],
) -> QuerySet[Issue]:
    FIELD_MAPPER: Dict[str, str] = {
        "label_ids": "labels__id",
        "assignee_ids": "assignees__id",
        "module_ids": "issue_module__module_id",
    }

    GROUP_FILTER_MAPPER: Dict[str, Q] = {
        "assignees__id": Q(issue_assignee__deleted_at__isnull=True),
        "labels__id": Q(label_issue__deleted_at__isnull=True),
        "issue_module__module_id": Q(issue_module__deleted_at__isnull=True),
    }

    custom_group_annotations = {}
    for group_key in [group_by, sub_group_by]:
        custom_group_annotation = _custom_property_group_annotation(group_key)
        if custom_group_annotation is not None:
            custom_group_annotations[group_key] = custom_group_annotation
        if group_key in GROUP_FILTER_MAPPER:
            queryset = queryset.filter(GROUP_FILTER_MAPPER[group_key])

    issue_assignee_subquery = Subquery(
        IssueAssignee.objects.filter(
            issue_id=OuterRef("pk"),
            deleted_at__isnull=True,
        )
        .values("issue_id")
        .annotate(arr=ArrayAgg("assignee_id", distinct=True))
        .values("arr")
    )

    issue_module_subquery = Subquery(
        ModuleIssue.objects.filter(
            issue_id=OuterRef("pk"),
            deleted_at__isnull=True,
            module__archived_at__isnull=True,
        )
        .values("issue_id")
        .annotate(arr=ArrayAgg("module_id", distinct=True))
        .values("arr")
    )

    issue_label_subquery = Subquery(
        IssueLabel.objects.filter(issue_id=OuterRef("pk"), deleted_at__isnull=True)
        .values("issue_id")
        .annotate(arr=ArrayAgg("label_id", distinct=True))
        .values("arr")
    )

    annotations_map: Dict[str, Tuple[str, Q]] = {
        "assignee_ids": Coalesce(issue_assignee_subquery, Value([], output_field=ArrayField(UUIDField()))),
        "label_ids": Coalesce(issue_label_subquery, Value([], output_field=ArrayField(UUIDField()))),
        "module_ids": Coalesce(issue_module_subquery, Value([], output_field=ArrayField(UUIDField()))),
    }

    default_annotations: Dict[str, Any] = custom_group_annotations

    for key, expression in annotations_map.items():
        if FIELD_MAPPER.get(key) in {group_by, sub_group_by}:
            continue
        default_annotations[key] = expression

    return queryset.annotate(**default_annotations)


def issue_on_results(
    issues: QuerySet[Issue],
    group_by: Optional[str],
    sub_group_by: Optional[str],
) -> List[Dict[str, Any]]:
    FIELD_MAPPER: Dict[str, str] = {
        "labels__id": "label_ids",
        "assignees__id": "assignee_ids",
        "issue_module__module_id": "module_ids",
    }

    original_list: List[str] = ["assignee_ids", "label_ids", "module_ids"]

    required_fields: List[str] = [
        "id",
        "name",
        "state_id",
        "sub_state_id",
        "sort_order",
        "completed_at",
        "estimate_point",
        "priority",
        "start_date",
        "target_date",
        "sequence_id",
        "project_id",
        "parent_id",
        "cycle_id",
        "sub_issues_count",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "attachment_count",
        "link_count",
        "is_draft",
        "archived_at",
        "state__group",
    ]

    if group_by in FIELD_MAPPER:
        original_list.remove(FIELD_MAPPER[group_by])
        original_list.append(group_by)

    if sub_group_by in FIELD_MAPPER:
        original_list.remove(FIELD_MAPPER[sub_group_by])
        original_list.append(sub_group_by)

    required_fields.extend(original_list)
    for custom_group_key in [group_by, sub_group_by]:
        if _custom_property_field_id(custom_group_key):
            required_fields.append(custom_group_key)
    return list(issues.values(*required_fields))


def issue_group_values(
    field: str,
    slug: str,
    project_id: Optional[str] = None,
    filters: Dict[str, Any] = {},
    queryset: Optional[QuerySet] = None,
) -> List[Union[str, Any]]:
    if field == "state_id":
        queryset = State.objects.filter(is_triage=False, workspace__slug=slug).values_list("id", flat=True)
        if project_id:
            return list(queryset.filter(project_id=project_id))
        return list(queryset)

    if field == "labels__id":
        queryset = Label.objects.filter(workspace__slug=slug).values_list("id", flat=True)
        if project_id:
            return list(queryset.filter(project_id=project_id)) + ["None"]
        return list(queryset) + ["None"]

    if field == "assignees__id":
        if project_id:
            return list(
                ProjectMember.objects.filter(workspace__slug=slug, project_id=project_id, is_active=True).values_list(
                    "member_id", flat=True
                )
            )
        return list(
            WorkspaceMember.objects.filter(workspace__slug=slug, is_active=True).values_list("member_id", flat=True)
        )

    if field == "issue_module__module_id":
        queryset = Module.objects.filter(workspace__slug=slug).values_list("id", flat=True)
        if project_id:
            return list(queryset.filter(project_id=project_id)) + ["None"]
        return list(queryset) + ["None"]

    if field == "cycle_id":
        queryset = Cycle.objects.filter(workspace__slug=slug).values_list("id", flat=True)
        if project_id:
            return list(queryset.filter(project_id=project_id)) + ["None"]
        return list(queryset) + ["None"]

    if field == "project_id":
        queryset = Project.objects.filter(workspace__slug=slug).values_list("id", flat=True)
        return list(queryset)

    if field == "priority":
        return ["low", "medium", "high", "urgent", "none"]

    if field == "state__group":
        return ["backlog", "unstarted", "started", "completed", "cancelled"]

    custom_group_values = _custom_property_group_values(field, slug, project_id, queryset)
    if custom_group_values is not None:
        return custom_group_values

    if field == "target_date":
        queryset = queryset.values_list("target_date", flat=True).distinct()
        if project_id:
            return list(queryset.filter(project_id=project_id))
        else:
            return list(queryset)

    if field == "start_date":
        queryset = queryset.values_list("start_date", flat=True).distinct()
        if project_id:
            return list(queryset.filter(project_id=project_id))
        else:
            return list(queryset)

    if field == "created_by":
        queryset = queryset.values_list("created_by", flat=True).distinct()
        if project_id:
            return list(queryset.filter(project_id=project_id))
        else:
            return list(queryset)

    return []


def _custom_property_field_id(field: Optional[str]) -> Optional[str]:
    if not isinstance(field, str) or not field.startswith("customproperty_"):
        return None
    field_id = field[len("customproperty_") :]
    return field_id or None


def _custom_property_group_field(field: Optional[str]) -> Optional[ProjectIssueField]:
    field_id = _custom_property_field_id(field)
    if field_id is None:
        return None
    return ProjectIssueField.objects.filter(id=field_id, is_disabled=False).first()


def _custom_property_group_annotation(field: Optional[str]):
    project_field = _custom_property_group_field(field)
    if project_field is None:
        return None

    value_rows = IssueFieldValue.objects.filter(
        issue_id=OuterRef("pk"),
        field=project_field,
        deleted_at__isnull=True,
    )

    if project_field.field_type == ProjectIssueField.FieldType.SINGLE_SELECT:
        return Subquery(
            value_rows.filter(
                selected_options__deleted_at__isnull=True,
                selected_options__option__deleted_at__isnull=True,
            ).values("selected_options__option_id")[:1]
        )

    if project_field.field_type == ProjectIssueField.FieldType.SINGLE_MEMBER:
        return Subquery(
            value_rows.filter(selected_users__deleted_at__isnull=True).values("selected_users__user_id")[:1]
        )

    return Value(None)


def _custom_property_group_values(
    field: str,
    slug: str,
    project_id: Optional[str],
    queryset: Optional[QuerySet],
) -> Optional[List[Union[str, Any]]]:
    project_field = _custom_property_group_field(field)
    if project_field is None:
        return None

    if project_field.field_type == ProjectIssueField.FieldType.SINGLE_SELECT:
        return list(
            ProjectIssueFieldOption.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                field=project_field,
            ).values_list("id", flat=True)
        ) + [None]

    if project_field.field_type == ProjectIssueField.FieldType.SINGLE_MEMBER:
        return list(
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                is_active=True,
            ).values_list("member_id", flat=True)
        ) + [None]

    return []
