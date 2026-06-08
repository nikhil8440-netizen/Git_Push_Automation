// State Management
let projects = [];
let logs = [];
let systemStatus = {};
let pollingInterval = null;

// DOM Elements
const projectsTbody = document.getElementById('projects-tbody');
const logsListContainer = document.getElementById('logs-list-container');
const formPanel = document.getElementById('form-panel');
const projectForm = document.getElementById('project-form');
const formTitle = document.getElementById('form-title');
const btnShowAdd = document.getElementById('btn-show-add');
const btnForceRun = document.getElementById('btn-force-run');
const btnCloseForm = document.getElementById('btn-close-form');
const btnCancel = document.getElementById('btn-cancel');
const dryRunCheckbox = document.getElementById('dry-run-checkbox');

// Filter Elements
const logSearch = document.getElementById('log-search');
const logFilterStatus = document.getElementById('log-filter-status');

// Metrics Elements
const metricTotal = document.querySelector('#metric-total .metric-val');
const metricActive = document.querySelector('#metric-active .metric-val');
const metricSuccess = document.querySelector('#metric-success .metric-val');
const metricFailed = document.querySelector('#metric-failed .metric-val');
const metricRetry = document.querySelector('#metric-retry .metric-val');
const metricPaused = document.querySelector('#metric-paused .metric-val');

// Modal Elements
const logModal = document.getElementById('log-modal');
const modalProject = document.getElementById('modal-project');
const modalTimestamp = document.getElementById('modal-timestamp');
const modalStdout = document.getElementById('modal-stdout');
const modalStderr = document.getElementById('modal-stderr');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnModalCloseFooter = document.getElementById('btn-modal-close-footer');

// Git Identity Modal Elements
const gitIdentityModal = document.getElementById('git-identity-modal');
const gitIdentityName = document.getElementById('git-identity-name');
const gitIdentityEmail = document.getElementById('git-identity-email');

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    startPolling();
    await fetchInitialData();
    await checkAndPromptGitIdentity();
    await checkAndPromptGitAuth();
});

// Setup event listeners
function setupEventListeners() {
    // Show add project form
    btnShowAdd.addEventListener('click', () => {
        resetForm();
        formTitle.textContent = "Add Repository";
        formPanel.style.display = 'block';
        document.getElementById('p-name').focus();
    });

    // Close form buttons
    btnCloseForm.addEventListener('click', hideForm);
    btnCancel.addEventListener('click', hideForm);
    document.getElementById('btn-back-form').addEventListener('click', hideForm);

    // Form submission
    projectForm.addEventListener('submit', handleFormSubmit);

    // Force Run All
    btnForceRun.addEventListener('click', handleForceRun);

    // Dry Run mode toggle
    dryRunCheckbox.addEventListener('change', handleDryRunToggle);

    // Log filters
    logSearch.addEventListener('input', renderLogs);
    logFilterStatus.addEventListener('change', renderLogs);

    // Close modal
    btnCloseModal.addEventListener('click', hideModal);
    btnModalCloseFooter.addEventListener('click', hideModal);
    logModal.addEventListener('click', (e) => {
        if (e.target === logModal) hideModal();
    });
}

// Fetch helper functions
async function fetchInitialData() {
    await Promise.all([
        fetchProjects(),
        fetchLogs(),
        fetchSystemStatus()
    ]);
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        await Promise.all([
            fetchProjects(),
            fetchLogs(),
            fetchSystemStatus()
        ]);
    }, 5000); // Poll every 5 seconds
}

async function fetchProjects() {
    try {
        const res = await fetch('/projects');
        if (res.ok) {
            projects = await res.json();
            renderProjects();
            updateMetrics();
        }
    } catch (err) {
        console.error("Failed to fetch projects:", err);
    }
}

async function fetchLogs() {
    try {
        const res = await fetch('/logs');
        if (res.ok) {
            logs = await res.json();
            renderLogs();
        }
    } catch (err) {
        console.error("Failed to fetch logs:", err);
    }
}

