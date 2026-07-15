# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import copy
import json
import uuid

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models import (
    Count,
    Exists,
    F,
    Func,
    OuterRef,
    Prefetch,
    Q,
    Subquery,
    UUIDField,
    Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    IssueCreateSerializer,
    IssueDetailSerializer,
    IssueListDetailSerializer,
    IssueSerializer,
    ProjectUserPropertySerializer,
)
from plane.app.services.issue_field import IssueFieldValueService
from plane.app.services.module_issue_field import ModuleIssueFieldValueService
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.issue_description_version_task import issue_description_version_task
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.bgtasks.webhook_task import model_activity
from plane.db.models import (
    CycleIssue,
    FileAsset,
    IntakeIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    IssueLink,
    IssueReaction,
    IssueRelation,
    IssueSubscriber,
    ProjectUserProperty,
    ModuleIssue,
    Project,
    ProjectMember,
    UserRecentVisit,
    Module,
)
from plane.db.utils.module_visibility import filter_visible_module_relations, filter_visible_modules
from plane.utils.filters import ComplexFilterBackend, IssueFilterSet
from plane.utils.global_paginator import paginate
from plane.utils.grouper import (
    issue_group_values,
    issue_on_results,
    issue_queryset_grouper,
    resolve_issue_group_by,
)
from plane.utils.host import base_host
from plane.utils.issue_filters import issue_filters
from plane.utils.order_queryset import order_issue_queryset
from plane.utils.paginator import GroupedOffsetPaginator, SubGroupedOffsetPaginator
from plane.utils.timezone_converter import user_timezone_converter

from .. import BaseAPIView, BaseViewSet


def visible_module_ids_subquery(user):
    return Coalesce(
        Subquery(
            filter_visible_module_relations(
                ModuleIssue.objects.filter(
                    issue_id=OuterRef("pk"),
                    deleted_at__isnull=True,
                    module__archived_at__isnull=True,
                ),
                user,
            )
            .order_by()
            .values("issue_id")
            .annotate(arr=ArrayAgg("module_id", distinct=True))
            .values("arr")
        ),
        Value([], output_field=ArrayField(UUIDField())),
    )


def sanitize_module_query_params(query_params, slug, project_id, user):
    if "module" not in query_params:
        return query_params

    module_values = [item for item in query_params.get("module", "").split(",") if item]
    if not module_values or all(item == "null" for item in module_values):
        return query_params

    requested_module_ids = []
    for item in module_values:
        if item in ["None", "null"]:
            continue
        try:
            requested_module_ids.append(str(uuid.UUID(str(item))))
        except (AttributeError, TypeError, ValueError):
            continue

    visible_module_ids = {
        str(module_id)
        for module_id in filter_visible_modules(
            Module.objects.filter(workspace__slug=slug, project_id=project_id, pk__in=requested_module_ids),
            user,
        ).values_list("id", flat=True)
    }

    sanitized_module_values = [module_id for module_id in requested_module_ids if module_id in visible_module_ids]
    if "None" in module_values:
        sanitized_module_values.append("None")
    if not sanitized_module_values:
        sanitized_module_values = ["00000000-0000-0000-0000-000000000000"]

    query_params["module"] = ",".join(sanitized_module_values)
    return query_params


def single_module_context_id(query_params):
    module_values = [item for item in query_params.get("module", "").split(",") if item]
    excluded_values = ["None", "null", "00000000-0000-0000-0000-000000000000"]
    if len(module_values) != 1 or module_values[0] in excluded_values:
        return None

    try:
        return str(uuid.UUID(module_values[0]))
    except (AttributeError, TypeError, ValueError):
        return None


def visible_module_filter_values(module_values, slug, project_id, user):
    valid_module_ids = []
    for item in module_values:
        try:
            valid_module_ids.append(str(uuid.UUID(str(item))))
        except (AttributeError, TypeError, ValueError):
            continue

    visible_module_ids = {
        str(module_id)
        for module_id in filter_visible_modules(
            Module.objects.filter(workspace__slug=slug, project_id=project_id, pk__in=valid_module_ids),
            user,
        ).values_list("id", flat=True)
    }
    return [module_id for module_id in valid_module_ids if module_id in visible_module_ids]


def sanitize_module_filter_data(filter_data, slug, project_id, user):
    if isinstance(filter_data, list):
        return [sanitize_module_filter_data(item, slug, project_id, user) for item in filter_data]

    if not isinstance(filter_data, dict):
        return filter_data

    sanitized_filter_data = {}
    for key, value in filter_data.items():
        if key in ["and", "or"] and isinstance(value, list):
            sanitized_filter_data[key] = [sanitize_module_filter_data(item, slug, project_id, user) for item in value]
        elif key == "not" and isinstance(value, dict):
            sanitized_filter_data[key] = sanitize_module_filter_data(value, slug, project_id, user)
        elif key == "module_id":
            visible_values = visible_module_filter_values([value], slug, project_id, user)
            sanitized_filter_data[key] = visible_values[0] if visible_values else "00000000-0000-0000-0000-000000000000"
        elif key == "module_id__in":
            if isinstance(value, list):
                module_values = value
                keep_comma_separated_value = False
            elif isinstance(value, str):
                module_values = [item for item in value.split(",") if item]
                keep_comma_separated_value = True
            else:
                module_values = [value]
                keep_comma_separated_value = False
            visible_values = visible_module_filter_values(module_values, slug, project_id, user)
            if keep_comma_separated_value:
                sanitized_filter_data[key] = (
                    ",".join(visible_values) if visible_values else "00000000-0000-0000-0000-000000000000"
                )
            else:
                sanitized_filter_data[key] = (
                    visible_values if visible_values else ["00000000-0000-0000-0000-000000000000"]
                )
        else:
            sanitized_filter_data[key] = sanitize_module_filter_data(value, slug, project_id, user)

    return sanitized_filter_data


