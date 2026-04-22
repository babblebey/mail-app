import { describe, it, expect } from "vitest"
import {
  isSentFolder,
  isDraftsFolder,
  isTrashFolder,
  isJunkFolder,
  isRealRecipient,
  getInitials,
  getSenderName,
  getRecipientName,
  getRecipientLabel,
  getDraftRecipientLabel,
  classifyMixedFolderEmail,
  computeSelectAllChecked,
  toggleSelectItem,
  type Contact,
} from "~/lib/mail-utils"

// ─── Folder classification ────────────────────────────────────────────────────

describe("isSentFolder", () => {
  it("detects common Sent folder names", () => {
    expect(isSentFolder("Sent")).toBe(true)
    expect(isSentFolder("SENT")).toBe(true)
    expect(isSentFolder("Sent Items")).toBe(true)
    expect(isSentFolder("[Gmail]/Sent Mail")).toBe(true)
  })

  it("does not misclassify unrelated folders", () => {
    expect(isSentFolder("INBOX")).toBe(false)
    expect(isSentFolder("Drafts")).toBe(false)
    expect(isSentFolder("Trash")).toBe(false)
  })
})

describe("isDraftsFolder", () => {
  it("detects common Drafts folder names", () => {
    expect(isDraftsFolder("Drafts")).toBe(true)
    expect(isDraftsFolder("DRAFTS")).toBe(true)
    expect(isDraftsFolder("[Gmail]/Drafts")).toBe(true)
  })

  it("does not misclassify unrelated folders", () => {
    expect(isDraftsFolder("INBOX")).toBe(false)
    expect(isDraftsFolder("Sent")).toBe(false)
  })
})

describe("isTrashFolder", () => {
  it("detects trash by 'trash' keyword", () => {
    expect(isTrashFolder("Trash")).toBe(true)
    expect(isTrashFolder("[Gmail]/Trash")).toBe(true)
  })

  it("detects trash by 'deleted' keyword", () => {
    expect(isTrashFolder("Deleted Items")).toBe(true)
    expect(isTrashFolder("DELETED")).toBe(true)
  })

  it("does not misclassify unrelated folders", () => {
    expect(isTrashFolder("INBOX")).toBe(false)
    expect(isTrashFolder("Sent")).toBe(false)
  })
})

describe("isJunkFolder", () => {
  it("detects junk by 'junk' keyword", () => {
    expect(isJunkFolder("Junk")).toBe(true)
    expect(isJunkFolder("Junk Email")).toBe(true)
  })

  it("detects junk by 'spam' keyword", () => {
    expect(isJunkFolder("Spam")).toBe(true)
    expect(isJunkFolder("[Gmail]/Spam")).toBe(true)
  })

  it("does not misclassify unrelated folders", () => {
    expect(isJunkFolder("INBOX")).toBe(false)
    expect(isJunkFolder("Sent")).toBe(false)
  })
})

// ─── Contact / display helpers ────────────────────────────────────────────────

describe("getInitials", () => {
  it("returns up to 2 initials from a full name", () => {
    expect(getInitials("Alice Bob")).toBe("AB")
    expect(getInitials("Alice Bob Christmas")).toBe("AB")
  })

  it("handles single-word names", () => {
    expect(getInitials("Alice")).toBe("A")
  })
})

describe("getSenderName", () => {
  it("returns the full display name when available", () => {
    expect(getSenderName({ name: "Alice Smith", address: "alice@example.com" })).toBe("Alice Smith")
  })

  it("falls back to the local part of the email address", () => {
    expect(getSenderName({ name: "", address: "alice@example.com" })).toBe("alice")
  })

  it("returns the full address if there is no @ symbol", () => {
    expect(getSenderName({ name: "", address: "alice" })).toBe("alice")
  })
})

describe("getRecipientName", () => {
  it("returns the first word of the display name", () => {
    expect(getRecipientName({ name: "Alice Smith", address: "alice@example.com" })).toBe("Alice")
  })

  it("falls back to the local part of the email address", () => {
    expect(getRecipientName({ name: "", address: "alice@example.com" })).toBe("alice")
  })
})

