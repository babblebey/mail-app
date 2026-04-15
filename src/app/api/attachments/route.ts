import { z } from "zod";
import { simpleParser } from "mailparser";

import { auth } from "~/server/auth";
import { withImapClient, resolveAccountId } from "~/server/imap/client";

const querySchema = z.object({
  folder: z.string().min(1),
  uid: z.coerce.number().int().positive(),
  index: z.coerce.number().int().nonnegative(),
  accountId: z.string().cuid().optional(),
  preview: z.literal("1").optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid parameters", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { folder, uid, index, accountId, preview } = parsed.data;

  const resolvedAccountId = await resolveAccountId(
    accountId,
    session.user.id,
  );

  return withImapClient(resolvedAccountId, session.user.id, async (client) => {
    await client.mailboxOpen(folder, { readOnly: true });

    const downloadResult = await client.download(
      uid.toString(),
      undefined,
      { uid: true },
    );

    const chunks: Uint8Array[] = [];
    for await (const chunk of downloadResult.content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    const rawSource = Buffer.concat(chunks);

    const message = await simpleParser(rawSource);

    const attachments = message.attachments ?? [];
    if (index >= attachments.length) {
      return Response.json(
        { error: "Attachment not found at the specified index" },
        { status: 404 },
      );
    }

    const attachment = attachments[index]!;
    const filename = attachment.filename ?? "unnamed";
    const disposition = preview === "1" ? "inline" : "attachment";

    return new Response(new Uint8Array(attachment.content), {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(attachment.size),
        "Content-Disposition": `${disposition}; filename="${filename}"`,
      },
    });
  });
}
