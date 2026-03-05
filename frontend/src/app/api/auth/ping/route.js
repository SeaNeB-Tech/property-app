import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, route: "auth/ping" }, { status: 200 });
}

