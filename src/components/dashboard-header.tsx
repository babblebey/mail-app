"use client"

import { usePathname, useSearchParams } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb"
import { Separator } from "~/components/ui/separator"
import { SidebarTrigger } from "~/components/ui/sidebar"

export function DashboardHeader() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const folder = searchParams.get("folder") ?? "INBOX"
  const folderLabel =
    folder.charAt(0).toUpperCase() + folder.slice(1).toLowerCase()

  const isThread = pathname.startsWith("/dashboard/mail/")
  const isSettings = pathname === "/dashboard/settings"

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {isSettings ? (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : isThread ? (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Mail</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink
                    href={`/dashboard?folder=${encodeURIComponent(folder)}`}
                  >
                    {folderLabel}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Thread</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Mail</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{folderLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  )
}
