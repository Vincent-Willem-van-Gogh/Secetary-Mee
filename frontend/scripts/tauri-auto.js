#!/usr/bin/env node
/**
 * Auto-detect GPU and run Tauri with appropriate features
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Get the command (dev or build)
const command = process.argv[2];
if (!command || !['dev', 'build'].includes(command)) {
  console.error('Usage: node tauri-auto.js [dev|build]');
  process.exit(1);
}

// Detect GPU feature
let feature = '';

// Check for environment variable override first
if (process.env.TAURI_GPU_FEATURE) {
  feature = process.env.TAURI_GPU_FEATURE;
  console.log(`🔧 Using forced GPU feature from environment: ${feature}`);
} else {
  try {
    const result = execSync('node scripts/auto-detect-gpu.js', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit']
    });
    feature = result.trim();
  } catch (err) {
    // If detection fails, continue with no features
  }
}

console.log(''); // Empty line for spacing
const platform = os.platform();
const env = { ...process.env };

// Build the isolated Sherpa sidecar expected by tauri.conf.json.
const targetTriples = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-gnu',
};
const targetTriple = targetTriples[`${os.platform()}-${os.arch()}`];
if (!targetTriple) {
  console.error(`Unsupported Sherpa live preview target: ${os.platform()}-${os.arch()}`);
  process.exit(1);
}
const workspaceRoot = path.resolve(__dirname, '../..');
const executableSuffix = os.platform() === 'win32' ? '.exe' : '';
try {
  execSync('cargo build --release -p sherpa-helper', { cwd: workspaceRoot, stdio: 'inherit', env });
  const source = path.join(workspaceRoot, 'target', 'release', `sherpa-helper${executableSuffix}`);
  const destination = path.join(__dirname, '..', 'src-tauri', 'binaries', `sherpa-helper-${targetTriple}${executableSuffix}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (os.platform() !== 'win32') fs.chmodSync(destination, 0o755);
} catch (err) {
  console.error('Failed to build Sherpa live preview helper.');
  process.exit(err.status || 1);
}

// Platform-specific environment variables
if (platform === 'linux' && feature === 'cuda') {
  console.log('🐧 Linux/CUDA detected: Setting CMAKE flags for NVIDIA GPU');
  env.CMAKE_CUDA_ARCHITECTURES = '75';
  env.CMAKE_CUDA_STANDARD = '17';
  env.CMAKE_POSITION_INDEPENDENT_CODE = 'ON';
}

// Build the tauri command
let tauriCmd = `tauri ${command}`;
if (feature && feature !== 'none') {
  tauriCmd += ` -- --features ${feature}`;
  console.log(`🚀 Running: tauri ${command} with features: ${feature}`);
} else {
  console.log(`🚀 Running: tauri ${command} (CPU-only mode)`);
}
console.log('');

// Execute the command
try {
  execSync(tauriCmd, { stdio: 'inherit', env });
} catch (err) {
  process.exit(err.status || 1);
}
