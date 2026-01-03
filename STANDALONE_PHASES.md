# Helixio Desktop - 10 Phase Implementation Plan

> **Target**: Standalone desktop application for Windows + macOS
> **Framework**: Electron (recommended by STANDALONE_PLAN.md evaluation)
> **Timeline**: 6-8 weeks
> **Status**: Ready for Implementation

---

## Overview

This document breaks down the Electron desktop implementation into 10 discrete phases, enabling incremental progress with clear milestones and testing gates between each phase.

```
Phase 1-2:   Foundation & Setup
Phase 3-4:   Core Electron Implementation
Phase 5-6:   Native Integration & Platform Features
Phase 7-8:   Auto-Update & Quality Assurance
Phase 9-10:  Build, Distribution & Release
```

---

## Phase 1: Project Setup & Workspace Configuration

**Duration**: 2-3 days
**Dependencies**: None
**Deliverable**: Desktop workspace with build tooling

### Goals
- Create the `/desktop` workspace within the monorepo
- Configure TypeScript compilation for Electron
- Set up development workflow with hot reload
- Establish project structure

### Tasks

#### 1.1 Create Desktop Workspace Structure

```
/desktop
├── package.json
├── tsconfig.json
├── .gitignore
├── /src
│   └── (empty, populated in Phase 2)
├── /resources
│   └── (placeholder icons)
└── /build
    └── (build configuration files)
```

#### 1.2 Configure `/desktop/package.json`

```json
{
  "name": "@helixio/desktop",
  "version": "0.1.0",
  "description": "Helixio Desktop Application",
  "main": "dist/main.js",
  "scripts": {
    "dev": "tsc -w",
    "build": "tsc",
    "start": "electron .",
    "dist": "electron-builder",
    "dist:mac": "electron-builder --mac",
    "dist:win": "electron-builder --win",
    "dist:linux": "electron-builder --linux",
    "postinstall": "electron-rebuild"
  },
  "dependencies": {
    "electron-updater": "^6.1.0",
    "electron-log": "^5.0.0"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.0",
    "@electron/rebuild": "^3.4.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  }
}
```

#### 1.3 Configure `/desktop/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 1.4 Update Root `package.json`

Add desktop to workspaces and add npm scripts:

```json
{
  "workspaces": [
    "server",
    "client",
    "desktop"
  ],
  "scripts": {
    "desktop:dev": "npm run build && npm run start --workspace=desktop",
    "desktop:build": "npm run build && npm run build --workspace=desktop",
    "desktop:dist": "npm run desktop:build && npm run dist --workspace=desktop",
    "desktop:dist:mac": "npm run desktop:build && npm run dist:mac --workspace=desktop",
    "desktop:dist:win": "npm run desktop:build && npm run dist:win --workspace=desktop"
  }
}
```

#### 1.5 Create Placeholder Icons

Create placeholder icons in `/desktop/resources/`:
- `icon.icns` - macOS (512x512)
- `icon.ico` - Windows
- `icon.png` - Linux (512x512)
- `tray-icon.png` - System tray (22x22)

### Exit Criteria
- [ ] `npm install` in root completes without errors
- [ ] `npm run build --workspace=desktop` compiles successfully
- [ ] Desktop workspace recognized by npm workspaces
- [ ] TypeScript configured and compiling

---

## Phase 2: Main Process Foundation

**Duration**: 3-4 days
**Dependencies**: Phase 1
**Deliverable**: Basic Electron app that starts with placeholder window

### Goals
- Implement Electron main process entry point
- Set up application lifecycle management
- Configure single instance lock
- Establish logging infrastructure

### Tasks

