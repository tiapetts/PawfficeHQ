import { admin } from "../_shared/subscription.ts";
import { encryptSquareToken, squareBaseUrl } from "../_shared/square.ts";

const version = "2026-08-19";
const redirect = (url: string, status: string, message?: string) => {
  const target = new URL(url);
  target.searchParams.set("square", status);
  if (message) target.searchParams.set("square_message", message.slice(0, 180));
  return Response.redirect(target.toString(), 302);
};

Deno.serve(async (request) => {
  let fallback = "https://pawfficehq.com";
  try {
    const incoming = new URL(request.url);
    const state = incoming.searchParams.get("state");
    const code = incoming.searchParams.get("code");
    const oauthError = incoming.searchParams.get("error");
    if (!state) throw new Error("Missing OAuth state.");
    const stateResult = await admin.from("square_oauth_state").select("business_id,requested_by,return_url,expires_at").eq("state", state).maybeSingle();
    if (stateResult.error || !stateResult.data) throw new Error("This Square connection request is invalid or expired.");
    fallback = stateResult.data.return_url;
    await admin.from("square_oauth_state").delete().eq("state", state);
    if (new Date(stateResult.data.expires_at) < new Date()) throw new Error("This Square connection request expired. Please try again.");
    if (oauthError || !code) throw new Error(oauthError ?? "Square did not return an authorization code.");
    const environment = Deno.env.get("SQUARE_ENVIRONMENT") ?? "sandbox";
    const clientId = Deno.env.get("SQUARE_APPLICATION_ID");
    const clientSecret = Deno.env.get("SQUARE_APPLICATION_SECRET");
    const redirectUri = Deno.env.get("SQUARE_OAUTH_REDIRECT_URL");
    if (!clientId || !clientSecret || !redirectUri) throw new Error("Square OAuth secrets are incomplete.");
    const base = squareBaseUrl(environment);
    const tokenResponse = await fetch(`${base}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/json", "Square-Version": version }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }) });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || token.errors) throw new Error(token.errors?.[0]?.detail ?? "Square token exchange failed.");
    const headers = { Authorization: `Bearer ${token.access_token}`, "Square-Version": version, "Content-Type": "application/json" };
    const [merchantResponse, locationsResponse] = await Promise.all([fetch(`${base}/v2/merchants/${token.merchant_id}`, { headers }), fetch(`${base}/v2/locations`, { headers })]);
    const merchant = await merchantResponse.json();
    const locations = await locationsResponse.json();
    if (!merchantResponse.ok) throw new Error(merchant.errors?.[0]?.detail ?? "Square merchant could not be loaded.");
    const location = (locations.locations ?? []).find((item: Record<string, unknown>) => item.status === "ACTIVE") ?? locations.locations?.[0];
    const now = new Date().toISOString();
    const saved = await admin.from("square_connection").upsert({ business_id: stateResult.data.business_id, merchant_id: token.merchant_id, location_id: location?.id ?? null, location_name: location?.name ?? merchant.merchant?.business_name ?? null, access_token: null, refresh_token: null, access_token_encrypted: await encryptSquareToken(token.access_token), refresh_token_encrypted: await encryptSquareToken(token.refresh_token), token_expires_at: token.expires_at ?? null, token_last_refreshed_at: now, token_last_checked_at: now, last_token_error: null, environment, status: "connected", connected_by: stateResult.data.requested_by, connected_at: now, updated_at: now }, { onConflict: "business_id" });
    if (saved.error) throw saved.error;
    return redirect(fallback, "connected");
  } catch (error) {
    return redirect(fallback, "error", error instanceof Error ? error.message : "Square connection failed.");
  }
});
