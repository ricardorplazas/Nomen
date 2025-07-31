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
    const effectiveTheme = theme === 'system' 
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') 
        : theme;
    document.body.dataset.theme = effectiveTheme;
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

const clearEditor = () => {
    selectedKeyId = null;
    nicknameInput.value = '';
    providerSelect.value = 'gemini';
    keyValueInput.value = '';
    nicknameInput.focus();
    renderKeyList();
};

const loadKeyIntoEditor = (keyId) => {
    const key = apiKeys.find(k => k.id === keyId);
    if (key) {
        selectedKeyId = key.id;
        nicknameInput.value = key.nickname;
        providerSelect.value = key.provider;
        keyValueInput.value = key.key;
    } else {
        clearEditor();
    }
    renderKeyList();
};

const saveKeys = () => {
    window.electronAPI.saveKeys(apiKeys);
};

// --- Event Listeners ---
newKeyBtn.addEventListener('click', clearEditor);

keyList.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
        const keyId = e.target.dataset.id;
        loadKeyIntoEditor(keyId);
    }
});

saveKeyBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    const key = keyValueInput.value.trim();
    if (!nickname || !key) {
        // Optionally show an error to the user
        console.error("Nickname and Key cannot be empty.");
        return;
    }

    if (selectedKeyId) {
        // Update existing key
        const existingKey = apiKeys.find(k => k.id === selectedKeyId);
        if (existingKey) {
            existingKey.nickname = nickname;
            existingKey.provider = providerSelect.value;
            existingKey.key = key;
        }
    } else {
        // Create new key
        const newKey = {
            id: `key-${Date.now()}`,
            nickname: nickname,
            provider: providerSelect.value,
            key: key
        };
        apiKeys.push(newKey);
        selectedKeyId = newKey.id;
    }
    saveKeys();
    renderKeyList();
});

deleteKeyBtn.addEventListener('click', () => {
    if (selectedKeyId) {
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
    } else {
        clearEditor();
    }
    
    // Get initial theme
    const initialTheme = await window.electronAPI.getTheme();
    applyTheme(initialTheme);
});

// --- IPC Listeners ---
window.electronAPI.onThemeUpdated((theme) => {
    applyTheme(theme);
});
