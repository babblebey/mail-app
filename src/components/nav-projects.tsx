"use client"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"

export function NavProjects({
  labels,
}: {
  labels: {
    name: string
    url: string
    color: string
    count: number
  }[]
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Labels</SidebarGroupLabel>
      <SidebarMenu>
        {labels.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild>
              <a href={item.url}>
                <span className={`size-2 shrink-0 rounded-full ${item.color}`} />
                <span>{item.name}</span>
              </a>
            </SidebarMenuButton>
            <SidebarMenuBadge>{item.count}</SidebarMenuBadge>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