#### 2.1 Create `/desktop/src/main.ts`

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import log from 'electron-log';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.warn('Another instance is already running');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus existing window when second instance launched
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      if (windows[0].isMinimized()) windows[0].restore();
      windows[0].focus();
    }
  });

  app.whenReady().then(async () => {
    log.info('Helixio Desktop starting...');
    log.info(`App version: ${app.getVersion()}`);
    log.info(`Electron: ${process.versions.electron}`);
    log.info(`Chrome: ${process.versions.chrome}`);
    log.info(`Node: ${process.versions.node}`);
    log.info(`Platform: ${process.platform} ${process.arch}`);

    // Placeholder: create basic window
    const mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      title: 'Helixio',
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'resources', 'loading.html'));
    mainWindow.once('ready-to-show', () => mainWindow.show());

    // macOS: re-create window when dock icon clicked
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        // Re-create window
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    log.info('Helixio Desktop shutting down...');
  });
}
```

#### 2.2 Create Loading Screen

Create `/desktop/resources/loading.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Helixio</title>
  <style>
    body {
      margin: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: #1a1a2e;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .loader {
      text-align: center;
    }
    .spinner {
      width: 50px;
      height: 50px;
      border: 3px solid #333;
      border-top: 3px solid #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <div>Starting Helixio...</div>
  </div>
</body>
</html>
```

#### 2.3 Add TypeScript Types

Create `/desktop/src/types.d.ts`:

```typescript
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT?: string;
      NODE_ENV: 'development' | 'production';
      NO_OPEN?: string;
      HELIXIO_DATA_DIR?: string;
      ELECTRON_IS_PACKAGED?: string;
    }
  }
}

export {};
```

### Exit Criteria
- [ ] `npm run desktop:dev` starts Electron window
- [ ] Loading screen displays
- [ ] Logs written to file and console
- [ ] Single instance lock prevents duplicate apps
- [ ] App quits cleanly

---

## Phase 3: Server Loader Implementation

**Duration**: 3-4 days
**Dependencies**: Phase 2
**Deliverable**: Express server starting within Electron process

### Goals
- Create server loader module to bootstrap Express
- Implement dynamic port finding
- Configure environment for embedded server
- Handle server lifecycle

### Tasks

#### 3.1 Create `/desktop/src/server-loader.ts`

```typescript
import { app } from 'electron';
import path from 'path';
import net from 'net';
import log from 'electron-log';

let serverPort: number = 0;
let serverStarted: boolean = false;

/**
 * Find an available port in the given range
 */
async function findAvailablePort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '127.0.0.1');
    });
    if (available) return port;
  }
  throw new Error(`No available port found between ${start} and ${end}`);
}

/**
 * Start the embedded Express server
 */
export async function startServer(): Promise<number> {
  if (serverStarted) {
    log.info('Server already started on port', serverPort);
    return serverPort;
  }

  // Find available port
  serverPort = await findAvailablePort(3001, 3100);
  log.info(`Found available port: ${serverPort}`);

  // Configure environment
  process.env.PORT = String(serverPort);
  process.env.NODE_ENV = 'production';
  process.env.NO_OPEN = 'true';
  process.env.HELIXIO_DATA_DIR = app.getPath('userData');
  process.env.ELECTRON_IS_PACKAGED = app.isPackaged ? 'true' : 'false';

  log.info('Server environment:', {
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    HELIXIO_DATA_DIR: process.env.HELIXIO_DATA_DIR,
    ELECTRON_IS_PACKAGED: process.env.ELECTRON_IS_PACKAGED,
  });

  // Resolve server path
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'dist', 'index.js')
    : path.join(__dirname, '..', '..', 'server', 'dist', 'index.js');

  log.info(`Loading server from: ${serverPath}`);

  try {
    // Dynamic import of the server
    await import(serverPath);
    serverStarted = true;
    log.info('Express server started successfully');
    return serverPort;
  } catch (error) {
    log.error('Failed to start server:', error);
    throw error;
  }
}

/**
 * Stop the server (cleanup)
 */
export async function stopServer(): Promise<void> {
  if (!serverStarted) return;
  log.info('Server stop requested');
  serverStarted = false;
  // Server will gracefully shutdown with process
}

/**
 * Get the current server port
 */
export function getServerPort(): number {
  return serverPort;
}

/**
 * Check if server is running
 */
export function isServerRunning(): boolean {
  return serverStarted;
}
```

#### 3.2 Update Main Process to Use Server Loader

Update `/desktop/src/main.ts` to start server:

```typescript
import { startServer, stopServer, getServerPort } from './server-loader';

// In app.whenReady():
app.whenReady().then(async () => {
  try {
    log.info('Starting Helixio Desktop...');

    // Start Express server first
    const port = await startServer();
    log.info(`Server ready on port ${port}`);

    // Create window pointing to server
    const mainWindow = new BrowserWindow({
      // ... config
    });

    const serverUrl = `http://127.0.0.1:${port}`;
    log.info(`Loading: ${serverUrl}`);
    mainWindow.loadURL(serverUrl);

  } catch (error) {
    log.error('Startup failed:', error);
    app.quit();
  }
});

