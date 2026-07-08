from django.db.models import Exists, OuterRef, Q

from plane.db.models import Module, ModuleMember


def module_visible_to_user_q(user, prefix=""):
    visibility_key = f"{prefix}visibility"

    if not user or not getattr(user, "is_authenticated", False):
        return Q(**{visibility_key: Module.ModuleVisibility.PUBLIC})

    module_id_field = f"{prefix[:-2]}_id" if prefix else "id"
    module_member_exists = Exists(
        ModuleMember.objects.filter(
            module_id=OuterRef(module_id_field),
            member_id=user.id,
            deleted_at__isnull=True,
        )
    )

    return (
        Q(**{visibility_key: Module.ModuleVisibility.PUBLIC})
        | Q(**{f"{prefix}created_by_id": user.id})
        | Q(**{f"{prefix}lead_id": user.id})
        | module_member_exists
    )


def filter_visible_modules(queryset, user):
    return queryset.filter(module_visible_to_user_q(user)).distinct()


def filter_visible_module_relations(queryset, user, module_prefix="module__"):
    return queryset.filter(module_visible_to_user_q(user, prefix=module_prefix)).distinct()


def is_module_visible_to_user(module, user):
    if module.visibility == Module.ModuleVisibility.PUBLIC:
        return True

    if not user or not getattr(user, "is_authenticated", False):
        return False

    if module.created_by_id == user.id or module.lead_id == user.id:
        return True

    return ModuleMember.objects.filter(module=module, member_id=user.id, deleted_at__isnull=True).exists()
