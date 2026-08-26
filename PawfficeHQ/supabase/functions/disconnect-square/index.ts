import { admin, authenticatedBusiness, cors, json } from "../_shared/subscription.ts";
import { getSquareConnection, squareBaseUrl } from "../_shared/square.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { businessId } = await request.json();
    await authenticatedBusiness(request, businessId);
    try {
      const connection = await getSquareConnection(businessId, false);
      await fetch(`${squareBaseUrl(connection.environment)}/oauth2/revoke`, {
        method: "POST",
        headers: { Authorization: `Client ${Deno.env.get("SQUARE_APPLICATION_SECRET") ?? ""}`, "Content-Type": "application/json", "Square-Version": "2026-08-19" },
        body: JSON.stringify({ access_token: connection.accessToken, client_id: Deno.env.get("SQUARE_APPLICATION_ID"), revoke_only_access_token: false }),
      });
    } catch {
      // Local removal must remain available when Square has already revoked or expired the token.
    }
    const removed = await admin.from("square_connection").delete().eq("business_id", businessId);
    if (removed.error) throw removed.error;
    return json({ disconnected: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to disconnect Square." }, 400);
  }
});

