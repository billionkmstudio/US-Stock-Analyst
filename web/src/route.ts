import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // 簡單的單人版防護:檢查 email 是否符合 ALLOWED_EMAIL
  const allowed = process.env.ALLOWED_EMAIL;
  if (allowed) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.email !== allowed) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=unauthorized`);
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
