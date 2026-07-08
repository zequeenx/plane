# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Django modules
from django.db.models import Q, Subquery
from django.db import IntegrityError

# Module imports
from plane.app.views.base import BaseAPIView
from plane.db.models import Module, UserFavorite, Workspace
from plane.db.utils.module_visibility import filter_visible_modules
from plane.app.serializers import UserFavoriteSerializer
from plane.app.permissions import allow_permission, ROLE


def visible_module_ids_for_user(slug, user):
    return filter_visible_modules(Module.objects.filter(workspace__slug=slug), user).values("id")


def is_hidden_module_favorite(slug, user, entity_type, entity_identifier):
    if entity_type != "module" or not entity_identifier:
        return False

    return not filter_visible_modules(
        Module.objects.filter(workspace__slug=slug, pk=entity_identifier),
        user,
    ).exists()


def filter_visible_module_favorites(queryset, slug, user):
    visible_module_ids = visible_module_ids_for_user(slug, user)
    return queryset.filter(~Q(entity_type="module") | Q(entity_identifier__in=Subquery(visible_module_ids)))


class WorkspaceFavoriteEndpoint(BaseAPIView):
    use_read_replica = True

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        # the second filter is to check if the user is a member of the project
        favorites = UserFavorite.objects.filter(user=request.user, workspace__slug=slug, parent__isnull=True).filter(
            Q(project__isnull=True) & ~Q(entity_type="page")
            | (
                Q(project__isnull=False)
                & Q(project__project_projectmember__member=request.user)
                & Q(project__project_projectmember__is_active=True)
            )
        )
        favorites = filter_visible_module_favorites(favorites, slug, request.user)
        serializer = UserFavoriteSerializer(favorites, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        try:
            workspace = Workspace.objects.get(slug=slug)
            entity_type = request.data.get("entity_type")
            entity_identifier = request.data.get("entity_identifier")

            if is_hidden_module_favorite(slug, request.user, entity_type, entity_identifier):
                return Response({"error": "Module not found"}, status=status.HTTP_404_NOT_FOUND)

            # If the favorite exists return
            if entity_identifier:
                user_favorites = UserFavorite.objects.filter(
                    workspace=workspace,
                    user_id=request.user.id,
                    entity_type=entity_type,
                    entity_identifier=entity_identifier,
                ).first()

                # If the favorite exists return
                if user_favorites:
                    serializer = UserFavoriteSerializer(user_favorites)
                    return Response(serializer.data, status=status.HTTP_200_OK)

            # else create a new favorite
            serializer = UserFavoriteSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(
                    user_id=request.user.id,
                    workspace=workspace,
                    project_id=request.data.get("project_id", None),
                )
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response({"error": "Favorite already exists"}, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def patch(self, request, slug, favorite_id):
        favorite = UserFavorite.objects.get(user=request.user, workspace__slug=slug, pk=favorite_id)
        if is_hidden_module_favorite(slug, request.user, favorite.entity_type, favorite.entity_identifier):
            return Response({"error": "Module not found"}, status=status.HTTP_404_NOT_FOUND)
        entity_type = request.data.get("entity_type", favorite.entity_type)
        entity_identifier = request.data.get("entity_identifier", favorite.entity_identifier)
        if is_hidden_module_favorite(slug, request.user, entity_type, entity_identifier):
            return Response({"error": "Module not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = UserFavoriteSerializer(favorite, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def delete(self, request, slug, favorite_id):
        favorite = UserFavorite.objects.get(user=request.user, workspace__slug=slug, pk=favorite_id)
        if is_hidden_module_favorite(slug, request.user, favorite.entity_type, favorite.entity_identifier):
            return Response({"error": "Module not found"}, status=status.HTTP_404_NOT_FOUND)

        favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceFavoriteGroupEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, favorite_id):
        favorites = UserFavorite.objects.filter(user=request.user, workspace__slug=slug, parent_id=favorite_id).filter(
            Q(project__isnull=True)
            | (
                Q(project__isnull=False)
                & Q(project__project_projectmember__member=request.user)
                & Q(project__project_projectmember__is_active=True)
            )
        )
        favorites = filter_visible_module_favorites(favorites, slug, request.user)
        serializer = UserFavoriteSerializer(favorites, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
