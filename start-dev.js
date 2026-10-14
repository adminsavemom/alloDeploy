import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting AlloDeploy (Backend + Frontend)...\n');

let isExiting = false;
let backendProcess = null;
let frontendProcess = null;

function startBackend() {
  if (isExiting) return;
  console.log('▶ [Engine] Starting AlloDeploy backend on port 5000...');
  backendProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, 'backend'),
    shell: true,
    stdio: 'inherit'
  });

  backendProcess.on('exit', (code) => {
    if (!isExiting) {
      console.warn(`⚠️ Backend process exited with code ${code}. Restarting in 2s...`);
      setTimeout(startBackend, 2000);
    }
  });
}

function startFrontend() {
  if (isExiting) return;
  console.log('▶ [UI] Starting AlloDeploy frontend on port 5173...');
  frontendProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, 'frontend'),
    shell: true,
    stdio: 'inherit'
  });

  frontendProcess.on('exit', (code) => {
    if (!isExiting) {
      console.warn(`⚠️ Frontend process exited with code ${code}. Restarting in 2s...`);
      setTimeout(startFrontend, 2000);
    }
  });
}

startBackend();
startFrontend();

function handleExit() {
  isExiting = true;
  if (backendProcess) backendProcess.kill();
  if (frontendProcess) frontendProcess.kill();
  process.exit();
}

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);
process.on('exit', handleExit);
