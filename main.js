const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell, nativeTheme, session } = require('electron');
const path = require('path');
const os = require('os');
const https = require('https');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let tray = null;
let mousePositionInterval = null;
let isQuitting = false;
let currentLanguage = 'zh';
let logStream = null;
let isAutoUpdateEnabled = false;
let pendingUpdateInfo = null;

const UPDATE_SERVER = 'https://update.idmanos.com/windows';

// 简化版自动更新：直接下载并安装
function downloadAndInstallUpdate(version) {
  const tempDir = app.getPath('temp');
  const exeName = `Idpetos_Update_${Date.now()}.exe`;
  const filePath = path.join(tempDir, exeName);

  // 从pendingUpdateInfo.files获取文件URL
  let fileUrl = 'Idpetos Setup ' + version + '.exe';
  if (pendingUpdateInfo && pendingUpdateInfo.files && pendingUpdateInfo.files.length > 0) {
    fileUrl = pendingUpdateInfo.files[0].url;
  }

  // 尝试多个可能的URL格式
  const urls = [
    UPDATE_SERVER + '/' + encodeURIComponent(fileUrl),
    UPDATE_SERVER + '/' + fileUrl.replace(/ /g, '%20'),
    UPDATE_SERVER + '/' + fileUrl
  ];

  console.log('[AutoUpdater] Attempting to download version:', version);
  console.log('[AutoUpdater] File URL from server:', fileUrl);

  function tryDownload(urlIndex) {
    if (urlIndex >= urls.length) {
      console.error('[AutoUpdater] All download attempts failed');
      return;
    }

    const downloadUrl = urls[urlIndex];
    console.log('[AutoUpdater] Trying URL (' + (urlIndex + 1) + '/' + urls.length + '):', downloadUrl);

    const file = fs.createWriteStream(filePath);

    https.get(downloadUrl, (response) => {
      console.log('[AutoUpdater] Response status:', response.statusCode, 'for URL:', downloadUrl);

      if (response.statusCode === 200) {
        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log('[AutoUpdater] Download complete:', filePath);

          // 先打开安装包，然后退出应用
          console.log('[AutoUpdater] Opening installer first...');

          // 先打开安装包
          shell.openPath(filePath).then(result => {
            console.log('[AutoUpdater] Installer opened, result:', result);

            // 打开安装包后再退出应用
            console.log('[AutoUpdater] Now quitting app...');
            isQuitting = true;
            app.quit();
          }).catch(err => {
            console.error('[AutoUpdater] Failed to open installer:', err);
            // 如果打开失败，仍然退出应用
            isQuitting = true;
            app.quit();
          });
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // 处理重定向
        const location = response.headers.location;
        console.log('[AutoUpdater] Redirect to:', location);
        file.close();
        fs.unlinkSync(filePath);

        if (location) {
          // 直接使用新的URL
          const redirectFile = fs.createWriteStream(filePath);
          https.get(location, (redirectResponse) => {
            if (redirectResponse.statusCode === 200) {
              redirectResponse.pipe(redirectFile);
              redirectFile.on('finish', () => {
                redirectFile.close();
                console.log('[AutoUpdater] Download complete after redirect:', filePath);

                // 先打开安装包，然后退出应用
                console.log('[AutoUpdater] Opening installer first...');

                // 先打开安装包
                shell.openPath(filePath).then(result => {
                  console.log('[AutoUpdater] Installer opened, result:', result);

                  // 打开安装包后再退出应用
                  console.log('[AutoUpdater] Now quitting app...');
                  isQuitting = true;
                  app.quit();
                }).catch(err => {
                  console.error('[AutoUpdater] Failed to open installer:', err);
                  // 如果打开失败，仍然退出应用
                  isQuitting = true;
                  app.quit();
                });
              });
            } else {
              console.error('[AutoUpdater] Redirect download failed:', redirectResponse.statusCode);
              redirectFile.close();
              tryDownload(urlIndex + 1);
            }
          }).on('error', (err) => {
            console.error('[AutoUpdater] Redirect download error:', err);
            redirectFile.close();
            tryDownload(urlIndex + 1);
          });
        } else {
          tryDownload(urlIndex + 1);
        }
      } else {
        console.error('[AutoUpdater] Download failed with status:', response.statusCode);
        file.close();
        tryDownload(urlIndex + 1);
      }
    }).on('error', (err) => {
      console.error('[AutoUpdater] Download error:', err);
      file.close();
      tryDownload(urlIndex + 1);
    });
  }

  tryDownload(0);
}

