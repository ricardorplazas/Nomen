// prompts-renderer.js - Frontend logic for prompts.html

// --- UI Element References ---
const promptList = document.getElementById('prompt-list');
const newPromptBtn = document.getElementById('new-prompt-btn');
const deletePromptBtn = document.getElementById('delete-prompt-btn');
const savePromptBtn = document.getElementById('save-prompt-btn');
const titleInput = document.getElementById('prompt-title-input');
const textarea = document.getElementById('prompt-textarea');
const versionSelect = document.getElementById('version-history-select');

// --- Global State ---
let prompts = [];
let selectedPromptId = null;

// --- Functions ---
const applyTheme = (theme) => {
    const effectiveTheme = theme === 'system' 
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') 
        : theme;
    document.body.dataset.theme = effectiveTheme;
};

const renderPromptList = () => {
    promptList.innerHTML = '';
    prompts.forEach(prompt => {
        const li = document.createElement('li');
        li.textContent = prompt.title;
        li.dataset.id = prompt.id;
        if (prompt.id === selectedPromptId) {
            li.classList.add('active');
        }
        promptList.appendChild(li);
    });
};

const populateVersionHistory = (prompt) => {
    versionSelect.innerHTML = '';
    if (prompt && prompt.history && prompt.history.length > 0) {
        prompt.history.forEach((versionText, index) => {
            const option = document.createElement('option');
            option.value = index;
            const isCurrent = index === prompt.history.length - 1;
            option.textContent = `Version ${index + 1}${isCurrent ? ' (Current)' : ''}`;
            versionSelect.appendChild(option);
        });
        versionSelect.selectedIndex = prompt.history.length - 1;
        versionSelect.disabled = false;
    } else {
        versionSelect.innerHTML = '<option>Version History</option>';
        versionSelect.disabled = true;
    }
};

const clearEditor = () => {
    selectedPromptId = null;
    titleInput.value = '';
    textarea.value = '';
    populateVersionHistory(null);
    titleInput.focus();
    renderPromptList();
};

const loadPromptIntoEditor = (promptId) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (prompt) {
        selectedPromptId = prompt.id;
        titleInput.value = prompt.title;
        textarea.value = prompt.text;
        populateVersionHistory(prompt);
    } else {
        clearEditor();
    }
    renderPromptList();
};

const savePrompts = () => {
    window.electronAPI.savePrompts(prompts);
};

// --- Event Listeners ---
newPromptBtn.addEventListener('click', clearEditor);

promptList.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
        const promptId = e.target.dataset.id;
        loadPromptIntoEditor(promptId);
    }
});

savePromptBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    const text = textarea.value.trim();
    if (!title || !text) {
        console.error("Title and Text cannot be empty.");
        return;
    }

    if (selectedPromptId) {
        // Update existing prompt
        const prompt = prompts.find(p => p.id === selectedPromptId);
        if (prompt) {
            prompt.title = title;
            if (text !== prompt.text) {
                prompt.text = text;
                if (!prompt.history) prompt.history = [];
                prompt.history.push(text);
                if (prompt.history.length > 10) {
                    prompt.history.shift();
                }
            }
        }
    } else {
        // Create new prompt
        const newPrompt = {
            id: `prompt-${Date.now()}`,
            title: title,
            text: text,
            history: [text]
        };
        prompts.push(newPrompt);
        selectedPromptId = newPrompt.id;
    }
    savePrompts();
    loadPromptIntoEditor(selectedPromptId); // Reload to update history and list
});

deletePromptBtn.addEventListener('click', () => {
    if (selectedPromptId && prompts.length > 1) {
        prompts = prompts.filter(p => p.id !== selectedPromptId);
        savePrompts();
        loadPromptIntoEditor(prompts[0].id);
    }
});

versionSelect.addEventListener('change', () => {
    if (selectedPromptId) {
        const prompt = prompts.find(p => p.id === selectedPromptId);
        const versionIndex = parseInt(versionSelect.value, 10);
        if (prompt && prompt.history[versionIndex] !== undefined) {
            textarea.value = prompt.history[versionIndex];
        }
    }
});

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', async () => {
    // Get initial data
    prompts = await window.electronAPI.getPrompts();
    if (prompts && prompts.length > 0) {
        loadPromptIntoEditor(prompts[0].id);
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
