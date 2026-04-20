"use client"

import * as React from "react"
import { AppSidebar } from "~/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb"
import { Separator } from "~/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Button } from "~/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog"
import { Badge } from "~/components/ui/badge"
import { Skeleton } from "~/components/ui/skeleton"
import {
  MailAccountForm,
  type MailAccountFormValues,
} from "~/components/mail-account-form"
import {
  MailIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { cn } from "~/lib/utils"
import { api } from "~/trpc/react"

export default function SettingsPage() {
  const [showForm, setShowForm] = React.useState(false)
  const [editingAccount, setEditingAccount] = React.useState<{
    id: string
    values: Partial<MailAccountFormValues>
  } | null>(null)

  const accountsQuery = api.mailAccount.list.useQuery()
  const utils = api.useUtils()

  const deleteMutation = api.mailAccount.delete.useMutation({
    onSuccess: () => {
      void utils.mailAccount.list.invalidate()
    },
  })

  const setDefaultMutation = api.mailAccount.setDefault.useMutation({
    onMutate: async (variables) => {
      await utils.mailAccount.list.cancel()
      const previousAccounts = utils.mailAccount.list.getData()
      utils.mailAccount.list.setData(undefined, (old) =>
        old?.map((a) => ({ ...a, isDefault: a.id === variables.id }))
      )
      return { previousAccounts }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousAccounts) {
        utils.mailAccount.list.setData(undefined, context.previousAccounts)
      }
    },
    onSettled: () => {
      void utils.mailAccount.list.invalidate()
    },
  })

  const accounts = accountsQuery.data ?? []
  const hasAccounts = accounts.length > 0

  function handleEdit(account: (typeof accounts)[number]) {
    setEditingAccount({
      id: account.id,
      values: {
        label: account.label,
        email: account.email,
        imapHost: account.imapHost,
        imapPort: account.imapPort,
        imapTls: account.imapTls,
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        smtpTls: account.smtpTls,
        username: account.username,
        password: "",
      },
    })
    setShowForm(false)
  }

  function handleFormSuccess() {
    setShowForm(false)
    setEditingAccount(null)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingAccount(null)
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Mail Accounts</h1>
              <p className="text-sm text-muted-foreground">
                Manage your connected mail accounts and credentials.
              </p>
            </div>
            {hasAccounts && !showForm && !editingAccount && (
              <Button onClick={() => setShowForm(true)}>
                <PlusIcon data-icon="inline-start" />
                Add Account
              </Button>
            )}
          </div>

          {/* Add Account Form */}
          {showForm && (
            <Card>
              <CardHeader>
                <CardTitle>Add Mail Account</CardTitle>
                <CardDescription>
                  Enter your mail server credentials to connect a new account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MailAccountForm
                  onSuccess={handleFormSuccess}
                  onCancel={handleCancel}
                />
              </CardContent>
            </Card>
          )}

          {/* Edit Account Form */}
          {editingAccount && (
            <Card>
              <CardHeader>
                <CardTitle>Edit Mail Account</CardTitle>
                <CardDescription>
                  Update your mail server credentials. Leave password blank to
                  keep the current one.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MailAccountForm
                  accountId={editingAccount.id}
                  initialValues={editingAccount.values}
                  onSuccess={handleFormSuccess}
                  onCancel={handleCancel}
                />
              </CardContent>
            </Card>
          )}

          {/* Loading state */}
          {accountsQuery.isLoading && (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          )}

          {/* Onboarding prompt when no accounts exist */}
          {!accountsQuery.isLoading && !hasAccounts && !showForm && (
            <Card>
              <CardHeader className="items-center text-center">
                <div className="flex size-12 items-center justify-center mx-auto rounded-full bg-muted">
                  <MailIcon className="size-6 text-muted-foreground" />
                </div>
                <CardTitle>No mail accounts connected</CardTitle>
                <CardDescription>
                  Add your first mail account to start sending and receiving
                  email.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <Button onClick={() => setShowForm(true)}>
                  <PlusIcon data-icon="inline-start" />
                  Add Your First Account
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Account list */}
          {!accountsQuery.isLoading &&
            hasAccounts &&
            !showForm &&
            !editingAccount && (
              <div className="flex flex-col gap-4">
                {accounts.map((account) => (
                  <Card key={account.id} size="sm">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                          <MailIcon className="size-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <CardTitle>{account.label}</CardTitle>
                            {account.isDefault && (
                              <Badge variant="secondary">Default</Badge>
                            )}
                          </div>
                          <CardDescription>{account.email}</CardDescription>
                        </div>
                        <div className="flex items-center gap-1">
                          {!account.isDefault && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                setDefaultMutation.mutate({ id: account.id })
                              }
                              disabled={setDefaultMutation.isPending}
                            >
                              <StarIcon />
                              <span className="sr-only">Set as default</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(account)}
                          >
                            <PencilIcon />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <Trash2Icon />
                                <span className="sr-only">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete mail account
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove &quot;
                                  {account.label}&quot;? This action cannot be
                                  undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    deleteMutation.mutate({ id: account.id })
                                  }
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                        <span>
                          IMAP: {account.imapHost}:{account.imapPort}
                          {account.imapTls ? " (TLS)" : ""}
                        </span>
                        <span>
                          SMTP: {account.smtpHost}:{account.smtpPort}
                          {account.smtpTls ? " (TLS)" : ""}
                        </span>
                        <span>User: {account.username}</span>
                      </div>
                      <AccountSyncStatus accountId={account.id} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString()
}

function AccountSyncStatus({ accountId }: { accountId: string }) {
  const syncStatus = api.mail.getSyncStatus.useQuery(
    { accountId },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.status
        return status === "syncing" || status === "pending" ? 2000 : 30000
      },
    },
  )

  const triggerSync = api.mail.triggerSync.useMutation({
    onSuccess: () => {
      void syncStatus.refetch()
    },
  })

  const isSyncing =
    syncStatus.data?.status === "syncing" ||
    syncStatus.data?.status === "pending"

  return (
    <div className="mt-3 flex items-center gap-3 border-t pt-3">
      <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
        {syncStatus.data?.status === "error" ? (
          <>
            <span className="size-2 rounded-full bg-destructive" />
            <span className="text-destructive">
              Sync error: {syncStatus.data.error ?? "Unknown error"}
            </span>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCwIcon className="size-3.5 animate-spin" />
            <span>Syncing…</span>
          </>
        ) : (
          <>
            <span className="size-2 rounded-full bg-green-500" />
            <span>
              {syncStatus.data?.lastSyncCompletedAt
                ? `Last synced ${formatRelativeTime(syncStatus.data.lastSyncCompletedAt)}`
                : "Not synced yet"}
            </span>
          </>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={isSyncing || triggerSync.isPending}
        onClick={() => triggerSync.mutate({ accountId })}
      >
        <RefreshCwIcon
          className={cn("size-3.5", isSyncing && "animate-spin")}
        />
        {isSyncing ? "Syncing…" : "Sync Now"}
      </Button>
    </div>
  )
}