async function fetchSystemStatus() {
    try {
        const res = await fetch('/system-status');
        if (res.ok) {
            systemStatus = await res.json();
            renderSystemStatus();
        }
    } catch (err) {
        console.error("Failed to fetch system status:", err);
    }
}

// UI Rendering - Projects Table
function renderProjects() {
    if (projects.length === 0) {
        projectsTbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    No repositories added yet. Click "+ Add Repository" to start.
                </td>
            </tr>
        `;
        return;
    }

    projectsTbody.innerHTML = projects.map(p => {
        const isPaused = p.paused;
        const isEnabled = p.enabled;
        
        // Compute display status
        let displayStatus = p.last_status || 'Never Run';
        if (!isEnabled) {
            displayStatus = 'DISABLED';
        } else if (isPaused) {
            displayStatus = 'PAUSED';
        }
        
        // Badge color class mapping
        const badgeClass = `badge-${displayStatus.toLowerCase()}`;
        const lastRunTime = p.last_run ? p.last_run : 'Never';
        
        return `
            <tr data-id="${p.id}">
                <td class="repo-name">${escapeHTML(p.name)}</td>
                <td class="repo-path" title="${escapeHTML(p.path)}">${escapeHTML(p.path)}</td>
                <td><span class="repo-branch">${escapeHTML(p.branch)}</span></td>
                <td><span class="badge ${badgeClass}">${displayStatus}</span></td>
                <td class="time-text">${lastRunTime}</td>
                <td>
                    <label class="switch-container">
                        <input type="checkbox" class="toggle-enable" ${isEnabled ? 'checked' : ''}>
                        <span class="switch-slider"></span>
                    </label>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action run-now" ${!isEnabled || isPaused ? 'disabled' : ''}>Run Now</button>
                        <button class="btn-action test-conn">Test Conn</button>
                        <button class="btn-action toggle-pause">${isPaused ? 'Resume' : 'Pause'}</button>
                        <button class="btn-action edit-proj">Edit</button>
                        <button class="btn-action delete-proj" style="color: var(--color-failed); border-color: rgba(239, 68, 68, 0.2)">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Bind event handlers inside table
    bindTableActions();
}

function bindTableActions() {
    // Enable/Disable toggles
    projectsTbody.querySelectorAll('.toggle-enable').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const tr = e.target.closest('tr');
            const id = tr.dataset.id;
            const enabled = e.target.checked;
            
            try {
                const res = await fetch(`/projects/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled })
                });
                if (res.ok) {
                    fetchProjects();
                    fetchLogs();
                }
            } catch (err) {
                console.error("Error setting project enable status:", err);
            }
        });
    });

    // Run Now Action
    projectsTbody.querySelectorAll('.run-now').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tr = e.target.closest('tr');
            const id = tr.dataset.id;
            const project = projects.find(p => p.id === id);
            const repoName = project ? project.name : 'Unknown';

            // Show custom backup prompt modal instead of native prompt + confirm
            const promptResult = await showBackupPrompt(repoName);
            if (!promptResult.run) {
                return; // User cancelled the backup
            }
            const commitMsg = promptResult.commitMsg || "";

            btn.disabled = true;
            showRunningOverlay();

            try {
                const res = await fetch(`/run/${id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ commit_message: commitMsg })
                });
                const result = await res.json();
                hideRunningOverlay();

                if (res.ok && result.success) {
                    await showAlert("Pushed to GitHub", result.message, false, true);
                } else {
                    await showAlert("Backup Issue", `Backup Failed or Warning Raised:\n${result.message}`, true);
                }
            } catch (err) {
                hideRunningOverlay();
                console.error("Run Now API failure:", err);
                await showAlert("Error", "An unexpected error occurred during execution.", true);
            } finally {
                btn.disabled = false;
                await fetchInitialData();
            }
        });
    });

    // Test Connection Action
    projectsTbody.querySelectorAll('.test-conn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tr = e.target.closest('tr');
            const id = tr.dataset.id;
            
            // Show loader spinner
            const originalText = btn.textContent;
            btn.innerHTML = `<span class="spinner"></span> Testing...`;
            btn.disabled = true;
            
            try {
                const res = await fetch(`/test-connection/${id}`, { method: 'POST' });
                const result = await res.json();
                
                if (res.ok && result.success) {
                    await showAlert("Test Connection", "Test connection successful!");
                } else {
                    await showAlert("Connection Failed", `Test connection failed:\n${result.message}`, true);
                }
            } catch (err) {
                console.error("Test connection failed:", err);
                await showAlert("Connection Error", "Could not connect to server.", true);
            } finally {
                await fetchInitialData();
            }
        });
    });

    // Pause/Resume Action
    projectsTbody.querySelectorAll('.toggle-pause').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tr = e.target.closest('tr');
            const id = tr.dataset.id;
            const project = projects.find(p => p.id === id);
            if (!project) return;
            
            const paused = !project.paused;
            
            try {
                const res = await fetch(`/projects/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paused })
                });
                if (res.ok) {
                    fetchProjects();
                    fetchLogs();
                }
            } catch (err) {
                console.error("Error setting pause state:", err);
            }
        });
    });

    // Edit Action
    projectsTbody.querySelectorAll('.edit-proj').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tr = e.target.closest('tr');
            const id = tr.dataset.id;
            const project = projects.find(p => p.id === id);
            if (!project) return;
            
            // Populate form
            document.getElementById('project-id').value = project.id;
            document.getElementById('p-name').value = project.name;
            document.getElementById('p-path').value = project.path;
            document.getElementById('p-origin').value = project.origin;
            document.getElementById('p-branch').value = project.branch;
            document.getElementById('p-interval').value = project.run_interval_minutes;
            document.getElementById('p-exclude').value = (project.excluded_paths || []).join(', ');
            
            document.getElementById('p-enabled').checked = project.enabled;
            document.getElementById('p-commit').checked = project.auto_commit;
            document.getElementById('p-push').checked = project.auto_push;
            document.getElementById('p-startup').checked = project.run_on_startup;
            
            formTitle.textContent = "Edit Repository";
            formPanel.style.display = 'block';
            document.getElementById('p-name').focus();
        });
    });

    // Delete Action
    projectsTbody.querySelectorAll('.delete-proj').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tr = e.target.closest('tr');
            const id = tr.dataset.id;
            const project = projects.find(p => p.id === id);
            if (!project) return;
            
            const confirmed = await showConfirm(
                "Delete Repository", 
                `Are you sure you want to delete project "${project.name}"?\nThis only removes it from Git Manager; your local files will NOT be affected.`,
                { isDelete: true, confirmText: "Delete" }
            );
            
            if (confirmed) {
                try {
                    const res = await fetch(`/projects/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        hideForm();
                        fetchProjects();
                        fetchLogs();
                    }
                } catch (err) {
                    console.error("Error deleting project:", err);
                }
            }
        });
    });
}

