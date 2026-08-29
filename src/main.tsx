import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { isTauri } from './settings'
import './index.css'

// Inside Tauri the window is deliberately transparent, so the desktop shows
// through and the opacity slider means something. Everywhere else there is
// nothing behind the page but the browser's own canvas, which is white — and
// on an iOS home-screen app that canvas is visible, because the layout
// viewport stops above the home indicator even though the app is drawn
// full-bleed at the top. That gap was the white band along the bottom edge.
if (!isTauri()) document.documentElement.dataset.web = 'true'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
