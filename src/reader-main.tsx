import './pdfjsCompatibility';
import 'pdfjs-dist/web/pdf_viewer.css';
import { mountApplication } from './bootstrap';
import { ReaderApp } from './components/reader/ReaderApp';
import './styles/globals.css';
import './styles/reader.css';

void mountApplication(<ReaderApp />);
