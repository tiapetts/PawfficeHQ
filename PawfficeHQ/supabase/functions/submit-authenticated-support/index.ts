import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://pawfficehq.com",
  "https://www.pawfficehq.com",
  "http://localhost:5173",
]);

const categories = new Set(["bug", "support", "feature"]);

function cors(request: Request) {
  const origin = request.headers.get("Origin") ?? "";

  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://pawfficehq.com",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(request),
      "Content-Type": "application/json",
    },
  });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function validateScreenshots(files: File[]): string | null {
  if (files.length > MAX_SCREENSHOTS) {
    return "You can attach a maximum of 3 screenshots.";
  }

  for (const file of files) {
    if (!allowedImageTypes.has(file.type)) {
      return "Only PNG, JPG, and WebP screenshots are allowed.";
    }

    if (file.size === 0 || file.size > MAX_SCREENSHOT_SIZE) {
      return "Each screenshot must be between 1 byte and 5 MB.";
    }
  }

  return null;
}

async function isValidImage(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  // PNG signature
  if (file.type === "image/png") {
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

    return pngSignature.every((byte, index) => bytes[index] === byte);
  }

  // JPEG signature
  if (file.type === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  // WebP signature
  if (file.type === "image/webp") {
    const header = new TextDecoder().decode(bytes);

    return header.startsWith("RIFF") && header.slice(8, 12) === "WEBP";
  }

  return false;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: cors(request) });
  }

  if (request.method !== "POST") {
    return json(request, { error: "Method not allowed." }, 405);
  }

  const origin = request.headers.get("Origin");

  if (origin && !allowedOrigins.has(origin)) {
    return json(request, { error: "Origin not allowed." }, 403);
  }

  const token = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return json(request, { error: "Please sign in." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the user instead of trusting submitted identity fields.
  const { data: userData, error: authError } = await admin.auth.getUser(token);

  const user = userData.user;

  if (authError || !user || !user.email) {
    return json(request, { error: "Invalid session." }, 401);
  }

  const { data: staff, error: staffError } = await admin
    .from("STAFF")
    .select("id, business_id, first_name, last_name, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (staffError) {
    console.error("Staff lookup failed:", staffError.message);
    return json(request, { error: "Could not verify employee." }, 500);
  }

  if (!staff || staff.is_active !== true || !staff.business_id) {
    return json(request, { error: "No active employee profile." }, 403);
  }

  const { data: business, error: businessError } = await admin
    .from("business")
    .select("business_name")
    .eq("id", staff.business_id)
    .single();

  if (businessError || !business) {
    return json(request, { error: "Business not found." }, 403);
  }

  //   const input = await request.json().catch(() => null);

  //   if (!input || typeof input !== "object" || Array.isArray(input)) {
  //     return json(request, { error: "Invalid request." }, 400);
  //   }

  //   const body = input as Record<string, unknown>;
  //   const category = clean(body.category, 30);
  //   const subject = clean(body.subject, 150);
  //   const message = clean(body.message, 5000);

  const contentType = request.headers.get("Content-Type") ?? "";

  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return json(request, { error: "Expected a form submission." }, 415);
  }

  const form = await request.formData().catch(() => null);

  if (!form) {
    return json(request, { error: "Invalid form data." }, 400);
  }

  const category = clean(form.get("category"), 30);
  const subject = clean(form.get("subject"), 150);
  const message = clean(form.get("message"), 5000);

  const screenshotEntries = form.getAll("screenshots");

  if (screenshotEntries.some((entry) => !(entry instanceof File))) {
    return json(request, { error: "Invalid screenshot." }, 400);
  }

  const screenshots = screenshotEntries as File[];

  const screenshotError = validateScreenshots(screenshots);

  for (const screenshot of screenshots) {
    if (!(await isValidImage(screenshot))) {
      return json(
        request,
        { error: "One of your screenshots is not a valid image type." },
        400,
      );
    }
  }

  if (screenshotError) {
    return json(request, { error: screenshotError }, 400);
  }

  if (!categories.has(category) || subject.length < 3 || message.length < 10) {
    return json(
      request,
      { error: "Please complete all required fields." },
      400,
    );
  }

  // Limit each account to 5 submissions per hour.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error: countError } = await admin
    .from("support_request")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by", user.id)
    .gte("created_at", oneHourAgo);

  if (countError) {
    return json(request, { error: "Please try again later." }, 500);
  }

  if ((count ?? 0) >= 5) {
    return json(
      request,
      { error: "Too many requests. Please try again later." },
      429,
    );
  }

  const requesterName =
    `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() || user.email;

  const { data: ticket, error: insertError } = await admin
    .from("support_request")
    .insert({
      requester_name: requesterName,
      requester_email: user.email,
      business_name: business.business_name,
      business_id: staff.business_id,
      submitted_by: user.id,
      category,
      subject,
      message,
      status: "new",
    })
    .select("id")
    .single();

  if (insertError || !ticket) {
    console.error("Support insert failed:", insertError.message);
    return json(
      request,
      { error: "Could not save your support request." },
      500,
    );
  }

  const ticketId = ticket.id;

  const uploadedPaths: string[] = [];

  async function cleanupFailedSubmission() {
    if (uploadedPaths.length > 0) {
      const { error: storageCleanupError } = await admin.storage
        .from("support-screenshots")
        .remove(uploadedPaths);

      if (storageCleanupError) {
        console.error(
          "Screenshot cleanup failed:",
          storageCleanupError.message,
        );
      }
    }

    const { error: ticketCleanupError } = await admin
      .from("support_request")
      .delete()
      .eq("id", ticketId);

    if (ticketCleanupError) {
      console.error("Ticket cleanup failed:", ticketCleanupError.message);
    }
  }

  for (const screenshot of screenshots) {
    const extension =
      screenshot.type === "image/png"
        ? "png"
        : screenshot.type === "image/jpeg"
          ? "jpg"
          : "webp";

    const storagePath = `${staff.business_id}/${ticketId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await admin.storage
      .from("support-screenshots")
      .upload(storagePath, screenshot, {
        contentType: screenshot.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Screenshot upload failed:", uploadError.message);

      await cleanupFailedSubmission();

      return json(
        request,
        { error: "Could not upload screenshots. Please try again." },
        500,
      );
    }

    uploadedPaths.push(storagePath);

    const { error: attachmentError } = await admin
      .from("support_request_attachment")
      .insert({
        support_request_id: ticketId,
        storage_path: storagePath,
        file_name: screenshot.name.slice(0, 255),
      });

    if (attachmentError) {
      console.error("Attachment record failed:", attachmentError.message);

      await cleanupFailedSubmission();

      return json(
        request,
        { error: "Could not save screenshot details. Please try again." },
        500,
      );
    }
  }

  return json(request, {
    success: true,
    ticket_id: ticketId,
  });
});
