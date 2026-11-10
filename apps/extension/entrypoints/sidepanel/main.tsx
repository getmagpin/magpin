import '@magpin/ui/styles.css';
import './sidepanel.css';
import { render } from 'preact';
import { App } from './App';

render(<App />, document.getElementById('app')!);
