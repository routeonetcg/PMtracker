import { describe, expect, it } from "vitest";
import { importRowSchema, toCsv } from "./csv";
import { bpsToInput } from "./money";

describe("csv", () => {
  it("escapes quotes, commas and spreadsheet formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["=SUM(A1)", -12.5]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n\'=SUM(A1),-12.5\r\n');
  });

  it("parses a raw card row", () => {
    const r = importRowSchema.parse({ name: "Pikachu V", set: "Brilliant Stars", number: "157/172", condition: "LP", purchase: "12.50", quantity: "3", tags: "chase; jp-hunt" });
    expect(r).toMatchObject({ conditionType: "raw", rawCondition: "LP", purchase: 1250, quantity: 3, tags: ["chase", "jp-hunt"], language: "EN" });
  });

  it("parses graded rows from 'PSA 10' or separate columns", () => {
    expect(importRowSchema.parse({ name: "A", set: "B", condition: "PSA 10" })).toMatchObject({ conditionType: "graded", grader: "PSA", grade: "10" });
    expect(importRowSchema.parse({ name: "A", set: "B", grader: "bgs", grade: "9.5", language: "Japanese" })).toMatchObject({ grader: "BGS", grade: "9.5", language: "JP" });
  });

  it("reports friendly errors", () => {
    const r = importRowSchema.safeParse({ name: "", set: "B", condition: "mint-ish", purchase: "abc" });
    expect(r.success).toBe(false);
    expect(importRowSchema.safeParse({ name: "A", set: "B", status: "Sold" }).success).toBe(false);
    expect(importRowSchema.safeParse({ name: "A", set: "B", grader: "PSA", grade: "11" }).success).toBe(false);
  });

  it("keeps blank cost as missing", () => {
    expect(importRowSchema.parse({ name: "A", set: "B" }).purchase).toBeNull();
  });

  it("formats basis points for inputs", () => {
    expect(bpsToInput(1325)).toBe("13.25");
    expect(bpsToInput(1250)).toBe("12.5");
    expect(bpsToInput(1505)).toBe("15.05");
    expect(bpsToInput(-500)).toBe("-5");
  });
});