// 拖拽相关的变量
let isDragging = false;
let dragEndTimeout = null;
let lastMoveTime = 0;
let pendingMove = null;

// 禁用Electron安全限制，允许加载不安全的内容
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-insecure-localhost');
app.commandLine.appendSwitch('allow-running-insecure-content');

// 注册协议处理，允许发起网络请求
app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'geolocation' || permission === 'notifications' || permission === 'fullscreen' || permission === 'webRequest' || permission === 'loadBundle') {
      callback(true);
    } else {
      callback(false);
    }
  });
});

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const scaleFactor = primaryDisplay.scaleFactor;

  const windowWidth = 260;
  const windowHeight = 480;

  // 右下角：屏幕CSS像素 - 窗口CSS像素
  const targetX = Math.floor(width - windowWidth);
  const targetY = Math.floor(height - windowHeight);

  // 配置session以允许API请求
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'geolocation' || permission === 'notifications' || permission === 'fullscreen' || permission === 'webRequest' || permission === 'loadBundle') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // 允许所有来源加载内容（用于API请求）
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Access-Control-Allow-Origin'] = ['*'];
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    details.responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    details.responseHeaders['Access-Control-Allow-Methods'] = ['*'];
    details.responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    callback({ responseHeaders: details.responseHeaders });
  });

  // 允许加载所有URL
  session.defaultSession.setBlockableMessages && session.defaultSession.setBlockableMessages([]);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: windowWidth,
    maxWidth: windowWidth,
    minHeight: windowHeight,
    maxHeight: windowHeight,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    focusable: true,
    useContentSize: true,
    show: false
  });

  mainWindow.loadFile('index_new.html');

  // 确保窗口在预期位置后再显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.setPosition(targetX, targetY);
    mainWindow.show();
  });

  mainWindow.on('minimize', function (event) {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('close', function (event) {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  // 监听窗口移动
  mainWindow.on('move', function () {
    if (!isDragging) {
      isDragging = true;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('window-moving');
      }
    }
    if (dragEndTimeout) {
      clearTimeout(dragEndTimeout);
    }
    dragEndTimeout = setTimeout(function () {
      if (isDragging) {
        isDragging = false;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('window-move-end');
        }
      }
    }, 100);
  });

  // 监听显示器变化
  screen.on('display-metrics-changed', (event, display, changedMetrics) => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      adjustWindowToScreen();
    }
  });

  // 监听窗口获得焦点，确保DPI变化后窗口大小正确
  mainWindow.on('focus', () => {
    adjustWindowToScreen();
  });

  // 监听窗口显示，确保从托盘恢复时大小正确
  mainWindow.on('show', () => {
    adjustWindowToScreen();
  });
}

// 调整窗口位置和大小以适应屏幕
function adjustWindowToScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const pos = mainWindow.getPosition();
  const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
  const { width: screenWidth, height: screenHeight } = currentDisplay.workAreaSize;
  const winBounds = mainWindow.getBounds();
  const windowWidth = 260;
  const windowHeight = 480;

  // 调整大小以适应DPI
  const expectedWidth = windowWidth;
  const expectedHeight = windowHeight;

  if (winBounds.width !== expectedWidth || winBounds.height !== expectedHeight) {
    mainWindow.setSize(expectedWidth, expectedHeight);
  }

  // 调整位置以适应屏幕边界
  let newX = Math.max(0, Math.min(pos[0], screenWidth - winBounds.width));
  let newY = Math.max(0, Math.min(pos[1], screenHeight - winBounds.height));

  if (newX !== pos[0] || newY !== pos[1]) {
    mainWindow.setPosition(newX, newY);
  }
}

