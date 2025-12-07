import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
// import './index.css' // We don't have this yet, skipping

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
