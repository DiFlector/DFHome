import { Boxes, LayoutDashboard, Home, Store, Settings, House } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const nav = [
  { title: "Дашборд", to: "/", icon: LayoutDashboard, end: true },
  { title: "План дома", to: "/plan", icon: Home, end: false },
  { title: "Устройства", to: "/devices", icon: Boxes, end: false },
  { title: "Магазин", to: "/store", icon: Store, end: false },
  { title: "Настройки", to: "/settings", icon: Settings, end: false },
]

export function AppSidebar() {
  const { pathname } = useLocation()

  const isActive = (to: string, end: boolean) =>
    end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <House className="size-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-heading text-base font-semibold">DFHome</span>
            <span className="text-muted-foreground text-xs">Умный дом</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Навигация</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    render={<NavLink to={item.to} end={item.end} />}
                    isActive={isActive(item.to, item.end)}
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
