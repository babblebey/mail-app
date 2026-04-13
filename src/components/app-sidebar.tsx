"use client"

import * as React from "react"

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
import {
  InboxIcon,
  SendIcon,
  ClockIcon,
  FileTextIcon,
  AlertOctagonIcon,
  ArchiveIcon,
  Trash2Icon,
  SettingsIcon,
  CircleHelpIcon,
  MailIcon,
  SearchIcon,
} from "lucide-react"

const data = {
  user: {
    name: "John Doe",
    email: "john.doe@example.com",
    avatar: "",
  },
  navMain: [
    {
      title: "Inbox",
      url: "#",
      icon: <InboxIcon />,
      isActive: true,
      items: [
        {
          title: "All Messages",
          url: "#",
        },
        {
          title: "Already Read",
          url: "#",
        },
        {
          title: "Unreadable",
          url: "#",
        },
      ],
    },
    {
      title: "Sent",
      url: "#",
      icon: <SendIcon />,
    },
    {
      title: "Send later",
      url: "#",
      icon: <ClockIcon />,
    },
    {
      title: "Drafts",
      url: "#",
      icon: <FileTextIcon />,
    },
    {
      title: "Spam",
      url: "#",
      icon: <AlertOctagonIcon />,
    },
    {
      title: "Archive",
      url: "#",
      icon: <ArchiveIcon />,
    },
    {
      title: "Trash",
      url: "#",
      icon: <Trash2Icon />,
    },
  ],
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
        <NavMain items={data.navMain} />
        <NavProjects labels={data.labels} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