// In before-quit:
app.on('before-quit', async () => {
  await stopServer();
});
```

### Exit Criteria
- [ ] Server starts on dynamic port
- [ ] App data stored in Electron userData path
- [ ] Server logs visible in electron-log output
- [ ] API endpoints accessible at `http://127.0.0.1:PORT/api`
- [ ] Server stops cleanly on app quit

---

## Phase 4: Window Manager & Preload Script

**Duration**: 2-3 days
**Dependencies**: Phase 3
**Deliverable**: Full window management with secure preload bridge

### Goals
- Create dedicated window manager module
- Implement secure preload script for IPC
- Configure Content Security Policy
- Handle external links properly

### Tasks

#### 4.1 Create `/desktop/src/window-manager.ts`

```typescript
import { BrowserWindow, shell, session } from 'electron';
import path from 'path';
import log from 'electron-log';

let mainWindow: BrowserWindow | null = null;

export function createWindow(serverPort: number): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Helixio',
    icon: getIconPath(),
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app
  const url = `http://127.0.0.1:${serverPort}`;
  log.info(`Loading: ${url}`);
  mainWindow.loadURL(url);

  // Show when ready (avoids flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    log.info('Main window shown');
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    log.info(`Opening external URL: ${url}`);
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://127.0.0.1') && !url.startsWith('http://localhost')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Clean up reference
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set CSP headers
  setupCSP(serverPort);

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function getIconPath(): string {
  const resourcesPath = path.join(__dirname, '..', 'resources');
  switch (process.platform) {
    case 'darwin':
      return path.join(resourcesPath, 'icon.icns');
    case 'win32':
      return path.join(resourcesPath, 'icon.ico');
    default:
      return path.join(resourcesPath, 'icon.png');
  }
}

function setupCSP(serverPort: number): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self' http://127.0.0.1:${serverPort}; ` +
          `script-src 'self' 'unsafe-inline' 'unsafe-eval'; ` +
          `style-src 'self' 'unsafe-inline'; ` +
          `img-src 'self' http://127.0.0.1:* data: blob: https:; ` +
          `font-src 'self' data:; ` +
          `connect-src 'self' http://127.0.0.1:* https://api.comicvine.gamespot.com https://metron.cloud https://graphql.anilist.co https://api.anthropic.com;`
        ]
      }
    });
  });
}
```

#### 4.2 Create `/desktop/src/preload.ts`

```typescript
import { contextBridge, ipcRenderer } from 'electron';

// Expose protected APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => process.platform,
  isPackaged: () => ipcRenderer.invoke('app:isPackaged'),

  // File dialogs
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:selectFile', options),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  onUpdateAvailable: (callback: (info: unknown) => void) => {
    const handler = (_event: unknown, info: unknown) => callback(info);
    ipcRenderer.on('updater:available', handler);
    return () => ipcRenderer.removeListener('updater:available', handler);
  },
  onUpdateDownloaded: (callback: (info: unknown) => void) => {
    const handler = (_event: unknown, info: unknown) => callback(info);
    ipcRenderer.on('updater:downloaded', handler);
    return () => ipcRenderer.removeListener('updater:downloaded', handler);
  },
  onDownloadProgress: (callback: (progress: { percent: number }) => void) => {
    const handler = (_event: unknown, progress: { percent: number }) => callback(progress);
    ipcRenderer.on('updater:progress', handler);
    return () => ipcRenderer.removeListener('updater:progress', handler);
  },
  installUpdate: () => ipcRenderer.send('updater:install'),

  // Shell integration
  showItemInFolder: (filePath: string) => ipcRenderer.send('shell:showItemInFolder', filePath),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
});
```

#### 4.3 Add TypeScript Definitions for Preload

Create `/desktop/src/preload-types.ts`:

```typescript
export interface ElectronAPI {
  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => string;
  isPackaged: () => Promise<boolean>;

  // File dialogs
  selectDirectory: () => Promise<string | null>;
  selectFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;

  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;

  // Auto-update
  checkForUpdates: () => Promise<void>;
  onUpdateAvailable: (callback: (info: unknown) => void) => () => void;
  onUpdateDownloaded: (callback: (info: unknown) => void) => () => void;
  onDownloadProgress: (callback: (progress: { percent: number }) => void) => () => void;
  installUpdate: () => void;

