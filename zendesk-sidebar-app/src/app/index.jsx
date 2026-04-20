import ReactDOM from 'react-dom/client'
import '@zendeskgarden/css-bedrock'
import './index.css'
import App from './App.jsx'
import { ClientProvider } from './contexts/ClientProvider.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <ClientProvider>
    <App />
  </ClientProvider>
)
