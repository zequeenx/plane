import uuid

import pytest
from rest_framework import status

from plane.db.models import Intake, IntakeIssue, Issue, Project, ProjectMember, State, StateGroup, SubState


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

    def workspace_issues_url(self, workspace_slug: str) -> str:
        return f"/api/workspaces/{workspace_slug}/issues/"

    def entity_search_url(self, workspace_slug: str) -> str:
        return f"/api/workspaces/{workspace_slug}/entity-search/"

    def public_intake_issue_url(self, workspace_slug: str, project_id: uuid.UUID, issue_id: uuid.UUID) -> str:
        return f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/intake-issues/{issue_id}/"

    def public_relation_url(self, workspace_slug: str, project_id: uuid.UUID, issue_id: uuid.UUID) -> str:
        return f"/api/v1/workspaces/{workspace_slug}/projects/{project_id}/work-items/{issue_id}/relations/"


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

    @pytest.mark.django_db
    def test_workspace_issue_view_rows_include_sub_state_id(self, session_client, workspace, create_user):
        project, todo, _, todo_ready, _ = self.create_project_state_data(workspace, create_user)
        issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            name="View row sub-state",
            state=todo,
            sub_state=todo_ready,
        )

        response = session_client.get(
            self.workspace_issues_url(workspace.slug),
            {"sub_state_id": str(todo_ready.id)},
        )

        assert response.status_code == status.HTTP_200_OK
        row = next(item for item in response.json()["results"] if item["id"] == str(issue.id))
        assert row["state_id"] == str(todo.id)
        assert row["sub_state_id"] == str(todo_ready.id)

    @pytest.mark.django_db
    def test_entity_search_issue_rows_include_sub_state_id(self, session_client, workspace, create_user):
        project, todo, _, todo_ready, _ = self.create_project_state_data(workspace, create_user)
        issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            name="Searchable sub-state issue",
            state=todo,
            sub_state=todo_ready,
        )

        project_response = session_client.get(
            self.entity_search_url(workspace.slug),
            {
                "query": "Searchable sub-state issue",
                "query_type": "issue",
                "project_id": str(project.id),
                "count": 5,
            },
        )
        workspace_response = session_client.get(
            self.entity_search_url(workspace.slug),
            {
                "query": "Searchable sub-state issue",
                "query_type": "issue",
                "count": 5,
            },
        )

        assert project_response.status_code == status.HTTP_200_OK
        assert workspace_response.status_code == status.HTTP_200_OK

        project_row = next(item for item in project_response.json()["issue"] if item["id"] == str(issue.id))
        workspace_row = next(item for item in workspace_response.json()["issue"] if item["id"] == str(issue.id))
        assert project_row["state_id"] == str(todo.id)
        assert workspace_row["state_id"] == str(todo.id)
        assert project_row["sub_state_id"] == str(todo_ready.id)
        assert workspace_row["sub_state_id"] == str(todo_ready.id)

    @pytest.mark.django_db
    def test_public_intake_issue_update_keeps_existing_sub_state(
        self, api_key_client, workspace, create_user, monkeypatch
    ):
        project, todo, _, todo_ready, _ = self.create_project_state_data(workspace, create_user)
        project.intake_view = True
        project.save(update_fields=["intake_view"])
        intake = Intake.objects.create(workspace=workspace, project=project, name="Triage")
        issue = Issue.objects.create(
            project=project,
            workspace=workspace,
            name="Intake issue",
            state=todo,
            sub_state=todo_ready,
        )
        IntakeIssue.objects.create(workspace=workspace, project=project, intake=intake, issue=issue)
        monkeypatch.setattr("plane.api.views.intake.issue_activity.delay", lambda *args, **kwargs: None)

        response = api_key_client.patch(
            self.public_intake_issue_url(workspace.slug, project.id, issue.id),
            {"issue": {"name": "Renamed intake issue"}},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        issue.refresh_from_db()
        assert issue.name == "Renamed intake issue"
        assert issue.sub_state_id == todo_ready.id

    @pytest.mark.django_db
    def test_public_relation_create_returns_sub_state_id_for_nullable_related_issues(
        self, api_key_client, workspace, create_user, monkeypatch
    ):
        project, todo, _, todo_ready, _ = self.create_project_state_data(workspace, create_user)
        source = Issue.objects.create(project=project, workspace=workspace, name="Source", state=todo)
        without_sub_state = Issue.objects.create(
            project=project,
            workspace=workspace,
            name="No sub-state relation target",
            state=todo,
            sub_state=None,
        )
        with_sub_state = Issue.objects.create(
            project=project,
            workspace=workspace,
            name="Sub-state relation target",
            state=todo,
            sub_state=todo_ready,
        )
        monkeypatch.setattr("plane.api.views.issue.issue_activity.delay", lambda *args, **kwargs: None)

        response = api_key_client.post(
            self.public_relation_url(workspace.slug, project.id, source.id),
            {
                "relation_type": "relates_to",
                "issues": [str(without_sub_state.id), str(with_sub_state.id)],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        rows = {item["id"]: item for item in response.json()}
        assert rows[str(without_sub_state.id)]["sub_state_id"] is None
        assert rows[str(with_sub_state.id)]["sub_state_id"] == str(todo_ready.id)