// 执行窗口移动（带防抖和边界检查）
function doMoveWindow(x, y) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isNaN(x) || isNaN(y)) return;

  const currentDisplay = screen.getDisplayMatching(mainWindow.getBounds());
  const { width: screenWidth, height: screenHeight } = currentDisplay.workAreaSize;
  const winBounds = mainWindow.getBounds();

  const currentPos = mainWindow.getPosition();
  const deltaX = Math.abs(x - currentPos[0]);
  const deltaY = Math.abs(y - currentPos[1]);

  if (deltaX > 300 || deltaY > 300) {
    console.warn('异常的大移动被阻止', deltaX, deltaY);
    return;
  }

  const minX = 0;
  const maxX = screenWidth - winBounds.width;
  const minY = 0;
  const maxY = screenHeight - winBounds.height;

  let clampedX = Math.floor(Math.max(minX, Math.min(x, maxX)));
  let clampedY = Math.floor(Math.max(minY, Math.min(y, maxY)));

  if (currentPos[0] !== clampedX || currentPos[1] !== clampedY) {
    mainWindow.setPosition(clampedX, clampedY);
  }
}

// 移动窗口 IPC 处理（带防抖）
ipcMain.on('move-window', (event, x, y) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const now = Date.now();

  // 通知渲染进程窗口正在移动
  mainWindow.webContents.send('window-moving');

  // 防抖：限制移动频率到60fps
  if (now - lastMoveTime < 16) {
    if (pendingMove) {
      clearTimeout(pendingMove);
    }
    pendingMove = setTimeout(() => {
      doMoveWindow(x, y);
      pendingMove = null;
    }, 16);
    return;
  }

  lastMoveTime = now;
  doMoveWindow(x, y);
});

// 拖拽开始
ipcMain.on('drag-start', () => {
  isDragging = true;
  if (dragEndTimeout) {
    clearTimeout(dragEndTimeout);
    dragEndTimeout = null;
  }
});

// 拖拽结束
ipcMain.on('drag-end', () => {
  // 延迟清除拖拽标记，避免拖拽结束瞬间的移动
  dragEndTimeout = setTimeout(() => {
    isDragging = false;
  }, 100);
});

// 获取窗口位置
ipcMain.on('get-window-position', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const pos = mainWindow.getPosition();
    mainWindow.webContents.send('window-position', pos[0], pos[1]);
  }
});

ipcMain.handle('get-window-position', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.getPosition();
  }
  return [0, 0];
});

ipcMain.handle('get-window-bounds', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
  }
  return { x: 0, y: 0, width: 260, height: 480 };
});

ipcMain.handle('get-scale-factor', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return primaryDisplay.scaleFactor;
});

// 设置窗口大小
ipcMain.on('set-window-size', (event, width, height) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSize(width, height);
  }
});

// 托盘相关功能
function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico');
  tray = new Tray(iconPath);
  updateTrayMenu();
  tray.setToolTip('Idpetos');

  tray.on('click', function () {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function updateTrayMenu() {
  const isAutoStart = getAutoStart();

  const labels = {
    show: currentLanguage === 'zh' ? '显示 Idpetos' : 'Show Idpetos',
    autoStart: currentLanguage === 'zh' ? '开机自启动' : 'Auto Start',
    language: currentLanguage === 'zh' ? '语言' : 'Language',
    viewLog: currentLanguage === 'zh' ? '查看日志' : 'View Log',
    minimize: currentLanguage === 'zh' ? '缩小到托盘' : 'Minimize to Tray',
    exit: currentLanguage === 'zh' ? '退出' : 'Exit',
    chinese: currentLanguage === 'zh' ? '中文 ✓' : '中文',
    english: currentLanguage === 'zh' ? 'English' : 'English ✓',
    autoUpdate: currentLanguage === 'zh' ? '自动更新' : 'Auto Update'
  };

  const contextMenu = Menu.buildFromTemplate([
    {
      label: labels.show,
      click: function () {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: labels.autoStart,
      type: 'checkbox',
      checked: isAutoStart,
      click: function (menuItem) {
        setAutoStart(menuItem.checked);
        updateTrayMenu();
      }
    },
    {
      label: labels.autoUpdate,
      type: 'checkbox',
      checked: isAutoUpdateEnabled,
      click: function (menuItem) {
        setAutoUpdate(menuItem.checked);
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auto-update-changed', menuItem.checked);
        }
      }
    },
    {
      label: labels.language,
      submenu: [
        {
          label: labels.chinese,
          type: 'radio',
          checked: currentLanguage === 'zh',
          click: function () {
            currentLanguage = 'zh';
            updateTrayMenu();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('language-changed', 'zh');
            }
          }
        },
        {
          label: labels.english,
          type: 'radio',
          checked: currentLanguage === 'en',
          click: function () {
            currentLanguage = 'en';
            updateTrayMenu();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('language-changed', 'en');
            }
          }
        }
      ]
    },
    {
      label: labels.viewLog,
      click: function () {
        openLogFile();
      }
    },
    {
      label: labels.minimize,
      click: function () {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: labels.exit,
      click: function () {
        isQuitting = true;
        stopMousePositionTracking();
        if (tray) {
          tray.destroy();
          tray = null;
        }
        app.quit();
      }
    }
  ]);

  if (tray) {
    tray.setContextMenu(contextMenu);
  }
}

function setAutoStart(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe'),
    args: []
  });
}

