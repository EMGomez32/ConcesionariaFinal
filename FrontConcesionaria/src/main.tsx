import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'
import { useUIStore } from './store/uiStore'
import { HelmetProvider } from 'react-helmet-async'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: unknown) => {
      const message = (error as { message?: string })?.message || 'Error al cargar los datos';
      useUIStore.getState().addToast(message, 'error');
    },
  }),
  mutationCache: new MutationCache({
    onError: (error: unknown) => {
      const message = (error as { message?: string })?.message || 'Error al realizar la operación';
      useUIStore.getState().addToast(message, 'error');
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
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
