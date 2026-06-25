# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from uuid import uuid4

from plane.db.models import Workspace, WorkspaceMember, WorkspaceUserProperties
from plane.db.models.workspace import get_default_display_properties, get_default_filters, get_default_props


@pytest.mark.unit
class TestWorkspaceModel:
    """Test the Workspace model"""

    @pytest.mark.django_db
    def test_workspace_creation(self, create_user):
        """Test creating a workspace"""
        # Create a workspace
        workspace = Workspace.objects.create(
            name="Test Workspace", slug="test-workspace", id=uuid4(), owner=create_user
        )

        # Verify it was created
        assert workspace.id is not None
        assert workspace.name == "Test Workspace"
        assert workspace.slug == "test-workspace"
        assert workspace.owner == create_user

    @pytest.mark.django_db
    def test_workspace_member_creation(self, create_user):
        """Test creating a workspace member"""
        # Create a workspace
        workspace = Workspace.objects.create(
            name="Test Workspace", slug="test-workspace", id=uuid4(), owner=create_user
        )

        # Create a workspace member
        workspace_member = WorkspaceMember.objects.create(
            workspace=workspace,
            member=create_user,
            role=20,  # Admin role
        )

        # Verify it was created
        assert workspace_member.id is not None
        assert workspace_member.workspace == workspace
        assert workspace_member.member == create_user
        assert workspace_member.role == 20

    @pytest.mark.django_db
    def test_workspace_issue_defaults_include_sub_state_metadata(self, create_user):
        workspace = Workspace.objects.create(
            name="Test Workspace", slug="test-workspace", id=uuid4(), owner=create_user
        )

        workspace_member = WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
        user_properties = WorkspaceUserProperties.objects.create(workspace=workspace, user=create_user)

        default_props = get_default_props()
        default_filters = get_default_filters()
        default_display_properties = get_default_display_properties()

        assert default_props["filters"]["state"] is None
        assert default_props["filters"]["sub_state"] is None
        assert default_filters["state"] is None
        assert default_filters["sub_state"] is None
        assert default_props["display_properties"]["state"] is True
        assert default_props["display_properties"]["sub_state"] is False
        assert default_display_properties["display_properties"]["state"] is True
        assert default_display_properties["display_properties"]["sub_state"] is False
        assert "sub_state" not in default_props["display_filters"]

        assert workspace_member.view_props["filters"]["sub_state"] is None
        assert workspace_member.default_props["filters"]["sub_state"] is None
        assert workspace_member.view_props["display_properties"]["sub_state"] is False
        assert workspace_member.default_props["display_properties"]["sub_state"] is False
        assert user_properties.filters["sub_state"] is None
        assert user_properties.display_properties["display_properties"]["sub_state"] is False
