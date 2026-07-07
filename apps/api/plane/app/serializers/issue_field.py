from django.utils import timezone
from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.db.models import ProjectIssueField, ProjectIssueFieldOption


class ProjectIssueFieldOptionSerializer(BaseSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ProjectIssueFieldOption
        fields = ["id", "value", "sort_order", "field", "project", "workspace", "created_at", "updated_at"]
        read_only_fields = ["id", "field", "project", "workspace", "created_at", "updated_at"]


class ProjectIssueFieldSerializer(BaseSerializer):
    id = serializers.UUIDField(read_only=True)
    options = ProjectIssueFieldOptionSerializer(many=True, read_only=True)

    class Meta:
        model = ProjectIssueField
        fields = [
            "id",
            "name",
            "description",
            "field_type",
            "sort_order",
            "is_disabled",
            "disabled_at",
            "options",
            "project",
            "workspace",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "disabled_at", "project", "workspace", "created_at", "updated_at", "options"]

    def validate_field_type(self, value):
        if self.instance and value != self.instance.field_type:
            raise serializers.ValidationError("Field type cannot be changed")
        return value

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Field name is required")
        return value.strip()

    def update(self, instance, validated_data):
        if "is_disabled" in validated_data:
            is_disabled = validated_data["is_disabled"]
            if is_disabled and not instance.is_disabled:
                validated_data["disabled_at"] = timezone.now()
            if not is_disabled:
                validated_data["disabled_at"] = None
        return super().update(instance, validated_data)
