// main.js - The Backend (Main Process)

const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn, exec } = require('child_process');
const https = require('https');

let store;
let mainWindow;

// --- Dependency Checking ---
const commandExists = (command) => {
    return new Promise((resolve) => {
        exec(`command -v ${command}`, (error) => resolve(!error));
    });
};

const checkDependencies = async () => {
    const dependencies = ['gs', 'tesseract', 'pdftotext', 'jq', 'gtimeout', 'exiftool', 'pandoc'];
    const missingDependencies = [];
    for (const dep of dependencies) {
        if (!(await commandExists(dep))) missingDependencies.push(dep);
    }
    if (missingDependencies.length > 0) {
        dialog.showErrorBox('Missing Dependencies', `Please install the following required tools using Homebrew:\n\nbrew install ${missingDependencies.join(' ')}`);
        app.quit();
    }
};

// --- Window Creation ---
const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minHeight: 600,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#2e2e2e',
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  // mainWindow.webContents.openDevTools({ mode: 'undocked' });
};

const createManagerWindow = (htmlFile, width = 700, height = 500) => {
    const newWindow = new BrowserWindow({
        width, height,
        minHeight: 400,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 15, y: 15 },
        parent: mainWindow,
        modal: true,
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, 
            contextIsolation: true 
        },
        backgroundColor: '#2e2e2e',
    });
    newWindow.loadFile(path.join(__dirname, htmlFile));
};

app.whenReady().then(async () => {
  const { default: Store } = await import('electron-store');
  const initialPromptText = 'Please generate a filename for the document in its original language. Structure: YYYY MM DD - Sender/Creator - Brief description. Only output the filename, without the file extension. Here is the information:';
  store = new Store({
      defaults: {
          prompts: [{ id: 'default-filename', title: 'Default Filename Prompt', text: initialPromptText, history: [initialPromptText] }],
          apiKeys: [],
          'user-settings': { theme: 'system' }
      }
  });

  const savedTheme = store.get('user-settings.theme', 'system');
  nativeTheme.themeSource = savedTheme;

  await checkDependencies();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---
ipcMain.on('open-prompts-window', () => createManagerWindow('prompts.html'));
ipcMain.on('open-keys-window', () => createManagerWindow('keys.html'));

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return !canceled ? filePaths[0] : null;
});

ipcMain.handle('dialog:openFiles', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Documents', extensions: ['pdf', 'txt', 'doc', 'docx', 'ppt', 'pptx'] }]
    });
    return !canceled ? filePaths : null;
});

ipcMain.on('set-theme', (event, theme) => {
    nativeTheme.themeSource = theme;
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('theme-updated', theme);
    });
});

ipcMain.handle('get-theme', () => store.get('user-settings.theme', 'system'));
ipcMain.handle('get-settings', () => store.get('user-settings'));
ipcMain.on('save-settings', (event, settings) => store.set('user-settings', settings));
ipcMain.handle('get-prompts', () => store.get('prompts'));
ipcMain.on('save-prompts', (event, prompts) => store.set('prompts', prompts));
ipcMain.handle('get-keys', () => store.get('apiKeys'));
ipcMain.on('save-keys', (event, keys) => store.set('apiKeys', keys));

// --- Model Fetching Logic ---
ipcMain.handle('fetch-models', async (event, { provider, apiKey }) => {
    if (!apiKey) return { error: 'API Key is required.' };
    const options = { method: 'GET', headers: {} };
    let url;
    if (provider === 'openai') {
        url = 'https://api.openai.com/v1/models';
        options.headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (provider === 'anthropic') {
        return { models: [
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
            { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
        ].sort((a, b) => b.id.localeCompare(a.id))};
    } else if (provider === 'gemini') {
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    } else { return { error: 'Unsupported provider.' }; }

    return new Promise((resolve) => {
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) { resolve({ error: parsed.error.message }); return; }
                    let models;
                    if (provider === 'openai') {
                         models = parsed.data
                            .filter(model => model.id.startsWith('gpt-') && !model.id.includes('instruct') && !model.id.includes('vision') && !model.id.includes('dall-e'))
                            .sort((a, b) => b.created - a.created).slice(0, 20).map(model => ({ id: model.id, name: model.id }));
                    } else if (provider === 'gemini') {
                        models = parsed.models
                            .filter(model => model.supportedGenerationMethods.includes('generateContent') && !model.displayName.toLowerCase().includes('vision') && !model.name.includes('preview'))
                            .map(model => ({ id: model.name.split('/')[1], name: model.displayName })).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 20);
                    }
                    resolve({ models });
                } catch (e) { resolve({ error: 'Failed to parse model list.' }); }
            });
        }).on('error', (e) => { resolve({ error: e.message }); });
    });
});

