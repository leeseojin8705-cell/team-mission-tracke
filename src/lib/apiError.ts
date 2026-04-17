/**
 * JSON API 응답에서 `error` 또는 `message` 필드를 읽습니다. (본문은 한 번만 소비)
 */
export async function readApiErrorMessage(res: Response): Promise<string | null> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return null;
  try {
    const text = await res.text();
    if (!text.trim()) return null;
    const j = JSON.parse(text) as { error?: unknown; message?: unknown };
    const err = j.error ?? j.message;
    if (typeof err === "string" && err.trim()) return err.trim();
  } catch {
    return null;
  }
  return null;
}
