// renderer.js - Unified frontend logic for the application

// --- UI Element References ---
const navRenamer = document.getElementById('nav-renamer');
const navSorter = document.getElementById('nav-sorter');
const renamerView = document.getElementById('renamer-view');
const sorterView = document.getElementById('sorter-view');
const settingsRenamer = document.getElementById('settings-renamer');
const settingsSorter = document.getElementById('settings-sorter');
const themeBtn = document.getElementById('theme-btn');
const providerSelect = document.getElementById('provider-select');
const modelSelect = document.getElementById('model-select');
const apiKeySelect = document.getElementById('api-key-select');
const promptSelect = document.getElementById('prompt-select');
const keysBtn = document.getElementById('keys-btn');
const promptsBtn = document.getElementById('prompts-btn');
const chooseFolderBtn = document.getElementById('choose-folder-btn');
const outputFolderInput = document.getElementById('output-folder');
const saveInPlaceCheckbox = document.getElementById('save-in-place-checkbox');
const dropZone = document.getElementById('drop-zone');
const statusViewContainer = document.getElementById('status-view-container');
const statusView = document.getElementById('status-view');
const clearFinishedBtn = document.getElementById('clear-finished-btn');
const archiveCheckbox = document.getElementById('archive-original-checkbox');
const convertPdfaCheckbox = document.getElementById('convert-pdfa-checkbox');
const selectTargetFolderBtn = document.getElementById('select-target-folder-btn');
const selectInputFolderBtn = document.getElementById('select-input-folder-btn');
const indexStatus = document.getElementById('index-status');
const inputFolderPath = document.getElementById('input-folder-path');
const sortingQueue = document.getElementById('sorting-queue');
const sorterFooter = document.getElementById('sorter-footer');
const clearSortedBtn = document.getElementById('clear-sorted-btn');
const sorterDepthInput = document.getElementById('sorter-depth-input');

// --- Global State ---
let prompts = [];
let apiKeys = [];
let dragCounter = 0;
let targetFolder = null;
let folderIndex = [];

// --- View Switching Logic ---
const switchView = (viewName) => {
    navRenamer.classList.toggle('active', viewName === 'renamer');
    navSorter.classList.toggle('active', viewName === 'sorter');
    renamerView.style.display = viewName === 'renamer' ? 'flex' : 'none';
    sorterView.style.display = viewName === 'sorter' ? 'flex' : 'none';
    settingsRenamer.style.display = viewName === 'renamer' ? 'flex' : 'none';
    settingsSorter.style.display = viewName === 'sorter' ? 'flex' : 'none';
};

// --- Shared Functions ---
const populatePromptsDropdown = () => {
    const currentVal = promptSelect.value;
    promptSelect.innerHTML = '';
    prompts.forEach(prompt => {
        const option = document.createElement('option');
        option.value = prompt.id;
        option.textContent = prompt.title;
        promptSelect.appendChild(option);
    });
    if (prompts.find(p => p.id === currentVal)) {
        promptSelect.value = currentVal;
    }
};
const populateKeysDropdown = () => {
    const currentVal = apiKeySelect.value;
    apiKeySelect.innerHTML = '';
    apiKeys.forEach(key => {
        const option = document.createElement('option');
        option.value = key.id;
        option.textContent = key.nickname;
        apiKeySelect.appendChild(option);
    });
    if (apiKeys.find(k => k.id === currentVal)) {
        apiKeySelect.value = currentVal;
    }
};
const loadPrompts = async () => {
    prompts = await window.electronAPI.getPrompts();
    populatePromptsDropdown();
};
const loadKeys = async () => {
    apiKeys = await window.electronAPI.getKeys();
    populateKeysDropdown();
};
const saveCurrentSettings = () => {
    const settings = {
        provider: providerSelect.value, model: modelSelect.value,
        selectedKey: apiKeySelect.value, outputFolder: outputFolderInput.value,
        saveInPlace: saveInPlaceCheckbox.checked,
        archiveOriginal: archiveCheckbox.checked, convertToPDFA: convertPdfaCheckbox.checked,
        selectedPrompt: promptSelect.value, theme: document.body.dataset.savedTheme || 'system',
        sorterMaxDepth: parseInt(sorterDepthInput.value, 10) || 5
    };
    window.electronAPI.saveSettings(settings);
};