// UI Rendering - Activity Logs Panel
function renderLogs() {
    const query = logSearch.value.toLowerCase();
    const filterStatus = logFilterStatus.value;
    
    const filtered = logs.filter(log => {
        const matchesQuery = log.project.toLowerCase().includes(query) || log.message.toLowerCase().includes(query);
        const matchesStatus = !filterStatus || log.status === filterStatus;
        return matchesQuery && matchesStatus;
    });

    if (filtered.length === 0) {
        logsListContainer.innerHTML = `<div class="log-rowempty">No logs match your filter criteria.</div>`;
        return;
    }

    logsListContainer.innerHTML = filtered.map(log => {
        const badgeClass = `badge-${log.status.toLowerCase()}`;
        // Unique log key identification (index/timestamp)
        const logDataString = encodeURIComponent(JSON.stringify(log));
        
        return `
            <div class="log-row">
                <span class="col-time">${escapeHTML(log.timestamp)}</span>
                <span class="col-proj">${escapeHTML(log.project)}</span>
                <span class="col-status"><span class="badge ${badgeClass}">${log.status}</span></span>
                <span class="col-msg" title="${escapeHTML(log.message)}">${escapeHTML(log.message)}</span>
                <span class="col-action">
                    <button class="btn-action view-log-console" data-log="${logDataString}">Console</button>
                </span>
            </div>
        `;
    }).join('');

    // Bind event handlers inside logs list
    logsListContainer.querySelectorAll('.view-log-console').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const logData = JSON.parse(decodeURIComponent(btn.dataset.log));
            showLogConsoleModal(logData);
        });
    });
}

