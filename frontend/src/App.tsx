import { Route, Routes, useLocation } from "react-router-dom"

import { AppSidebar } from "@/components/layout/AppSidebar"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import Dashboard from "@/pages/Dashboard"
import Devices from "@/pages/Devices"
import Plan from "@/pages/Plan"
import Settings from "@/pages/Settings"
import Store from "@/pages/Store"

const titles: Record<string, string> = {
  "/": "Дашборд",
  "/plan": "План дома",
  "/devices": "Устройства",
  "/store": "Магазин интеграций",
  "/settings": "Настройки",
}

function Header() {
  const { pathname } = useLocation()
  const title = titles[pathname] ?? "DFHome"

  return (
    <header className="bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <h1 className="font-heading text-lg font-semibold">{title}</h1>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  )
}

export function App() {
  return (
    <TooltipProvider delay={200}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Header />
          <div className="flex-1 p-4 md:p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/store" element={<Store />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  )
}

export default App
