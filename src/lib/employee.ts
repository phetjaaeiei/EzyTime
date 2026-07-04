export type ClockViewState = "signed-out" | "needs-nickname" | "ready";

export function getClockViewState(hasSession: boolean, nickname: string | null): ClockViewState {
  if (!hasSession) return "signed-out";
  if (!nickname) return "needs-nickname";
  return "ready";
}

export function validateNickname(rawNickname: string): string | null {
  const trimmed = rawNickname.trim();
  if (trimmed.length < 2) return "กรุณากรอกชื่อเล่นอย่างน้อย 2 ตัวอักษร";
  if (trimmed.length > 100) return "ชื่อเล่นยาวเกินไป กรุณาใช้ไม่เกิน 100 ตัวอักษร";
  return null;
}

export function extractNickname(userMetadata: Record<string, unknown> | null | undefined): string | null {
  const nickname = userMetadata?.nickname;
  if (typeof nickname !== "string") return null;
  const trimmed = nickname.trim();
  return trimmed.length >= 2 ? trimmed : null;
}
