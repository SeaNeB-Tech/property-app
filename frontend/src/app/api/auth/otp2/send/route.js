import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, route: "auth/otp2/send" }, { status: 200 });
}