// --- Renamer-Specific Logic ---
const startRenameProcessing = (filePaths) => {
    if (!filePaths || filePaths.length === 0) return;
    const selectedPrompt = prompts.find(p => p.id === promptSelect.value);
    const selectedKey = apiKeys.find(k => k.id === apiKeySelect.value);
    const settings = {
        provider: providerSelect.value, model: modelSelect.value,
        prompt: selectedPrompt ? selectedPrompt.text : "No prompt selected",
        apiKey: selectedKey ? selectedKey.key : "", outputFolder: outputFolderInput.value,
        saveInPlace: saveInPlaceCheckbox.checked,
        archiveOriginal: archiveCheckbox.checked, convertToPDFA: convertPdfaCheckbox.checked 
    };
    
    statusViewContainer.style.display = 'flex';
    filePaths.forEach(path => {
        const fileName = path.split(/[\\/]/).pop();
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.setAttribute('data-path', path);
        fileItem.innerHTML = `<span class="file-name">${fileName}</span><span class="file-status status-processing">Queued...</span>`;
        statusView.appendChild(fileItem);
    });
    window.electronAPI.processFiles({ files: filePaths, settings });
};

// --- Sorter-Specific Logic ---
const renderSortItem = (fileInfo) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'file-sort-item';
    itemDiv.setAttribute('data-filepath', fileInfo.filePath);
    let buttonsHtml = fileInfo.suggestions.map(suggestion => 
        `<button class="suggestion-btn" data-target="${suggestion}">${suggestion.replace(targetFolder, '') || '/'}</button>`
    ).join('');
    buttonsHtml += `<button class="suggestion-btn none" data-target="none">None of these</button>`;
    itemDiv.innerHTML = `<div class="file-sort-item-header">${fileInfo.fileName}</div><div class="suggestion-group">${buttonsHtml}</div>`;
    sortingQueue.appendChild(itemDiv);
    itemDiv.querySelectorAll('.suggestion-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const target = button.getAttribute('data-target');
            if (target !== 'none') {
                const result = await window.electronAPI.moveFile({ source: fileInfo.filePath, destination: target });
                itemDiv.innerHTML = result.success 
                    ? `<div class="file-sort-item-header">${fileInfo.fileName}</div><div class="status-sorted">Moved!</div>`
                    : `<div class="file-sort-item-header">${fileInfo.fileName}</div><div class="status-error">Move Failed: ${result.error}</div>`;
            } else {
                itemDiv.innerHTML = `<div class="file-sort-item-header">${fileInfo.fileName}</div><div class="status-skipped">Skipped.</div>`;
            }
        });
    });
};

// --- Theme Management ---
const themes = ['system', 'light', 'dark'];
const themeIcons = {
    dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Zm0-80q88 0 158-48.5T740-375q-20 5-40 8t-40 3q-123 0-209.5-86.5T364-660q0-20 3-40t8-40q-78 32-126.5 102T200-480q0 116 82 198t198 82Zm-10-270Z"/></svg>`,
    light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M480-360q50 0 85-35t35-85q0-50-35-85t-85-35q-50 0-85 35t-35 85q0 50 35 85t85 35Zm0 80q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Zm326-268Z"/></svg>`,
    system: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M396-396q-32-32-58.5-67T289-537q-5 14-6.5 28.5T281-480q0 83 58 141t141 58q14 0 28.5-2t28.5-6q-39-22-74-48.5T396-396Zm57-56q51 51 114 87.5T702-308q-40 51-98 79.5T481-200q-117 0-198.5-81.5T201-480q0-65 28.5-123t79.5-98q20 72 56.5 135T453-452Zm290 72q-20-5-39.5-11T665-405q8-18 11.5-36.5T680-480q0-83-58.5-141.5T480-680q-20 0-38.5 3.5T405-665q-8-19-13.5-38T381-742q24-9 49-13.5t51-4.5q117 0 198.5 81.5T761-480q0 26-4.5 51T743-380ZM440-840v-120h80v120h-80Zm0 840v-120h80V0h-80Zm323-706-57-57 85-84 57 56-85 85ZM169-113l-57-56 85-85 57 57-85 84Zm671-327v-80h120v80H840ZM0-440v-80h120v80H0Zm791 328-85-85 57-57 84 85-56 57ZM197-706l-84-85 56-57 85 85-57 57Zm199 310Z"/></svg>`
};
const applyTheme = (theme) => {
    const effectiveTheme = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    document.body.dataset.theme = effectiveTheme;
    themeBtn.innerHTML = themeIcons[theme];
    themeBtn.setAttribute('aria-label', `Theme: ${theme}`);
};

