import { MailList } from "~/components/mail-list"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const folder = typeof params.folder === "string" ? params.folder : "INBOX"

  return <MailList folder={folder} />
}
