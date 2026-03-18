import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "tmt_session";
const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-in-production";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload =
  | {
      role: "player";
      playerId: string;
    }
  | {
      role: "coach" | "owner";
      userId: string;
    };

function sign(payload: SessionPayload): string {
  const data = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  const encoded = Buffer.from(data, "utf8").toString("base64url");
  return `${encoded}.${hmac}`;
}

function verify(token: string): SessionPayload | null {
  try {
    const [encoded, hmac] = token.split(".");
    if (!encoded || !hmac) return null;
    const data = Buffer.from(encoded, "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
    if (crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) {
      return JSON.parse(data) as SessionPayload;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verify(token);
}

export async function setSession(payload: SessionPayload): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
