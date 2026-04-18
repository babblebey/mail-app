-- CreateTable
CREATE TABLE "MailFolder" (
    "id" TEXT NOT NULL,
    "mailAccountId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialUse" TEXT,
    "delimiter" TEXT,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "unseenMessages" INTEGER NOT NULL DEFAULT 0,
    "uidValidity" INTEGER,
    "highestUid" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "MailFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "mailAccountId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "uid" INTEGER NOT NULL,
    "messageId" TEXT,
    "subject" TEXT,
    "fromAddress" JSONB NOT NULL,
    "toAddress" JSONB NOT NULL,
    "ccAddress" JSONB,
    "bccAddress" JSONB,
    "date" TIMESTAMP(3),
    "flags" TEXT[],
    "read" BOOLEAN NOT NULL DEFAULT false,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "snippet" TEXT,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "inReplyTo" TEXT,
    "references" TEXT[],
    "bodyFetched" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailMessageBody" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "textBody" TEXT,
    "htmlBody" TEXT,
    "attachments" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailMessageBody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "mailAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "error" TEXT,
    "lastSyncStartedAt" TIMESTAMP(3),
    "lastSyncCompletedAt" TIMESTAMP(3),

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailFolder_mailAccountId_path_key" ON "MailFolder"("mailAccountId", "path");

-- CreateIndex
CREATE INDEX "MailMessage_mailAccountId_idx" ON "MailMessage"("mailAccountId");

-- CreateIndex
CREATE INDEX "MailMessage_folderId_date_idx" ON "MailMessage"("folderId", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_folderId_uid_key" ON "MailMessage"("folderId", "uid");

-- CreateIndex
CREATE UNIQUE INDEX "MailMessageBody_messageId_key" ON "MailMessageBody"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_mailAccountId_key" ON "SyncState"("mailAccountId");

-- AddForeignKey
ALTER TABLE "MailFolder" ADD CONSTRAINT "MailFolder_mailAccountId_fkey" FOREIGN KEY ("mailAccountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_mailAccountId_fkey" FOREIGN KEY ("mailAccountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MailFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessageBody" ADD CONSTRAINT "MailMessageBody_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_mailAccountId_fkey" FOREIGN KEY ("mailAccountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
