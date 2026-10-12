import { createRoot } from 'react-dom/client'
import { Analytics, AnalyticsPreferences } from '../../components/analytics/Analytics'
import '../../app/globals.css'

const mismatch = new URLSearchParams(location.search).has('mismatch')
history.replaceState(null, '', '/blog/article')
const config = { measurementId: 'G-TEST123', origin: mismatch ? 'https://canonical.example' : location.origin }
createRoot(document.getElementById('root')!).render(<>
  <main className="min-h-[150vh] p-4"><h1>Public article</h1></main>
  <footer className="p-8">
    <form onSubmit={event => event.preventDefault()}><label>Email<input type="email" /></label><button type="submit">Subscribe</button></form>
    <AnalyticsPreferences config={config} />
  </footer>
  <Analytics config={config} />
</>)