function getAutoStart() {
  const settings = app.getLoginItemSettings();
  return settings.openAtLogin;
}

ipcMain.handle('get-auto-start', () => {
  return getAutoStart();
});

ipcMain.handle('set-auto-start', (event, enable) => {
  setAutoStart(enable);
  updateTrayMenu();
  return getAutoStart();
});

function setAutoUpdate(enable) {
  isAutoUpdateEnabled = enable;
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    config.autoUpdate = enable;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    if (enable) {
      checkForUpdates();
    }
  } catch (e) {
    console.error('Failed to save auto update setting:', e);
  }
}

function getAutoUpdate() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.autoUpdate === true;
    }
  } catch (e) {
    console.error('Failed to read auto update setting:', e);
  }
  return false;
}

ipcMain.handle('get-auto-update', () => {
  return isAutoUpdateEnabled;
});

ipcMain.handle('set-auto-update', (event, enable) => {
  setAutoUpdate(enable);
  updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auto-update-changed', enable);
  }
  return isAutoUpdateEnabled;
});

ipcMain.handle('get-current-version', () => {
  return app.getVersion();
});

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...');
    console.log('[AutoUpdater] Feed URL:', UPDATE_SERVER);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-checking');
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    console.log('[AutoUpdater] Update info:', JSON.stringify(info, null, 2));
    console.log('[AutoUpdater] Files to download:', info.files);

    // 存储更新信息供下载使用
    pendingUpdateInfo = {
      version: info.version,
      notes: info.releaseNotes || 'New version available',
      files: info.files
    };

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', pendingUpdateInfo);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] Update not available. Current version:', app.getVersion());
    console.log('[AutoUpdater] Check result:', info);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available', {
        version: app.getVersion()
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err);
    console.error('[AutoUpdater] Error stack:', err.stack);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        error: err.message || 'Update error'
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log('[AutoUpdater] Download progress:', progressObj.percent.toFixed(2) + '%', 'bytesPerSecond:', progressObj.bytesPerSecond, 'transferred:', progressObj.transferred, 'total:', progressObj.total);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', {
        percent: progressObj.percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    console.log('[AutoUpdater] Downloaded files:', info);
    console.log('[AutoUpdater] Ready for installation');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        releaseNotes: info.releaseNotes
      });
    }
  });
}

function initAutoUpdater() {
  console.log('[AutoUpdater] Initializing auto updater with feed URL:', UPDATE_SERVER);
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: UPDATE_SERVER,
    channel: 'latest'
  });
  console.log('[AutoUpdater] Auto updater initialized');
}

function checkForUpdates() {
  if (!isAutoUpdateEnabled) return;

  try {
    autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('[AutoUpdater] Failed to check for updates:', err);
  }
}

ipcMain.handle('check-for-updates', () => {
  try {
    console.log('[AutoUpdater] Manual check for updates...');
    autoUpdater.checkForUpdates();
    return true;
  } catch (err) {
    console.error('[AutoUpdater] Failed to check for updates:', err);
    return false;
  }
});

