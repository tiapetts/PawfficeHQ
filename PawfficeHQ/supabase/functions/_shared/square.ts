import { admin } from "./subscription.ts";

const version = "2026-08-19";
const encoder = new TextEncoder();

const base64 = (bytes: Uint8Array) => {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
};

const unbase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

async function encryptionKey() {
  const secret = Deno.env.get("SQUARE_TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("Square token encryption is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSquareToken(value: string | null | undefined) {
  if (!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value)));
  return `v1.${base64(iv)}.${base64(encrypted)}`;
}

export async function decryptSquareToken(value: string | null | undefined) {
  if (!value) return null;
  const [versionTag, ivValue, encryptedValue] = value.split(".");
  if (versionTag !== "v1" || !ivValue || !encryptedValue) throw new Error("Square token could not be decrypted.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(ivValue) }, await encryptionKey(), unbase64(encryptedValue));
  return new TextDecoder().decode(decrypted);
}

export const squareBaseUrl = (environment: string) => environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";

export async function saveSquareTokens(businessId: string, accessToken: string, refreshToken: string | null | undefined, expiresAt: string | null | undefined) {
  return admin.from("square_connection").update({
    access_token_encrypted: await encryptSquareToken(accessToken),
    refresh_token_encrypted: await encryptSquareToken(refreshToken),
    access_token: null,
    refresh_token: null,
    token_expires_at: expiresAt ?? null,
    token_last_refreshed_at: new Date().toISOString(),
    last_token_error: null,
    status: "connected",
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);
}

export async function getSquareConnection(businessId: string, refresh = true) {
  const result = await admin.from("square_connection").select("*").eq("business_id", businessId).maybeSingle();
  const connection = result.data;
  if (result.error || !connection || connection.status !== "connected") throw new Error("Square must be reconnected in Settings.");
  let accessToken = connection.access_token_encrypted ? await decryptSquareToken(connection.access_token_encrypted) : connection.access_token;
  let refreshToken = connection.refresh_token_encrypted ? await decryptSquareToken(connection.refresh_token_encrypted) : connection.refresh_token;
  if (!accessToken) throw new Error("Square must be reconnected in Settings.");

  if (!connection.access_token_encrypted && connection.access_token) {
    await saveSquareTokens(businessId, connection.access_token, connection.refresh_token, connection.token_expires_at);
  }

  const refreshedAt = connection.token_last_refreshed_at ? new Date(connection.token_last_refreshed_at).getTime() : 0;
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : Number.POSITIVE_INFINITY;
  const shouldRefresh = refresh && (Date.now() - refreshedAt > 6 * 86400000 || expiresAt - Date.now() < 7 * 86400000);
  if (shouldRefresh) {
    if (!refreshToken) throw new Error("Square authorization expired. Reconnect Square in Settings.");
    const clientId = Deno.env.get("SQUARE_APPLICATION_ID");
    const clientSecret = Deno.env.get("SQUARE_APPLICATION_SECRET");
    const redirectUri = Deno.env.get("SQUARE_OAUTH_REDIRECT_URL");
    if (!clientId || !clientSecret || !redirectUri) throw new Error("Square OAuth secrets are incomplete.");
    const response = await fetch(`${squareBaseUrl(connection.environment)}/oauth2/token`, {
      method: "POST",
      headers: { "Square-Version": version, "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken, redirect_uri: redirectUri }),
    });
    const token = await response.json();
    if (!response.ok || token.errors) {
      const detail = token.errors?.[0]?.detail ?? "Square token refresh failed.";
      await admin.from("square_connection").update({ status: "refresh_required", last_token_error: detail, updated_at: new Date().toISOString() }).eq("business_id", businessId);
      throw new Error("Square authorization needs attention. Reconnect Square in Settings.");
    }
    accessToken = token.access_token;
    refreshToken = token.refresh_token ?? refreshToken;
    await saveSquareTokens(businessId, accessToken, refreshToken, token.expires_at);
  }
  await admin.from("square_connection").update({ token_last_checked_at: new Date().toISOString() }).eq("business_id", businessId);
  return { ...connection, accessToken, refreshToken };
}
