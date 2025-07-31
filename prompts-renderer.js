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
    document.body.dataset.theme = theme === 'system' 
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') 
        : theme;
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

const loadPromptIntoEditor = (promptId) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (prompt) {
        selectedPromptId = prompt.id;
        titleInput.value = prompt.title;
        textarea.value = prompt.text;
        populateVersionHistory(prompt);
    } else {
        selectedPromptId = null;
        titleInput.value = '';
        textarea.value = '';
        populateVersionHistory(null);
    }
    renderPromptList();
};

const savePrompts = () => {
    window.electronAPI.savePrompts(prompts);
};

// --- Event Listeners ---
newPromptBtn.addEventListener('click', () => {
    const newPrompt = {
        id: `prompt-${Date.now()}`,
        title: 'New Prompt',
        text: '',
        history: ['']
    };
    prompts.push(newPrompt);
    loadPromptIntoEditor(newPrompt.id);
});

promptList.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
        const promptId = e.target.dataset.id;
        loadPromptIntoEditor(promptId);
    }
});

savePromptBtn.addEventListener('click', () => {
    if (selectedPromptId) {
        const prompt = prompts.find(p => p.id === selectedPromptId);
        if (prompt) {
            prompt.title = titleInput.value;
            const newText = textarea.value;
            if (newText !== prompt.text) {
                prompt.text = newText;
                if (!prompt.history) prompt.history = [];
                prompt.history.push(newText);
                if (prompt.history.length > 10) {
                    prompt.history.shift();
                }
            }
            savePrompts();
            loadPromptIntoEditor(prompt.id);
        }
    }
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
    }

    // Get initial theme
    const initialTheme = await window.electronAPI.getTheme();
    applyTheme(initialTheme);
});

// --- IPC Listeners ---
window.electronAPI.onThemeUpdated((theme) => {
    applyTheme(theme);
});