  // Shell integration
  showItemInFolder: (filePath: string) => void;
  openExternal: (url: string) => Promise<void>;
  openPath: (filePath: string) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
```

### Exit Criteria
- [ ] Window opens with correct dimensions and icon
- [ ] Preload script compiles and loads
- [ ] `window.electronAPI` available in DevTools console
- [ ] External links open in system browser
- [ ] CSP headers applied correctly

---

## Phase 5: Native Module Integration

**Duration**: 4-5 days
**Dependencies**: Phase 4
**Deliverable**: 7zip-bin, sharp, and keytar working in packaged app

### Goals
- Configure electron-rebuild for native modules
- Update archive service for packaged 7zip paths
- Update app-paths service for Electron userData
- Handle keytar deprecation with fallback

### Tasks

#### 5.1 Server Modification: `/server/src/services/app-paths.service.ts`

Add Electron data directory support:

```typescript
import { homedir } from 'os';
import { join } from 'path';

const APP_DIR_NAME = '.helixio';

/**
 * Get the application data directory.
 * Supports Electron userData override via HELIXIO_DATA_DIR env var.
 */
export function getAppDataDir(): string {
  // Electron desktop app override
  if (process.env.HELIXIO_DATA_DIR) {
    return process.env.HELIXIO_DATA_DIR;
  }
  // Default: ~/.helixio
  return join(homedir(), APP_DIR_NAME);
}
```

#### 5.2 Server Modification: `/server/src/services/archive.service.ts`

Update 7zip binary path resolution:

```typescript
import path from 'path';
import * as sevenBin from '7zip-bin';

/**
 * Get the path to the 7za binary, handling both development
 * and packaged Electron app scenarios.
 */
function get7zipBinaryPath(): string {
  // Check if running in packaged Electron app
  if (process.env.ELECTRON_IS_PACKAGED === 'true' && process.resourcesPath) {
    const platform = process.platform;
    const arch = process.arch;
    const binary = platform === 'win32' ? '7za.exe' : '7za';
    const binaryPath = path.join(
      process.resourcesPath,
      '7zip-bin',
      platform,
      arch,
      binary
    );
    console.log(`[Archive] Using packaged 7zip: ${binaryPath}`);
    return binaryPath;
  }

  // Development: use node_modules path
  console.log(`[Archive] Using dev 7zip: ${sevenBin.path7za}`);
  return sevenBin.path7za;
}

// Use get7zipBinaryPath() wherever sevenBin.path7za was used
const SEVEN_ZIP_PATH = get7zipBinaryPath();
```

#### 5.3 Server Modification: `/server/src/index.ts`

Skip browser auto-open in Electron:

```typescript
// Find browser open code and update:
const shouldOpenBrowser =
  process.env.NO_OPEN !== 'true' &&
  process.env.NODE_ENV !== 'production';

if (shouldOpenBrowser) {
  setTimeout(() => {
    open(CLIENT_URL);
  }, 2000);
}
```

#### 5.4 Keytar Fallback

Update `/server/src/services/secure-storage.service.ts` with fallback:

```typescript
import { safeStorage } from 'electron';

// If keytar fails, use Electron's safeStorage or encrypted file fallback
async function getSecureValue(key: string): Promise<string | null> {
  try {
    // Try keytar first
    return await keytar.getPassword('helixio', key);
  } catch (error) {
    // Fallback to encrypted file storage
    return getFromEncryptedFile(key);
  }
}
```

#### 5.5 Configure electron-rebuild

Add to `/desktop/package.json`:

```json
{
  "scripts": {
    "postinstall": "electron-rebuild -f -w sharp,keytar"
  }
}
```

### Exit Criteria
- [ ] `electron-rebuild` completes without errors
- [ ] CBZ/CBR extraction works in development
- [ ] Cover image generation works (sharp)
- [ ] API keys stored securely
- [ ] `HELIXIO_DATA_DIR` respected for all data paths

---

## Phase 6: System Integration (Tray, Menu, IPC)

**Duration**: 3-4 days
**Dependencies**: Phase 5
**Deliverable**: System tray, application menu, and IPC handlers

### Goals
- Implement system tray with context menu
- Create platform-appropriate application menu
- Register all IPC handlers
- Add window controls

### Tasks

#### 6.1 Create `/desktop/src/tray.ts`

```typescript
import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import path from 'path';
import log from 'electron-log';

let tray: Tray | null = null;

export function initTray(mainWindow: BrowserWindow): void {
  const iconPath = path.join(__dirname, '..', 'resources', 'tray-icon.png');
  let icon = nativeImage.createFromPath(iconPath);

  // Resize for system tray (16x16 on Windows, 22x22 on macOS)
  const size = process.platform === 'win32' ? 16 : 22;
  icon = icon.resize({ width: size, height: size });

  tray = new Tray(icon);
  tray.setToolTip('Helixio');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Helixio',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Scan Libraries',
      click: () => {
        mainWindow.show();
        mainWindow.webContents.send('tray:scan-libraries');
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click on tray icon shows window
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });

