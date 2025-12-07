// ui/index.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) {
  const div = document.createElement('div');
  div.id = 'root';
  document.body.appendChild(div);
}

createRoot(document.getElementById('root')!).render(<App />);
