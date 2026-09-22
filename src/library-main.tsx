import React from 'react';
import ReactDOM from 'react-dom/client';
import { LibraryApp } from './components/library/LibraryApp';
import './styles/globals.css';
import './styles/library.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><LibraryApp /></React.StrictMode>,
);
