// Debug setup
const debugDiv = document.createElement('div');
debugDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.9);color:#0f0;font-family:monospace;font-size:11px;padding:10px;z-index:9999;';
document.body.appendChild(debugDiv);

function log(msg, isError = false) {
  const line = document.createElement('div');
  if (isError) line.style.color = '#f00';
  line.textContent = new Date().toLocaleTimeString() + ' ' + msg;
  debugDiv.appendChild(line);
  console.log(msg);
}

window.onerror = (msg, url, line, col, error) => {
  log('ERROR: ' + msg, true);
  return true;
};

window.onunhandledrejection = (e) => {
  log('Promise Error: ' + e.reason, true);
};

log('Loading main.js...');

// Import components
log('Importing App.jsx...');
import('./App.jsx').then(() => {
  log('App.jsx loaded');
  
  log('Importing Counter.jsx...');
  return import('./Counter.jsx');
}).then(() => {
  log('Counter.jsx loaded');
  log('All components imported successfully');
  
  // Check elements
  setTimeout(() => {
    const app = document.querySelector('polyx-app');
    log('polyx-app found: ' + !!app);
    if (app) {
      log('innerHTML length: ' + app.innerHTML.length);
      if (app.innerHTML.length > 0) {
        log('First 50 chars: ' + app.innerHTML.substring(0, 50));
      }
    }
    
    const counter = document.querySelector('polyx-counter');
    log('polyx-counter found: ' + !!counter);
  }, 500);
}).catch(err => {
  log('Import error: ' + err.message, true);
  console.error(err);
});
