import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
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