// --- AI Model Fetching ---
const modelCache = {};
const fetchAndDisplayModels = async () => {
    const provider = providerSelect.value;
    const selectedKey = apiKeys.find(k => k.id === apiKeySelect.value);
    const apiKey = selectedKey ? selectedKey.key : null;
    const cacheKey = `${provider}-${apiKey}`;
    if (modelCache[cacheKey]) { updateModelsDropdown(modelCache[cacheKey].models); return; }
    if (!apiKey) { modelSelect.innerHTML = '<option>API Key required</option>'; return; }
    modelSelect.innerHTML = '<option>Fetching models...</option>';
    const result = await window.electronAPI.fetchModels({ provider, apiKey });
    if (result.error) {
        modelSelect.innerHTML = `<option>${result.error}</option>`;
    } else {
        modelCache[cacheKey] = { models: result.models };
        updateModelsDropdown(result.models);
    }
};
const updateModelsDropdown = (models = []) => {
    modelSelect.innerHTML = '';
    if (models.length === 0) { modelSelect.innerHTML = '<option>No models found</option>'; return; }
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id; option.textContent = model.name;
        modelSelect.appendChild(option);
    });
};

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadPrompts(); 
    await loadKeys();
    const settings = await window.electronAPI.getSettings();
    if (settings) {
        providerSelect.value = settings.provider || 'gemini';
        apiKeySelect.value = settings.selectedKey || '';
        outputFolderInput.value = settings.outputFolder || '';
        saveInPlaceCheckbox.checked = settings.saveInPlace || false;
        archiveCheckbox.checked = settings.archiveOriginal || false;
        convertPdfaCheckbox.checked = typeof settings.convertToPDFA === 'boolean' ? settings.convertToPDFA : true;
        sorterDepthInput.value = settings.sorterMaxDepth || 5;
        document.body.dataset.savedTheme = settings.theme || 'system';
        applyTheme(document.body.dataset.savedTheme);
        if (apiKeySelect.value) {
            await fetchAndDisplayModels();
        }
        modelSelect.value = settings.model || '';
        promptSelect.value = settings.selectedPrompt || '';
    } else {
        applyTheme('system');
    }
});

