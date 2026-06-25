# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from .base import BaseSerializer
from rest_framework import serializers

from plane.db.models import State, StateGroup, SubState


class SubStateLiteSerializer(BaseSerializer):
    class Meta:
        model = SubState
        fields = ["id", "state_id", "project_id", "workspace_id", "name", "color", "icon", "sequence"]
        read_only_fields = fields


class SubStateSerializer(BaseSerializer):
    class Meta:
        model = SubState
        fields = ["id", "project_id", "workspace_id", "state_id", "name", "color", "icon", "sequence"]
        read_only_fields = ["project_id", "workspace_id", "state_id"]


class StateSerializer(BaseSerializer):
    order = serializers.FloatField(required=False)
    sub_states = SubStateLiteSerializer(source="state_sub_states", many=True, read_only=True)

    class Meta:
        model = State
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "name",
            "color",
            "group",
            "default",
            "description",
            "sequence",
            "order",
            "sub_states",
        ]
        read_only_fields = ["workspace", "project"]

    def validate(self, attrs):
        if attrs.get("group") == StateGroup.TRIAGE.value:
            raise serializers.ValidationError("Cannot create triage state")
        return attrs


class StateLiteSerializer(BaseSerializer):
    class Meta:
        model = State
        fields = ["id", "name", "color", "group"]
        read_only_fields = fields
