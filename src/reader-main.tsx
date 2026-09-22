import './pdfjsCompatibility';
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'pdfjs-dist/web/pdf_viewer.css';
import { ReaderApp } from './components/reader/ReaderApp';
import './styles/globals.css';
import './styles/reader.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ReaderApp /></React.StrictMode>,
);