navRenamer.addEventListener('click', () => switchView('renamer'));
navSorter.addEventListener('click', () => switchView('sorter'));
keysBtn.addEventListener('click', () => window.electronAPI.openKeysWindow());
promptsBtn.addEventListener('click', () => window.electronAPI.openPromptsWindow());
themeBtn.addEventListener('click', () => {
    let currentThemeIndex = themes.indexOf(document.body.dataset.savedTheme || 'system');
    let nextTheme = themes[(currentThemeIndex + 1) % themes.length];
    document.body.dataset.savedTheme = nextTheme;
    window.electronAPI.setTheme(nextTheme);
    saveCurrentSettings();
});
chooseFolderBtn.addEventListener('click', async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) { outputFolderInput.value = folderPath; saveCurrentSettings(); }
});
clearFinishedBtn.addEventListener('click', () => {
    document.querySelectorAll('.file-item .status-success, .file-item .status-error').forEach(item => item.parentElement.remove());
});
dropZone.addEventListener('click', async () => {
    const filePaths = await window.electronAPI.selectFiles();
    if(filePaths) startRenameProcessing(filePaths);
});
dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); e.stopPropagation(); dragCounter++; dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); dragCounter--; if (dragCounter === 0) dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation(); dragCounter = 0;
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const allowedExtensions = ['.pdf', '.txt', '.doc', '.docx', '.ppt', '.pptx'];
        const filePaths = Array.from(files, file => file.path).filter(path => typeof path === 'string' && allowedExtensions.some(ext => path.toLowerCase().endsWith(ext)));
        if (filePaths.length > 0) startRenameProcessing(filePaths);
    }
});
selectTargetFolderBtn.addEventListener('click', async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
        targetFolder = folderPath;
        indexStatus.textContent = 'Indexing...';
        selectInputFolderBtn.disabled = true;
        const maxDepth = parseInt(sorterDepthInput.value, 10) || 5;
        window.electronAPI.indexFolder({ folderPath, maxDepth });
    }
});

selectInputFolderBtn.addEventListener('click', async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
        inputFolderPath.textContent = `Input: ${folderPath.split(/[\\/]/).pop()}`;
        sortingQueue.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--text-secondary);">Analyzing files...</div>';
        sorterFooter.style.display = 'none';
        window.electronAPI.processSorting({ inputPath: folderPath, folderIndex: folderIndex });
    }
});

clearSortedBtn.addEventListener('click', () => {
    document.querySelectorAll('.file-sort-item').forEach(item => {
        if (item.querySelector('.status-sorted') || item.querySelector('.status-skipped')) {
            item.remove();
        }
    });
    // If no items are left, hide the footer
    if (sortingQueue.childElementCount === 0) {
        sorterFooter.style.display = 'none';
    }
});

[providerSelect, modelSelect, apiKeySelect, outputFolderInput, saveInPlaceCheckbox, archiveCheckbox, convertPdfaCheckbox, promptSelect, sorterDepthInput].forEach(el => {
    el.addEventListener('change', saveCurrentSettings);
});
providerSelect.addEventListener('change', fetchAndDisplayModels);
apiKeySelect.addEventListener('change', fetchAndDisplayModels);

// --- IPC Listeners ---
window.electronAPI.onUpdateStatus((data) => {
    const fileItem = document.querySelector(`.file-item[data-path="${data.path}"]`);
    if (fileItem) {
        const statusElement = fileItem.querySelector('.file-status');
        const nameElement = fileItem.querySelector('.file-name');
        if (data.status === 'Done') {
            statusElement.textContent = 'Done'; statusElement.className = 'file-status status-success';
            nameElement.title = data.message;
        } else if (data.status === 'Error') {
            statusElement.textContent = 'Error'; statusElement.className = 'file-status status-error';
            nameElement.title = data.message;
        } else {
            statusElement.textContent = data.status; statusElement.className = 'file-status status-processing';
            nameElement.title = '';
        }
    }
});
window.electronAPI.onSortSuggestion((fileInfo) => {
    if (sortingQueue.innerHTML.includes('Analyzing files...')) {
        sortingQueue.innerHTML = '';
    }
    renderSortItem(fileInfo);
});

window.electronAPI.onFolderIndexed((data) => {
    indexStatus.textContent = `Indexing... Found ${data.count} folders.`;
});

window.electronAPI.onIndexingComplete((data) => {
    folderIndex = data.allFolders;
    indexStatus.textContent = `Indexed ${data.total} subfolders.`;
    selectInputFolderBtn.disabled = false;
});

window.electronAPI.onSortingComplete(() => {
    sorterFooter.style.display = 'flex';
});

window.electronAPI.onPromptsUpdated(loadPrompts);
window.electronAPI.onKeysUpdated(loadKeys);

window.electronAPI.onThemeUpdated((theme) => {
    document.body.dataset.savedTheme = theme;
    applyTheme(theme);
});
