from django.db import transaction
from rest_framework import serializers

from plane.app.services.issue_field import IssueFieldValueService
from plane.db.models import (
    ModuleIssue,
    ModuleIssueField,
    ModuleIssueFieldOption,
    ModuleIssueFieldValue,
    ModuleIssueFieldValueOption,
    ModuleIssueFieldValueUser,
    ProjectMember,
)


class ModuleIssueFieldValueService(IssueFieldValueService):
    value_model = ModuleIssueFieldValue
    option_value_model = ModuleIssueFieldValueOption
    user_value_model = ModuleIssueFieldValueUser
    field_model = ModuleIssueField
    option_model = ModuleIssueFieldOption

    @classmethod
    def serialize_values(cls, issue_ids, module_ids=None):
        values = cls.value_model.objects.filter(issue_id__in=issue_ids, field__is_disabled=False).select_related(
            "field", "module"
        ).prefetch_related("selected_options", "selected_users")
        if module_ids is not None:
            values = values.filter(module_id__in=module_ids)

        serialized = {str(issue_id): {} for issue_id in issue_ids}
        for value in values:
            issue_values = serialized.setdefault(str(value.issue_id), {})
            module_values = issue_values.setdefault(str(value.module_id), {})
            module_values[str(value.field_id)] = cls._serialize_value(value)
        return serialized

    @classmethod
    def serialize_issue_value_map(cls, issue_id, module_ids=None):
        return cls.serialize_values([issue_id], module_ids=module_ids).get(str(issue_id), {})

    @classmethod
    def attach_module_field_values_to_issue_dicts(cls, issue_dicts, module_ids=None):
        issue_ids = [issue_dict.get("id") for issue_dict in issue_dicts if issue_dict.get("id") is not None]
        values_by_issue_id = cls.serialize_values(issue_ids, module_ids=module_ids)
        for issue_dict in issue_dicts:
            issue_id = issue_dict.get("id")
            issue_dict["module_field_values"] = values_by_issue_id.get(str(issue_id), {}) if issue_id is not None else {}
        return issue_dicts

    @classmethod
    @transaction.atomic
    def update_issue_values(cls, issue, module, raw_values):
        if not ModuleIssue.objects.filter(issue=issue, module=module, deleted_at__isnull=True).exists():
            raise serializers.ValidationError({"module": "Issue must belong to the module."})
        if not isinstance(raw_values, dict):
            raise serializers.ValidationError({"field_values": "Expected an object keyed by field id."})

        normalized_values = {
            cls._normalize_id(field_id, f"Field {field_id} is not valid."): submitted_value
            for field_id, submitted_value in raw_values.items()
        }
        fields = {
            str(field.id): field
            for field in cls.field_model.objects.filter(
                module=module,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                id__in=normalized_values.keys(),
            )
        }

        for field_id, submitted_value in normalized_values.items():
            field = fields.get(field_id)
            if field is None:
                raise serializers.ValidationError({"field_values": f"Field {field_id} is not valid."})
            if field.is_disabled:
                raise serializers.ValidationError({"field_values": f"Field {field_id} is disabled."})
            cls._validate_submitted_value(field, submitted_value)
            cls._upsert_value(issue, module, field, submitted_value)

    @classmethod
    def _upsert_value(cls, issue, module, field, submitted_value):
        if submitted_value is None:
            cls.value_model.objects.filter(issue=issue, module=module, field=field).delete(soft=False)
            return None
        value, _ = cls.value_model.objects.get_or_create(
            issue=issue,
            module=module,
            field=field,
            defaults={"workspace_id": issue.workspace_id, "project_id": issue.project_id},
        )
        cls._clear_value(value)
        return cls._write_typed_value(value, field, submitted_value)

    @classmethod
    def _write_typed_value(cls, value, field, submitted_value):
        field_type = field.field_type
        if field_type == cls.field_model.FieldType.SINGLE_SELECT:
            option = cls._get_option(field, submitted_value)
            cls.option_value_model.objects.create(
                workspace_id=value.workspace_id,
                project_id=value.project_id,
                module_id=value.module_id,
                value=value,
                option=option,
            )
        elif field_type == cls.field_model.FieldType.MULTI_SELECT:
            options = cls._get_options(field, submitted_value)
            cls.option_value_model.objects.bulk_create(
                [
                    cls.option_value_model(
                        workspace_id=value.workspace_id,
                        project_id=value.project_id,
                        module_id=value.module_id,
                        value=value,
                        option=option,
                    )
                    for option in options
                ],
                batch_size=10,
            )
        elif field_type == cls.field_model.FieldType.SINGLE_MEMBER:
            user_id = cls._get_member_id(field, submitted_value)
            cls.user_value_model.objects.create(
                workspace_id=value.workspace_id,
                project_id=value.project_id,
                module_id=value.module_id,
                value=value,
                user_id=user_id,
            )
        elif field_type == cls.field_model.FieldType.MULTI_MEMBER:
            user_ids = cls._get_member_ids(field, submitted_value)
            cls.user_value_model.objects.bulk_create(
                [
                    cls.user_value_model(
                        workspace_id=value.workspace_id,
                        project_id=value.project_id,
                        module_id=value.module_id,
                        value=value,
                        user_id=user_id,
                    )
                    for user_id in user_ids
                ],
                batch_size=10,
            )
        elif field_type == cls.field_model.FieldType.DATE:
            value.date_value = cls._parse_date(submitted_value)
            value.save(update_fields=["date_value", "updated_at"])
        elif field_type == cls.field_model.FieldType.DATE_RANGE:
            start, end = cls._parse_date_range(submitted_value)
            value.date_range_start = start
            value.date_range_end = end
            value.save(update_fields=["date_range_start", "date_range_end", "updated_at"])
        elif field_type == cls.field_model.FieldType.PLAIN_TEXT:
            if not isinstance(submitted_value, str):
                raise serializers.ValidationError({"field_values": "Text field value must be a string."})
            value.text_value = submitted_value
            value.save(update_fields=["text_value", "updated_at"])
        else:
            raise serializers.ValidationError({"field_values": "Field type is not supported."})
        return value

    @classmethod
    def _get_option(cls, field, option_id):
        option_id = cls._normalize_id(option_id, "Option is not valid for the field.")
        option = cls.option_model.objects.filter(field=field, id=option_id).first()
        if option is None:
            raise serializers.ValidationError({"field_values": "Option is not valid for the field."})
        return option

    @classmethod
    def _get_options(cls, field, option_ids):
        option_ids = cls._ensure_list(option_ids)
        unique_option_ids = list(
            dict.fromkeys(
                [
                    cls._normalize_id(option_id, "One or more options are not valid for the field.")
                    for option_id in option_ids
                ]
            )
        )
        options = list(cls.option_model.objects.filter(field=field, id__in=unique_option_ids))
        if len(options) != len(unique_option_ids):
            raise serializers.ValidationError({"field_values": "One or more options are not valid for the field."})
        return options

    @classmethod
    def _get_member_id(cls, field, user_id):
        user_id = cls._normalize_id(user_id, "User is not an active project member.")
        if not ProjectMember.objects.filter(project=field.project, member_id=user_id, is_active=True).exists():
            raise serializers.ValidationError({"field_values": "User is not an active project member."})
        return user_id

    @classmethod
    def _get_member_ids(cls, field, user_ids):
        user_ids = cls._ensure_list(user_ids)
        unique_user_ids = list(
            dict.fromkeys(
                [
                    cls._normalize_id(user_id, "One or more users are not active project members.")
                    for user_id in user_ids
                ]
            )
        )
        valid_user_ids = set(
            str(user_id)
            for user_id in ProjectMember.objects.filter(
                project=field.project,
                member_id__in=unique_user_ids,
                is_active=True,
            ).values_list("member_id", flat=True)
        )
        if len(valid_user_ids) != len(unique_user_ids):
            raise serializers.ValidationError({"field_values": "One or more users are not active project members."})
        return unique_user_ids
