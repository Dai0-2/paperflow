import ReactDOM from 'react-dom/client';
import { RecoveryApp } from './components/recovery/RecoveryApp';
import './styles/globals.css';
import './styles/recovery.css';

const root = document.getElementById('root');
if (!root) throw new Error('Recovery root is missing.');
ReactDOM.createRoot(root).render(<RecoveryApp />);
