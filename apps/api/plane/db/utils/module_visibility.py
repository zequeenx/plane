from django.db.models import Q

from plane.db.models import Module, ModuleMember


def module_visible_to_user_q(user, prefix=""):
    visibility_key = f"{prefix}visibility"
    module_member_key = f"{prefix}modulemember"

    if not user or not getattr(user, "is_authenticated", False):
        return Q(**{visibility_key: Module.ModuleVisibility.PUBLIC})

    return (
        Q(**{visibility_key: Module.ModuleVisibility.PUBLIC})
        | Q(**{f"{prefix}created_by_id": user.id})
        | Q(**{f"{prefix}lead_id": user.id})
        | Q(**{f"{module_member_key}__member_id": user.id, f"{module_member_key}__deleted_at__isnull": True})
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