// UI Rendering - Metrics Summary Card values
function updateMetrics() {
    const total = projects.length;
    const active = projects.filter(p => p.enabled && !p.paused).length;
    const paused = projects.filter(p => p.enabled && p.paused).length;
    
    const success = projects.filter(p => p.enabled && p.last_status === 'SUCCESS').length;
    const failed = projects.filter(p => p.enabled && p.last_status === 'FAILED').length;
    const retry = projects.filter(p => p.enabled && p.last_status === 'PENDING_RETRY').length;

    metricTotal.textContent = total;
    metricActive.textContent = active;
    metricSuccess.textContent = success;
    metricFailed.textContent = failed;
    metricRetry.textContent = retry;
    metricPaused.textContent = paused;
}

// UI Rendering - System Status Panel Indicators
function renderSystemStatus() {
    bindIndicatorState('sys-python', systemStatus.python_installed);
    bindIndicatorState('sys-git', systemStatus.git_installed);
    bindIndicatorState('sys-internet', systemStatus.internet_available);
    bindIndicatorState('sys-task', systemStatus.task_registered);

    // Python
    const pythonEl = document.getElementById('sys-python');
    if (pythonEl) {
        pythonEl.onclick = () => showAlert(
            'Python',
            systemStatus.python_installed
                ? 'Python is installed and detected.\n\nThe Flask server and all git operations are running on this Python installation.'
                : 'Python was not detected in PATH.\n\nThe server appears to be running, so this may be a transient detection issue — try refreshing.',
            !systemStatus.python_installed
        );
    }

    // Git
    const gitEl = document.getElementById('sys-git');
    if (gitEl) {
        gitEl.onclick = () => showAlert(
            'Git',
            systemStatus.git_installed
                ? 'Git is installed and available in PATH.\n\nAll backup operations (init, add, commit, push) are ready.'
                : 'Git was not found in PATH.\n\nInstall Git and make sure it is added to your system PATH, then restart the server.\n\nWindows: git-scm.com\nmacOS: brew install git\nLinux: sudo apt install git',
            !systemStatus.git_installed
        );
    }

    // Identity — opens setup modal
    const identityConfigured = systemStatus.git_identity?.configured;
    bindIndicatorState('sys-identity', identityConfigured);
    const identityEl = document.getElementById('sys-identity');
    if (identityEl) {
        identityEl.onclick = () => showGitIdentityModal(identityConfigured);
    }

    // Network
    const netEl = document.getElementById('sys-internet');
    if (netEl) {
        netEl.onclick = () => showAlert(
            'Network',
            systemStatus.internet_available
                ? 'Network is reachable.\n\nGitHub is accessible — pushes should work normally.'
                : 'Cannot reach GitHub.\n\nCheck your internet connection. Backups will still commit locally and be marked "Pending Retry" — they will push automatically once connectivity is restored.',
            !systemStatus.internet_available
        );
    }

    // Scheduler
    const taskEl = document.getElementById('sys-task');
    if (taskEl) {
        taskEl.onclick = () => {
            const platform = systemStatus.platform || 'win32';
            if (platform !== 'win32') {
                showAlert(
                    'Scheduler',
                    'Automated scheduling via Task Scheduler is Windows-only.\n\nOn macOS and Linux, use "Run Now" or "Force Run All" from the dashboard.\n\nTo run on a schedule, set up a cron job manually:\n  python -m backend.scheduler'
                );
            } else if (systemStatus.task_registered) {
                showAlert(
                    'Scheduler',
                    'Windows Task Scheduler task is registered.\n\nThe backup engine runs automatically at logon and on each repo\'s configured interval — even when the dashboard is closed.'
                );
            } else {
                showAlert(
                    'Scheduler',
                    'Windows Task Scheduler task is not registered.\n\nTo enable automatic background backups, open PowerShell as Administrator and run:\n\ncd backend\n.\\create_task.ps1\n\nRemove it anytime with remove_task.ps1.',
                    true
                );
            }
        };
    }

    if (systemStatus.dry_run !== undefined) {
        dryRunCheckbox.checked = systemStatus.dry_run;
    }
}

