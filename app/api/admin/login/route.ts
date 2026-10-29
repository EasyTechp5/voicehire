import { login, logout } from "@/lib/auth";

export async function POST(req: Request) {
  const { passcode } = await req.json().catch(() => ({ passcode: "" }));
  if (await login(String(passcode || ""))) return Response.json({ ok: true });
  await new Promise((r) => setTimeout(r, 800)); // slow down guessing
  return Response.json({ error: "Wrong passcode" }, { status: 401 });
}

export async function DELETE() {
  await logout();
  return Response.json({ ok: true });
}
