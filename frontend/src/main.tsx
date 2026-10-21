import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { notification } from 'antd'
import './index.css'
import App from './App.tsx'

notification.config({
  placement: 'bottomRight',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

