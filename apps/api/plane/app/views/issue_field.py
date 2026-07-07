from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectIssueFieldOptionSerializer, ProjectIssueFieldSerializer
from plane.app.services.issue_field import IssueFieldValueService
from plane.db.models import Issue, IssueFieldValueOption, ProjectIssueField, ProjectIssueFieldOption

from .base import BaseAPIView, BaseViewSet


TEXT_OPTION_FIELD_TYPES = {
    ProjectIssueField.FieldType.SINGLE_SELECT,
    ProjectIssueField.FieldType.MULTI_SELECT,
}


class ProjectIssueFieldViewSet(BaseViewSet):
    serializer_class = ProjectIssueFieldSerializer

    def get_queryset(self):
        return (
            ProjectIssueField.objects.filter(
                workspace__slug=self.kwargs["slug"],
                project_id=self.kwargs["project_id"],
            )
            .prefetch_related("options")
            .order_by("sort_order", "created_at")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        fields = self.get_queryset().filter(is_disabled=False)
        return Response(self.serializer_class(fields, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        serializer = self.serializer_class(data=request.data, context={"project_id": project_id})
        serializer.is_valid(raise_exception=True)
        serializer.save(project_id=project_id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk=None):
        field = self.get_queryset().get(pk=pk)
        serializer = self.serializer_class(field, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk=None):
        field = self.get_queryset().get(pk=pk)
        if not field.is_disabled:
            return Response({"error": "Disable the field before deleting it"}, status=status.HTTP_400_BAD_REQUEST)
        field.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DisabledProjectIssueFieldsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id):
        fields = (
            ProjectIssueField.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                is_disabled=True,
            )
            .prefetch_related("options")
            .order_by("sort_order", "created_at")
        )
        return Response(ProjectIssueFieldSerializer(fields, many=True).data, status=status.HTTP_200_OK)


class ProjectIssueFieldOptionViewSet(BaseViewSet):
    serializer_class = ProjectIssueFieldOptionSerializer

    def _get_field(self, slug, project_id, field_id):
        return ProjectIssueField.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            pk=field_id,
            is_disabled=False,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def create(self, request, slug, project_id, field_id):
        field = self._get_field(slug, project_id, field_id)
        if field.field_type not in TEXT_OPTION_FIELD_TYPES:
            return Response(
                {"error": "Options are only supported for text select fields"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace_id=field.workspace_id, project_id=field.project_id, field=field)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def destroy(self, request, slug, project_id, field_id, pk=None):
        field = self._get_field(slug, project_id, field_id)
        option = ProjectIssueFieldOption.objects.get(field=field, pk=pk)
        with transaction.atomic():
            IssueFieldValueOption.objects.filter(option=option).delete(soft=False)
            option.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueFieldValueEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], creator=True, model=Issue)
    def patch(self, request, slug, project_id, issue_id):
        issue = Issue.objects.get(workspace__slug=slug, project_id=project_id, pk=issue_id)
        raw_values = request.data.get("field_values", request.data)
        with transaction.atomic():
            IssueFieldValueService.update_issue_values(issue, raw_values)
        return Response(
            {"field_values": IssueFieldValueService.serialize_issue_value_map(issue.id)},
            status=status.HTTP_200_OK,
        )