ipcMain.handle('start-download-update', () => {
  try {
    console.log('[AutoUpdater] Starting simple download update...');
    console.log('[AutoUpdater] Pending update info:', pendingUpdateInfo);

    if (!pendingUpdateInfo) {
      console.error('[AutoUpdater] No pending update info available');
      return false;
    }

    downloadAndInstallUpdate(pendingUpdateInfo.version);
    return true;
  } catch (err) {
    console.error('[AutoUpdater] Failed to download update:', err);
    return false;
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-language', () => {
  return currentLanguage;
});

ipcMain.handle('set-language', (event, lang) => {
  currentLanguage = lang;
  updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('language-changed', lang);
  }
  return currentLanguage;
});

ipcMain.handle('get-foreground-window', () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec('powershell -command "Add-Type -AssemblyName Microsoft.VisualBasic; $activeWindow = [Microsoft.VisualBasic.Interaction]::AppActivate([Microsoft.VisualBasic.Interaction]::GetActiveWindowTitle()); Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | Where-Object {$_.MainWindowTitle -ne \'\'} | Select-Object -First 1 | ForEach-Object {\'{0} - {1}\' -f $_.ProcessName, $_.MainWindowTitle}"', (error, stdout) => {
      if (error || !stdout.trim()) {
        exec('powershell -command "Get-Process | Where-Object {$_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne \'\'} | Select-Object -First 1 | Format-List ProcessName,MainWindowTitle"', (err2, out2) => {
          if (err2 || !out2.trim()) {
            resolve({ title: '', process: '' });
          } else {
            const lines = out2.trim().split('\n');
            let title = '';
            let process = '';
            lines.forEach(line => {
              if (line.includes('MainWindowTitle')) title = line.split(':').slice(1).join(':').trim();
              if (line.includes('ProcessName')) process = line.split(':').slice(1).join(':').trim();
            });
            resolve({ title: process + ' - ' + title, process: process });
          }
        });
      } else {
        const title = stdout.trim();
        const processMatch = title.match(/^(.+) - /);
        const process = processMatch ? processMatch[1] : '';
        resolve({ title: title, process: process });
      }
    });
  });
});

// HTTP 请求和系统信息
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Parse error')); }
      });
    }).on('error', (e) => { reject(e); });
  });
}

let cachedSystemContext = null;
let contextCacheTime = 0;

ipcMain.handle('get-system-context', async () => {
  const now = Date.now();
  if (cachedSystemContext && (now - contextCacheTime) < 300000) {
    return { ...cachedSystemContext, currentTime: getCurrentTimeString() };
  }

  const context = {
    currentTime: getCurrentTimeString(),
    location: '',
    weather: '',
    systemInfo: getSystemInfo()
  };

  try {
    const geo = await httpGet('http://ip-api.com/json/?fields=city,country,timezone');
    if (geo && geo.city) {
      context.location = geo.city + ', ' + geo.country;
    }
  } catch (e) {
    context.location = '未知地点';
  }

  try {
    const weather = await httpGet('https://wttr.in/?format=j1');
    if (weather && weather.current_condition && weather.current_condition[0]) {
      const c = weather.current_condition[0];
      context.weather = c.weatherDesc[0].value + '，' + c.temp_C + '°C，湿度' + c.humidity + '%';
    }
  } catch (e) {
    context.weather = '天气信息暂不可用';
  }

  cachedSystemContext = context;
  contextCacheTime = now;
  return context;
});

function getCurrentTimeString() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth() + 1;
  const d = now.getDate();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const h = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return y + '年' + mo + '月' + d + '日 星期' + week + ' ' + h + ':' + mi + ':' + s;
}

function getSystemInfo() {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model.replace(/\(R\)|\(TM\)|CPU|Processor/g, '').trim() : '未知';
  const cpuCores = cpus.length;
  const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const freeMem = Math.round(os.freemem() / (1024 * 1024 * 1024));
  const platform = os.platform() === 'win32' ? 'Windows' : os.platform();
  const release = os.release();
  return platform + ' ' + release + '，' + cpuModel + ' ' + cpuCores + '核，内存' + totalMem + 'GB（可用' + freeMem + 'GB）';
}