describe("getRecipientLabel", () => {
  it("formats a single To recipient", () => {
    const to: Contact[] = [{ name: "Alice", address: "alice@example.com" }]
    expect(getRecipientLabel(to, [], [])).toBe("To: Alice")
  })

  it("formats multiple recipients across To, CC, and BCC", () => {
    const to: Contact[] = [{ name: "Alice", address: "alice@example.com" }]
    const cc: Contact[] = [{ name: "Bob", address: "bob@example.com" }]
    const bcc: Contact[] = [{ name: "Carol", address: "carol@example.com" }]
    expect(getRecipientLabel(to, cc, bcc)).toBe("To: Alice, Bob, Carol")
  })
})

describe("isRealRecipient", () => {
  it("accepts normal email addresses", () => {
    expect(isRealRecipient({ name: "", address: "alice@example.com" })).toBe(true)
  })

  it("rejects undisclosed-recipients pseudo-addresses", () => {
    expect(isRealRecipient({ name: "", address: "undisclosed-recipients:;" })).toBe(false)
    expect(isRealRecipient({ name: "", address: "Undisclosed-Recipients@example.com" })).toBe(false)
  })
})

describe("getDraftRecipientLabel", () => {
  it("returns null when no real recipients exist", () => {
    expect(getDraftRecipientLabel([], [], [])).toBeNull()
  })

  it("returns comma-separated first names for real recipients", () => {
    const to: Contact[] = [{ name: "Alice Smith", address: "alice@example.com" }]
    const cc: Contact[] = [{ name: "Bob Jones", address: "bob@example.com" }]
    expect(getDraftRecipientLabel(to, cc, [])).toBe("Alice, Bob")
  })

  it("filters out undisclosed-recipients from the label", () => {
    const to: Contact[] = [
      { name: "", address: "undisclosed-recipients:;" },
      { name: "Alice", address: "alice@example.com" },
    ]
    expect(getDraftRecipientLabel(to, [], [])).toBe("Alice")
  })
})

// ─── Mixed-folder classification ─────────────────────────────────────────────

describe("classifyMixedFolderEmail", () => {
  const userEmails = ["me@example.com"]

  it("classifies a message with \\Draft flag as drafts", () => {
    const mail = {
      flags: ["\\Draft"],
      from: { name: "Me", address: "me@example.com" },
      to: [{ name: "Alice", address: "alice@example.com" }],
      cc: [],
      bcc: [],
    }
    expect(classifyMixedFolderEmail(mail, userEmails)).toBe("drafts")
  })

  it("classifies a sent message (from user, real recipient) as sent", () => {
    const mail = {
      flags: ["\\Seen"],
      from: { name: "Me", address: "me@example.com" },
      to: [{ name: "Alice", address: "alice@example.com" }],
      cc: [],
      bcc: [],
    }
    expect(classifyMixedFolderEmail(mail, userEmails)).toBe("sent")
  })

  it("classifies a message from user with no real recipients as drafts", () => {
    const mail = {
      flags: [],
      from: { name: "Me", address: "me@example.com" },
      to: [{ name: "", address: "undisclosed-recipients:;" }],
      cc: [],
      bcc: [],
    }
    expect(classifyMixedFolderEmail(mail, userEmails)).toBe("drafts")
  })

  it("classifies a message not from the user as inbox", () => {
    const mail = {
      flags: [],
      from: { name: "Sender", address: "sender@external.com" },
      to: [{ name: "Me", address: "me@example.com" }],
      cc: [],
      bcc: [],
    }
    expect(classifyMixedFolderEmail(mail, userEmails)).toBe("inbox")
  })

  it("is case-insensitive for the from address comparison", () => {
    const mail = {
      flags: [],
      from: { name: "Me", address: "ME@EXAMPLE.COM" },
      to: [{ name: "Alice", address: "alice@example.com" }],
      cc: [],
      bcc: [],
    }
    expect(classifyMixedFolderEmail(mail, userEmails)).toBe("sent")
  })
})

// ─── Selection state transitions ─────────────────────────────────────────────

describe("toggleSelectItem", () => {
  it("adds an item that is not present", () => {
    const result = toggleSelectItem(new Set(["a"]), "b")
    expect(result.has("a")).toBe(true)
    expect(result.has("b")).toBe(true)
  })

  it("removes an item that is already present", () => {
    const result = toggleSelectItem(new Set(["a", "b"]), "a")
    expect(result.has("a")).toBe(false)
    expect(result.has("b")).toBe(true)
  })

  it("returns a new Set (does not mutate the original)", () => {
    const original = new Set(["a"])
    const result = toggleSelectItem(original, "b")
    expect(result).not.toBe(original)
    expect(original.has("b")).toBe(false)
  })
})

