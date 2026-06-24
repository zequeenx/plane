# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest
from rest_framework import status

from plane.db.models import IssueView, Project, ProjectMember, User, WorkspaceMember


class TestProjectViewBase:
    def get_project_view_url(self, workspace_slug: str, project_id: uuid.UUID, view_id: uuid.UUID | None = None) -> str:
        base_url = f"/api/workspaces/{workspace_slug}/projects/{project_id}/views/"
        return f"{base_url}{view_id}/" if view_id else base_url

    def create_project(self, workspace, owner):
        project = Project.objects.create(name="Project Views", identifier="PV", workspace=workspace)
        ProjectMember.objects.create(project=project, member=owner, role=20, is_active=True)
        return project

    def create_member(self, workspace, project, email: str, role: int = 15):
        user = User.objects.create_user(email=email, username=email.split("@")[0])
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role, is_active=True)
        ProjectMember.objects.create(project=project, member=user, role=role, is_active=True)
        return user

    def create_view(self, workspace, project, owner, access: int, name: str = "View"):
        return IssueView.objects.create(
            workspace=workspace,
            project=project,
            owned_by=owner,
            created_by=owner,
            updated_by=owner,
            name=name,
            description="",
            filters={},
            query={},
            access=access,
        )

    def payload(self, name: str = "Saved view", access: int = 1):
        return {
            "name": name,
            "description": "",
            "access": access,
            "filters": {},
            "rich_filters": {},
            "display_filters": {"layout": "list", "group_by": "state", "order_by": "-created_at"},
            "display_properties": {"assignee": True, "state": True},
        }


@pytest.mark.contract
class TestProjectViewAPI(TestProjectViewBase):
    @pytest.mark.django_db
    def test_create_public_project_view_stores_public_access(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)

        response = session_client.post(
            self.get_project_view_url(workspace.slug, project.id), self.payload(access=1), format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["access"] == 1
        assert IssueView.objects.get(id=response.json()["id"]).access == 1

    @pytest.mark.django_db
    def test_create_private_project_view_stores_private_access(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)

        response = session_client.post(
            self.get_project_view_url(workspace.slug, project.id), self.payload(access=0), format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["access"] == 0
        assert IssueView.objects.get(id=response.json()["id"]).access == 0

    @pytest.mark.django_db
    def test_member_can_list_and_retrieve_another_users_public_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        public_view = self.create_view(workspace, project, create_user, access=1, name="Public")
        member = self.create_member(workspace, project, "member-public@example.com")
        session_client.force_authenticate(user=member)

        list_response = session_client.get(self.get_project_view_url(workspace.slug, project.id))
        retrieve_response = session_client.get(self.get_project_view_url(workspace.slug, project.id, public_view.id))

        assert list_response.status_code == status.HTTP_200_OK
        assert str(public_view.id) in [view["id"] for view in list_response.json()]
        assert retrieve_response.status_code == status.HTTP_200_OK
        assert retrieve_response.json()["id"] == str(public_view.id)

    @pytest.mark.django_db
    def test_member_cannot_list_or_retrieve_another_users_private_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        private_view = self.create_view(workspace, project, create_user, access=0, name="Private")
        member = self.create_member(workspace, project, "member-private@example.com")
        session_client.force_authenticate(user=member)

        list_response = session_client.get(self.get_project_view_url(workspace.slug, project.id))
        retrieve_response = session_client.get(self.get_project_view_url(workspace.slug, project.id, private_view.id))

        assert list_response.status_code == status.HTTP_200_OK
        assert str(private_view.id) not in [view["id"] for view in list_response.json()]
        assert retrieve_response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_admin_equivalent_cannot_list_or_retrieve_another_users_private_view(
        self, session_client, workspace, create_user
    ):
        project = self.create_project(workspace, create_user)
        private_view = self.create_view(workspace, project, create_user, access=0, name="Private")
        admin = self.create_member(workspace, project, "project-admin@example.com", role=20)
        session_client.force_authenticate(user=admin)

        list_response = session_client.get(self.get_project_view_url(workspace.slug, project.id))
        retrieve_response = session_client.get(self.get_project_view_url(workspace.slug, project.id, private_view.id))

        assert list_response.status_code == status.HTTP_200_OK
        assert str(private_view.id) not in [view["id"] for view in list_response.json()]
        assert retrieve_response.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.django_db
    def test_non_owner_cannot_update_public_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        public_view = self.create_view(workspace, project, create_user, access=1, name="Public")
        member = self.create_member(workspace, project, "member-update@example.com")
        session_client.force_authenticate(user=member)

        response = session_client.patch(
            self.get_project_view_url(workspace.slug, project.id, public_view.id),
            {"name": "Changed by non-owner"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        public_view.refresh_from_db()
        assert public_view.name == "Public"

    @pytest.mark.django_db
    def test_owner_can_update_public_view_without_changing_access(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        public_view = self.create_view(workspace, project, create_user, access=1, name="Public")

        response = session_client.patch(
            self.get_project_view_url(workspace.slug, project.id, public_view.id),
            {"name": "Renamed public"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        public_view.refresh_from_db()
        assert public_view.name == "Renamed public"
        assert public_view.access == 1

    @pytest.mark.django_db
    def test_owner_cannot_change_public_view_to_private(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        public_view = self.create_view(workspace, project, create_user, access=1, name="Public")

        response = session_client.patch(
            self.get_project_view_url(workspace.slug, project.id, public_view.id),
            {"access": 0},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        public_view.refresh_from_db()
        assert public_view.access == 1

    @pytest.mark.django_db
    def test_owner_can_change_private_view_to_public(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        private_view = self.create_view(workspace, project, create_user, access=0, name="Private")

        response = session_client.patch(
            self.get_project_view_url(workspace.slug, project.id, private_view.id),
            {"access": 1},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        private_view.refresh_from_db()
        assert private_view.access == 1

    @pytest.mark.django_db
    def test_admin_equivalent_can_delete_another_users_public_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        public_view = self.create_view(workspace, project, create_user, access=1, name="Public")
        admin = self.create_member(workspace, project, "delete-admin@example.com", role=20)
        session_client.force_authenticate(user=admin)

        response = session_client.delete(self.get_project_view_url(workspace.slug, project.id, public_view.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueView.objects.filter(id=public_view.id).exists()

    @pytest.mark.django_db
    def test_admin_equivalent_cannot_delete_another_users_private_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        private_view = self.create_view(workspace, project, create_user, access=0, name="Private")
        admin = self.create_member(workspace, project, "delete-private-admin@example.com", role=20)
        session_client.force_authenticate(user=admin)

        response = session_client.delete(self.get_project_view_url(workspace.slug, project.id, private_view.id))

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert IssueView.objects.filter(id=private_view.id).exists()

    @pytest.mark.django_db
    def test_owner_can_delete_private_view(self, session_client, workspace, create_user):
        project = self.create_project(workspace, create_user)
        private_view = self.create_view(workspace, project, create_user, access=0, name="Private")

        response = session_client.delete(self.get_project_view_url(workspace.slug, project.id, private_view.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not IssueView.objects.filter(id=private_view.id).exists()