  // Double-click restores
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  log.info('System tray initialized');
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
    log.info('System tray destroyed');
  }
}

export function updateTrayTooltip(message: string): void {
  if (tray) {
    tray.setToolTip(`Helixio - ${message}`);
  }
}
```

#### 6.2 Create `/desktop/src/menu.ts`

```typescript
import { app, Menu, shell, BrowserWindow } from 'electron';
import { getMainWindow } from './window-manager';
import log from 'electron-log';

export function initMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            getMainWindow()?.webContents.send('menu:preferences');
          },
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Add Library...',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            getMainWindow()?.webContents.send('menu:add-library');
          },
        },
        { type: 'separator' },
        {
          label: 'Scan All Libraries',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            getMainWindow()?.webContents.send('menu:scan-all');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const },
        ]),
      ],
    },

    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
        ] : [
          { role: 'close' as const },
        ]),
      ],
    },

    // Help menu
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/RolldeoDev/Helixio/wiki');
          },
        },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal('https://github.com/RolldeoDev/Helixio/issues');
          },
        },
        { type: 'separator' },
        {
          label: 'View Logs',
          click: async () => {
            await shell.openPath(log.transports.file.getFile().path);
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  log.info('Application menu initialized');
}
```

#### 6.3 Create `/desktop/src/ipc-handlers.ts`

```typescript
import { ipcMain, dialog, shell, app } from 'electron';
import { getMainWindow } from './window-manager';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

export function registerIpcHandlers(): void {
  // App info
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:isPackaged', () => app.isPackaged);

  // File dialogs
  ipcMain.handle('dialog:selectDirectory', async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Library Folder',
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:selectFile', async (_, options) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options?.filters || [],
    });

    return result.canceled ? null : result.filePaths[0];
  });

  // Window controls
  ipcMain.on('window:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    const win = getMainWindow();
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    getMainWindow()?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return getMainWindow()?.isMaximized() || false;
  });

  // Shell
  ipcMain.on('shell:showItemInFolder', (_, filePath) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('shell:openExternal', async (_, url) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('shell:openPath', async (_, filePath) => {
    return await shell.openPath(filePath);
  });

  // Updater
  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      log.error('Update check failed:', err);
    }
  });

  ipcMain.on('updater:install', () => {
    autoUpdater.quitAndInstall();
  });

  log.info('IPC handlers registered');
}
```

### Exit Criteria
- [ ] System tray appears with context menu
- [ ] Tray click/double-click shows window
- [ ] Application menu visible (especially on macOS)
- [ ] Menu keyboard shortcuts work
- [ ] All IPC handlers respond correctly

---

## Phase 7: Auto-Update System

**Duration**: 3-4 days
**Dependencies**: Phase 6
**Deliverable**: Working auto-update via GitHub Releases

### Goals
- Configure electron-updater
- Implement update notification UI
- Test full update cycle
- Add manual update check

### Tasks

#### 7.1 Create `/desktop/src/updater.ts`

```typescript
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { BrowserWindow, dialog, app } from 'electron';
import log from 'electron-log';

// Configure auto-updater
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;

export function initUpdater(): void {
  // Don't check for updates in development
  if (!app.isPackaged) {
    log.info('Skipping auto-update in development mode');
    return;
  }

  // Initial check
  checkForUpdates();

  // Periodic checks (every 4 hours)
  setInterval(checkForUpdates, 4 * 60 * 60 * 1000);

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info(`Update available: ${info.version}`);
    notifyRenderer('updater:available', info);
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info(`No update available. Current: ${app.getVersion()}, Latest: ${info.version}`);
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const percent = progress.percent.toFixed(1);
    log.info(`Download progress: ${percent}%`);
    notifyRenderer('updater:progress', { percent: progress.percent });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info(`Update downloaded: ${info.version}`);
    notifyRenderer('updater:downloaded', info);

    // Prompt user
    promptInstallUpdate(info);
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
  });
}

