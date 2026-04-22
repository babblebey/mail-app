import { MailThreadView } from "~/components/mail-thread"

export default async function MailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const folder = typeof sp.folder === "string" ? sp.folder : "INBOX"

  return <MailThreadView uid={Number(id)} folder={folder} />
}
