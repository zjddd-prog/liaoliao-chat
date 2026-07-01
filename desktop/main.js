const { app, BrowserWindow, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');

// 飞友之家服务器地址
const APP_URL = 'https://liaoliao-chat.onrender.com';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 750,
    minWidth: 380,
    minHeight: 600,
    title: '飞友之家',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: false
    },
    autoHideMenuBar: true,
    show: false
  });

  // 设置窗口标题
  mainWindow.setTitle('飞友之家');

  // 加载应用
  mainWindow.loadURL(APP_URL);

  // 窗口准备好后再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 在外部浏览器打开链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 导航限制：只允许应用内导航
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.hostname !== new URL(APP_URL).hostname) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // 创建菜单
  const menuTemplate = [
    {
      label: '飞友之家',
      submenu: [
        {
          label: '关于飞友之家',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于飞友之家',
              message: '飞友之家 v1.0.0',
              detail: '一个简洁友好的实时聊天应用\n\n随时随地，畅快聊天！',
              buttons: ['好的']
            });
          }
        },
        { type: 'separator' },
        {
          label: '重新加载',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow.reload()
        },
        {
          label: '开发者工具',
          accelerator: 'F12',
          click: () => mainWindow.webContents.toggleDevTools()
        },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
