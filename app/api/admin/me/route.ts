import { isAdmin, unauthorized } from "@/lib/auth";

export async function GET() {
  return (await isAdmin()) ? Response.json({ ok: true }) : unauthorized();
}
