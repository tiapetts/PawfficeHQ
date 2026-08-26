import { admin, json } from "../_shared/subscription.ts";
import { getSquareConnection } from "../_shared/square.ts";

Deno.serve(async (request) => {
  const expected = Deno.env.get("SQUARE_TOKEN_REFRESH_CRON_SECRET");
  const provided = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!expected || provided !== expected) return json({ error: "Unauthorized" }, 401);
  try {
    const result = await admin.from("square_connection").select("business_id").eq("status", "connected");
    if (result.error) throw result.error;
    const outcomes = await Promise.allSettled((result.data ?? []).map((row) => getSquareConnection(row.business_id, true)));
    return json({
      checked: outcomes.length,
      succeeded: outcomes.filter((outcome) => outcome.status === "fulfilled").length,
      failed: outcomes.filter((outcome) => outcome.status === "rejected").length,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Square token refresh failed." }, 500);
  }
});
