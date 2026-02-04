import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './web3config' // 初始化 AppKit

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
