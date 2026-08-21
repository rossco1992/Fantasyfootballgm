import { describe, expect, it } from "vitest";

import { parseCsv } from "@/providers/shared/csv";

describe("provider CSV parser", () => {
  it("parses quoted commas, escaped quotes, and embedded newlines", () => {
    expect(
      parseCsv(
        '\uFEFFid,name,notes\r\n1,"Smith, Jr.","line one\nline two"\r\n2,"A ""Nickname"" B",\r\n',
      ),
    ).toEqual([
      { id: "1", name: "Smith, Jr.", notes: "line one\nline two" },
      { id: "2", name: 'A "Nickname" B', notes: "" },
    ]);
  });

  it("rejects malformed headers and unterminated quotes", () => {
    expect(() => parseCsv("id,id\n1,2\n")).toThrow(/unique/);
    expect(() => parseCsv('id,name\n1,"open')).toThrow(/quoted field/);
  });
});
