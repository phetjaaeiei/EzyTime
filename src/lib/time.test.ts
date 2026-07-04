import { describe, expect, it } from "vitest";
import { formatDuration } from "./time";

describe("formatDuration", () => {
  it("returns a dash for undefined input", () => {
    expect(formatDuration(undefined)).toBe("-");
  });

  it("formats minutes under an hour", () => {
    expect(formatDuration(45)).toBe("45 นาที");
  });

  it("formats whole hours with no remainder", () => {
    expect(formatDuration(120)).toBe("2 ชม.");
  });

  it("formats hours with a remainder", () => {
    expect(formatDuration(125)).toBe("2 ชม. 5 นาที");
  });
});
