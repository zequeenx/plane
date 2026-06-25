import uuid

import pytest
from rest_framework import status

from plane.db.models import (
    Issue,
    Project,
    ProjectMember,
    State,
    StateGroup,
    User,
    WorkspaceMember,
)


class TestProjectSubStateBase:
    def create_project(self, workspace, owner):
        project = Project.objects.create(name="Sub State Project", identifier="SSP", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=project, member=owner, role=20, is_active=True)
        started = State.objects.create(
            workspace=workspace,
            project=project,
            name="Art Assets In Production",
            color="#F59E0B",
            group=StateGroup.STARTED.value,
            sequence=35000,
        )
        review = State.objects.create(
            workspace=workspace,
            project=project,
            name="Review",
            color="#46A758",
            group=StateGroup.COMPLETED.value,
            sequence=45000,
        )
        return project, started, review

    def create_member(self, workspace, project, email: str, role: int = 15):
        user = User.objects.create_user(email=email, username=email.split("@")[0])
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=role, is_active=True)
        ProjectMember.objects.create(workspace=workspace, project=project, member=user, role=role, is_active=True)
        return user

    def create_sub_state(
        self,
        session_client,
        workspace_slug: str,
        project_id: uuid.UUID,
        state_id: uuid.UUID,
        payload,
    ):
        response = session_client.post(
            self.sub_state_url(workspace_slug, project_id, state_id),
            payload,
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        return response.json()

    def sub_state_url(
        self,
        workspace_slug: str,
        project_id: uuid.UUID,
        state_id: uuid.UUID,
        sub_state_id: uuid.UUID | None = None,
    ) -> str:
        base_url = f"/api/workspaces/{workspace_slug}/projects/{project_id}/states/{state_id}/sub-states/"
        return f"{base_url}{sub_state_id}/" if sub_state_id else base_url

    def state_list_url(self, workspace_slug: str, project_id: uuid.UUID) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/states/"


@pytest.mark.contract
class TestProjectSubStateAPI(TestProjectSubStateBase):
    @pytest.mark.django_db
    def test_admin_can_create_and_list_sub_states(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)

        create_response = session_client.post(
            self.sub_state_url(workspace.slug, project.id, state.id),
            {"name": "Not Started", "color": "#60646C", "icon": "0", "sequence": 10000},
            format="json",
        )
        list_response = session_client.get(self.sub_state_url(workspace.slug, project.id, state.id))

        assert create_response.status_code == status.HTTP_200_OK
        assert create_response.json()["name"] == "Not Started"
        assert create_response.json()["state_id"] == str(state.id)
        assert create_response.json()["project_id"] == str(project.id)
        assert list_response.status_code == status.HTTP_200_OK
        assert [item["name"] for item in list_response.json()] == ["Not Started"]

    @pytest.mark.django_db
    def test_member_can_list_but_cannot_create_sub_states(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        existing_sub_state = self.create_sub_state(
            session_client,
            workspace.slug,
            project.id,
            state.id,
            {"name": "Ready for Member", "color": "#60646C", "icon": "", "sequence": 10000},
        )
        member = self.create_member(workspace, project, "sub-state-member@example.com", role=15)
        session_client.force_authenticate(user=member)

        list_response = session_client.get(self.sub_state_url(workspace.slug, project.id, state.id))
        create_response = session_client.post(
            self.sub_state_url(workspace.slug, project.id, state.id),
            {"name": "In Progress", "color": "#F59E0B", "icon": "", "sequence": 20000},
            format="json",
        )

        assert list_response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in list_response.json()] == [existing_sub_state["id"]]
        assert create_response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_duplicate_name_is_rejected_under_same_state(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        payload = {"name": "In Progress", "color": "#F59E0B", "icon": "", "sequence": 20000}

        first_response = session_client.post(
            self.sub_state_url(workspace.slug, project.id, state.id),
            payload,
            format="json",
        )
        second_response = session_client.post(
            self.sub_state_url(workspace.slug, project.id, state.id),
            payload,
            format="json",
        )

        assert first_response.status_code == status.HTTP_200_OK
        assert second_response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_same_name_is_allowed_under_different_states(self, session_client, workspace, create_user):
        project, started, review = self.create_project(workspace, create_user)
        payload = {"name": "In Progress", "color": "#F59E0B", "icon": "", "sequence": 20000}

        started_response = session_client.post(
            self.sub_state_url(workspace.slug, project.id, started.id), payload, format="json"
        )
        review_response = session_client.post(
            self.sub_state_url(workspace.slug, project.id, review.id), payload, format="json"
        )

        assert started_response.status_code == status.HTTP_200_OK
        assert review_response.status_code == status.HTTP_200_OK
        assert started_response.json()["state_id"] != review_response.json()["state_id"]

    @pytest.mark.django_db
    def test_admin_can_update_sub_state_fields(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        created = self.create_sub_state(
            session_client,
            workspace.slug,
            project.id,
            state.id,
            {"name": "Started", "color": "#F59E0B", "icon": "", "sequence": 20000},
        )

        response = session_client.patch(
            self.sub_state_url(workspace.slug, project.id, state.id, created["id"]),
            {"name": "Started Work", "color": "#46A758", "icon": "go", "sequence": 30000},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "Started Work"
        assert response.json()["color"] == "#46A758"
        assert response.json()["icon"] == "go"
        assert response.json()["sequence"] == 30000

    @pytest.mark.django_db
    def test_admin_can_delete_unused_sub_state(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        created = self.create_sub_state(
            session_client,
            workspace.slug,
            project.id,
            state.id,
            {"name": "Unused", "color": "#60646C", "icon": "", "sequence": 10000},
        )

        response = session_client.delete(self.sub_state_url(workspace.slug, project.id, state.id, created["id"]))

        assert response.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_delete_used_sub_state_is_rejected(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        created = self.create_sub_state(
            session_client,
            workspace.slug,
            project.id,
            state.id,
            {"name": "Used", "color": "#60646C", "icon": "", "sequence": 10000},
        )
        Issue.objects.create(
            project=project,
            workspace=workspace,
            name="Uses sub-state",
            state=state,
            sub_state_id=created["id"],
        )

        response = session_client.delete(self.sub_state_url(workspace.slug, project.id, state.id, created["id"]))

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["error"] == "The sub-state is not empty, only empty sub-states can be deleted"

    @pytest.mark.django_db
    def test_project_state_list_includes_nested_sub_states(self, session_client, workspace, create_user):
        project, state, _ = self.create_project(workspace, create_user)
        created = self.create_sub_state(
            session_client,
            workspace.slug,
            project.id,
            state.id,
            {"name": "Ready", "color": "#46A758", "icon": "", "sequence": 30000},
        )

        response = session_client.get(self.state_list_url(workspace.slug, project.id))

        assert response.status_code == status.HTTP_200_OK
        state_payload = next(item for item in response.json() if item["id"] == str(state.id))
        assert state_payload["sub_states"][0]["id"] == created["id"]
        assert state_payload["sub_states"][0]["state_id"] == str(state.id)
        assert state_payload["sub_states"][0]["project_id"] == str(project.id)
        assert state_payload["sub_states"][0]["workspace_id"] == str(workspace.id)
