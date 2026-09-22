import { mountApplication } from './bootstrap';
import { LibraryApp } from './components/library/LibraryApp';
import './styles/globals.css';
import './styles/library.css';

void mountApplication(<LibraryApp />);
