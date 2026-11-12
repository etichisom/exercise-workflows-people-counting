import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { App } from './App'
import { initialTheme } from './hooks'
import './index.css'

// Apply the theme before the first render to avoid a light flash in dark mode.
document.documentElement.classList.toggle('dark', initialTheme() === 'dark')

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <TooltipProvider delayDuration={150}>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
