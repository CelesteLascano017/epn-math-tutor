import { HeroUIProvider } from '@heroui/react'
import type { ReactNode } from 'react'

import { ChatProvider } from '@/store/ChatProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'

/**
 * Composes every app-wide provider in one place:
 *   HeroUIProvider  -> HeroUI components + overlay/portal context
 *   ThemeProvider   -> dark/light class management
 *   ChatProvider    -> chat state + backend orchestration
 *
 * Order matters: ChatProvider is innermost so components can use both theme
 * and chat, and HeroUI overlays render within the themed root.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <HeroUIProvider>
      <ThemeProvider>
        <ChatProvider>{children}</ChatProvider>
      </ThemeProvider>
    </HeroUIProvider>
  )
}
