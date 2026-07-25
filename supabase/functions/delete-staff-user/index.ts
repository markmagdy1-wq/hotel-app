// supabase/functions/delete-staff-user/index.ts
//
// Removes a staff member's hotel access. By default this only deletes their
// `staff` link (revokes access to this hotel); pass deleteAuthUser: true to
// also delete their underlying Supabase Auth account entirely.
//
// Deploy: supabase functions deploy delete-staff-user

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

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Invalid or expired session. Please sign in again." }, 401);
    }
    const callerId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerStaff, error: staffErr } = await admin
      .from("staff")
      .select("role, hotel_id")
      .eq("user_id", callerId)
      .single();

    if (staffErr || !callerStaff || callerStaff.role !== "manager") {
      return json({ error: "Only managers can remove staff." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body.userId || "");
    const deleteAuthUser = Boolean(body.deleteAuthUser);

    if (!targetUserId) return json({ error: "Missing userId." }, 400);
    if (targetUserId === callerId) return json({ error: "You can't remove your own access." }, 400);

    // Confirm the target is staff at the SAME hotel before touching anything.
    const { data: targetStaff, error: targetErr } = await admin
      .from("staff")
      .select("hotel_id")
      .eq("user_id", targetUserId)
      .single();

    if (targetErr || !targetStaff || targetStaff.hotel_id !== callerStaff.hotel_id) {
      return json({ error: "That user isn't staff at your hotel." }, 404);
    }

    const { error: deleteStaffErr } = await admin.from("staff").delete().eq("user_id", targetUserId);
    if (deleteStaffErr) return json({ error: deleteStaffErr.message }, 400);

    if (deleteAuthUser) {
      const { error: deleteAuthErr } = await admin.auth.admin.deleteUser(targetUserId);
      if (deleteAuthErr) {
        // Staff link is already gone (access revoked); surface this as a warning, not a failure.
        return json({ ok: true, warning: `Access revoked, but couldn't delete the login: ${deleteAuthErr.message}` }, 200);
      }
    }

    return json({ ok: true }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error." }, 500);
  }
});
