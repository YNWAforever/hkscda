import { createHash } from "node:crypto";
import { z } from "zod";
import { readBoundedFormData } from "../http/boundedFormData.server";
import { createSupabaseServiceClient, requireAdmin } from "../donations/supabase.server";
import { requireVerifiedVolunteer } from "../volunteers/policy/booking.repository.server";
const metadata = z
  .object({
    application_id: z.string().uuid(),
    expected_revision: z.coerce.number().int().positive(),
    idempotency_key: z.string().uuid(),
  })
  .strict();
const MAX_MULTIPART_BYTES = 11 * 1024 * 1024;
const INTENT_LIFETIME_MS = 24 * 60 * 60 * 1000;

export async function readBoundedInternshipFormData(request: Request): Promise<FormData | null> {
  return readBoundedFormData(request, MAX_MULTIPART_BYTES);
}
export async function internshipAttachment(
  request: Request,
  createClient: typeof createSupabaseServiceClient = createSupabaseServiceClient,
  now = () => new Date(),
) {
  const client = createClient();
  try {
    const actor = await requireVerifiedVolunteer(request, client);
    if (request.method === "GET") {
      const id = z.string().uuid().parse(new URL(request.url).searchParams.get("id"));
      const { data: file, error } = await client
        .from("internship_attachment")
        .select("object_path,application:internship_application(applicant_id)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!file) return new Response(null, { status: 404 });
      const row = file as unknown as { object_path: string; application: { applicant_id: string } };
      if (row.application.applicant_id !== actor)
        await requireAdmin(request, ["staff", "admin"], client);
      const { data, error: signError } = await client.storage
        .from("internship-private")
        .createSignedUrl(row.object_path, 60);
      if (signError) throw signError;
      return Response.json({ url: data.signedUrl }, { headers: { "cache-control": "no-store" } });
    }
    const form = await readBoundedInternshipFormData(request);
    if (!form) return new Response(null, { status: 413 });
    const input = metadata.parse({
      application_id: form.get("application_id"),
      expected_revision: form.get("expected_revision"),
      idempotency_key: form.get("idempotency_key"),
    });
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size < 1 ||
      file.size > 10 * 1024 * 1024 ||
      !["application/pdf", "image/jpeg", "image/png"].includes(file.type)
    )
      return Response.json({ error: "附件須為10MB以內PDF、JPEG或PNG" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid =
      file.type === "application/pdf"
        ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
        : file.type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    if (!valid) return Response.json({ error: "附件內容與格式不符" }, { status: 400 });
    const { data: app, error: readError } = await client
      .from("internship_application")
      .select("id,applicant_id,status,revision")
      .eq("id", input.application_id)
      .maybeSingle();
    if (readError) throw readError;
    if (!app || app.applicant_id !== actor) return new Response(null, { status: 403 });
    const path = `${actor}/${app.id}/${input.idempotency_key}`;
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const command = {
      action: "attach",
      ...input,
      object_path: path,
      content_hash: contentHash,
      label: file.name.slice(0, 150),
      mime_type: file.type,
      byte_size: file.size,
    };
    const { data: prior, error: priorError } = await client
      .from("internship_command_result")
      .select("key")
      .eq("actor", actor)
      .eq("key", input.idempotency_key)
      .maybeSingle();
    if (priorError) throw priorError;
    if (!prior) {
      if (
        app.revision !== input.expected_revision ||
        !["submitted", "needs_information"].includes(app.status)
      )
        return Response.json({ error: "申請已變更，請重新載入" }, { status: 409 });
      const { error: intentError } = await client
        .from("internship_attachment_upload_intent")
        .upsert(
          {
            storage_path: path,
            application_id: app.id,
            actor,
            expires_at: new Date(now().getTime() + INTENT_LIFETIME_MS).toISOString(),
          },
          { onConflict: "storage_path", ignoreDuplicates: true },
        );
      if (intentError) throw intentError;
      const { data: intent, error: intentReadError } = await client
        .from("internship_attachment_upload_intent")
        .select("cleanup_claimed_at")
        .eq("storage_path", path)
        .maybeSingle();
      if (intentReadError) throw intentReadError;
      if (!intent || intent.cleanup_claimed_at)
        return Response.json({ error: "附件上載正在清理，請稍後重試" }, { status: 409 });
      const { error: uploadError } = await client.storage
        .from("internship-private")
        .upload(path, bytes, { contentType: file.type, upsert: false });
      if (uploadError) {
        if (!("statusCode" in uploadError && String(uploadError.statusCode) === "409"))
          throw uploadError;
        const { data: stored, error: downloadError } = await client.storage
          .from("internship-private")
          .download(path);
        if (downloadError) throw downloadError;
        if (
          createHash("sha256")
            .update(new Uint8Array(await stored.arrayBuffer()))
            .digest("hex") !== contentHash
        )
          return Response.json({ error: "同一重試識別不可改用另一附件" }, { status: 409 });
      }
    }
    const { data, error } = await client.rpc("internship_command", {
      p_actor: actor,
      p_command: command,
    });
    if (error) throw error;
    return Response.json(data, {
      status: data.kind === "conflict" ? 409 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError)
      return Response.json({ error: "附件資料無效" }, { status: 400 });
    console.error("Internship private attachment failed", error);
    return Response.json({ error: "未能處理私人附件" }, { status: 500 });
  }
}
