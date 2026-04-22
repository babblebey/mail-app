import { redirect } from "next/navigation"

import { auth } from "~/server/auth"
import { AppSidebar } from "~/components/app-sidebar"
import { DashboardHeader } from "~/components/dashboard-header"
import {
  SidebarInset,
  SidebarProvider,
} from "~/components/ui/sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
