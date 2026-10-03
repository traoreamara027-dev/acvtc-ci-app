import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const canonicalOrigin = "https://acvtc-ci-app.vercel.app";
const exactOrigins = new Set([
  canonicalOrigin,
  "https://acvtc-ci-app-traoreamara027-3825.vercel.app",
  "https://acvtc-ci-app-git-main-traoreamara027-3825.vercel.app",
]);

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (exactOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" &&
      url.hostname.endsWith("-traoreamara027-3825.vercel.app") &&
      url.hostname.startsWith("acvtc-ci-");
  } catch {
    return false;
  }
}

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : canonicalOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "ACVTC-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("Origin");
    if (!isAllowedOrigin(origin)) {
      return new Response("Origine non autorisée.", { status: 403, headers: corsHeadersFor(req) });
    }
    return new Response("ok", { headers: corsHeadersFor(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Méthode non autorisée." }, 405);

  try {
    const origin = req.headers.get("Origin");
    if (!isAllowedOrigin(origin)) return json(req, { error: "Origine non autorisée." }, 403);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(req, { error: "Non autorisé." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json(req, { error: "Session invalide." }, 401);

    const { data: caller } = await admin
      .from("members_v5")
      .select("id, role_id, actif")
      .eq("auth_user_id", userData.user.id)
      .eq("actif", true)
      .maybeSingle();

    if (!caller || Number(caller.role_id) !== 1) {
      return json(req, { error: "Cette opération est réservée au Président." }, 403);
    }

    const body = await req.json();
    const memberId = String(body?.memberId || "").trim();
    let email = String(body?.email || "").trim().toLowerCase();

    let memberQuery = admin
      .from("members_v5")
      .select("id, nom_complet, email, actif, auth_user_id")
      .eq("actif", true);

    if (memberId) memberQuery = memberQuery.eq("id", memberId);
    else if (email && email.includes("@")) memberQuery = memberQuery.ilike("email", email);
    else return json(req, { error: "Membre ou adresse e-mail invalide." }, 400);

    const { data: member, error: memberError } = await memberQuery.maybeSingle();
    if (memberError || !member) return json(req, { error: "Membre ACVTC-CI introuvable ou inactif." }, 404);

    email = String(member.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return json(req, { error: "Adresse e-mail invalide." }, 400);

    const password = temporaryPassword();
    let authUserId = String(member.auth_user_id || "");
    let newlyCreatedUserId = "";

    if (authUserId) {
      const current = await admin.auth.admin.getUserById(authUserId);
      if (current.error || !current.data.user) return json(req, { error: "Compte de connexion introuvable." }, 404);
      const metadata = { ...(current.data.user.user_metadata || {}), must_change_password: true };
      const updated = await admin.auth.admin.updateUserById(authUserId, {
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (updated.error) throw updated.error;
    } else {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { must_change_password: true },
      });

      if (created.error) {
        if (!/already|registered|exists|been registered/i.test(created.error.message || "")) throw created.error;
        const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listed.error) throw listed.error;
        const existing = listed.data.users.find((u) => String(u.email || "").toLowerCase() === email);
        if (!existing) throw created.error;
        authUserId = existing.id;
        const metadata = { ...(existing.user_metadata || {}), must_change_password: true };
        const updated = await admin.auth.admin.updateUserById(authUserId, {
          password,
          email_confirm: true,
          user_metadata: metadata,
        });
        if (updated.error) throw updated.error;
      } else {
        authUserId = created.data.user.id;
        newlyCreatedUserId = authUserId;
      }

      const linked = await admin
        .from("members_v5")
        .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
        .eq("id", member.id);

      if (linked.error) {
        if (newlyCreatedUserId) await admin.auth.admin.deleteUser(newlyCreatedUserId);
        throw linked.error;
      }
    }

    return json(req, {
      ok: true,
      member_id: member.id,
      member_name: member.nom_complet,
      email,
      temporary_password: password,
      login_url: canonicalOrigin,
      message: "Accès provisoire créé. Copiez-le maintenant : le mot de passe ne sera plus affiché.",
    });
  } catch (error) {
    console.error(error);
    return json(req, { error: error instanceof Error ? error.message : "Erreur inattendue." }, 500);
  }
});
