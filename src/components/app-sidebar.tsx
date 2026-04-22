"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { NavMain } from "~/components/nav-main"
import { NavProjects } from "~/components/nav-projects"
import { NavSecondary } from "~/components/nav-secondary"
import { NavUser } from "~/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import { Skeleton } from "~/components/ui/skeleton"
import {
  InboxIcon,
  SendIcon,
  FileTextIcon,
  AlertOctagonIcon,
  ArchiveIcon,
  Trash2Icon,
  SettingsIcon,
  CircleHelpIcon,
  MailIcon,
  SearchIcon,
  FolderIcon,
  RefreshCwIcon,
  AlertCircleIcon,
} from "lucide-react"
import { api } from "~/trpc/react"

/** Maps IMAP special-use flags to icons. */
const SPECIAL_USE_ICONS: Record<string, React.ReactNode> = {
  "\\Inbox": <InboxIcon />,
  "\\Sent": <SendIcon />,
  "\\Drafts": <FileTextIcon />,
  "\\Junk": <AlertOctagonIcon />,
  "\\Trash": <Trash2Icon />,
  "\\Archive": <ArchiveIcon />,
}

const data = {
  user: {
    name: "John Doe",
    email: "john.doe@example.com",
    avatar: "",
  },
  navSecondary: [
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: <SettingsIcon />,
    },
    {
      title: "Help Center",
      url: "#",
      icon: <CircleHelpIcon />,
    },
  ],
  labels: [
    {
      name: "Billing & Payments",
      url: "#",
      color: "bg-green-500",
      count: 31,
    },
    {
      name: "Project Updates",
      url: "#",
      color: "bg-orange-500",
      count: 19,
    },
    {
      name: "Client Inquiries",
      url: "#",
      color: "bg-blue-500",
      count: 22,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const searchParams = useSearchParams()
  const currentFolder = searchParams.get("folder") ?? "INBOX"

  const foldersQuery = api.mail.listFolders.useQuery({})

  const navItems = React.useMemo(() => {
    if (!foldersQuery.data) return []

    return foldersQuery.data.map((folder) => ({
      title: folder.name.charAt(0).toUpperCase() + folder.name.slice(1).toLowerCase(),
      url: `/dashboard?folder=${encodeURIComponent(folder.path)}`,
      icon: folder.specialUse
        ? (SPECIAL_USE_ICONS[folder.specialUse] ?? <FolderIcon />)
        : <FolderIcon />,
      isActive: folder.path === currentFolder,
      badge: folder.unseenMessages,
    }))
  }, [foldersQuery.data, currentFolder])
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <MailIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Mail App</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <form>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 opacity-50" />
            <SidebarInput placeholder="Search..." className="pl-8" />
          </div>
        </form>
      </SidebarHeader>
      <SidebarContent>
        {foldersQuery.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
        ) : foldersQuery.isError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground">
            <AlertCircleIcon className="size-5 text-destructive" />
            <p>Failed to load folders</p>
            <button
              onClick={() => foldersQuery.refetch()}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <RefreshCwIcon className="size-3" />
              Retry
            </button>
          </div>
        ) : (
          <NavMain items={navItems} />
        )}
        <NavProjects labels={data.labels} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
