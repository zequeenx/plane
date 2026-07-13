/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const sourceModuleDetailsInFlight = new Map<string, Promise<unknown>>();

type TResolveCustomFieldGroupSourceModuleId = {
  projectViewSourceModuleId?: string | null;
  routeModuleId?: string | null;
  sourceModuleIdOverride?: string | null;
};

export const resolveCustomFieldGroupSourceModuleId = ({
  projectViewSourceModuleId,
  routeModuleId,
  sourceModuleIdOverride,
}: TResolveCustomFieldGroupSourceModuleId): string | null =>
  sourceModuleIdOverride ?? routeModuleId ?? projectViewSourceModuleId ?? null;

export const loadSourceModuleDetailsOnce = (moduleId: string, loadModule: () => Promise<unknown>): Promise<unknown> => {
  const inFlightRequest = sourceModuleDetailsInFlight.get(moduleId);
  if (inFlightRequest) return inFlightRequest;

  const request = loadModule().finally(() => {
    if (sourceModuleDetailsInFlight.get(moduleId) === request) sourceModuleDetailsInFlight.delete(moduleId);
  });
  sourceModuleDetailsInFlight.set(moduleId, request);
  return request;
};
