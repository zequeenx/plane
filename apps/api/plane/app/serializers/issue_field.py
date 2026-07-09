from django.utils import timezone
from rest_framework import serializers

from plane.app.serializers.base import BaseSerializer
from plane.db.models import ModuleIssueField, ModuleIssueFieldOption, ProjectIssueField, ProjectIssueFieldOption


class ProjectIssueFieldOptionSerializer(BaseSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ProjectIssueFieldOption
        fields = ["id", "value", "sort_order", "field", "project", "workspace", "created_at", "updated_at"]
        read_only_fields = ["id", "field", "project", "workspace", "created_at", "updated_at"]

    def validate_value(self, value):
        if not value.strip():
            raise serializers.ValidationError("Option value is required")
        return value.strip()


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
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Field name is required")
        project_id = self.instance.project_id if self.instance else self.context.get("project_id")
        if project_id:
            fields = ProjectIssueField.objects.filter(project_id=project_id, name=name)
            if self.instance:
                fields = fields.exclude(pk=self.instance.pk)
            if fields.exists():
                raise serializers.ValidationError("Field name already exists")
        return name

    def create(self, validated_data):
        validated_data["is_disabled"] = False
        validated_data["disabled_at"] = None
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "is_disabled" in validated_data:
            is_disabled = validated_data["is_disabled"]
            if is_disabled and not instance.is_disabled:
                validated_data["disabled_at"] = timezone.now()
            if not is_disabled:
                validated_data["disabled_at"] = None
        return super().update(instance, validated_data)


class ModuleIssueFieldOptionSerializer(BaseSerializer):
    id = serializers.UUIDField(read_only=True)
    module = serializers.UUIDField(source="module_id", read_only=True)

    class Meta:
        model = ModuleIssueFieldOption
        fields = ["id", "value", "sort_order", "field", "module", "project", "workspace", "created_at", "updated_at"]
        read_only_fields = ["id", "field", "module", "project", "workspace", "created_at", "updated_at"]

    def validate_value(self, value):
        option_value = value.strip()
        if not option_value:
            raise serializers.ValidationError("Option value is required")
        field_id = self.instance.field_id if self.instance else self.context.get("field_id")
        if field_id:
            options = ModuleIssueFieldOption.objects.filter(field_id=field_id, value=option_value)
            if self.instance:
                options = options.exclude(pk=self.instance.pk)
            if options.exists():
                raise serializers.ValidationError("Option value already exists")
        return option_value


class ModuleIssueFieldSerializer(BaseSerializer):
    id = serializers.UUIDField(read_only=True)
    module = serializers.UUIDField(source="module_id", read_only=True)
    options = ModuleIssueFieldOptionSerializer(many=True, read_only=True)

    class Meta:
        model = ModuleIssueField
        fields = [
            "id",
            "name",
            "description",
            "field_type",
            "sort_order",
            "is_disabled",
            "disabled_at",
            "options",
            "module",
            "project",
            "workspace",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "disabled_at", "module", "project", "workspace", "created_at", "updated_at", "options"]

    def validate_field_type(self, value):
        if self.instance and value != self.instance.field_type:
            raise serializers.ValidationError("Field type cannot be changed")
        return value

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Field name is required")
        module_id = self.instance.module_id if self.instance else self.context.get("module_id")
        if module_id:
            fields = ModuleIssueField.objects.filter(module_id=module_id, name=name)
            if self.instance:
                fields = fields.exclude(pk=self.instance.pk)
            if fields.exists():
                raise serializers.ValidationError("Field name already exists")
        return name

    def create(self, validated_data):
        validated_data["is_disabled"] = False
        validated_data["disabled_at"] = None
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "is_disabled" in validated_data:
            is_disabled = validated_data["is_disabled"]
            if is_disabled and not instance.is_disabled:
                validated_data["disabled_at"] = timezone.now()
            if not is_disabled:
                validated_data["disabled_at"] = None
        return super().update(instance, validated_data)
