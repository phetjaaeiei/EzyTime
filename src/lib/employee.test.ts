import { describe, expect, it } from "vitest";
import { extractNickname, getClockViewState, validateNickname } from "./employee";

describe("getClockViewState", () => {
  it("returns signed-out when there is no session", () => {
    expect(getClockViewState(false, null)).toBe("signed-out");
  });

  it("returns needs-nickname when signed in without a nickname", () => {
    expect(getClockViewState(true, null)).toBe("needs-nickname");
  });

  it("returns ready when signed in with a nickname", () => {
    expect(getClockViewState(true, "มะลิ")).toBe("ready");
  });
});

describe("validateNickname", () => {
  it("rejects nicknames shorter than 2 characters", () => {
    expect(validateNickname("ก")).toBe("กรุณากรอกชื่อเล่นอย่างน้อย 2 ตัวอักษร");
  });

  it("rejects nicknames longer than 100 characters", () => {
    expect(validateNickname("ก".repeat(101))).toBe("ชื่อเล่นยาวเกินไป กรุณาใช้ไม่เกิน 100 ตัวอักษร");
  });

  it("accepts a valid nickname and treats surrounding whitespace as fine", () => {
    expect(validateNickname("  มะลิ  ")).toBeNull();
  });
});

describe("extractNickname", () => {
  it("returns null when metadata is undefined", () => {
    expect(extractNickname(undefined)).toBeNull();
  });

  it("returns null when nickname is missing or not a string", () => {
    expect(extractNickname({})).toBeNull();
    expect(extractNickname({ nickname: 42 })).toBeNull();
  });

  it("returns null when nickname is too short after trimming", () => {
    expect(extractNickname({ nickname: " ก " })).toBeNull();
  });

  it("returns the trimmed nickname when valid", () => {
    expect(extractNickname({ nickname: "  มะลิ  " })).toBe("มะลิ");
  });
});
