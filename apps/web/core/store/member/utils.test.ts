import { EUserPermissions } from "@plane/constants";
import { EUserProjectRoles } from "@plane/types";
import type { TProjectMembership } from "@plane/types";
import { describe, expect, it } from "vitest";

import { filterActiveProjectMemberships } from "./utils";

const membership = (member: string, role: TProjectMembership["role"], isActive: boolean): TProjectMembership => ({
  created_at: "2026-07-13T00:00:00Z",
  id: `membership-${member}`,
  is_active: isActive,
  member,
  original_role: role as EUserProjectRoles,
  role,
});

describe("filterActiveProjectMemberships", () => {
  it("keeps only active eligible members while excluding inactive members and guests", () => {
    const active = membership("active-member", EUserPermissions.MEMBER, true);
    const inactive = membership("inactive-member", EUserPermissions.MEMBER, false);
    const guest = membership("guest-member", EUserPermissions.GUEST, true);

    expect(filterActiveProjectMemberships([active, inactive, guest], false)).toEqual([active]);
  });

  it("preserves active memberships from responses that omit the active flag", () => {
    const active = { ...membership("active-member", EUserPermissions.MEMBER, true), is_active: undefined };

    expect(filterActiveProjectMemberships([active], false)).toEqual([active]);
  });
});