function bindIndicatorState(elementId, isOk) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (isOk) {
        el.className = 'status-item ok';
        el.querySelector('.status-dot').style.backgroundColor = 'var(--color-success)';
    } else {
        el.className = 'status-item problem';
        el.querySelector('.status-dot').style.backgroundColor = 'var(--color-failed)';
    }
}

// Git Identity Setup
async function checkAndPromptGitIdentity() {
    try {
        const res = await fetch('/git-identity');
        if (!res.ok) return;
        const identity = await res.json();
        if (!identity.configured) {
            await showGitIdentityModal(false);
        }
    } catch (err) {
        console.error("Could not check git identity:", err);
    }
}

function showGitIdentityModal(isAlreadyConfigured) {
    return new Promise((resolve) => {
        const title = document.getElementById('git-identity-modal-title');
        title.textContent = isAlreadyConfigured ? 'Update Git Identity' : 'Git Identity Setup';

        if (systemStatus.git_identity) {
            gitIdentityName.value = systemStatus.git_identity.name || '';
            gitIdentityEmail.value = systemStatus.git_identity.email || '';
        }

        gitIdentityModal.style.display = 'flex';
        gitIdentityName.focus();

        const saveBtn = document.getElementById('btn-save-identity');
        const skipBtn = document.getElementById('btn-skip-identity');
        const closeBtn = document.getElementById('btn-close-identity-modal');

        const cleanup = () => {
            gitIdentityModal.style.display = 'none';
            saveBtn.removeEventListener('click', onSave);
            skipBtn.removeEventListener('click', onSkip);
            closeBtn.removeEventListener('click', onSkip);
            gitIdentityModal.removeEventListener('click', onOverlay);
            window.removeEventListener('keydown', onKey);
            resolve();
        };

        const onSave = async () => {
            const name = gitIdentityName.value.trim();
            const email = gitIdentityEmail.value.trim();
            if (!name || !email) {
                await showAlert("Missing Fields", "Please enter both a name and an email address.", true);
                return;
            }
            try {
                const res = await fetch('/git-identity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email })
                });
                const result = await res.json();
                if (res.ok && result.success) {
                    cleanup();
                    await showAlert("Identity Saved", `Git identity set:\n${name} <${email}>\n\nYou're all set. The first time you push to GitHub, a browser window will open to sign in — that's normal.`);
                    fetchSystemStatus();
                } else {
                    await showAlert("Error", result.error || "Failed to save git identity.", true);
                }
            } catch (err) {
                await showAlert("Error", "Could not reach the server.", true);
            }
        };

        const onSkip = () => cleanup();
        const onOverlay = (e) => { if (e.target === gitIdentityModal) cleanup(); };
        const onKey = (e) => {
            if (e.key === 'Escape') cleanup();
            if (e.key === 'Enter') onSave();
        };

        saveBtn.addEventListener('click', onSave);
        skipBtn.addEventListener('click', onSkip);
        closeBtn.addEventListener('click', onSkip);
        gitIdentityModal.addEventListener('click', onOverlay);
        window.addEventListener('keydown', onKey);
    });
}

// GitHub PAT Auth Setup (Linux only)
async function checkAndPromptGitAuth() {
    if (systemStatus.platform !== 'linux') return;
    try {
        const res = await fetch('/git-auth');
        if (!res.ok) return;
        const auth = await res.json();
        if (auth.needs_setup) {
            await showGitAuthModal();
        }
    } catch (err) {
        console.error("Could not check git auth status:", err);
    }
}

function showGitAuthModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('git-auth-modal');
        const usernameInput = document.getElementById('git-auth-username');
        const tokenInput = document.getElementById('git-auth-token');
        const saveBtn = document.getElementById('btn-save-auth');
        const skipBtn = document.getElementById('btn-skip-auth');
        const closeBtn = document.getElementById('btn-close-auth-modal');
        const toggleBtn = document.getElementById('btn-toggle-pat');

        usernameInput.value = '';
        tokenInput.value = '';
        tokenInput.type = 'password';
        toggleBtn.textContent = 'Show';

        toggleBtn.onclick = () => {
            if (tokenInput.type === 'password') {
                tokenInput.type = 'text';
                toggleBtn.textContent = 'Hide';
            } else {
                tokenInput.type = 'password';
                toggleBtn.textContent = 'Show';
            }
        };

        modal.style.display = 'flex';
        usernameInput.focus();

        const cleanup = () => {
            modal.style.display = 'none';
            saveBtn.removeEventListener('click', onSave);
            skipBtn.removeEventListener('click', onSkip);
            closeBtn.removeEventListener('click', onSkip);
            modal.removeEventListener('click', onOverlay);
            window.removeEventListener('keydown', onKey);
            resolve();
        };

        const onSave = async () => {
            const username = usernameInput.value.trim();
            const token = tokenInput.value.trim();
            if (!username || !token) {
                await showAlert("Missing Fields", "Please enter both your GitHub username and token.", true);
                return;
            }
            try {
                const res = await fetch('/git-auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, token })
                });
                const result = await res.json();
                if (res.ok && result.success) {
                    cleanup();
                    await showAlert("Credentials Saved", "GitHub credentials stored successfully.\n\nAll future pushes will authenticate automatically — no login needed.");
                    fetchSystemStatus();
                } else {
                    await showAlert("Error", result.error || "Failed to store credentials.", true);
                }
            } catch (err) {
                await showAlert("Error", "Could not reach the server.", true);
            }
        };

        const onSkip = () => cleanup();
        const onOverlay = (e) => { if (e.target === modal) cleanup(); };
        const onKey = (e) => {
            if (e.key === 'Escape') cleanup();
            if (e.key === 'Enter' && document.activeElement !== skipBtn) onSave();
        };

        saveBtn.addEventListener('click', onSave);
        skipBtn.addEventListener('click', onSkip);
        closeBtn.addEventListener('click', onSkip);
        modal.addEventListener('click', onOverlay);
        window.addEventListener('keydown', onKey);
    });
}

