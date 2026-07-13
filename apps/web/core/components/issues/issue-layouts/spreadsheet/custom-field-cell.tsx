/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { PropsWithChildren } from "react";

export function SpreadsheetCustomFieldCell(props: PropsWithChildren) {
  return <div className="flex h-full w-full items-center border-b-[0.5px] border-subtle px-2">{props.children}</div>;
}