def sanitize_rich_filter_params(request, slug, project_id, user):
    raw_filter = request.query_params.get("filters")
    if not raw_filter:
        return None

    try:
        filter_data = json.loads(raw_filter)
    except json.JSONDecodeError:
        return raw_filter

    return sanitize_module_filter_data(filter_data, slug, project_id, user)


def filter_queryset_with_module_visibility(view, request, queryset, slug, project_id, user):
    filter_data = sanitize_rich_filter_params(request, slug, project_id, user)
    if filter_data is None:
        return view.filter_queryset(queryset)

    for backend in list(view.filter_backends):
        if backend is ComplexFilterBackend:
            queryset = backend().filter_queryset(request, queryset, view, filter_data=filter_data)
        else:
            queryset = backend().filter_queryset(request, queryset, view)
    return queryset


def grouping_by_modules(group_by, sub_group_by):
    return "issue_module__module_id" in [group_by, sub_group_by]


def normalize_module_group_by(field):
    if field == "module_ids":
        return "issue_module__module_id"
    if field == "state":
        return "state_id"
    return field


def visible_module_id_strings(slug, project_id, user):
    return {
        str(module_id)
        for module_id in filter_visible_modules(
            Module.objects.filter(workspace__slug=slug, project_id=project_id),
            user,
        ).values_list("id", flat=True)
    }


def filter_grouped_module_response(response, slug, project_id, user):
    visible_module_ids = visible_module_id_strings(slug, project_id, user)
    results = response.data.get("results", {})
    if not isinstance(results, dict):
        return response

    def collect_issue_ids(value):
        if isinstance(value, dict):
            issue_ids = {value.get("id")} if value.get("id") else set()
            for child in value.values():
                issue_ids.update(collect_issue_ids(child))
            return issue_ids
        if isinstance(value, list):
            issue_ids = set()
            for child in value:
                issue_ids.update(collect_issue_ids(child))
            return issue_ids
        return set()

    issue_ids = collect_issue_ids(results)
    visible_module_ids_by_issue_id = {str(issue_id): [] for issue_id in issue_ids}
    if issue_ids:
        visible_module_relations = filter_visible_module_relations(
            ModuleIssue.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue_id__in=issue_ids,
                deleted_at__isnull=True,
                module__archived_at__isnull=True,
            ),
            user,
        ).values_list("issue_id", "module_id")
        for issue_id, module_id in visible_module_relations:
            visible_module_ids_by_issue_id.setdefault(str(issue_id), []).append(str(module_id))

    def mask_issue(issue):
        if not isinstance(issue, dict):
            return
        issue["module_ids"] = visible_module_ids_by_issue_id.get(str(issue.get("id")), [])
        if (
            str(issue.get("issue_module__module_id")) not in visible_module_ids
            and str(issue.get("issue_module__module_id")) != "None"
        ):
            issue.pop("issue_module__module_id", None)

    def filter_issue_list(group):
        if not isinstance(group, dict):
            return
        for issue in group.get("results", []):
            mask_issue(issue)

    def append_unique_issue(group, issue):
        if not isinstance(group, dict) or not isinstance(issue, dict):
            return False
        issue_id = issue.get("id")
        results_list = group.setdefault("results", [])
        existing_issue_ids = {
            existing_issue.get("id")
            for existing_issue in results_list
            if isinstance(existing_issue, dict)
        }
        if issue_id not in existing_issue_ids:
            results_list.append(issue)
            return True
        return False

    def merge_total_results(target_group, appended_count=0):
        if not isinstance(target_group, dict):
            return
        target_group["total_results"] = (target_group.get("total_results") or 0) + appended_count

    def refresh_subgroup_total(group):
        if not isinstance(group, dict) or not isinstance(group.get("results"), dict):
            return
        group["total_results"] = sum(
            subgroup.get("total_results") or 0
            for subgroup in group["results"].values()
            if isinstance(subgroup, dict)
        )

    def filter_subgroups(group, subgroup_keys_are_modules=False):
        if not isinstance(group, dict) or not isinstance(group.get("results"), dict):
            return
        for subgroup_id in list(group["results"].keys()):
            if subgroup_keys_are_modules and subgroup_id not in visible_module_ids and subgroup_id != "None":
                none_subgroup = group["results"].setdefault("None", {"results": [], "total_results": 0})
                appended_count = 0
                for issue in group["results"][subgroup_id].get("results", []):
                    mask_issue(issue)
                    if not issue.get("module_ids"):
                        appended_count += int(append_unique_issue(none_subgroup, issue))
                merge_total_results(none_subgroup, appended_count)
                del group["results"][subgroup_id]
                continue
            filter_issue_list(group["results"][subgroup_id])
        if subgroup_keys_are_modules:
            refresh_subgroup_total(group)

    group_by = response.data.get("grouped_by")
    sub_group_by = response.data.get("sub_grouped_by")

    if group_by == "issue_module__module_id":
        for group_id in list(results.keys()):
            if group_id not in visible_module_ids and group_id != "None":
                none_group = results.setdefault("None", {"results": {} if sub_group_by else [], "total_results": 0})
                hidden_group_results = results[group_id].get("results", {})
                if sub_group_by and isinstance(hidden_group_results, dict):
                    for subgroup_id, subgroup in hidden_group_results.items():
                        none_subgroup = none_group["results"].setdefault(
                            subgroup_id,
                            {"results": [], "total_results": 0},
                        )
                        appended_count = 0
                        for issue in subgroup.get("results", []):
                            mask_issue(issue)
                            if not issue.get("module_ids"):
                                appended_count += int(append_unique_issue(none_subgroup, issue))
                        merge_total_results(none_subgroup, appended_count)
                    refresh_subgroup_total(none_group)
                else:
                    appended_count = 0
                    for issue in hidden_group_results:
                        mask_issue(issue)
                        if not issue.get("module_ids"):
                            appended_count += int(append_unique_issue(none_group, issue))
                    merge_total_results(none_group, appended_count)
                del results[group_id]
                continue
            if sub_group_by:
                filter_subgroups(results[group_id])
            else:
                filter_issue_list(results[group_id])
        return response

    for group in results.values():
        if sub_group_by == "issue_module__module_id":
            filter_subgroups(group, subgroup_keys_are_modules=True)
        else:
            filter_issue_list(group)

    return response


