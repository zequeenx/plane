from uuid import UUID

from django.db import transaction
from rest_framework import serializers

from plane.db.models import (
    IssueFieldValue,
    IssueFieldValueOption,
    IssueFieldValueUser,
    ProjectIssueField,
    ProjectIssueFieldOption,
    ProjectMember,
)


class IssueFieldValueService:
    @classmethod
    def serialize_values(cls, issue_ids):
        values = (
            IssueFieldValue.objects.filter(issue_id__in=issue_ids, field__is_disabled=False)
            .select_related("field")
            .prefetch_related("selected_options", "selected_users")
        )
        serialized = {str(issue_id): {} for issue_id in issue_ids}
        for value in values:
            serialized.setdefault(str(value.issue_id), {})[str(value.field_id)] = cls._serialize_value(value)
        return serialized

    @classmethod
    def serialize_issue_value_map(cls, issue_id):
        return cls.serialize_values([issue_id]).get(str(issue_id), {})

    @classmethod
    def attach_field_values_to_issue_dicts(cls, issue_dicts):
        issue_ids = [issue_dict.get("id") for issue_dict in issue_dicts if issue_dict.get("id") is not None]
        values_by_issue_id = cls.serialize_values(issue_ids)
        for issue_dict in issue_dicts:
            issue_id = issue_dict.get("id")
            issue_dict["field_values"] = values_by_issue_id.get(str(issue_id), {}) if issue_id is not None else {}
        return issue_dicts

    @classmethod
    def attach_field_values_to_issue_dict(cls, issue_dict):
        if not issue_dict:
            return {}
        issue_dict["field_values"] = cls.serialize_issue_value_map(issue_dict.get("id"))
        return issue_dict

    @classmethod
    @transaction.atomic
    def update_issue_values(cls, issue, raw_values):
        if raw_values is None:
            return
        if not isinstance(raw_values, dict):
            raise serializers.ValidationError({"field_values": "Expected an object keyed by field id."})

        normalized_values = {
            cls._normalize_id(field_id, f"Field {field_id} is not valid."): submitted_value
            for field_id, submitted_value in raw_values.items()
        }
        fields = {
            str(field.id): field
            for field in ProjectIssueField.objects.filter(
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

        for field_id, submitted_value in normalized_values.items():
            cls._validate_submitted_value(fields[field_id], submitted_value)

        for field_id, submitted_value in normalized_values.items():
            field = fields[field_id]
            cls._upsert_value(issue, field, submitted_value)

    @classmethod
    def _upsert_value(cls, issue, field, submitted_value):
        if submitted_value is None:
            IssueFieldValue.objects.filter(issue=issue, field=field).delete(soft=False)
            return None

        value, _ = IssueFieldValue.objects.get_or_create(
            issue=issue,
            field=field,
            defaults={"workspace_id": issue.workspace_id, "project_id": issue.project_id},
        )
        cls._clear_value(value)

        field_type = field.field_type
        if field_type == ProjectIssueField.FieldType.SINGLE_SELECT:
            option = cls._get_option(field, submitted_value)
            IssueFieldValueOption.objects.create(value=value, option=option)
        elif field_type == ProjectIssueField.FieldType.MULTI_SELECT:
            options = cls._get_options(field, submitted_value)
            IssueFieldValueOption.objects.bulk_create(
                [
                    IssueFieldValueOption(
                        workspace_id=value.workspace_id,
                        project_id=value.project_id,
                        value=value,
                        option=option,
                    )
                    for option in options
                ],
                batch_size=10,
            )
        elif field_type == ProjectIssueField.FieldType.SINGLE_MEMBER:
            user_id = cls._get_member_id(field, submitted_value)
            IssueFieldValueUser.objects.create(value=value, user_id=user_id)
        elif field_type == ProjectIssueField.FieldType.MULTI_MEMBER:
            user_ids = cls._get_member_ids(field, submitted_value)
            IssueFieldValueUser.objects.bulk_create(
                [
                    IssueFieldValueUser(
                        workspace_id=value.workspace_id,
                        project_id=value.project_id,
                        value=value,
                        user_id=user_id,
                    )
                    for user_id in user_ids
                ],
                batch_size=10,
            )
        elif field_type == ProjectIssueField.FieldType.DATE:
            value.date_value = cls._parse_date(submitted_value)
            value.save(update_fields=["date_value", "updated_at"])
        elif field_type == ProjectIssueField.FieldType.DATE_RANGE:
            start, end = cls._parse_date_range(submitted_value)
            value.date_range_start = start
            value.date_range_end = end
            value.save(update_fields=["date_range_start", "date_range_end", "updated_at"])
        elif field_type == ProjectIssueField.FieldType.PLAIN_TEXT:
            if not isinstance(submitted_value, str):
                raise serializers.ValidationError({"field_values": "Text field value must be a string."})
            value.text_value = submitted_value
            value.save(update_fields=["text_value", "updated_at"])
        else:
            raise serializers.ValidationError({"field_values": "Field type is not supported."})

        return value

    @classmethod
    def _clear_value(cls, value):
        value.text_value = None
        value.date_value = None
        value.date_range_start = None
        value.date_range_end = None
        value.save(update_fields=["text_value", "date_value", "date_range_start", "date_range_end", "updated_at"])
        value.selected_options.all().delete(soft=False)
        value.selected_users.all().delete(soft=False)

    @staticmethod
    def _ensure_list(submitted_value):
        if not isinstance(submitted_value, list):
            raise serializers.ValidationError({"field_values": "Expected a list of values."})
        return submitted_value

    @classmethod
    def _validate_submitted_value(cls, field, submitted_value):
        if submitted_value is None:
            return

        field_type = field.field_type
        if field_type == ProjectIssueField.FieldType.SINGLE_SELECT:
            cls._get_option(field, submitted_value)
        elif field_type == ProjectIssueField.FieldType.MULTI_SELECT:
            cls._get_options(field, submitted_value)
        elif field_type == ProjectIssueField.FieldType.SINGLE_MEMBER:
            cls._get_member_id(field, submitted_value)
        elif field_type == ProjectIssueField.FieldType.MULTI_MEMBER:
            cls._get_member_ids(field, submitted_value)
        elif field_type == ProjectIssueField.FieldType.DATE:
            cls._parse_date(submitted_value)
        elif field_type == ProjectIssueField.FieldType.DATE_RANGE:
            cls._parse_date_range(submitted_value)
        elif field_type == ProjectIssueField.FieldType.PLAIN_TEXT:
            if not isinstance(submitted_value, str):
                raise serializers.ValidationError({"field_values": "Text field value must be a string."})
        else:
            raise serializers.ValidationError({"field_values": "Field type is not supported."})

    @staticmethod
    def _normalize_id(submitted_value, error_message):
        if isinstance(submitted_value, (dict, list)):
            raise serializers.ValidationError({"field_values": error_message})
        try:
            return str(UUID(str(submitted_value)))
        except (AttributeError, TypeError, ValueError):
            raise serializers.ValidationError({"field_values": error_message})

    @classmethod
    def _get_option(cls, field, option_id):
        option_id = cls._normalize_id(option_id, "Option is not valid for the field.")
        option = ProjectIssueFieldOption.objects.filter(field=field, id=option_id).first()
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
        options = list(ProjectIssueFieldOption.objects.filter(field=field, id__in=unique_option_ids))
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

    @staticmethod
    def _parse_date(submitted_value):
        if submitted_value is None:
            return None
        return serializers.DateField().to_internal_value(submitted_value)

    @classmethod
    def _parse_date_range(cls, submitted_value):
        if not isinstance(submitted_value, dict):
            raise serializers.ValidationError({"field_values": "Date range value must be an object."})
        start = cls._parse_date(submitted_value.get("start", submitted_value.get("date_range_start")))
        end = cls._parse_date(submitted_value.get("end", submitted_value.get("date_range_end")))
        if start is not None and end is not None and start > end:
            raise serializers.ValidationError({"field_values": "Date range start cannot exceed end."})
        return start, end

    @staticmethod
    def _serialize_value(value):
        field_type = value.field.field_type
        if field_type == ProjectIssueField.FieldType.SINGLE_SELECT:
            option = next(iter(value.selected_options.all()), None)
            return str(option.option_id) if option else None
        if field_type == ProjectIssueField.FieldType.MULTI_SELECT:
            return [str(selected_option.option_id) for selected_option in value.selected_options.all()]
        if field_type == ProjectIssueField.FieldType.SINGLE_MEMBER:
            selected_user = next(iter(value.selected_users.all()), None)
            return str(selected_user.user_id) if selected_user else None
        if field_type == ProjectIssueField.FieldType.MULTI_MEMBER:
            return [str(selected_user.user_id) for selected_user in value.selected_users.all()]
        if field_type == ProjectIssueField.FieldType.DATE:
            return value.date_value.isoformat() if value.date_value else None
        if field_type == ProjectIssueField.FieldType.DATE_RANGE:
            return {
                "start": value.date_range_start.isoformat() if value.date_range_start else None,
                "end": value.date_range_end.isoformat() if value.date_range_end else None,
            }
        if field_type == ProjectIssueField.FieldType.PLAIN_TEXT:
            return value.text_value
        return None