async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    log.error('Update check failed:', err);
  }
}

function notifyRenderer(channel: string, data: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(channel, data);
  });
}

async function promptInstallUpdate(info: UpdateInfo): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: `Helixio ${info.version} is ready to install`,
    detail: 'The update will be installed when you restart. Would you like to restart now?',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    log.info('User chose to restart for update');
    autoUpdater.quitAndInstall();
  } else {
    log.info('User deferred update installation');
  }
}
```

#### 7.2 Update Main Process

In `/desktop/src/main.ts`:

```typescript
import { initUpdater } from './updater';

// After window is ready
setTimeout(() => {
  initUpdater();
}, 5000); // Delay to let app fully load
```

### Exit Criteria
- [ ] Update check runs on startup (production only)
- [ ] Update notifications appear in UI
- [ ] Download progress visible
- [ ] Restart prompt appears when download complete
- [ ] Update installs successfully after restart

---

## Phase 8: Testing & Quality Assurance

**Duration**: 4-5 days
**Dependencies**: Phase 7
**Deliverable**: Comprehensive test coverage and bug fixes

### Goals
- Test all functionality on Windows and macOS
- Fix platform-specific bugs
- Verify native module behavior
- Test update cycle end-to-end

### Tasks

#### 8.1 Create Test Checklist

```markdown
## Phase 8 Testing Checklist

### Startup & Lifecycle
- [ ] App starts without errors (macOS)
- [ ] App starts without errors (Windows)
- [ ] Single instance lock works
- [ ] Server starts on available port
- [ ] App quits cleanly
- [ ] Logs written to correct location

### Window Management
- [ ] Window remembers size/position
- [ ] Min/max/close buttons work
- [ ] Fullscreen toggle works
- [ ] External links open in browser

### Native Modules
- [ ] CBZ extraction works
- [ ] CBR extraction works
- [ ] CB7 extraction works
- [ ] Cover generation works (sharp)
- [ ] Secure storage works

### System Integration
- [ ] Tray icon appears
- [ ] Tray context menu works
- [ ] Application menu works (macOS)
- [ ] Keyboard shortcuts work
- [ ] File dialogs open

### Features (Full Parity)
- [ ] Library creation/scanning
- [ ] Series browsing
- [ ] Reader functionality
- [ ] Reading progress saved
- [ ] Metadata lookup works
- [ ] Settings persist

### Auto-Update
- [ ] Update check runs
- [ ] Notification appears (if update available)
- [ ] Manual check works
- [ ] Download progresses
- [ ] Restart installs update
```

#### 8.2 Add Desktop Test Scripts

Add to `/desktop/package.json`:

```json
{
  "scripts": {
    "test": "echo 'Manual testing required'",
    "test:startup": "electron . --test-startup",
    "test:native": "electron . --test-native-modules"
  }
}
```

#### 8.3 Create Smoke Test Script

Create `/desktop/src/smoke-test.ts`:

```typescript
import { app } from 'electron';
import log from 'electron-log';

export async function runSmokeTests(): Promise<boolean> {
  const results: { test: string; passed: boolean; error?: string }[] = [];

  // Test 1: App paths
  try {
    const userData = app.getPath('userData');
    results.push({ test: 'App paths', passed: !!userData });
  } catch (e) {
    results.push({ test: 'App paths', passed: false, error: String(e) });
  }

  // Test 2: Server import
  try {
    const serverPath = require.resolve('../../server/dist/index.js');
    results.push({ test: 'Server module', passed: !!serverPath });
  } catch (e) {
    results.push({ test: 'Server module', passed: false, error: String(e) });
  }

  // Test 3: 7zip binary
  try {
    const sevenBin = require('7zip-bin');
    const fs = require('fs');
    const exists = fs.existsSync(sevenBin.path7za);
    results.push({ test: '7zip binary', passed: exists });
  } catch (e) {
    results.push({ test: '7zip binary', passed: false, error: String(e) });
  }

  // Log results
  log.info('=== Smoke Test Results ===');
  results.forEach(r => {
    log.info(`${r.passed ? '✓' : '✗'} ${r.test}${r.error ? `: ${r.error}` : ''}`);
  });

  return results.every(r => r.passed);
}
```

### Exit Criteria
- [ ] All checklist items pass on macOS
- [ ] All checklist items pass on Windows
- [ ] No critical bugs remaining
- [ ] Performance acceptable (startup < 5s)
- [ ] Memory usage reasonable (< 500MB idle)

---

## Phase 9: Build System & Packaging

**Duration**: 3-4 days
**Dependencies**: Phase 8
**Deliverable**: Installable builds for Windows and macOS

### Goals
- Configure electron-builder
- Create installer packages
- Set up code signing (optional for testing)
- Optimize bundle size

### Tasks

#### 9.1 Create `/desktop/electron-builder.yml`

```yaml
appId: com.helixio.desktop
productName: Helixio
copyright: Copyright (c) 2024-2026 RolldeoDev