def attach_visible_module_field_values(issue_dicts, user):
    issue_ids = [issue_dict.get("id") for issue_dict in issue_dicts if issue_dict.get("id")]
    if not issue_ids:
        return issue_dicts
    visible_module_ids = set(
        filter_visible_module_relations(
            ModuleIssue.objects.filter(
                issue_id__in=issue_ids,
                deleted_at__isnull=True,
                module__archived_at__isnull=True,
            ),
            user,
        ).values_list("module_id", flat=True)
    )
    return ModuleIssueFieldValueService.attach_module_field_values_to_issue_dicts(
        issue_dicts,
        module_ids=list(visible_module_ids),
    )


class IssueListEndpoint(BaseAPIView):
    filter_backends = (ComplexFilterBackend,)
    filterset_class = IssueFilterSet

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        issue_ids = request.GET.get("issues", False)

        if not issue_ids:
            return Response({"error": "Issues are required"}, status=status.HTTP_400_BAD_REQUEST)

        issue_ids = [issue_id for issue_id in issue_ids.split(",") if issue_id != ""]

        # Base queryset with basic filters
        queryset = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk__in=issue_ids)

        # Apply filtering from filterset
        queryset = filter_queryset_with_module_visibility(self, request, queryset, slug, project_id, request.user)

        # Apply legacy filters
        query_params = sanitize_module_query_params(request.query_params.copy(), slug, project_id, request.user)
        filters = issue_filters(query_params, "GET")
        issue_queryset = queryset.filter(**filters)
        issue_queryset = issue_queryset.filter(state__deleted_at__isnull=True)

        # Add select_related, prefetch_related if fields or expand is not None
        if self.fields or self.expand:
            issue_queryset = issue_queryset.select_related("workspace", "project", "state", "parent").prefetch_related(
                "assignees", "labels", "issue_module__module"
            )

        # Add annotations
        issue_queryset = (
            issue_queryset.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .distinct()
        )

        order_by_param = request.GET.get("order_by", "-created_at")
        # Issue queryset
        issue_queryset, _ = order_issue_queryset(
            issue_queryset=issue_queryset,
            order_by_param=order_by_param,
            slug=slug,
            project_id=project_id,
        )

        # Group by
        group_by = request.GET.get("group_by", False)
        sub_group_by = request.GET.get("sub_group_by", False)
        group_by = resolve_issue_group_by(group_by, slug=slug, project_id=project_id)
        sub_group_by = resolve_issue_group_by(sub_group_by, slug=slug, project_id=project_id)
        group_by = normalize_module_group_by(group_by)
        sub_group_by = normalize_module_group_by(sub_group_by)

        # issue queryset
        issue_queryset = issue_queryset_grouper(
            queryset=issue_queryset,
            group_by=group_by,
            sub_group_by=sub_group_by,
            slug=slug,
            project_id=project_id,
        )
        issue_queryset = issue_queryset.annotate(module_ids=visible_module_ids_subquery(request.user))

        recent_visited_task.delay(
            slug=slug,
            project_id=project_id,
            entity_name="project",
            entity_identifier=project_id,
            user_id=request.user.id,
        )

        if self.fields or self.expand:
            issues = IssueSerializer(issue_queryset, many=True, fields=self.fields, expand=self.expand).data
            issues = IssueFieldValueService.attach_field_values_to_issue_dicts(issues)
            issues = attach_visible_module_field_values(issues, request.user)
        else:
            issues = issue_queryset.values(
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
                "module_ids",
                "label_ids",
                "assignee_ids",
                "sub_issues_count",
                "created_at",
                "updated_at",
                "created_by",
                "updated_by",
                "attachment_count",
                "link_count",
                "is_draft",
                "archived_at",
                "deleted_at",
            )
            datetime_fields = ["created_at", "updated_at"]
            issues = user_timezone_converter(issues, datetime_fields, request.user.user_timezone)
            issues = IssueFieldValueService.attach_field_values_to_issue_dicts(issues)
            issues = attach_visible_module_field_values(issues, request.user)
        return Response(issues, status=status.HTTP_200_OK)


