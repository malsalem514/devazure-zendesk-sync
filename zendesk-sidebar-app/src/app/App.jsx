import { Suspense, lazy } from 'react'
import { DEFAULT_THEME, ThemeProvider } from '@zendeskgarden/react-theming'
import { useLocation } from './hooks/useClient.js'
import { TranslationProvider } from './contexts/TranslationProvider.jsx'

const TicketSideBar = lazy(() => import('./locations/TicketSideBar.jsx'))

const LOCATIONS = {
  ticket_sidebar: TicketSideBar,
  default: () => null
}

function App() {
  const location = useLocation()
  const Location = LOCATIONS[location] || LOCATIONS.default

  return (
    <ThemeProvider theme={{ ...DEFAULT_THEME }}>
      <TranslationProvider>
        <Suspense fallback={<span>Loading...</span>}>
          <Location />
        </Suspense>
      </TranslationProvider>
    </ThemeProvider>
  )
}

export default App