directories:
  output: dist
  buildResources: resources

files:
  - "dist/**/*"
  - "node_modules/**/*"
  - "!node_modules/**/test/**"
  - "!node_modules/**/tests/**"
  - "!node_modules/**/docs/**"
  - "!node_modules/**/*.md"
  - "!node_modules/**/*.map"

extraResources:
  # Server distribution
  - from: "../server/dist"
    to: "server/dist"
  - from: "../server/prisma"
    to: "server/prisma"
  - from: "../server/node_modules/.prisma"
    to: "server/node_modules/.prisma"

  # Client build
  - from: "../client/dist"
    to: "client/dist"

  # 7zip binaries
  - from: "../server/node_modules/7zip-bin"
    to: "7zip-bin"

# macOS configuration
mac:
  category: public.app-category.utilities
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

dmg:
  background: resources/dmg-background.png
  iconSize: 80
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

# Windows configuration
win:
  target:
    - target: nsis
      arch: [x64]
    - target: portable
      arch: [x64]
  icon: resources/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  menuCategory: Helixio
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico

# Linux configuration
linux:
  target:
    - AppImage
    - deb
  category: Utility
  icon: resources/icon.png
  maintainer: RolldeoDev

# Auto-update
publish:
  provider: github
  owner: RolldeoDev
  repo: Helixio
  releaseType: release
```

#### 9.2 Create macOS Entitlements

Create `/desktop/build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

#### 9.3 Update Build Scripts

Update `/desktop/package.json`:

```json
{
  "scripts": {
    "predist": "npm run build",
    "dist": "electron-builder",
    "dist:mac": "electron-builder --mac",
    "dist:win": "electron-builder --win",
    "dist:linux": "electron-builder --linux",
    "dist:all": "electron-builder -mwl"
  }
}
```

### Exit Criteria
- [ ] `npm run desktop:dist:mac` produces DMG
- [ ] `npm run desktop:dist:win` produces EXE/MSI
- [ ] Installers work on clean machines
- [ ] App launches after installation
- [ ] Data stored in correct location

---

## Phase 10: Distribution, CI/CD & Release

**Duration**: 3-4 days
**Dependencies**: Phase 9
**Deliverable**: Automated releases via GitHub Actions

### Goals
- Set up GitHub Actions workflow
- Configure code signing (when certificates obtained)
- Create release process
- Document distribution

### Tasks

#### 10.1 Create `/.github/workflows/desktop-release.yml`

```yaml
name: Desktop Release

on:
  push:
    tags:
      - 'desktop-v*'
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (e.g., 1.0.0)'
        required: true

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build server and client
        run: npm run build

      - name: Build desktop (macOS)
        run: npm run desktop:dist:mac
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Uncomment when code signing is configured:
          # CSC_LINK: ${{ secrets.MAC_CERTS }}
          # CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTS_PASSWORD }}
          # APPLE_ID: ${{ secrets.APPLE_ID }}
          # APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
          # APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}

      - name: Upload macOS artifacts
        uses: actions/upload-artifact@v4
        with:
          name: macos-build
          path: |
            desktop/dist/*.dmg
            desktop/dist/*.zip

  build-windows:
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build server and client
        run: npm run build

      - name: Build desktop (Windows)
        run: npm run desktop:dist:win
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Uncomment when code signing is configured:
          # CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          # CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}

      - name: Upload Windows artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-build
          path: |
            desktop/dist/*.exe
            desktop/dist/*-portable.exe

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build server and client
        run: npm run build

      - name: Build desktop (Linux)
        run: npm run desktop:dist:linux
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload Linux artifacts
        uses: actions/upload-artifact@v4
        with:
          name: linux-build
          path: |
            desktop/dist/*.AppImage
            desktop/dist/*.deb

  create-release:
    needs: [build-macos, build-windows, build-linux]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          draft: true
          generate_release_notes: true
          files: |
            artifacts/macos-build/*
            artifacts/windows-build/*
            artifacts/linux-build/*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 10.2 Create Release Process Documentation

Create `/desktop/RELEASE.md`:

```markdown
# Helixio Desktop Release Process