class IssueViewSet(BaseViewSet):
    model = Issue
    webhook_event = "issue"
    search_fields = ["name"]
    filter_backends = (ComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def get_serializer_class(self):
        return IssueCreateSerializer if self.action in ["create", "update", "partial_update"] else IssueSerializer

    def get_queryset(self):
        issues = Issue.issue_objects.filter(
            project_id=self.kwargs.get("project_id"),
            workspace__slug=self.kwargs.get("slug"),
        ).distinct()

        return issues

    def apply_annotations(self, issues):
        issues = (
            issues.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=Subquery(
                    IssueLink.objects.filter(issue=OuterRef("id"))
                    .values("issue")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                attachment_count=Subquery(
                    FileAsset.objects.filter(
                        issue_id=OuterRef("id"),
                        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                    )
                    .values("issue_id")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                sub_issues_count=Subquery(
                    Issue.issue_objects.filter(parent=OuterRef("id"))
                    .values("parent")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
        )

        return issues

    @method_decorator(gzip_page)
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        extra_filters = {}
        if request.GET.get("updated_at__gt", None) is not None:
            extra_filters = {"updated_at__gt": request.GET.get("updated_at__gt")}

        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        query_params = request.query_params.copy()

        query_params = sanitize_module_query_params(query_params, slug, project_id, request.user)
        source_module_id = single_module_context_id(query_params)
        self.source_module_id = source_module_id
        filters = issue_filters(query_params, "GET")
        order_by_param = request.GET.get("order_by", "-created_at")

        issue_queryset = self.get_queryset()

        # Apply rich filters
        issue_queryset = filter_queryset_with_module_visibility(
            self,
            request,
            issue_queryset,
            slug,
            project_id,
            request.user,
        )

        # Apply legacy filters
        issue_queryset = issue_queryset.filter(**filters, **extra_filters)

        # Keeping a copy of the queryset before applying annotations
        filtered_issue_queryset = copy.deepcopy(issue_queryset)

        # Applying annotations to the issue queryset
        issue_queryset = self.apply_annotations(issue_queryset)

        # Issue queryset
        issue_queryset, order_by_param = order_issue_queryset(
            issue_queryset=issue_queryset,
            order_by_param=order_by_param,
            slug=slug,
            project_id=project_id,
        )

        # Group by
        group_by = request.GET.get("group_by", False)
        sub_group_by = request.GET.get("sub_group_by", False)
        group_by = resolve_issue_group_by(
            group_by, slug=slug, project_id=project_id, module_id=source_module_id
        )
        sub_group_by = resolve_issue_group_by(
            sub_group_by, slug=slug, project_id=project_id, module_id=source_module_id
        )
        group_by = normalize_module_group_by(group_by)
        sub_group_by = normalize_module_group_by(sub_group_by)

        # issue queryset
        issue_queryset = issue_queryset_grouper(
            queryset=issue_queryset,
            group_by=group_by,
            sub_group_by=sub_group_by,
            slug=slug,
            project_id=project_id,
            module_id=source_module_id,
        )
        issue_queryset = issue_queryset.annotate(module_ids=visible_module_ids_subquery(request.user))

        recent_visited_task.delay(
            slug=slug,
            project_id=project_id,
            entity_name="project",
            entity_identifier=project_id,
            user_id=request.user.id,
        )
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
        ):
            issue_queryset = issue_queryset.filter(created_by=request.user)
            filtered_issue_queryset = filtered_issue_queryset.filter(created_by=request.user)

        if group_by:
            if sub_group_by:
                if group_by == sub_group_by:
                    return Response(
                        {
                            "error": "Group by and sub group by cannot have same parameters"  # noqa: E501
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    response = self.paginate(
                        request=request,
                        order_by=order_by_param,
                        queryset=issue_queryset,
                        total_count_queryset=filtered_issue_queryset,
                        on_results=lambda issues: attach_visible_module_field_values(
                            IssueFieldValueService.attach_field_values_to_issue_dicts(
                                issue_on_results(group_by=group_by, issues=issues, sub_group_by=sub_group_by)
                            ),
                            request.user,
                        ),
                        paginator_cls=SubGroupedOffsetPaginator,
                        group_by_fields=issue_group_values(
                            field=group_by,
                            slug=slug,
                            project_id=project_id,
                            filters=filters,
                            queryset=filtered_issue_queryset,
                            module_id=source_module_id,
                        ),
                        sub_group_by_fields=issue_group_values(
                            field=sub_group_by,
                            slug=slug,
                            project_id=project_id,
                            filters=filters,
                            queryset=filtered_issue_queryset,
                            module_id=source_module_id,
                        ),
                        group_by_field_name=group_by,
                        sub_group_by_field_name=sub_group_by,
                        count_filter=Q(
                            Q(issue_intake__status=1)
                            | Q(issue_intake__status=-1)
                            | Q(issue_intake__status=2)
                            | Q(issue_intake__isnull=True),
                            archived_at__isnull=True,
                            is_draft=False,
                        ),
                    )
                    if grouping_by_modules(group_by, sub_group_by):
                        return filter_grouped_module_response(response, slug, project_id, request.user)
                    return response
            else:
                # Group paginate
                response = self.paginate(
                    request=request,
                    order_by=order_by_param,
                    queryset=issue_queryset,
                    total_count_queryset=filtered_issue_queryset,
                    on_results=lambda issues: attach_visible_module_field_values(
                        IssueFieldValueService.attach_field_values_to_issue_dicts(
                            issue_on_results(group_by=group_by, issues=issues, sub_group_by=sub_group_by)
                        ),
                        request.user,
                    ),
                    paginator_cls=GroupedOffsetPaginator,
                    group_by_fields=issue_group_values(
                        field=group_by,
                        slug=slug,
                        project_id=project_id,
                        filters=filters,
                        queryset=filtered_issue_queryset,
                        module_id=source_module_id,
                    ),
                    group_by_field_name=group_by,
                    count_filter=Q(
                        Q(issue_intake__status=1)
                        | Q(issue_intake__status=-1)
                        | Q(issue_intake__status=2)
                        | Q(issue_intake__isnull=True),
                        archived_at__isnull=True,
                        is_draft=False,
                    ),
                )
                if grouping_by_modules(group_by, sub_group_by):
                    return filter_grouped_module_response(response, slug, project_id, request.user)
                return response
        else:
            return self.paginate(
                order_by=order_by_param,
                request=request,
                queryset=issue_queryset,
                total_count_queryset=filtered_issue_queryset,
                on_results=lambda issues: attach_visible_module_field_values(
                    IssueFieldValueService.attach_field_values_to_issue_dicts(
                        issue_on_results(group_by=group_by, issues=issues, sub_group_by=sub_group_by)
                    ),
                    request.user,
                ),
            )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id)
        request_data = request.data.copy()
        field_values = request_data.pop("field_values", None)

        serializer = IssueCreateSerializer(
            data=request_data,
            context={
                "project_id": project_id,
                "workspace_id": project.workspace_id,
                "default_assignee_id": project.default_assignee_id,
            },
        )

        if serializer.is_valid():
            with transaction.atomic():
                created_issue = serializer.save()
                IssueFieldValueService.update_issue_values(created_issue, field_values)

            # Track the issue
            issue_activity.delay(
                type="issue.activity.created",
                requested_data=json.dumps(self.request.data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(serializer.data.get("id", None)),
                project_id=str(project_id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            queryset = self.get_queryset()
            queryset = self.apply_annotations(queryset)
            issue = (
                issue_queryset_grouper(
                    queryset=queryset.filter(pk=serializer.data["id"]),
                    group_by=None,
                    sub_group_by=None,
                )
                .values(
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
                    "module_ids",
                    "label_ids",
                    "assignee_ids",
                    "sub_issues_count",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "attachment_count",
                    "link_count",
                    "is_draft",
                    "archived_at",
                    "deleted_at",
                )
                .first()
            )
            datetime_fields = ["created_at", "updated_at"]
            issue = user_timezone_converter(issue, datetime_fields, request.user.user_timezone)
            issue = IssueFieldValueService.attach_field_values_to_issue_dict(issue)
            issue = attach_visible_module_field_values([issue], request.user)[0]
            # Send the model activity
            model_activity.delay(
                model_name="issue",
                model_id=str(serializer.data["id"]),
                requested_data=request.data,
                current_instance=None,
                actor_id=request.user.id,
                slug=slug,
                origin=base_host(request=request, is_app=True),
            )
            # updated issue description version
            issue_description_version_task.delay(
                updated_issue=json.dumps(request.data, cls=DjangoJSONEncoder),
                issue_id=str(serializer.data["id"]),
                user_id=request.user.id,
                is_creating=True,
            )
            return Response(issue, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], creator=True, model=Issue)
    def retrieve(self, request, slug, project_id, pk=None):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)

        issue = (
            Issue.objects.filter(
                project_id=self.kwargs.get("project_id"),
                workspace__slug=self.kwargs.get("slug"),
                pk=pk,
            )
            .select_related("state")
            .annotate(cycle_id=Subquery(CycleIssue.objects.filter(issue=OuterRef("id")).values("cycle_id")[:1]))
            .annotate(
                link_count=Subquery(
                    IssueLink.objects.filter(issue=OuterRef("id"))
                    .values("issue")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                attachment_count=Subquery(
                    FileAsset.objects.filter(
                        issue_id=OuterRef("id"),
                        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                    )
                    .values("issue_id")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                sub_issues_count=Subquery(
                    Issue.issue_objects.filter(parent=OuterRef("id"))
                    .values("parent")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                label_ids=Coalesce(
                    Subquery(
                        IssueLabel.objects.filter(issue_id=OuterRef("pk"))
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("label_id", distinct=True))
                        .values("arr")
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    Subquery(
                        IssueAssignee.objects.filter(
                            issue_id=OuterRef("pk"),
                            assignee__member_project__is_active=True,
                        )
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("assignee_id", distinct=True))
                        .values("arr")
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=visible_module_ids_subquery(request.user),
            )
            .prefetch_related(
                Prefetch(
                    "issue_reactions",
                    queryset=IssueReaction.objects.select_related("issue", "actor"),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_link",
                    queryset=IssueLink.objects.select_related("created_by"),
                )
            )
            .annotate(
                is_subscribed=Exists(
                    IssueSubscriber.objects.filter(
                        workspace__slug=slug,
                        project_id=project_id,
                        issue_id=OuterRef("pk"),
                        subscriber=request.user,
                    )
                )
            )
        ).first()
        if not issue:
            return Response(
                {"error": "The required object does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        """
        if the role is guest and guest_view_all_features is false and owned by is not
        the requesting user then dont show the issue
        """

        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
            and not issue.created_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )

        recent_visited_task.delay(
            slug=slug,
            entity_name="issue",
            entity_identifier=pk,
            user_id=request.user.id,
            project_id=project_id,
        )

        serializer = IssueDetailSerializer(issue, expand=self.expand)
        issue_data = IssueFieldValueService.attach_field_values_to_issue_dict(serializer.data)
        issue_data = attach_visible_module_field_values([issue_data], request.user)[0]
        return Response(issue_data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], creator=True, model=Issue)
    def partial_update(self, request, slug, project_id, pk=None):
        queryset = self.get_queryset()
        queryset = self.apply_annotations(queryset)

        skip_activity = request.data.pop("skip_activity", False)
        is_description_update = request.data.get("description_html") is not None

        issue = (
            queryset.annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "labels__id",
                        distinct=True,
                        filter=Q(~Q(labels__id__isnull=True) & Q(label_issue__deleted_at__isnull=True)),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True)
                            & Q(assignees__member_project__is_active=True)
                            & Q(issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=visible_module_ids_subquery(request.user),
            )
            .filter(pk=pk)
            .first()
        )

        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        current_instance = json.dumps(IssueDetailSerializer(issue).data, cls=DjangoJSONEncoder)

        requested_data = json.dumps(self.request.data, cls=DjangoJSONEncoder)
        serializer = IssueCreateSerializer(issue, data=request.data, partial=True, context={"project_id": project_id})
        if serializer.is_valid():
            serializer.save()
            # Check if the update is a migration description update
            is_migration_description_update = skip_activity and is_description_update
            # Log all the updates
            if not is_migration_description_update:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=requested_data,
                    actor_id=str(request.user.id),
                    issue_id=str(pk),
                    project_id=str(project_id),
                    current_instance=current_instance,
                    epoch=int(timezone.now().timestamp()),
                    notification=True,
                    origin=base_host(request=request, is_app=True),
                )
                model_activity.delay(
                    model_name="issue",
                    model_id=str(serializer.data.get("id", None)),
                    requested_data=request.data,
                    current_instance=current_instance,
                    actor_id=request.user.id,
                    slug=slug,
                    origin=base_host(request=request, is_app=True),
                )
                # updated issue description version
                issue_description_version_task.delay(
                    updated_issue=current_instance,
                    issue_id=str(serializer.data.get("id", None)),
                    user_id=request.user.id,
                )
            if "sub_state_id" in request.data:
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], creator=True, model=Issue)
    def destroy(self, request, slug, project_id, pk=None):
        issue = Issue.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)

        issue.delete()
        # delete the issue from recent visits
        UserRecentVisit.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            entity_identifier=pk,
            entity_name="issue",
        ).delete(soft=False)
        issue_activity.delay(
            type="issue.activity.deleted",
            requested_data=json.dumps({"issue_id": str(pk)}),
            actor_id=str(request.user.id),
            issue_id=str(pk),
            project_id=str(project_id),
            current_instance={},
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
            subscriber=False,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectUserDisplayPropertyEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id):
        try:
            issue_property = ProjectUserProperty.objects.get(
                user=request.user, 
                project_id=project_id
            )
        except ProjectUserProperty.DoesNotExist:
            issue_property = ProjectUserProperty.objects.create(
                user=request.user, 
                project_id=project_id
            )

        serializer = ProjectUserPropertySerializer(
            issue_property, 
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        issue_property, _ = ProjectUserProperty.objects.get_or_create(user=request.user, project_id=project_id)
        serializer = ProjectUserPropertySerializer(issue_property)
        return Response(serializer.data, status=status.HTTP_200_OK)


class BulkDeleteIssuesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids", [])

        if not len(issue_ids):
            return Response({"error": "Issue IDs are required"}, status=status.HTTP_400_BAD_REQUEST)

        issues = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, pk__in=issue_ids)

        total_issues = len(issues)

        # First, delete all related cycle issues
        CycleIssue.objects.filter(issue__in=issues).delete()

        # Then, delete all related module issues
        ModuleIssue.objects.filter(issue__in=issues).delete()

        # Finally, delete the issues themselves
        issues.delete()

        return Response(
            {"message": f"{total_issues} issues were deleted"},
            status=status.HTTP_200_OK,
        )


class DeletedIssuesListViewSet(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        filters = {}
        if request.GET.get("updated_at__gt", None) is not None:
            filters = {"updated_at__gt": request.GET.get("updated_at__gt")}
        deleted_issues = (
            Issue.all_objects.filter(workspace__slug=slug, project_id=project_id)
            .filter(Q(archived_at__isnull=False) | Q(deleted_at__isnull=False))
            .filter(**filters)
            .values_list("id", flat=True)
        )

        return Response(deleted_issues, status=status.HTTP_200_OK)


class IssuePaginatedViewSet(BaseViewSet):
    def get_queryset(self):
        workspace_slug = self.kwargs.get("slug")
        project_id = self.kwargs.get("project_id")

        issue_queryset = Issue.issue_objects.filter(workspace__slug=workspace_slug, project_id=project_id)

        return (
            issue_queryset.select_related("state")
            .annotate(cycle_id=Subquery(CycleIssue.objects.filter(issue=OuterRef("id")).values("cycle_id")[:1]))
            .annotate(
                link_count=Subquery(
                    IssueLink.objects.filter(issue=OuterRef("id"))
                    .values("issue")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                attachment_count=Subquery(
                    FileAsset.objects.filter(
                        issue_id=OuterRef("id"),
                        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                    )
                    .values("issue_id")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                sub_issues_count=Subquery(
                    Issue.issue_objects.filter(parent=OuterRef("id"))
                    .values("parent")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
        )

    def process_paginated_result(self, fields, results, timezone, user):
        paginated_data = results.values(*fields)

        # converting the datetime fields in paginated data
        datetime_fields = ["created_at", "updated_at"]
        paginated_data = user_timezone_converter(paginated_data, datetime_fields, timezone)
        paginated_data = IssueFieldValueService.attach_field_values_to_issue_dicts(paginated_data)
        paginated_data = attach_visible_module_field_values(paginated_data, user)

        return paginated_data

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        cursor = request.GET.get("cursor", None)
        is_description_required = request.GET.get("description", "false")
        updated_at = request.GET.get("updated_at__gt", None)

        # required fields
        required_fields = [
            "id",
            "name",
            "state_id",
            "sub_state_id",
            "state__group",
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
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "is_draft",
            "archived_at",
            "module_ids",
            "label_ids",
            "assignee_ids",
            "link_count",
            "attachment_count",
            "sub_issues_count",
        ]

        if str(is_description_required).lower() == "true":
            required_fields.append("description_html")

        # querying issues
        base_queryset = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id)

        base_queryset = base_queryset.order_by("updated_at")
        queryset = self.get_queryset().order_by("updated_at")

        # validation for guest user
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        project_member = ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=request.user,
            role=5,
            is_active=True,
        )
        if project_member.exists() and not project.guest_view_all_features:
            base_queryset = base_queryset.filter(created_by=request.user)
            queryset = queryset.filter(created_by=request.user)

        # filtering issues by greater then updated_at given by the user
        if updated_at:
            base_queryset = base_queryset.filter(updated_at__gt=updated_at)
            queryset = queryset.filter(updated_at__gt=updated_at)

        queryset = queryset.annotate(
            label_ids=Coalesce(
                Subquery(
                    IssueLabel.objects.filter(issue_id=OuterRef("pk"))
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("label_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
            assignee_ids=Coalesce(
                Subquery(
                    IssueAssignee.objects.filter(
                        issue_id=OuterRef("pk"),
                        assignee__member_project__is_active=True,
                    )
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("assignee_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
            module_ids=visible_module_ids_subquery(request.user),
        )

        paginated_data = paginate(
            base_queryset=base_queryset,
            queryset=queryset,
            cursor=cursor,
            on_result=lambda results: self.process_paginated_result(
                required_fields, results, request.user.user_timezone, request.user
            ),
        )

        return Response(paginated_data, status=status.HTTP_200_OK)


class IssueDetailEndpoint(BaseAPIView):
    filter_backends = (ComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def apply_annotations(self, issues, user=None):
        module_issue_queryset = ModuleIssue.objects.all()
        if user is not None:
            module_issue_queryset = filter_visible_module_relations(module_issue_queryset, user)

        return (
            issues.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .prefetch_related(
                Prefetch(
                    "issue_assignee",
                    queryset=IssueAssignee.objects.all(),
                )
            )
            .prefetch_related(
                Prefetch(
                    "label_issue",
                    queryset=IssueLabel.objects.all(),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_module",
                    queryset=module_issue_queryset,
                )
            )
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        query_params = sanitize_module_query_params(request.query_params.copy(), slug, project_id, request.user)
        filters = issue_filters(query_params, "GET")

        # check for the project member role, if the role is 5 then check for the guest_view_all_features
        #  if it is true then show all the issues else show only the issues created by the user
        permission_subquery = (
            Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id, id=OuterRef("id"))
            .filter(
                Q(
                    project__project_projectmember__member=self.request.user,
                    project__project_projectmember__is_active=True,
                    project__project_projectmember__role__gt=ROLE.GUEST.value,
                )
                | Q(
                    project__project_projectmember__member=self.request.user,
                    project__project_projectmember__is_active=True,
                    project__project_projectmember__role=ROLE.GUEST.value,
                    project__guest_view_all_features=True,
                )
                | Q(
                    project__project_projectmember__member=self.request.user,
                    project__project_projectmember__is_active=True,
                    project__project_projectmember__role=ROLE.GUEST.value,
                    project__guest_view_all_features=False,
                    created_by=self.request.user,
                )
            )
            .values("id")
        )
        # Main issue query
        issue = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id).filter(
            Exists(permission_subquery)
        )

        # Add additional prefetch based on expand parameter
        if self.expand:
            if "issue_relation" in self.expand:
                issue = issue.prefetch_related(
                    Prefetch(
                        "issue_relation",
                        queryset=IssueRelation.objects.select_related("related_issue"),
                    )
                )
            if "issue_related" in self.expand:
                issue = issue.prefetch_related(
                    Prefetch(
                        "issue_related",
                        queryset=IssueRelation.objects.select_related("issue"),
                    )
                )

        # Apply filtering from filterset
        issue = filter_queryset_with_module_visibility(self, request, issue, slug, project_id, request.user)

        # Apply legacy filters
        issue = issue.filter(**filters)

        # Total count queryset
        total_issue_queryset = copy.deepcopy(issue)

        # Applying annotations to the issue queryset
        issue = self.apply_annotations(issue, request.user)

        order_by_param = request.GET.get("order_by", "-created_at")

        # Issue queryset
        issue, order_by_param = order_issue_queryset(
            issue_queryset=issue,
            order_by_param=order_by_param,
            slug=slug,
            project_id=project_id,
        )
        return self.paginate(
            request=request,
            order_by=order_by_param,
            queryset=issue,
            total_count_queryset=total_issue_queryset,
            on_results=lambda issue: attach_visible_module_field_values(
                IssueFieldValueService.attach_field_values_to_issue_dicts(
                    IssueListDetailSerializer(issue, many=True, fields=self.fields, expand=self.expand).data
                ),
                request.user,
            ),
        )


class IssueBulkUpdateDateEndpoint(BaseAPIView):
    def validate_dates(self, current_start, current_target, new_start, new_target):
        """
        Validate that start date is before target date.
        """
        from datetime import datetime

        start = new_start or current_start
        target = new_target or current_target

        # Convert string dates to datetime objects if they're strings
        if isinstance(start, str):
            start = datetime.strptime(start, "%Y-%m-%d").date()
        if isinstance(target, str):
            target = datetime.strptime(target, "%Y-%m-%d").date()

        if start and target and start > target:
            return False
        return True

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        updates = request.data.get("updates", [])

        issue_ids = [update["id"] for update in updates]
        epoch = int(timezone.now().timestamp())

        # Fetch all relevant issues in a single query
        issues = list(Issue.objects.filter(id__in=issue_ids, workspace__slug=slug, project_id=project_id))
        issues_dict = {str(issue.id): issue for issue in issues}
        issues_to_update = []

        for update in updates:
            issue_id = update["id"]
            issue = issues_dict.get(issue_id)

            if not issue:
                continue

            start_date = update.get("start_date")
            target_date = update.get("target_date")
            validate_dates = self.validate_dates(issue.start_date, issue.target_date, start_date, target_date)
            if not validate_dates:
                return Response(
                    {"message": "Start date cannot exceed target date"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if start_date:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps({"start_date": update.get("start_date")}),
                    current_instance=json.dumps({"start_date": str(issue.start_date)}),
                    issue_id=str(issue_id),
                    actor_id=str(request.user.id),
                    project_id=str(project_id),
                    epoch=epoch,
                )
                issue.start_date = start_date
                issues_to_update.append(issue)

            if target_date:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps({"target_date": update.get("target_date")}),
                    current_instance=json.dumps({"target_date": str(issue.target_date)}),
                    issue_id=str(issue_id),
                    actor_id=str(request.user.id),
                    project_id=str(project_id),
                    epoch=epoch,
                )
                issue.target_date = target_date
                issues_to_update.append(issue)

        # Bulk update issues
        Issue.objects.bulk_update(issues_to_update, ["start_date", "target_date"])

        return Response({"message": "Issues updated successfully"}, status=status.HTTP_200_OK)


class IssueMetaEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, issue_id):
        issue = Issue.issue_objects.only("sequence_id", "project__identifier").get(
            id=issue_id, project_id=project_id, workspace__slug=slug
        )
        return Response(
            {
                "sequence_id": issue.sequence_id,
                "project_identifier": issue.project.identifier,
            },
            status=status.HTTP_200_OK,
        )


class IssueDetailIdentifierEndpoint(BaseAPIView):
    def strict_str_to_int(self, s):
        if not s.isdigit() and not (s.startswith("-") and s[1:].isdigit()):
            raise ValueError("Invalid integer string")
        return int(s)

    def get(self, request, slug, project_identifier, issue_identifier):
        # Check if the issue identifier is a valid integer
        try:
            issue_identifier = self.strict_str_to_int(issue_identifier)
        except ValueError:
            return Response(
                {"error": "Invalid issue identifier"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Fetch the project
        project = Project.objects.get(identifier__iexact=project_identifier, workspace__slug=slug)

        # Check if the user is a member of the project
        if not ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project.id,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Fetch the issue
        issue = (
            Issue.objects.filter(project_id=project.id)
            .filter(workspace__slug=slug)
            .select_related("workspace", "project", "state", "parent")
            .prefetch_related("assignees", "labels", "issue_module__module")
            .annotate(cycle_id=Subquery(CycleIssue.objects.filter(issue=OuterRef("id")).values("cycle_id")[:1]))
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .filter(sequence_id=issue_identifier)
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "labels__id",
                        distinct=True,
                        filter=Q(~Q(labels__id__isnull=True) & Q(label_issue__deleted_at__isnull=True)),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True)
                            & Q(assignees__member_project__is_active=True)
                            & Q(issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=visible_module_ids_subquery(request.user),
            )
            .prefetch_related(
                Prefetch(
                    "issue_reactions",
                    queryset=IssueReaction.objects.select_related("issue", "actor"),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_link",
                    queryset=IssueLink.objects.select_related("created_by"),
                )
            )
            .annotate(
                is_subscribed=Exists(
                    IssueSubscriber.objects.filter(
                        workspace__slug=slug,
                        project_id=project.id,
                        issue__sequence_id=issue_identifier,
                        subscriber=request.user,
                    )
                )
            )
            .annotate(
                is_intake=Exists(
                    IntakeIssue.objects.filter(
                        issue=OuterRef("id"),
                        status__in=[-2, 0],
                        workspace__slug=slug,
                        project_id=project.id,
                    )
                )
            )
        ).first()

        # Check if the issue exists
        if not issue:
            return Response(
                {"error": "The required object does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        """
        if the role is guest and guest_view_all_features is false and owned by is not
        the requesting user then dont show the issue
        """

        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project.id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
            and not issue.created_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )

        recent_visited_task.delay(
            slug=slug,
            entity_name="issue",
            entity_identifier=str(issue.id),
            user_id=str(request.user.id),
            project_id=str(project.id),
        )

        # Serialize the issue
        serializer = IssueDetailSerializer(issue, expand=self.expand)
        issue_data = IssueFieldValueService.attach_field_values_to_issue_dict(serializer.data)
        issue_data = attach_visible_module_field_values([issue_data], request.user)[0]
        return Response(issue_data, status=status.HTTP_200_OK)
