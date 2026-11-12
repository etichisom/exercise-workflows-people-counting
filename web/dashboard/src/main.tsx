import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import { App } from './App'
// Imported after App so page styles follow the vendored Hub widget CSS and
// win at equal specificity without editing the vendored files.
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(<StrictMode><App /></StrictMode>)
