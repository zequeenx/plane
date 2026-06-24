import uuid

import pytest
from rest_framework import status

from plane.db.models import Issue, Project, ProjectMember, State, StateGroup, SubState


class TestIssueSubStateBase:
    def create_project_state_data(self, workspace, owner):
        project = Project.objects.create(name="Issue Sub State Project", identifier="ISS", workspace=workspace)
        ProjectMember.objects.create(workspace=workspace, project=project, member=owner, role=20, is_active=True)
        todo = State.objects.create(
            workspace=workspace,
            project=project,
            name="Todo",
            color="#60646C",
            group=StateGroup.UNSTARTED.value,
            sequence=25000,
            default=True,
        )
        started = State.objects.create(
            workspace=workspace,
            project=project,
            name="Started",
            color="#F59E0B",
            group=StateGroup.STARTED.value,
            sequence=35000,
        )
        todo_ready = SubState.objects.create(
            project=project,
            workspace=workspace,
            state=todo,
            name="Ready",
            color="#60646C",
            sequence=10000,
        )
        started_working = SubState.objects.create(
            project=project,
            workspace=workspace,
            state=started,
            name="Working",
            color="#F59E0B",
            sequence=10000,
        )
        return project, todo, started, todo_ready, started_working

    def issues_url(self, workspace_slug: str, project_id: uuid.UUID, issue_id: uuid.UUID | None = None) -> str:
        base_url = f"/api/workspaces/{workspace_slug}/projects/{project_id}/issues/"
        return f"{base_url}{issue_id}/" if issue_id else base_url


@pytest.mark.contract
class TestIssueSubStateAPI(TestIssueSubStateBase):
    @pytest.mark.django_db
    def test_create_issue_without_sub_state(self, session_client, workspace, create_user):
        project, todo, _, _, _ = self.create_project_state_data(workspace, create_user)

        response = session_client.post(
            self.issues_url(workspace.slug, project.id),
            {"name": "No sub-state", "state_id": str(todo.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["sub_state_id"] is None

    @pytest.mark.django_db
    def test_create_issue_with_valid_sub_state(self, session_client, workspace, create_user):
        project, todo, _, todo_ready, _ = self.create_project_state_data(workspace, create_user)

        response = session_client.post(
            self.issues_url(workspace.slug, project.id),
            {"name": "With sub-state", "state_id": str(todo.id), "sub_state_id": str(todo_ready.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["sub_state_id"] == str(todo_ready.id)
        assert Issue.objects.get(id=response.json()["id"]).sub_state_id == todo_ready.id

    @pytest.mark.django_db
    def test_create_issue_rejects_sub_state_from_another_state(self, session_client, workspace, create_user):
        project, todo, _, _, started_working = self.create_project_state_data(workspace, create_user)

        response = session_client.post(
            self.issues_url(workspace.slug, project.id),
            {"name": "Invalid sub-state", "state_id": str(todo.id), "sub_state_id": str(started_working.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Issue.objects.filter(project=project, name="Invalid sub-state").exists()

    @pytest.mark.django_db
    def test_update_issue_rejects_stale_sub_state_when_state_changes_without_clearing(
        self, session_client, workspace, create_user
    ):
        project, todo, started, todo_ready, _ = self.create_project_state_data(workspace, create_user)
        issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            name="Move me",
            state=todo,
            sub_state=todo_ready,
        )

        response = session_client.patch(
            self.issues_url(workspace.slug, project.id, issue.id),
            {"state_id": str(started.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        issue.refresh_from_db()
        assert issue.state_id == todo.id
        assert issue.sub_state_id == todo_ready.id

    @pytest.mark.django_db
    def test_update_issue_can_change_state_and_clear_sub_state(self, session_client, workspace, create_user):
        project, todo, started, todo_ready, _ = self.create_project_state_data(workspace, create_user)
        issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            name="Clear me",
            state=todo,
            sub_state=todo_ready,
        )

        response = session_client.patch(
            self.issues_url(workspace.slug, project.id, issue.id),
            {"state_id": str(started.id), "sub_state_id": None},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["sub_state_id"] is None
        issue.refresh_from_db()
        assert issue.state_id == started.id
        assert issue.sub_state_id is None

    @pytest.mark.django_db
    def test_filter_issues_by_sub_state_id(self, session_client, workspace, create_user):
        project, todo, _, todo_ready, _ = self.create_project_state_data(workspace, create_user)
        included = Issue.objects.create(
            project=project,
            workspace=workspace,
            name="Included",
            state=todo,
            sub_state=todo_ready,
        )
        excluded = Issue.objects.create(
            project=project,
            workspace=workspace,
            name="Excluded",
            state=todo,
            sub_state=None,
        )

        response = session_client.get(
            self.issues_url(workspace.slug, project.id),
            {"sub_state_id": str(todo_ready.id)},
        )

        assert response.status_code == status.HTTP_200_OK
        result_ids = {issue["id"] for issue in response.json()["results"]}
        assert str(included.id) in result_ids
        assert str(excluded.id) not in result_ids