## Prerequisites
- All tests passing
- Version updated in package.json files
- CHANGELOG updated

## Steps

### 1. Update Version
```bash
# Update version in all package.json files
npm version patch # or minor, major
```

### 2. Create Release Tag
```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

### 3. Monitor Build
- GitHub Actions will build for all platforms
- Draft release created with artifacts

### 4. Test Builds
- Download each platform build
- Test installation and basic functionality
- Verify auto-update from previous version

### 5. Publish Release
- Edit draft release
- Add release notes
- Publish

## Code Signing

### macOS
- Requires Apple Developer account ($99/year)
- Certificate stored in GitHub Secrets
- Notarization required for Gatekeeper

### Windows
- EV code signing recommended
- Reduces SmartScreen warnings
- Certificate stored in GitHub Secrets
```

#### 10.3 Create User Documentation

Create `/desktop/README.md`:

```markdown
# Helixio Desktop

Standalone desktop application for managing your comic book library.

## Installation

### macOS
1. Download `Helixio-X.X.X.dmg`
2. Open the DMG file
3. Drag Helixio to Applications
4. Launch from Applications

**Note**: On first launch, you may need to right-click and select "Open"
to bypass Gatekeeper for unsigned builds.

### Windows
1. Download `Helixio-Setup-X.X.X.exe`
2. Run the installer
3. Follow installation prompts
4. Launch from Start Menu or Desktop shortcut

### Linux
1. Download `Helixio-X.X.X.AppImage`
2. Make executable: `chmod +x Helixio-*.AppImage`
3. Run: `./Helixio-*.AppImage`

## Data Location

All data is stored in:
- macOS: `~/Library/Application Support/Helixio/`
- Windows: `%APPDATA%\Helixio\`
- Linux: `~/.config/Helixio/`

This data is compatible with the Docker version at `~/.helixio/`.

## Troubleshooting

### Logs
Logs are stored at:
- macOS: `~/Library/Logs/Helixio/`
- Windows: `%USERPROFILE%\AppData\Roaming\Helixio\logs\`
- Linux: `~/.config/Helixio/logs/`

### Common Issues
- **App won't start**: Check logs for errors
- **Server timeout**: Port 3001-3100 may be blocked
- **Native modules**: Try reinstalling the app
```

### Exit Criteria
- [ ] GitHub Actions workflow runs successfully
- [ ] Artifacts uploaded for all platforms
- [ ] Draft release created automatically
- [ ] Manual release works correctly
- [ ] Auto-update connects to GitHub releases
- [ ] Documentation complete

---

## Summary

| Phase | Duration | Key Deliverable |
|-------|----------|-----------------|
| 1 | 2-3 days | Desktop workspace configured |
| 2 | 3-4 days | Basic Electron app starting |
| 3 | 3-4 days | Express server embedded |
| 4 | 2-3 days | Window manager & preload |
| 5 | 4-5 days | Native modules working |
| 6 | 3-4 days | System tray, menu, IPC |
| 7 | 3-4 days | Auto-update system |
| 8 | 4-5 days | Testing complete |
| 9 | 3-4 days | Installable packages |
| 10 | 3-4 days | CI/CD and release |
| **Total** | **31-40 days** | **Production release** |

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Native module failures | High | Medium | Test early, have fallbacks |
| macOS notarization | Medium | Medium | Apply for certificate early |
| Windows SmartScreen | Medium | High | Code signing, build reputation |
| Large bundle size | Low | High | Document trade-off, optimize later |
| Auto-update failures | Medium | Low | Manual download fallback |

---

## Cost Summary

| Item | Annual Cost | Notes |
|------|-------------|-------|
| Apple Developer | $99 | Required for notarization |
| Windows EV Cert | $200-500 | Reduces SmartScreen warnings |
| GitHub Actions | Free | For open source |
| **Total** | **~$300-600** | |

---

## Success Metrics

1. **Installation**: < 5 minutes from download to first library scan
2. **Startup Time**: < 5 seconds to usable state
3. **Feature Parity**: 100% of web features functional
4. **Stability**: < 1% crash rate
5. **Update Success**: > 95% successful auto-updates
6. **Memory Usage**: < 500MB at idle
