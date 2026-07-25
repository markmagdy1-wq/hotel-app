// supabase/functions/create-staff-user/index.ts
//
// Creates a real Supabase Auth user and links them to the caller's hotel
// via the `staff` table. Only a logged-in manager may call this.
//
// Deploy: supabase functions deploy create-staff-user
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided
// automatically to every Edge Function — no manual secrets needed.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Scoped to the caller's own JWT — only used to find out who is calling.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid or expired session. Please sign in again." }, 401);
    }
    const callerId = userData.user.id;

    // Service-role client — bypasses RLS, used only for the privileged writes below.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Confirm the caller is a manager, and find which hotel they manage.
    const { data: callerStaff, error: staffErr } = await admin
      .from("staff")
      .select("role, hotel_id")
      .eq("user_id", callerId)
      .single();

    if (staffErr || !callerStaff) {
      return json({ error: "Your account isn't linked to a hotel." }, 403);
    }
    if (callerStaff.role !== "manager") {
      return json({ error: "Only managers can add staff." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const displayName = String(body.displayName || "").trim();
    const role = String(body.role || "reception");

    if (!email || !password || !displayName) {
      return json({ error: "Email, password, and display name are required." }, 400);
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return json({ error: "Enter a valid email address." }, 400);
    }
    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }
    if (!["reception", "manager", "analyst"].includes(role)) {
      return json({ error: "Invalid role." }, 400);
    }

    // 1. Create the real Supabase Auth account.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      const msg = /already registered|already exists/i.test(createErr.message)
        ? "A user with that email already exists."
        : createErr.message;
      return json({ error: msg }, 400);
    }

    // 2. Link the new account to the manager's hotel with the chosen role.
    const { error: insertErr } = await admin.from("staff").insert({
      user_id: created.user.id,
      hotel_id: callerStaff.hotel_id,
      role,
      display_name: displayName,
    });
    if (insertErr) {
      // Don't leave an orphaned auth account with no staff record.
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: `Could not link staff record: ${insertErr.message}` }, 400);
    }

    return json({ ok: true, userId: created.user.id }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error." }, 500);
  }
});
