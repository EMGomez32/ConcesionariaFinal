import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
// Tipografías AUTOALOJADAS (antes venían de Google Fonts: cada visita mandaba la IP y el
// user-agent del visitante a Google, PRIV-18). Mismas familias y pesos que pedía el <link>
// de index.html: Inter 400–900, Space Grotesk 400–700, JetBrains Mono 500 y 700. Cada CSS
// por peso declara todos los subsets con `unicode-range`, igual que la hoja de Google: el
// navegador sólo baja el subset que usa la página (latin para el castellano). Vite copia
// los .woff2 a dist/assets con hash, así que salen same-origin y con cache largo.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/inter/900.css'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import './index.css'
import { queryClient } from './api/queryClient'
import { HelmetProvider } from 'react-helmet-async'
import { recargarPorVersionNueva } from './components/errorDeCarga'
// Se carga de entrada (y no recién con el TopBar) para que el tema siga los cambios
// del sistema también en las pantallas públicas.
import './store/themeStore'

// Vite avisa con este evento cuando no puede precargar un chunk (pasa después de
// un deploy: la pestaña pide archivos que ya no existen). Se recarga una vez para
// traer la versión nueva; si ya se recargó hace poco, se deja seguir el error y lo
// muestra la ErrorBoundary ("Hay una versión nueva, recargá").
window.addEventListener('vite:preloadError', (event) => {
  if (recargarPorVersionNueva()) event.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
)
