// keys-renderer.js - Frontend logic for keys.html

// --- UI Element References ---
const keyList = document.getElementById('key-list');
const newKeyBtn = document.getElementById('new-key-btn');
const deleteKeyBtn = document.getElementById('delete-key-btn');
const saveKeyBtn = document.getElementById('save-key-btn');
const nicknameInput = document.getElementById('key-nickname-input');
const providerSelect = document.getElementById('key-provider-select');
const keyValueInput = document.getElementById('key-value-input');

// --- Global State ---
let apiKeys = [];
let selectedKeyId = null;

// --- Functions ---
const applyTheme = (theme) => {
    document.body.dataset.theme = theme === 'system' 
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') 
        : theme;
};

const renderKeyList = () => {
    keyList.innerHTML = '';
    apiKeys.forEach(key => {
        const li = document.createElement('li');
        li.textContent = key.nickname;
        li.dataset.id = key.id;
        if (key.id === selectedKeyId) {
            li.classList.add('active');
        }
        keyList.appendChild(li);
    });
};

const loadKeyIntoEditor = (keyId) => {
    const key = apiKeys.find(k => k.id === keyId);
    if (key) {
        selectedKeyId = key.id;
        nicknameInput.value = key.nickname;
        providerSelect.value = key.provider;
        keyValueInput.value = key.key;
    } else {
        selectedKeyId = null;
        nicknameInput.value = '';
        providerSelect.value = 'gemini';
        keyValueInput.value = '';
    }
    renderKeyList();
};

const saveKeys = () => {
    window.electronAPI.saveKeys(apiKeys);
};

// --- Event Listeners ---
newKeyBtn.addEventListener('click', () => {
    const newKey = {
        id: `key-${Date.now()}`,
        nickname: 'New API Key',
        provider: 'gemini',
        key: ''
    };
    apiKeys.push(newKey);
    loadKeyIntoEditor(newKey.id);
});

keyList.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
        const keyId = e.target.dataset.id;
        loadKeyIntoEditor(keyId);
    }
});

saveKeyBtn.addEventListener('click', () => {
    if (selectedKeyId) {
        const key = apiKeys.find(k => k.id === selectedKeyId);
        if (key) {
            key.nickname = nicknameInput.value;
            key.provider = providerSelect.value;
            key.key = keyValueInput.value;
            saveKeys();
            renderKeyList();
        }
    }
});

deleteKeyBtn.addEventListener('click', () => {
    if (selectedKeyId && apiKeys.length > 0) {
        apiKeys = apiKeys.filter(k => k.id !== selectedKeyId);
        saveKeys();
        loadKeyIntoEditor(apiKeys.length > 0 ? apiKeys[0].id : null);
    }
});

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', async () => {
    // Get initial data
    apiKeys = await window.electronAPI.getKeys();
    if (apiKeys && apiKeys.length > 0) {
        loadKeyIntoEditor(apiKeys[0].id);
    }
    
    // Get initial theme
    const initialTheme = await window.electronAPI.getTheme();
    applyTheme(initialTheme);
});

// --- IPC Listeners ---
window.electronAPI.onThemeUpdated((theme) => {
    applyTheme(theme);
});
