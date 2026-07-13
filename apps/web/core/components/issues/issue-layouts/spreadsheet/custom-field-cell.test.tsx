import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpreadsheetCustomFieldCell } from "./custom-field-cell";

describe("SpreadsheetCustomFieldCell", () => {
  it("renders the spreadsheet layout with a subtle bottom separator", () => {
    const markup = renderToStaticMarkup(<SpreadsheetCustomFieldCell>Custom field</SpreadsheetCustomFieldCell>);

    expect(markup).toContain("flex h-full w-full items-center");
    expect(markup).toContain("border-b-[0.5px]");
    expect(markup).toContain("border-subtle");
    expect(markup).toContain("px-2");
  });

  it("wraps both project and module custom field branches", () => {
    const issueColumnSource = readFileSync(new URL("./issue-column.tsx", import.meta.url), "utf8");

    expect(issueColumnSource.match(/<SpreadsheetCustomFieldCell>/g)).toHaveLength(2);
    expect(issueColumnSource.match(/<\/SpreadsheetCustomFieldCell>/g)).toHaveLength(2);
  });
});