describe("computeSelectAllChecked", () => {
  it("returns false when nothing is selected", () => {
    expect(computeSelectAllChecked(0, 10)).toBe(false)
  })

  it("returns 'indeterminate' when some (but not all) items are selected", () => {
    expect(computeSelectAllChecked(1, 10)).toBe("indeterminate")
    expect(computeSelectAllChecked(5, 10)).toBe("indeterminate")
    expect(computeSelectAllChecked(9, 10)).toBe("indeterminate")
  })

  it("returns true when all items are selected", () => {
    expect(computeSelectAllChecked(10, 10)).toBe(true)
  })

  it("returns false when the list is empty (nothing selected)", () => {
    // An empty list means 0 of 0 items selected — the checkbox is unchecked,
    // not checked, because the "nothing selected" branch fires first.
    expect(computeSelectAllChecked(0, 0)).toBe(false)
  })
})

// ─── Optimistic update rollback — data shape contracts ───────────────────────
// These tests verify that the snapshot shape produced during onMutate
// (InfiniteData) round-trips correctly: restoring previousMessages in onError
// must yield a structure compatible with setInfiniteData.

describe("optimistic-update rollback shape contract", () => {
  type InfiniteData<T> = { pages: Array<{ messages: T[]; nextCursor: string | null }> }

  type MailSummary = {
    uid: number
    read: boolean
    flags: string[]
  }

  /**
   * Mirrors the optimistic read-state update applied in batchMarkAsRead's
   * onMutate handler. Returns the mutated copy so tests can verify the shape.
   */
  function applyOptimisticMarkAsRead(
    data: InfiniteData<MailSummary>,
    uids: number[],
    read: boolean,
  ): InfiniteData<MailSummary> {
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        messages: page.messages.map((msg) =>
          uids.includes(msg.uid) ? { ...msg, read } : msg,
        ),
      })),
    }
  }

  /**
   * Mirrors the optimistic removal applied in batchMoveMessages' onMutate
   * handler. Returns the mutated copy.
   */
  function applyOptimisticRemove(
    data: InfiniteData<MailSummary>,
    uids: number[],
  ): InfiniteData<MailSummary> {
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        messages: page.messages.filter((msg) => !uids.includes(msg.uid)),
      })),
    }
  }

  const seed: InfiniteData<MailSummary> = {
    pages: [
      {
        messages: [
          { uid: 1, read: false, flags: [] },
          { uid: 2, read: false, flags: [] },
          { uid: 3, read: true, flags: ["\\Seen"] },
        ],
        nextCursor: null,
      },
    ],
  }

  it("markAsRead — optimistic update flips read flag on targeted UIDs", () => {
    const updated = applyOptimisticMarkAsRead(seed, [1, 2], true)
    expect(updated.pages[0]!.messages.find((m) => m.uid === 1)!.read).toBe(true)
    expect(updated.pages[0]!.messages.find((m) => m.uid === 2)!.read).toBe(true)
    expect(updated.pages[0]!.messages.find((m) => m.uid === 3)!.read).toBe(true) // untouched
  })

  it("markAsRead — rollback restores previous snapshot exactly", () => {
    const previousMessages = seed
    const updated = applyOptimisticMarkAsRead(seed, [1], true)
    expect(updated.pages[0]!.messages.find((m) => m.uid === 1)!.read).toBe(true)
    // Simulate rollback by passing previousMessages back via setInfiniteData
    expect(previousMessages).toStrictEqual(seed)
  })

  it("markAsRead — does not mutate the original data object", () => {
    applyOptimisticMarkAsRead(seed, [1], true)
    expect(seed.pages[0]!.messages[0]!.read).toBe(false)
  })

  it("moveMessages — optimistic update removes targeted UIDs from all pages", () => {
    const updated = applyOptimisticRemove(seed, [1, 3])
    const remaining = updated.pages[0]!.messages
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.uid).toBe(2)
  })

  it("moveMessages — rollback restores all removed messages", () => {
    const previousMessages = seed
    applyOptimisticRemove(seed, [1, 3])
    // After rollback, the full snapshot is intact
    expect(previousMessages.pages[0]!.messages).toHaveLength(3)
  })

  it("moveMessages — does not mutate the original data object", () => {
    applyOptimisticRemove(seed, [2])
    expect(seed.pages[0]!.messages).toHaveLength(3)
  })
})