// 鼠标位置追踪（降低频率）
function startMousePositionTracking() {
  if (mousePositionInterval) {
    clearInterval(mousePositionInterval);
  }

  mousePositionInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      const mousePosition = screen.getCursorScreenPoint();
      mainWindow.webContents.send('global-mouse-move', mousePosition.x, mousePosition.y);
    }
  }, 100); // 降低到100ms
}

function stopMousePositionTracking() {
  if (mousePositionInterval) {
    clearInterval(mousePositionInterval);
    mousePositionInterval = null;
  }
}

app.whenReady().then(() => {
  ensureUserDataDir();
  initLog();
  setupAutoUpdater();
  initAutoUpdater();
  createWindow();
  createTray();
  startMousePositionTracking();
});

// 应用退出前清理
app.on('will-quit', () => {
  console.log('[App] Cleaning up before quit');
  stopMousePositionTracking();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

// 聊天记忆文件路径
function getMemoryFolder() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'memory');
}

function getCurrentMemoryFile() {
  const dir = getMemoryFolder();
  if (!fs.existsSync(dir)) {
    return null;
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
  if (files.length > 0) {
    return path.join(dir, files[0]);
  }
  return null;
}

function getMemoryFilePath() {
  const dir = getMemoryFolder();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // 查找现有的memory文件
  const existingFile = getCurrentMemoryFile();

  if (existingFile) {
    const fileName = path.basename(existingFile, '.json');
    const fileDate = new Date(fileName + 'T00:00:00.000Z');
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayDate = new Date(todayStr + 'T00:00:00.000Z');

    // 计算文件日期和今天的天数差
    const daysDiff = Math.floor((todayDate - fileDate) / (1000 * 60 * 60 * 24));

    // 如果文件日期不是今天且超过7天，创建新文件
    if (daysDiff >= 7) {
      const newFileName = todayStr + '.json';
      return path.join(dir, newFileName);
    }

    // 如果文件日期超过15天，创建新文件
    if (daysDiff >= 15) {
      const newFileName = todayStr + '.json';
      return path.join(dir, newFileName);
    }

    // 返回现有文件
    return existingFile;
  }

  // 没有文件，创建新文件
  const newFileName = todayStr + '.json';
  return path.join(dir, newFileName);
}

function getChatHistoryPath() {
  return getMemoryFilePath();
}

// 读取聊天历史
ipcMain.handle('get-chat-history', async () => {
  try {
    const dir = getMemoryFolder();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      return [];
    }

    const filePath = getChatHistoryPath();
    if (filePath && fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const history = JSON.parse(data);

      // 检查并限制7天内的记录
      const now = new Date();
      const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);

      const filteredHistory = history.filter(item => {
        if (item.timestamp) {
          const itemDate = new Date(item.timestamp);
          return itemDate >= sevenDaysAgo;
        }
        return true;
      });

      return filteredHistory;
    }
    return [];
  } catch (e) {
    console.error('Error reading chat history:', e);
    return [];
  }
});

// 保存聊天历史
ipcMain.handle('save-chat-history', async (event, newEntry) => {
  try {
    const dir = getMemoryFolder();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = getChatHistoryPath();
    let history = [];

    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      history = JSON.parse(data);
    }

    // 添加带时间戳的新记录
    history.push({
      timestamp: new Date().toISOString(),
      user: newEntry.user,
      bot: newEntry.bot
    });

    // 检查并限制7天内的记录
    const now = new Date();
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);

    history = history.filter(item => {
      if (item.timestamp) {
        const itemDate = new Date(item.timestamp);
        return itemDate >= sevenDaysAgo;
      }
      return true;
    });

    fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Error saving chat history:', e);
    return false;
  }
});

// 获取聊天历史文件路径
ipcMain.handle('get-chat-history-path', async () => {
  return getMemoryFolder();
});

// 打开聊天历史文件所在文件夹
ipcMain.handle('open-chat-history-folder', async () => {
  try {
    const dir = getMemoryFolder();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    shell.openPath(dir);
    return true;
  } catch (e) {
    console.error('Error opening folder:', e);
    return false;
  }
});

function getUserDataDir() {
  const userDataPath = app.getPath('userData');
  return userDataPath;
}

