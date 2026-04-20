// =============================================================================
// APPLICATION ENTRY POINT
// =============================================================================
// This is the main entry point for the React application.
// It renders the App component into the root element of the HTML page.

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Create the React root and render the App component
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);