// --- File Processing Logic (Renamer) ---
ipcMain.on('process-files', (event, { files, settings }) => {
    const processQueue = [...files]; 
    const processFile = (filePath) => {
        if (!filePath) { mainWindow.webContents.send('processing-complete'); return; }
        const scriptPath = path.join(__dirname, 'process-file.sh');
        const args = [
            filePath, settings.outputFolder, path.join(settings.outputFolder, 'originals'),
            settings.archiveOriginal.toString(), settings.apiKey, settings.model,
            settings.prompt, settings.provider, settings.convertToPDFA.toString(),
            path.extname(filePath).substring(1)
        ];
        const child = spawn('bash', [scriptPath, ...args]);
        let finalMessage = ''; let errorMessage = '';
        child.stdout.on('data', (data) => { finalMessage += data.toString(); });
        child.stderr.on('data', (data) => { errorMessage += data.toString(); console.error(`Error for ${path.basename(filePath)}: ${data}`); });
        child.on('close', (code) => {
            if (code === 0) {
                mainWindow.webContents.send('update-status', { path: filePath, status: 'Done', message: finalMessage.trim() });
            } else {
                 mainWindow.webContents.send('update-status', { path: filePath, status: 'Error', message: errorMessage.trim() });
            }
            processFile(processQueue.shift());
        });
    };
    processFile(processQueue.shift());
});

// --- Sorter Logic ---
async function findSubfoldersRecursive(currentPath, subfolders, currentDepth, maxDepth) {
    if (currentDepth >= maxDepth) return;
    try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                subfolders.push(fullPath);
                await findSubfoldersRecursive(fullPath, subfolders, currentDepth + 1, maxDepth);
            }
        }
    } catch (error) { /* ignore permission errors */ }
}

ipcMain.handle('index-folder', async (event, { folderPath, maxDepth }) => {
    const subfolders = [];
    await findSubfoldersRecursive(folderPath, subfolders, 0, maxDepth);
    return subfolders;
});

ipcMain.handle('move-file', async (event, { source, destination }) => {
    try {
        const fileName = path.basename(source);
        const finalDestination = path.join(destination, fileName);
        await fs.rename(source, finalDestination);
        return { success: true };
    } catch (error) {
        console.error('File move failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.on('process-sorting', async (event, { inputPath, folderIndex }) => {
    const settings = store.get('user-settings');
    const prompts = store.get('prompts');
    const keys = store.get('apiKeys');
    const selectedPrompt = prompts.find(p => p.id === settings.selectedPrompt);
    const selectedKey = keys.find(k => k.id === settings.selectedKey);
    if (!selectedKey || !selectedPrompt) { dialog.showErrorBox('Error', 'Please configure your API Key and Prompt first.'); return; }

    const files = await fs.readdir(inputPath);
    for (const file of files) {
        const filePath = path.join(inputPath, file);
        try {
            const stat = await fs.stat(filePath);
            if (stat.isFile()) {
                const scriptPath = path.join(__dirname, 'process-sorter.sh');
                const args = [ filePath, JSON.stringify(folderIndex), selectedKey.key, settings.model, selectedPrompt.text, settings.provider ];
                const child = spawn('bash', [scriptPath, ...args]);
                let output = '';
                child.stdout.on('data', (data) => { output += data.toString(); });
                child.on('close', (code) => {
                    if (code === 0) {
                        try {
                            const suggestions = JSON.parse(output);
                            event.sender.send('sort-suggestion', { fileName: file, filePath: filePath, suggestions: suggestions });
                        } catch (e) { console.error("Failed to parse sorter script output:", e, "Raw output:", output); }
                    }
                });
            }
        } catch(e) {
            console.error(`Could not process file ${filePath}:`, e);
        }
    }
});
