import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "crypto";

const COOKIE = "vh_admin";
const token = () =>
  createHmac("sha256", process.env.ADMIN_PASSCODE || "").update("vh-admin-v1").digest("hex");

const same = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

export async function isAdmin(): Promise<boolean> {
  if (!process.env.ADMIN_PASSCODE) return false;
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && same(c, token());
}

export async function login(passcode: string): Promise<boolean> {
  if (!process.env.ADMIN_PASSCODE || !same(passcode, process.env.ADMIN_PASSCODE)) return false;
  (await cookies()).set(COOKIE, token(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return true;
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

export const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });
