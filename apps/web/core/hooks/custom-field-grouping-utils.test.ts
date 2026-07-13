import { describe, expect, it, vi } from "vitest";

import { loadSourceModuleDetailsOnce, resolveCustomFieldGroupSourceModuleId } from "./custom-field-grouping-utils";

describe("loadSourceModuleDetailsOnce", () => {
  it("shares an in-flight source module request between simultaneous consumers", async () => {
    let resolveRequest: (() => void) | undefined;
    const loadModule = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        })
    );

    const firstRequest = loadSourceModuleDetailsOnce("module-1", loadModule);
    const secondRequest = loadSourceModuleDetailsOnce("module-1", loadModule);

    expect(loadModule).toHaveBeenCalledTimes(1);
    resolveRequest?.();
    await Promise.all([firstRequest, secondRequest]);
  });

  it("allows a source module request to retry after a failure", async () => {
    const loadModule = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce();

    await expect(loadSourceModuleDetailsOnce("module-2", loadModule)).rejects.toThrow("network unavailable");
    await expect(loadSourceModuleDetailsOnce("module-2", loadModule)).resolves.toBeUndefined();
    expect(loadModule).toHaveBeenCalledTimes(2);
  });
});

describe("resolveCustomFieldGroupSourceModuleId", () => {
  it("prefers an explicit source module override", () => {
    expect(
      resolveCustomFieldGroupSourceModuleId({
        projectViewSourceModuleId: "view-module",
        routeModuleId: "route-module",
        sourceModuleIdOverride: "override-module",
      })
    ).toBe("override-module");
  });

  it("uses the route module before a project view source module", () => {
    expect(
      resolveCustomFieldGroupSourceModuleId({
        projectViewSourceModuleId: "view-module",
        routeModuleId: "route-module",
      })
    ).toBe("route-module");
  });

  it("falls back to the project view source module", () => {
    expect(
      resolveCustomFieldGroupSourceModuleId({
        projectViewSourceModuleId: "view-module",
      })
    ).toBe("view-module");
  });
});