function ensureUserDataDir() {
  const dir = getUserDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 日志文件路径
function getLogFilePath() {
  const dir = getUserDataDir();
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(dir, `app_${date}.log`);
}

// 清理超过7天的日志文件
function cleanupOldLogs() {
  const dir = getUserDataDir();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      if (file.startsWith('app_') && file.endsWith('.log')) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        
        // 检查文件是否超过7天
        if (stats.mtime < sevenDaysAgo) {
          fs.unlinkSync(filePath);
          console.log('[LogCleanup] Deleted old log file:', file);
        }
      }
    });
  } catch (e) {
    console.error('[LogCleanup] Failed to cleanup old logs:', e);
  }
}

// 初始化日志
function initLog() {
  const logPath = getLogFilePath();
  ensureUserDataDir();
  
  // 清理旧日志
  cleanupOldLogs();

  // 重写console.log和console.error
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  function writeLog(level, ...args) {
    const time = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    const logLine = `[${time}] [${level}] ${message}\n`;

    // 追加到文件
    try {
      fs.appendFileSync(logPath, logLine, 'utf-8');
    } catch (e) {
      // 忽略写入错误
    }
  }

  console.log = (...args) => {
    originalLog.apply(console, args);
    writeLog('INFO', ...args);
  };

  console.error = (...args) => {
    originalError.apply(console, args);
    writeLog('ERROR', ...args);
  };

  console.warn = (...args) => {
    originalWarn.apply(console, args);
    writeLog('WARN', ...args);
  };

  // 初始日志
  console.log('========================================');
  console.log('Idpetos App Started');
  console.log('App Version:', app.getVersion());
  console.log('Platform:', process.platform);
  console.log('========================================');
}

// 打开日志文件
function openLogFile() {
  const logPath = getLogFilePath();
  ensureUserDataDir();

  // 如果文件不存在，创建一个空的
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, '', 'utf-8');
  }

  shell.openPath(logPath);
}

// 持久化存储设备ID（存储在Documents目录中，删除AppData不会影响）
function getDeviceIdFilePath() {
  const documentsPath = app.getPath('documents');
  const idpetosFolder = path.join(documentsPath, 'Idpetos');

  if (!fs.existsSync(idpetosFolder)) {
    fs.mkdirSync(idpetosFolder, { recursive: true });
  }
  return path.join(idpetosFolder, 'device_id.json');
}

ipcMain.handle('get-persistent-device-id', async () => {
  try {
    const filePath = getDeviceIdFilePath();
    const dirPath = path.dirname(filePath);

    // 确保目录存在
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      console.log('[DeviceId] Loaded from file:', parsed.deviceId);
      return parsed.deviceId;
    }

    // 生成稳定的设备ID（基于机器特征）
    const crypto = require('crypto');

    // 收集机器特征
    const features = [
      os.hostname(),           // 计算机名
      os.platform(),           // win32
      os.arch(),               // x64
      os.cpus()[0]?.model || '', // CPU型号
      os.totalmem(),           // 内存大小
      app.getPath('exe')       // 可执行文件路径
    ];

    const machineFingerprint = features.join('|');
    const machineHash = crypto.createHash('sha256').update(machineFingerprint).digest('hex').substring(0, 24);
    const deviceId = `device_${machineHash}`;

    const deviceData = {
      deviceId: deviceId,
      createdAt: new Date().toISOString(),
      machineHash: machineHash
    };

    fs.writeFileSync(filePath, JSON.stringify(deviceData, null, 2), 'utf-8');
    console.log('[DeviceId] Created new device ID:', deviceId);
    return deviceId;
  } catch (e) {
    console.error('Error getting persistent device ID:', e);
    // 最终的fallback
    const crypto = require('crypto');
    const fallbackId = crypto.randomBytes(16).toString('hex');
    return `device_${fallbackId}`;
  }
});

ipcMain.handle('open-user-data-folder', async () => {
  try {
    const dir = getUserDataDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    ensureUserDataFiles();
    shell.openPath(dir);
    return true;
  } catch (e) {
    console.error('Error opening user data folder:', e);
    return false;
  }
});

ipcMain.handle('get-system-theme', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  }
});

// 设置鼠标穿透
ipcMain.handle('set-ignore-mouse-events', (event, ignore) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});