// Event Handlers
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('project-id').value;
    const name = document.getElementById('p-name').value.trim();
    const path = document.getElementById('p-path').value.trim();
    const origin = document.getElementById('p-origin').value.trim();
    const branch = document.getElementById('p-branch').value.trim() || 'main';
    const run_interval_minutes = document.getElementById('p-interval').value;
    
    // Parse excluded paths
    const excludeInput = document.getElementById('p-exclude').value;
    const excluded_paths = excludeInput.split(',').map(s => s.trim()).filter(s => s.length > 0);

    const enabled = document.getElementById('p-enabled').checked;
    const auto_commit = document.getElementById('p-commit').checked;
    const auto_push = document.getElementById('p-push').checked;
    const run_on_startup = document.getElementById('p-startup').checked;

    const payload = {
        name, path, origin, branch, run_interval_minutes,
        excluded_paths, enabled, auto_commit, auto_push, run_on_startup
    };

    try {
        let res;
        if (id) {
            // Edit project
            res = await fetch(`/projects/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            // Add new project
            res = await fetch('/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (res.ok) {
            hideForm();
            fetchInitialData();
        } else {
            const err = await res.json();
            await showAlert("Save Error", `Error saving project: ${err.error}`, true);
        }
    } catch (err) {
        console.error("API error while saving project:", err);
        await showAlert("Connection Error", "Server connection failed.", true);
    }
}

async function handleForceRun() {
    const enabledCount = projects.filter(p => p.enabled && !p.paused).length;
    if (enabledCount === 0) {
        await showAlert("Force Run", "No enabled repositories to run. Add one or enable an existing project first.", true);
        return;
    }
    
    const confirmed = await showConfirm(
        "Force Run All",
        `Force Run will back up all ${enabledCount} enabled repositor${enabledCount === 1 ? 'y' : 'ies'} now. Continue?`,
        { isForceRun: true, confirmText: "Run All" }
    );
    if (!confirmed) {
        return;
    }

    btnForceRun.disabled = true;
    showRunningOverlay();

    try {
        const res = await fetch('/run-all', { method: 'POST' });
        const result = await res.json();
        hideRunningOverlay();
        if (res.ok && result.success) {
            await showAlert("All Pushed to GitHub", result.message, false, true);
        } else {
            await showAlert("Force Run Warnings", `Force Run finished with issues:\n${result.message}`, true);
        }
    } catch (err) {
        hideRunningOverlay();
        console.error("Force Run API failure:", err);
        await showAlert("Force Run Error", "An unexpected error occurred during Force Run.", true);
    } finally {
        btnForceRun.disabled = false;
        await fetchInitialData();
    }
}

async function handleDryRunToggle(e) {
    const dry_run = e.target.checked;
    
    try {
        const res = await fetch('/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dry_run })
        });
        if (res.ok) {
            fetchInitialData();
        }
    } catch (err) {
        console.error("Error toggling dry run mode:", err);
    }
}

// Modal Console Manager
function showLogConsoleModal(log) {
    modalProject.textContent = log.project;
    modalTimestamp.textContent = log.timestamp;
    
    modalStdout.textContent = log.stdout && log.stdout.trim() !== "" ? log.stdout.trim() : "No stdout content recorded.";
    modalStderr.textContent = log.stderr && log.stderr.trim() !== "" ? log.stderr.trim() : "No stderr content recorded.";
    
    logModal.style.display = 'flex';
}

function hideModal() {
    logModal.style.display = 'none';
}

// Form visibility utility
function hideForm() {
    formPanel.style.display = 'none';
    resetForm();
}

function resetForm() {
    projectForm.reset();
    document.getElementById('project-id').value = '';
    // Ensure default checkbox states
    document.getElementById('p-enabled').checked = true;
    document.getElementById('p-commit').checked = true;
    document.getElementById('p-push').checked = true;
    document.getElementById('p-startup').checked = true;
}

// Sanitization utilities
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setSafeMessageWithNewlines(element, text) {
    element.innerHTML = '';
    if (!text) return;
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        element.appendChild(document.createTextNode(line));
        if (index < lines.length - 1) {
            element.appendChild(document.createElement('br'));
        }
    });
}

// Loading overlay helpers
function showRunningOverlay() {
    document.getElementById('run-loading-overlay').style.display = 'flex';
}
function hideRunningOverlay() {
    document.getElementById('run-loading-overlay').style.display = 'none';
}

// Promise-based Alert Helper
function showAlert(title, message, isError = false, isSuccess = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('alert-modal');
        const modalTitle = document.getElementById('alert-modal-title');
        const modalMsg = document.getElementById('alert-modal-message');
        const okBtn = document.getElementById('btn-ok-alert');
        const closeBtn = document.getElementById('btn-close-alert-modal');

        modalTitle.textContent = title;
        setSafeMessageWithNewlines(modalMsg, message);

        if (isError) {
            modalTitle.style.color = 'var(--color-failed)';
            okBtn.className = 'btn btn-failed-custom';
        } else if (isSuccess) {
            modalTitle.style.color = 'var(--color-success)';
            okBtn.className = 'btn btn-success-custom';
        } else {
            modalTitle.style.color = 'var(--text-primary)';
            okBtn.className = 'btn btn-primary';
        }

        const cleanup = () => {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            closeBtn.removeEventListener('click', onClose);
            modal.removeEventListener('click', onOverlayClick);
            window.removeEventListener('keydown', onKeyDown);
        };

        const onOk = () => {
            cleanup();
            resolve();
        };

        const onClose = () => {
            cleanup();
            resolve();
        };

        const onOverlayClick = (e) => {
            if (e.target === modal) {
                cleanup();
                resolve();
            }
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                cleanup();
                resolve();
            }
        };

        okBtn.addEventListener('click', onOk);
        closeBtn.addEventListener('click', onClose);
        modal.addEventListener('click', onOverlayClick);
        window.addEventListener('keydown', onKeyDown);

        modal.style.display = 'flex';
        okBtn.focus();
    });
}

// Promise-based Confirm Helper
function showConfirm(title, message, options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const modalTitle = document.getElementById('confirm-modal-title');
        const modalMsg = document.getElementById('confirm-modal-message');
        const acceptBtn = document.getElementById('btn-accept-confirm');
        const cancelBtn = document.getElementById('btn-cancel-confirm');
        const closeBtn = document.getElementById('btn-close-confirm-modal');

        modalTitle.textContent = title;
        setSafeMessageWithNewlines(modalMsg, message);

        acceptBtn.textContent = options.confirmText || 'Confirm';
        cancelBtn.textContent = options.cancelText || 'Cancel';

        if (options.isDelete) {
            acceptBtn.className = 'btn btn-delete-custom';
            modalTitle.style.color = 'var(--color-failed)';
        } else if (options.isForceRun) {
            acceptBtn.className = 'btn btn-force';
            modalTitle.style.color = 'var(--color-success)';
        } else {
            acceptBtn.className = 'btn btn-primary';
            modalTitle.style.color = 'var(--text-primary)';
        }

        const cleanup = (value) => {
            modal.style.display = 'none';
            acceptBtn.removeEventListener('click', onAccept);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onClose);
            modal.removeEventListener('click', onOverlayClick);
            window.removeEventListener('keydown', onKeyDown);
            resolve(value);
        };

        const onAccept = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onClose = () => cleanup(false);
        const onOverlayClick = (e) => {
            if (e.target === modal) cleanup(false);
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') cleanup(false);
            if (e.key === 'Enter' && e.target !== cancelBtn && e.target !== closeBtn) cleanup(true);
        };

        acceptBtn.addEventListener('click', onAccept);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onClose);
        modal.addEventListener('click', onOverlayClick);
        window.addEventListener('keydown', onKeyDown);

        modal.style.display = 'flex';
        acceptBtn.focus();
    });
}

// Promise-based Backup Prompt Helper
function showBackupPrompt(repoName) {
    return new Promise((resolve) => {
        const modal = document.getElementById('backup-modal');
        const repoNameEl = document.getElementById('backup-modal-repo-name');
        const commitMsgInput = document.getElementById('backup-commit-msg');
        const runBtn = document.getElementById('btn-confirm-backup');
        const cancelBtn = document.getElementById('btn-cancel-backup');
        const closeBtn = document.getElementById('btn-close-backup-modal');

        repoNameEl.textContent = `Repository: ${repoName}`;
        commitMsgInput.value = '';

        const cleanup = (value) => {
            modal.style.display = 'none';
            runBtn.removeEventListener('click', onRun);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onClose);
            modal.removeEventListener('click', onOverlayClick);
            window.removeEventListener('keydown', onKeyDown);
            resolve(value);
        };

        const onRun = () => {
            const val = commitMsgInput.value.trim();
            cleanup({ run: true, commitMsg: val });
        };
        const onCancel = () => cleanup({ run: false });
        const onClose = () => cleanup({ run: false });
        const onOverlayClick = (e) => {
            if (e.target === modal) cleanup({ run: false });
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') cleanup({ run: false });
            if (e.key === 'Enter') onRun();
        };

        runBtn.addEventListener('click', onRun);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onClose);
        modal.addEventListener('click', onOverlayClick);
        window.addEventListener('keydown', onKeyDown);

        modal.style.display = 'flex';
        commitMsgInput.focus();
    });
}
