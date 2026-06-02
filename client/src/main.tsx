import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/base.css'
import './styles/atmosphere.css'
import { SidebarProvider } from './contexts/SidebarProvider'
import { TitlePreferenceProvider } from './contexts/TitlePreferenceContext'
import { LowEndModeProvider } from './contexts/LowEndModeContext'
import { AuthProvider } from './contexts/AuthContext'
import { WatchQueueProvider } from './contexts/WatchQueueContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <SidebarProvider>
          <TitlePreferenceProvider>
            <LowEndModeProvider>
              <AuthProvider>
                <WatchQueueProvider>
                  <App />
                </WatchQueueProvider>
              </AuthProvider>
            </LowEndModeProvider>
          </TitlePreferenceProvider>
        </SidebarProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)
