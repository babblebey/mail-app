/**
 * Pure utility functions shared by mail-list and mail-thread components.
 * Extracted here so they can be unit-tested without mounting any React tree.
 */

export type Contact = { name: string; address: string }

// ---------------------------------------------------------------------------
// Folder classification
// ---------------------------------------------------------------------------

export function isSentFolder(folder: string): boolean {
  return folder.toLowerCase().includes("sent")
}

export function isDraftsFolder(folder: string): boolean {
  return folder.toLowerCase().includes("draft")
}

export function isTrashFolder(folder: string): boolean {
  const lower = folder.toLowerCase()
  return lower.includes("trash") || lower.includes("deleted")
}

export function isJunkFolder(folder: string): boolean {
  const lower = folder.toLowerCase()
  return lower.includes("junk") || lower.includes("spam")
}

// ---------------------------------------------------------------------------
// Recipient / sender display helpers
// ---------------------------------------------------------------------------

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function getRecipientName(contact: Contact): string {
  if (contact.name.trim()) {
    return contact.name.trim().split(/\s+/)[0]!
  }
  return contact.address.split("@")[0] ?? contact.address
}

export function getSenderName(contact: Contact): string {
  if (contact.name.trim()) {
    return contact.name.trim()
  }
  return contact.address.split("@")[0] ?? contact.address
}

export function getRecipientLabel(
  to: Contact[],
  cc: Contact[],
  bcc: Contact[],
): string {
  return `To: ${[...to, ...cc, ...bcc].map(getRecipientName).join(", ")}`
}

export function isRealRecipient(contact: Contact): boolean {
  return !contact.address.toLowerCase().startsWith("undisclosed-recipients")
}

export function getDraftRecipientLabel(
  to: Contact[],
  cc: Contact[],
  bcc: Contact[],
): string | null {
  const all = [...to, ...cc, ...bcc].filter(isRealRecipient)
  if (all.length === 0) return null
  return all.map(getRecipientName).join(", ")
}

// ---------------------------------------------------------------------------
// Mixed-folder message classification
// Used when a folder holds both inbox, sent, and draft items (e.g. Trash, Junk).
// ---------------------------------------------------------------------------

export function classifyMixedFolderEmail(
  mail: {
    flags: string[]
    from: Contact
    to: Contact[]
    cc: Contact[]
    bcc: Contact[]
  },
  userEmails: string[],
): "inbox" | "sent" | "drafts" {
  if (mail.flags.includes("\\Draft")) return "drafts"
  const fromLower = mail.from.address.toLowerCase()
  if (userEmails.includes(fromLower)) {
    const hasRealRecipients =
      [...mail.to, ...mail.cc, ...mail.bcc].filter(isRealRecipient).length > 0
    return hasRealRecipients ? "sent" : "drafts"
  }
  return "inbox"
}

// ---------------------------------------------------------------------------
// Selection state helpers
// Used to derive the select-all checkbox state shown in MailListToolbar.
// ---------------------------------------------------------------------------

/**
 * Returns the checked state for the "select all" checkbox:
 * - `false`           → nothing selected
 * - `"indeterminate"` → some selected
 * - `true`            → all selected
 */
export function computeSelectAllChecked(
  selectedCount: number,
  totalCount: number,
): true | "indeterminate" | false {
  if (selectedCount === 0) return false
  if (selectedCount === totalCount) return true
  return "indeterminate"
}

/**
 * Toggles an item ID in a Set, returning a new Set.
 */
export function toggleSelectItem(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

// ---------------------------------------------------------------------------
// Optimistic unread-count helpers
// ---------------------------------------------------------------------------

/**
 * Computes the unread-count delta for a single read-state transition.
 * - unread -> read:  -1
 * - read   -> unread: +1
 * - no-op transition: 0
 */
export function getUnreadDeltaForReadToggle(
  currentRead: boolean,
  nextRead: boolean,
): number {
  if (currentRead === nextRead) return 0
  return nextRead ? -1 : 1
}

/**
 * Applies an unread delta to a count and clamps at 0.
 * Undefined/null counts are preserved because some providers may omit unread.
 */
export function applyUnreadDeltaWithClamp(
  currentUnread: number | null | undefined,
  delta: number,
): number | null | undefined {
  if (typeof currentUnread !== "number") return currentUnread
  return Math.max(0, currentUnread + delta)
}
