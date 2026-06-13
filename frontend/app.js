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
const modalStatusBadge = document.getElementById('modal-status-badge');
const modalExplainHeadline = document.getElementById('modal-explain-headline');
const modalExplainList = document.getElementById('modal-explain-list');
const modalMessage = document.getElementById('modal-message');
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

    // Profile (top-left avatar button)
    const profileBtn = document.getElementById('btn-profile');
    if (profileBtn) profileBtn.addEventListener('click', showProfileModal);
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
                        <button class="btn-action control-panel" title="Open the full visual git control panel">&#9881; Control</button>
                        <button class="btn-action run-now" ${!isEnabled || isPaused ? 'disabled' : ''}>Push Now</button>
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

    // Open Control Panel Action
    projectsTbody.querySelectorAll('.control-panel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tr = e.target.closest('tr');
            const id = tr.dataset.id;
            const project = projects.find(p => p.id === id);
            if (project) openGitPanel(project);
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

    // Profile avatar — show the user's initials (or a prompt dot if unset)
    updateProfileAvatar();

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

// Profile — top-left avatar showing the user's git identity initials.
function updateProfileAvatar() {
    const el = document.getElementById('profile-avatar-initials');
    if (!el) return;
    const id = systemStatus.git_identity || {};
    const name = (id.name || '').trim();
    const email = (id.email || '').trim();
    let initials = '?';
    if (name) {
        const parts = name.split(/\s+/).filter(Boolean);
        initials = (parts.length >= 2
            ? parts[0][0] + parts[parts.length - 1][0]
            : parts[0].slice(0, 2)).toUpperCase();
    } else if (email) {
        initials = email[0].toUpperCase();
    }
    el.textContent = initials;
    const btn = document.getElementById('btn-profile');
    if (btn) btn.classList.toggle('profile-unset', !id.configured);
}

// Profile modal — at-a-glance git identity + GitHub sign-in, with one-click
// access to the same setup flows Git itself asks for on first use.
async function showProfileModal() {
    const modal = document.getElementById('profile-modal');

    async function refresh() {
        // Git identity
        let identity = systemStatus.git_identity || {};
        try {
            const r = await fetch('/git-identity');
            if (r.ok) identity = await r.json();
        } catch (_) { /* keep cached */ }

        const nameEl = document.getElementById('profile-identity-name');
        const emailEl = document.getElementById('profile-identity-email');
        const idBadge = document.getElementById('profile-identity-badge');
        nameEl.textContent = identity.name && identity.name.trim() ? identity.name : 'Not set';
        emailEl.textContent = identity.email && identity.email.trim() ? identity.email : 'Not set';
        nameEl.classList.toggle('profile-muted', !(identity.name && identity.name.trim()));
        emailEl.classList.toggle('profile-muted', !(identity.email && identity.email.trim()));
        idBadge.textContent = identity.configured ? 'Configured' : 'Not set';
        idBadge.className = `badge ${identity.configured ? 'badge-success' : 'badge-failed'}`;

        // GitHub credentials
        const stateEl = document.getElementById('profile-auth-state');
        const helperEl = document.getElementById('profile-auth-helper');
        const authBadge = document.getElementById('profile-auth-badge');
        try {
            const r = await fetch('/git-auth');
            const auth = r.ok ? await r.json() : {};
            const stored = !!auth.has_credentials;
            stateEl.textContent = stored ? 'Stored — pushes sign in automatically' : 'Not stored';
            stateEl.classList.toggle('profile-muted', !stored);
            helperEl.textContent = auth.helper ? auth.helper : 'none configured';
            helperEl.classList.toggle('profile-muted', !auth.helper);
            authBadge.textContent = stored ? 'Signed in' : 'Not set';
            authBadge.className = `badge ${stored ? 'badge-success' : 'badge-failed'}`;
        } catch (_) {
            stateEl.textContent = 'Could not check';
            authBadge.textContent = '—';
            authBadge.className = 'badge';
        }
    }

    await refresh();
    modal.style.display = 'flex';

    const closeX = document.getElementById('btn-close-profile-modal');
    const closeFooter = document.getElementById('btn-profile-close-footer');
    const editIdentity = document.getElementById('btn-profile-edit-identity');
    const editAuth = document.getElementById('btn-profile-edit-auth');

    const close = () => {
        modal.style.display = 'none';
        closeX.removeEventListener('click', close);
        closeFooter.removeEventListener('click', close);
        editIdentity.removeEventListener('click', onEditIdentity);
        editAuth.removeEventListener('click', onEditAuth);
        modal.removeEventListener('click', onOverlay);
    };
    const onOverlay = (e) => { if (e.target === modal) close(); };
    // Open the existing setup modal on top, then refresh the profile view.
    const onEditIdentity = async () => {
        await showGitIdentityModal(systemStatus.git_identity?.configured);
        await refresh();
        updateProfileAvatar();
    };
    const onEditAuth = async () => {
        await showGitAuthModal();
        await refresh();
    };

    closeX.addEventListener('click', close);
    closeFooter.addEventListener('click', close);
    editIdentity.addEventListener('click', onEditIdentity);
    editAuth.addEventListener('click', onEditAuth);
    modal.addEventListener('click', onOverlay);
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

// Turn a raw log entry (status + terse message) into a plain-English
// explanation: a one-line headline plus a few bullet lines covering what
// happened, why, and what to do next. Keyword rules run first (most specific),
// then a per-status fallback, so every log — old or new — gets elaborated.
function explainLog(log) {
    const status = String(log.status || '').toUpperCase();
    const msg = String(log.message || '');
    const proj = log.project && log.project !== 'System' ? `"${log.project}"` : 'this project';

    // Search across the message AND the captured git stdout/stderr, so we can
    // recognise the exact git error even when the short message is generic.
    const hay = `${msg}\n${log.stdout || ''}\n${log.stderr || ''}`.toLowerCase();
    const has = (...words) => words.some(w => hay.includes(w));

    // Ordered, most-specific-first. First rule whose `when` is true wins, so
    // precise git-error signatures are listed before broad/engine/status rules.
    const rules = [
        // ---- GitHub policy / server-side push rejections --------------------
        { when: () => has('gh006', 'protected branch', 'must be made through a pull request', 'changes must be made through', 'required status check'),
          head: `GitHub is blocking direct pushes to this branch — it's protected.`,
          lines: [`The push reached GitHub, but a branch-protection rule on the remote (e.g. on "main") forbids pushing straight to it; changes have to arrive via a Pull Request.`,
                  `Either push ${proj} to a different branch and open a PR, or, on GitHub, go to Settings → Branches and relax/remove the protection rule for this branch.`,
                  `Nothing is wrong locally — your commits are safe and the rebase succeeded; only the final upload was refused.`] },
        { when: () => has('exceeds github\'s file size limit', 'this exceeds', 'gh001', 'large files detected', 'see https://git-lfs', 'use git lfs', 'file size limit of 100'),
          head: `A file is too big for GitHub (100 MB limit per file).`,
          lines: [`One or more files exceed GitHub's hard size limit, so the whole push was rejected.`,
                  `Either add the oversized file(s) to this project's excluded paths so they're not backed up, or track them with Git LFS.`,
                  `Big binaries, datasets, videos, and build outputs are the usual culprits.`] },
        { when: () => has('shallow update not allowed'),
          head: `GitHub refused a shallow/partial push.`,
          lines: [`The local repo is a shallow clone, which GitHub won't accept a push from.`,
                  `Convert it to a full repository (git fetch --unshallow) before backing up; the control panel terminal can run that.`] },

        // ---- Authentication / authorization ---------------------------------
        { when: () => has('support for password authentication was removed', 'password authentication is not available', 'token authentication'),
          head: `GitHub no longer accepts account passwords — you need a token.`,
          lines: [`GitHub removed plain-password pushes. The saved password (if any) can't work anymore.`,
                  `Create a Personal Access Token (PAT) on GitHub and enter it as your password/credential in the dashboard, then try again.`] },
        { when: () => has('the requested url returned error: 403', '403 forbidden', 'write access to repository not granted', 'permission to ', ' denied to '),
          head: `Your account is signed in, but isn't allowed to write to this repo.`,
          lines: [`GitHub accepted the login but returned "forbidden" — the account/token doesn't have push (write) access to this repository.`,
                  `Make sure you own the repo or are a collaborator, and that your token includes the "repo" scope. Then retry.`] },
        { when: () => has('repository not found', 'the requested url returned error: 404'),
          head: `GitHub can't find that repository.`,
          lines: [`The remote URL points to a repo that doesn't exist, was renamed/deleted, or is private and your credentials can't see it.`,
                  `Double-check the GitHub URL in ${proj}'s settings (typos, wrong owner, .git suffix), and that your token can access private repos.`] },
        { when: () => has('the requested url returned error: 401', 'invalid username or password', 'bad credentials', 'authentication failed'),
          head: `GitHub rejected the login.`,
          lines: [`Your saved credentials are missing, wrong, or expired — a Personal Access Token may have been revoked or timed out.`,
                  `Re-enter your GitHub credentials in the dashboard, then try Run Now. Your commits are still safe locally.`] },
        { when: () => has('permission denied (publickey)', 'host key verification failed', 'ssh: connect to host'),
          head: `The SSH key for GitHub isn't set up correctly.`,
          lines: [`This repo uses an SSH remote (git@github.com:…), and GitHub didn't accept the machine's SSH key.`,
                  `Add this computer's SSH public key to your GitHub account, or switch the remote to an HTTPS URL in the control panel.`] },
        { when: () => has('could not read from remote repository'),
          head: `GitHub wouldn't let the push connect — usually credentials or access.`,
          lines: [`Git couldn't read from the remote, which almost always means an authentication or permission problem.`,
                  `Re-check your credentials and that you have access to the repository, then retry. Your local commits are intact.`] },

        // ---- Network / connectivity -----------------------------------------
        { when: () => has('could not resolve host', 'name or service not known', 'temporary failure in name resolution'),
          head: `Couldn't look up GitHub's address — likely offline or DNS issue.`,
          lines: [`The computer couldn't resolve the GitHub hostname, so it never reached the server.`,
                  `Check your internet/DNS. Your changes are committed locally and will upload on the next run once you're back online.`] },
        { when: () => has('failed to connect', "couldn't connect to server", 'connection refused', 'connection timed out', 'could not connect', 'proxy'),
          head: `Couldn't reach GitHub over the network.`,
          lines: [`The connection to GitHub failed or timed out — a dropped link, firewall, VPN, or proxy can cause this.`,
                  `Your commits are safe locally; the next backup will retry the upload automatically.`] },
        { when: () => has('rpc failed', 'early eof', 'the remote end hung up', 'unexpected disconnect', 'fetch-pack', 'index-pack failed'),
          head: `The connection dropped partway through the transfer.`,
          lines: [`The push/pull started but the network cut out before it finished — common on flaky connections or very large pushes.`,
                  `Just run the backup again; git resumes cleanly and nothing was corrupted.`] },
        { when: () => has('internet unavailable', 'marked pending retry') || status === 'PENDING_RETRY',
          head: `Saved locally — will finish uploading once you're back online.`,
          lines: [`Your changes were committed on this machine, but GitHub couldn't be reached to upload them.`,
                  `No data is lost. The next scheduled run (or Run Now) will push these commits automatically when the connection returns.`] },
        { when: () => has('timed out after', 'command timed out'),
          head: `A git command took too long and was stopped.`,
          lines: [`The operation exceeded its time limit and was cancelled — usually a stalled network or a very large repository.`,
                  `Try again on a stronger connection, or trim large files from ${proj}.`] },

        // ---- Identity / local repo state ------------------------------------
        { when: () => has('please tell me who you are', 'empty ident', 'unable to auto-detect email', 'author identity unknown'),
          head: `Git doesn't know who to record as the commit author.`,
          lines: [`The commit needs a name and email (user.name / user.email) and none are set for this repo.`,
                  `Open the control panel for ${proj} → set the repository identity, then run the backup again.`] },
        { when: () => has('index.lock', 'unable to create', 'another git process seems to be running'),
          head: `Another git process is using the repository (or a stale lock is left behind).`,
          lines: [`Git protects the repo with a lock file while it works, and it's currently present.`,
                  `Wait for any other git operation to finish. If nothing is running, delete the ".git/index.lock" file and retry.`] },
        { when: () => has('no space left on device', 'disk full', 'out of disk'),
          head: `The drive is out of space.`,
          lines: [`Git couldn't write because the disk is full, so the backup stopped.`,
                  `Free up space on the drive holding ${proj}, then run again.`] },
        { when: () => has('would be overwritten by', 'your local changes to the following files would be overwritten'),
          head: `Uncommitted edits are blocking the sync.`,
          lines: [`A pull/merge/checkout would clobber local changes that haven't been committed, so git refused to proceed.`,
                  `Commit or stash those changes in the control panel first, then retry.`] },
        { when: () => has('not a git repository'),
          head: `This folder isn't a Git repository (yet).`,
          lines: [`The command needs an initialised repo, but the .git folder is missing.`,
                  `Click Run Now once to initialise ${proj}, then use the control panel.`] },
        { when: () => has('did not match any file', 'pathspec'),
          head: `Git couldn't find a file the command referred to.`,
          lines: [`A referenced path doesn't exist in the repo — it may have been renamed or already removed.`,
                  `Refresh the view and try again with the current file list.`] },

        // ---- Merge / rebase / conflicts (after the GH-policy rule above) -----
        { when: () => has('after rebase', 'auto-rebase failed', 'non-fast-forward') || (status === 'FAILED' && has('rejected')),
          head: `GitHub and your folder have conflicting histories.`,
          lines: [`GitHub has commits that clash with your local ones, and the engine couldn't merge them automatically.`,
                  `Open the control panel for ${proj} to resolve the conflict (pull/rebase and fix files), then push. Your local work is intact.`] },
        { when: () => has('automatic merge failed', 'fix conflicts', 'unmerged', 'needs merge', 'conflict'),
          head: `There are merge conflicts to resolve.`,
          lines: [`Two versions of the same lines changed, so git can't combine them on its own.`,
                  `Use the Changes tab in the control panel to fix the conflicted files, stage them, then continue/commit.`] },

        // ---- Backup engine: guards & status ---------------------------------
        { when: () => has('large commit guard'),
          head: `Too many files changed at once — backup was held for safety.`,
          lines: [`More than 1000 files changed, which often means an accidental bulk move/delete rather than real edits.`,
                  `If the change is intentional, click Run Now to push it through manually (the guard only blocks automatic runs).`] },
        { when: () => has('git add failed'),
          head: `Couldn't stage your changes for the commit.`,
          lines: [`The "git add" step failed — see Standard Error below for the exact cause (often a locked file or permissions issue).`,
                  `Close any program holding the files open and try again.`] },
        { when: () => has('git commit failed'),
          head: `Couldn't record the commit.`,
          lines: [`Files were staged but the commit step failed — see Standard Error below for details.`,
                  `A common cause is a missing git identity (user.name / user.email); set it in the control panel.`] },
        { when: () => has('failed to run git status'),
          head: `Couldn't read the repository's state.`,
          lines: [`The "git status" check failed, so the engine stopped before changing anything — see Standard Error below.`,
                  `The repository may be corrupted or mid-operation; the control panel can help recover it.`] },
        { when: () => has('origin remote missing'),
          head: `No GitHub destination is configured for ${proj}.`,
          lines: [`The repo has no "origin" remote, so there's nowhere to push the backup to.`,
                  `Add the GitHub repository URL in the project settings, then run again.`] },
        { when: () => has('folder missing', 'does not exist'),
          head: `The folder for ${proj} couldn't be found.`,
          lines: [`The path saved for this project no longer exists — it may have been moved, renamed, or deleted, or an external drive is disconnected.`,
                  `Fix the folder path in the project settings (or reconnect the drive), then run again.`] },
        { when: () => has('git is not installed'),
          head: `Git isn't installed (or isn't on the system PATH).`,
          lines: [`The engine drives the real git program, which it couldn't find on this machine.`,
                  `Install Git for Windows and restart the dashboard, then try again.`] },
        { when: () => has('scheduler error'),
          head: `The backup engine itself hit an error.`,
          lines: [`An unexpected failure happened while the scheduler was running — see the message above and Standard Error below.`] },
        { when: () => has('unusually large repository', 'large repository', '1gb', 'exceeds 1gb'),
          head: `This repository is unusually large (over 1 GB).`,
          lines: [`Backups will still run, but pushes may be slow and could hit GitHub size limits.`,
                  `Consider excluding large build artifacts, datasets, or binaries from ${proj}.`] },

        // ---- Dry run --------------------------------------------------------
        { when: () => has('dry run mode disabled'),
          head: `Dry Run Mode was turned off — backups are live again.`,
          lines: [`From now on, runs will actually commit and push to GitHub instead of just simulating.`] },
        { when: () => has('dry run mode enabled'),
          head: `Dry Run Mode was turned on — backups are now simulated.`,
          lines: [`Runs will detect changes and report what they'd do, but won't commit or push anything until you turn Dry Run off.`] },
        { when: () => has('dry run'),
          head: `Dry Run is on — changes were detected but only simulated.`,
          lines: [`The engine saw changes to back up, but Dry Run Mode is enabled, so nothing was actually committed or pushed.`,
                  `Turn off Dry Run Mode to perform real backups.`] },

        // ---- Backup engine: successes ---------------------------------------
        { when: () => has('synced remote changes and pushed', 'pending commits after syncing', 'after syncing remote'),
          head: `Backed up after syncing newer changes from GitHub.`,
          lines: [`GitHub already had commits that ${proj} didn't, so the engine first pulled and rebased those in, then pushed your work on top.`,
                  `Your folder and the GitHub repo are now fully in sync — nothing was lost on either side.`] },
        { when: () => has('unpushed'),
          head: `Uploaded earlier commits that hadn't reached GitHub yet.`,
          lines: [`A previous backup committed your changes locally but couldn't upload them (often an earlier network drop).`,
                  `Those pending commits have now been pushed, so GitHub is caught up.`] },
        { when: () => has('push disabled'),
          head: `Changes were committed locally, but not uploaded to GitHub.`,
          lines: [`Auto-push is turned off for ${proj}, so the engine saved a commit on your machine only.`,
                  `To get these onto GitHub, enable auto-push in the project settings, or push from the control panel.`] },
        { when: () => has('backup completed successfully', 'committed and pushed'),
          head: `Your latest changes are safely backed up on GitHub.`,
          lines: [`The engine staged your changed files, committed them, and uploaded the commit to GitHub.`,
                  `The GitHub repo is now an exact copy of your folder as of this run.`] },
        { when: () => has('push rejected', 'remote diverged'),
          head: `GitHub had newer commits — syncing them before pushing.`,
          lines: [`The remote moved ahead of your local copy, so a straight push was rejected.`,
                  `The engine is pulling and rebasing those changes in, then it will retry the push.`] },
        { when: () => has('connection test successful'),
          head: `GitHub is reachable and your credentials work.`,
          lines: [`A test connection to the remote succeeded — the URL is valid and authentication passed.`,
                  `Backups for ${proj} should push without prompting for a login.`] },
        { when: () => has('connection test failed'),
          head: `The connection test to GitHub didn't pass.`,
          lines: [`The remote URL, credentials, or network couldn't be verified — see the raw message for the specific reason.`,
                  `Fix the reported issue, then test again before relying on automatic backups.`] },
        { when: () => has('initialized new git'),
          head: `Set up version tracking in this folder for the first time.`,
          lines: [`The folder wasn't a Git repository yet, so the engine ran the one-time setup (git init) so it can be backed up.`,
                  `From now on each backup records a new snapshot of your changes.`] },
        { when: () => has('linked remote origin', 'updated remote origin'),
          head: `Linked ${proj} to its GitHub repository.`,
          lines: [`The remote URL where backups are uploaded has been set/updated.`,
                  `Future pushes will go to this destination.`] },
        { when: () => has('no changes to back up after applying ignore'),
          head: `Nothing to back up — the only changes were ignored files.`,
          lines: [`Files did change, but every one of them is excluded by your ignore rules, so there was nothing to commit.`,
                  `This is normal — adjust the excluded paths if you expected these files to be backed up.`] },
        { when: () => has('no changes detected') || status === 'NO_CHANGES',
          head: `Nothing changed since the last backup — no action needed.`,
          lines: [`The folder is byte-for-byte identical to the last snapshot, so there was nothing new to commit or push.`,
                  `This is a healthy "all caught up" result, not an error.`] },

        // ---- Control panel: manual git operations ---------------------------
        { when: () => has('force-pushed'),
          head: `Force-pushed — your local history overwrote GitHub's.`,
          lines: [`A force push replaced the remote branch with your local version (using --force-with-lease for safety).`,
                  `Any commits that were only on GitHub and not in ${proj} are now gone from that branch. Use this deliberately.`] },
        { when: () => has('amended commit'),
          head: `Rewrote the most recent commit.`,
          lines: [`The last commit was amended (its message and/or contents changed) instead of adding a new one.`,
                  `If it was already pushed, you'll need to force-push to update GitHub.`] },
        { when: () => has('committed via control panel'),
          head: `Saved a commit by hand from the control panel.`,
          lines: [`Your staged changes were recorded as a new commit on this machine.`,
                  `Push it (or let the next backup do so) to get it onto GitHub.`] },
        { when: () => has('pulled') && has('control panel'),
          head: `Pulled the latest changes down from GitHub.`,
          lines: [`Remote commits were fetched and merged into ${proj}, bringing your folder up to date.`] },
        { when: () => has('pushed tag'),
          head: `Uploaded a tag to GitHub.`,
          lines: [`The named tag now exists on the remote as well as locally.`] },
        { when: () => has('pushed') && has('control panel'),
          head: `Pushed your branch to GitHub from the control panel.`,
          lines: [`Local commits were uploaded; GitHub now matches your branch.`] },
        { when: () => has('created branch'),
          head: `Created a new branch.`,
          lines: [`A new line of work was started; commits now go onto this branch until you switch.`] },
        { when: () => has('switched to branch'),
          head: `Switched to a different branch.`,
          lines: [`Your working files now reflect that branch. Backups commit to whichever branch is checked out.`] },
        { when: () => has("merged '", 'merged "', 'merged ') && has('control panel'),
          head: `Merged another branch into the current one.`,
          lines: [`The other branch's commits are now part of this branch's history.`] },
        { when: () => has('deleted branch'),
          head: `Deleted a branch.`,
          lines: [`The branch label was removed. If it had commits not merged elsewhere, those may now be hard to reach (recoverable via the reflog for a while).`] },
        { when: () => has('rebased onto'),
          head: `Rebased the current branch onto another.`,
          lines: [`Your commits were replayed on top of the target branch, giving a linear history.`,
                  `If this branch was already pushed, you'll need to force-push to update GitHub.`] },
        { when: () => has('reverted commit'),
          head: `Reverted a commit.`,
          lines: [`A new commit was added that undoes the changes from the chosen one — history is preserved, the effect is reversed.`] },
        { when: () => has('cherry-picked'),
          head: `Cherry-picked a commit onto this branch.`,
          lines: [`A single commit from elsewhere was copied onto the current branch.`] },
        { when: () => has('reset --hard'),
          head: `Hard reset — moved the branch and discarded changes.`,
          lines: [`The branch was moved to another commit and uncommitted (and any skipped) changes were thrown away.`,
                  `If this lost something you needed, the reflog in the control panel can often recover it.`] },
        { when: () => has('reset --'),
          head: `Moved the branch pointer (reset).`,
          lines: [`The current branch now points at a different commit; your files were kept.`] },
        { when: () => has('added remote'),
          head: `Added a new remote.`,
          lines: [`A new push/fetch destination was registered for this repo.`] },
        { when: () => has('updated remote') && has('control panel'),
          head: `Changed a remote's URL.`,
          lines: [`Pushes/fetches for that remote will now go to the new address.`] },
        { when: () => has('removed remote'),
          head: `Removed a remote.`,
          lines: [`That push/fetch destination is no longer configured.`] },
        { when: () => has('created tag'),
          head: `Created a tag.`,
          lines: [`A named marker now points at this commit (handy for releases). Push it to share it on GitHub.`] },
        { when: () => has('deleted tag'),
          head: `Deleted a tag.`,
          lines: [`The local tag was removed. If it was on GitHub, delete it there too.`] },
        { when: () => has('cleared all stashes'),
          head: `Cleared every saved stash.`,
          lines: [`All stashed snapshots were dropped permanently — they can't be recovered.`] },
        { when: () => has('dropped a stash'),
          head: `Deleted a stash.`,
          lines: [`That saved snapshot was discarded.`] },
        { when: () => has('stashed', 'popped', 'applied') && has('stash'),
          head: `Used the stash to set changes aside (or bring them back).`,
          lines: [`Stashing parks uncommitted work so you can switch context, then restore it later.`] },
        { when: () => has('cleaned untracked'),
          head: `Permanently deleted untracked files.`,
          lines: [`Files git wasn't tracking were removed from disk. This can't be undone — they were never committed.`] },
        { when: () => has('untracked') && has('kept on disk'),
          head: `Stopped tracking files (but kept them on disk).`,
          lines: [`The files remain in your folder but git will no longer back them up. Commit to record their removal from the repo.`] },
        { when: () => has('--abort'),
          head: `Aborted the in-progress operation.`,
          lines: [`The merge/rebase/cherry-pick was cancelled and the repo returned to its previous state.`] },
        { when: () => has('--continue', '--skip'),
          head: `Continued the in-progress operation.`,
          lines: [`After resolving the conflict, the merge/rebase/cherry-pick was resumed.`] },
        { when: () => has('discarded'),
          head: `Local changes were thrown away on purpose.`,
          lines: [`Uncommitted edits in the listed files were discarded via the control panel.`,
                  `This is irreversible for those edits — they were never committed, so they can't be recovered.`] },
        { when: () => has('updated repository identity'),
          head: `Set the commit author name/email for this repo.`,
          lines: [`Future commits will be attributed to this identity.`] },
        { when: () => /\$\s*git /.test(msg),
          head: `Ran a manual git command from the terminal.`,
          lines: [`You executed a git command by hand. Its output is shown in Standard Output below.`] },

        // ---- Dashboard / system events --------------------------------------
        { when: () => has('added project to dashboard'),
          head: `Added a new project to the dashboard.`,
          lines: [`${proj} is now tracked and will be backed up on its schedule.`] },
        { when: () => has('was deleted from dashboard'),
          head: `Removed a project from the dashboard.`,
          lines: [`It will no longer be backed up. The folder and its GitHub repo are untouched — only the dashboard entry was removed.`] },
        { when: () => has('was paused'),
          head: `Paused this project.`,
          lines: [`Automatic backups are on hold until you resume it. Manual Run Now still works.`] },
        { when: () => has('was resumed', 'was enabled'),
          head: `Re-enabled this project.`,
          lines: [`Automatic backups will run again on schedule.`] },
        { when: () => has('was disabled'),
          head: `Disabled this project.`,
          lines: [`The scheduler will skip it until you enable it again.`] },
        { when: () => has('force run complete'),
          head: `Ran a backup across all projects at once.`,
          lines: [`Every enabled, non-paused project was processed in one pass — see the message for how many succeeded, failed, or were skipped.`] },
        { when: () => has('force run aborted', 'run now aborted') || status === 'ALREADY_RUNNING',
          head: `Skipped — another backup was already in progress.`,
          lines: [`Only one backup runs at a time to avoid two git operations colliding.`,
                  `This run was skipped; the in-progress one will finish normally.`] },
        { when: () => status === 'PAUSED' || status === 'DISABLED',
          head: `${proj} is paused, so the scheduler skipped it.`,
          lines: [`Backups are disabled for this project right now. Re-enable it to resume automatic runs.`] },
    ];

    for (const r of rules) {
        try { if (r.when()) return { headline: r.head, lines: r.lines }; }
        catch (_) { /* a bad rule should never break the modal */ }
    }

    // ---- Status fallbacks (nothing specific matched) ------------------------
    if (status === 'SUCCESS')
        return { headline: `Operation completed successfully.`, lines: [`The action finished without errors.`] };
    if (status === 'WARNING')
        return { headline: msg || `Something needs your attention.`,
            lines: [`The run didn't fully fail, but it didn't complete cleanly either — see the raw message and Standard Error below.`] };
    if (status === 'FAILED')
        return { headline: msg || `The operation failed.`,
            lines: [`It stopped before completing. Check the raw message and Standard Error below for the specific cause.`,
                    `Your local files were not changed by the failed step.`] };

    // Unknown status — show the message itself.
    return { headline: msg || `${status || 'Event'} logged.`, lines: [] };
}

// Modal Console Manager
function showLogConsoleModal(log) {
    modalProject.textContent = log.project;
    modalTimestamp.textContent = log.timestamp;

    const status = String(log.status || '').toUpperCase();
    modalStatusBadge.textContent = status || '—';
    modalStatusBadge.className = `badge badge-${status.toLowerCase()}`;

    const explained = explainLog(log);
    modalExplainHeadline.textContent = explained.headline;
    modalExplainList.innerHTML = '';
    (explained.lines || []).forEach(line => {
        const li = document.createElement('li');
        li.textContent = line;
        modalExplainList.appendChild(li);
    });

    const hasMsg = log.message && log.message.trim() !== "";
    const hasOut = log.stdout && log.stdout.trim() !== "";
    const hasErr = log.stderr && log.stderr.trim() !== "";

    modalMessage.textContent = hasMsg ? log.message.trim() : "No message recorded.";
    modalStdout.textContent = hasOut ? log.stdout.trim() : "No stdout content recorded.";
    modalStderr.textContent = hasErr ? log.stderr.trim() : "No stderr content recorded.";

    // Hide the raw git panes when there's nothing in them (e.g. internal
    // dashboard events run no git command), so the modal isn't full of
    // "No content recorded." placeholders.
    const sectionOf = (el) => el && el.closest('.console-section');
    const toggle = (el, show) => { const s = sectionOf(el); if (s) s.style.display = show ? '' : 'none'; };
    toggle(modalStdout, hasOut);
    toggle(modalStderr, hasErr);

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

// Toast Notification (replaces center-screen alert modal)
function showAlert(title, message, isError = false, isSuccess = false) {
    const container = document.getElementById('toast-container');

    const type = isError ? 'error' : isSuccess ? 'success' : 'info';
    const icon = isError ? '✕' : isSuccess ? '✓' : 'i';

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconEl = document.createElement('div');
    iconEl.className = 'toast-icon';
    iconEl.textContent = icon;

    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;

    const msgEl = document.createElement('div');
    msgEl.className = 'toast-message';
    setSafeMessageWithNewlines(msgEl, message);

    const body = document.createElement('div');
    body.className = 'toast-body';
    body.appendChild(titleEl);
    body.appendChild(msgEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '×';

    const progress = document.createElement('div');
    progress.className = 'toast-progress';

    toast.appendChild(iconEl);
    toast.appendChild(body);
    toast.appendChild(closeBtn);
    toast.appendChild(progress);
    container.appendChild(toast);

    const dismiss = () => {
        toast.style.animation = 'toastOut 0.35s ease-in forwards';
        setTimeout(() => toast.remove(), 350);
    };

    const timer = setTimeout(dismiss, 4000);
    closeBtn.addEventListener('click', () => { clearTimeout(timer); dismiss(); });

    return Promise.resolve();
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

/* ============================================================ */
/* Repository Control Panel — full visual git                   */
/* ============================================================ */

const gpState = { project: null, tab: 'changes', overview: null };

// ---- Generic API helpers ----
async function gitData(kind, params = {}) {
    const id = gpState.project.id;
    const qs = new URLSearchParams(params).toString();
    const url = `/git/${id}/data/${kind}` + (qs ? `?${qs}` : '');
    const res = await fetch(url);
    return res.json();
}

async function gitAction(op, params = {}) {
    const id = gpState.project.id;
    try {
        const res = await fetch(`/git/${id}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ op, params })
        });
        return res.json();
    } catch (err) {
        return { success: false, message: 'Could not reach the server.', output: String(err) };
    }
}

// Run an action, toast the result, optionally refresh the panel.
async function runGitAction(op, params = {}, { refresh = true, silentSuccess = false } = {}) {
    const result = await gitAction(op, params);
    if (result.success) {
        if (!silentSuccess) showAlert('Done', result.message || 'Operation completed.', false, true);
    } else {
        showAlert('Git', result.message || 'Operation failed.', true);
    }
    if (refresh) await gpRefresh();
    return result;
}

// ---- Centered DANGER confirm (destructive ops) ----
function showDanger(title, message, consequence, confirmText = 'Confirm') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('danger-overlay');
        document.getElementById('danger-title').textContent = title;
        document.getElementById('danger-message').textContent = message;
        document.getElementById('danger-consequence').textContent = consequence;
        const okBtn = document.getElementById('danger-confirm');
        const cancelBtn = document.getElementById('danger-cancel');
        okBtn.textContent = confirmText;

        const cleanup = (val) => {
            overlay.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onOverlay);
            window.removeEventListener('keydown', onKey);
            resolve(val);
        };
        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onOverlay = (e) => { if (e.target === overlay) cleanup(false); };
        const onKey = (e) => { if (e.key === 'Escape') cleanup(false); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onOverlay);
        window.addEventListener('keydown', onKey);

        overlay.style.display = 'flex';
        cancelBtn.focus();
    });
}

// ---- Generic single/double input prompt ----
function showInputModal({ title, desc = '', label = 'Value', value = '', label2 = null, value2 = '', okText = 'OK' }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('input-modal');
        document.getElementById('input-modal-title').textContent = title;
        document.getElementById('input-modal-desc').textContent = desc;
        document.getElementById('input-modal-desc').style.display = desc ? 'block' : 'none';
        document.getElementById('input-modal-label').textContent = label;
        const field = document.getElementById('input-modal-field');
        field.value = value;
        const field2group = document.getElementById('input-modal-field2-group');
        const field2 = document.getElementById('input-modal-field2');
        if (label2) {
            field2group.style.display = 'block';
            document.getElementById('input-modal-label2').textContent = label2;
            field2.value = value2;
        } else {
            field2group.style.display = 'none';
            field2.value = '';
        }
        document.getElementById('input-modal-ok').textContent = okText;

        const okBtn = document.getElementById('input-modal-ok');
        const cancelBtn = document.getElementById('input-modal-cancel');
        const closeBtn = document.getElementById('input-modal-close');

        const cleanup = (out) => {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOverlay);
            window.removeEventListener('keydown', onKey);
            resolve(out);
        };
        const onOk = () => cleanup({ ok: true, value: field.value.trim(), value2: field2.value.trim() });
        const onCancel = () => cleanup({ ok: false });
        const onOverlay = (e) => { if (e.target === modal) cleanup({ ok: false }); };
        const onKey = (e) => {
            if (e.key === 'Escape') cleanup({ ok: false });
            if (e.key === 'Enter' && document.activeElement !== cancelBtn) onOk();
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlay);
        window.addEventListener('keydown', onKey);

        modal.style.display = 'flex';
        field.focus();
        field.select();
    });
}

// ---- Open / close ----
let gpWired = false;
function openGitPanel(project) {
    gpState.project = project;
    gpState.tab = 'changes';
    document.getElementById('gp-repo-name').textContent = project.name;
    document.getElementById('gp-repo-path').textContent = project.path;

    if (!gpWired) {
        wireGitPanelChrome();
        gpWired = true;
    }

    // Reset tab UI
    document.querySelectorAll('.gp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'changes'));
    document.querySelectorAll('.gp-tabpane').forEach(p => p.classList.remove('active'));
    document.getElementById('gp-pane-changes').classList.add('active');
    // Fresh terminal for each open
    const termPane = document.getElementById('gp-pane-terminal');
    termPane.dataset.built = '';
    termPane.innerHTML = '';
    gpTermHistory = [];

    document.getElementById('git-panel').style.display = 'flex';
    gpRefresh();
}

function closeGitPanel() {
    document.getElementById('git-panel').style.display = 'none';
    gpState.project = null;
}

function wireGitPanelChrome() {
    document.getElementById('gp-close').addEventListener('click', closeGitPanel);
    document.getElementById('gp-refresh').addEventListener('click', gpRefresh);

    document.querySelectorAll('.gp-tab').forEach(tab => {
        tab.addEventListener('click', () => gpSwitchTab(tab.dataset.tab));
    });

    document.querySelectorAll('.gp-quick').forEach(btn => {
        btn.addEventListener('click', () => gpQuick(btn.dataset.quick));
    });

    document.getElementById('git-panel').addEventListener('click', (e) => {
        if (e.target.id === 'git-panel') closeGitPanel();
    });
}

function gpSwitchTab(tab) {
    gpState.tab = tab;
    document.querySelectorAll('.gp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.gp-tabpane').forEach(p => p.classList.remove('active'));
    document.getElementById(`gp-pane-${tab}`).classList.add('active');
    gpRenderActiveTab();
}

// ---- Refresh header + active tab ----
async function gpRefresh() {
    if (!gpState.project) return;
    const ov = await gitData('overview');
    gpState.overview = ov;
    gpRenderHeader(ov);
    await gpRenderActiveTab();
}

function gpRenderHeader(ov) {
    const chip = document.getElementById('gp-branch-name');
    const sync = document.getElementById('gp-syncinfo');
    if (!ov || !ov.ok) {
        chip.textContent = '—';
        sync.textContent = ov && ov.error ? ov.error : '';
        return;
    }
    if (!ov.is_repo) {
        chip.textContent = '(not initialized)';
        sync.textContent = 'Run a backup once to initialize this repository.';
        return;
    }
    const b = ov.branch || {};
    chip.textContent = b.branch || 'HEAD';
    let parts = [];
    if (b.upstream) parts.push(`→ ${b.upstream}`);
    if (b.ahead) parts.push(`<span class="ahead">↑${b.ahead}</span>`);
    if (b.behind) parts.push(`<span class="behind">↓${b.behind}</span>`);
    if (b.no_commits) parts.push('(no commits yet)');
    if (!b.ahead && !b.behind && b.upstream) parts.push('up to date');
    sync.innerHTML = parts.join(' &nbsp; ');
}

function gpRenderActiveTab() {
    switch (gpState.tab) {
        case 'changes': return gpRenderChanges();
        case 'history': return gpRenderHistory();
        case 'branches': return gpRenderBranches();
        case 'remotes': return gpRenderRemotes();
        case 'stash': return gpRenderStash();
        case 'terminal': return gpRenderTerminal();
    }
}

// ---- Quick actions (header) ----
async function gpQuick(kind) {
    const ov = gpState.overview;
    if (!ov || !ov.is_repo) {
        showAlert('Git', 'This folder is not a repository yet. Click "Run Now" once to initialize it.', true);
        return;
    }
    const branch = (ov.branch && ov.branch.branch) || 'main';
    if (kind === 'fetch') return runGitAction('fetch', { remote: 'origin' });
    if (kind === 'pull') return runGitAction('pull', { remote: 'origin', branch, rebase: true });
    if (kind === 'push') return runGitAction('push', { remote: 'origin', branch });
    if (kind === 'forcepush') {
        const ok = await showDanger(
            'Force Push?',
            `This will overwrite the "${branch}" branch on the remote with your local version.`,
            `git push --force-with-lease origin ${branch}\n\nAny commits on the remote that you don't have locally will be PERMANENTLY LOST. Use only if you know the remote should match your machine.`,
            'Force Push'
        );
        if (ok) return runGitAction('push', { remote: 'origin', branch, force: true });
    }
}

// ---- Helpers for rendering ----
function codeClass(code) {
    const c = (code || '').toUpperCase();
    if (c.startsWith('M')) return 'code-M';
    if (c.startsWith('A')) return 'code-A';
    if (c.startsWith('D')) return 'code-D';
    if (c.startsWith('R')) return 'code-R';
    if (c.startsWith('U')) return 'code-U';
    return 'code-Q';
}
function codeLabel(code) { return escapeHTML((code || '?').toUpperCase().slice(0, 1)); }

function notRepoHTML() {
    return `<div class="gp-empty">This folder is not a Git repository yet.<br>
        Close this panel and click <strong>Push Now</strong> (or Force Run All) once — that initializes it — then come back.</div>`;
}

// ---- CHANGES tab ----
async function gpRenderChanges() {
    const pane = document.getElementById('gp-pane-changes');
    const ov = gpState.overview;
    if (!ov || !ov.ok) { pane.innerHTML = `<div class="gp-empty">${escapeHTML(ov && ov.error ? ov.error : 'Could not load status.')}</div>`; return; }
    if (!ov.is_repo) { pane.innerHTML = notRepoHTML(); return; }

    const fileRow = (f, kind) => {
        const code = f.code || (kind === 'untracked' ? '?' : 'M');
        let actions = '';
        if (kind === 'staged') {
            actions = `<button class="gp-mini" data-act="unstage-file" data-file="${escapeHTML(f.path)}">Unstage</button>
                       <button class="gp-mini" data-act="diff" data-file="${escapeHTML(f.path)}" data-staged="1">Diff</button>`;
        } else if (kind === 'conflict') {
            actions = `<button class="gp-mini good" data-act="stage-file" data-file="${escapeHTML(f.path)}">Mark resolved</button>
                       <button class="gp-mini" data-act="diff" data-file="${escapeHTML(f.path)}" data-staged="0">Diff</button>`;
        } else {
            const untrackBtn = kind === 'unstaged'
                ? `<button class="gp-mini" data-act="untrack-file" data-file="${escapeHTML(f.path)}" title="Stop tracking but keep the file on disk">Untrack</button>` : '';
            actions = `<button class="gp-mini good" data-act="stage-file" data-file="${escapeHTML(f.path)}">Stage</button>
                       <button class="gp-mini" data-act="diff" data-file="${escapeHTML(f.path)}" data-staged="0">Diff</button>
                       ${untrackBtn}
                       <button class="gp-mini danger" data-act="discard-file" data-file="${escapeHTML(f.path)}" data-untracked="${kind === 'untracked' ? '1' : '0'}">Discard</button>`;
        }
        const path = typeof f === 'string' ? f : f.path;
        return `<div class="gp-file">
            <span class="gp-file-code ${codeClass(code)}">${codeLabel(code)}</span>
            <span class="gp-file-path" data-act="diff" data-file="${escapeHTML(path)}" data-staged="${kind === 'staged' ? '1' : '0'}" title="${escapeHTML(path)}">${escapeHTML(path)}</span>
            <span class="gp-file-actions">${actions}</span>
        </div>`;
    };

    const staged = ov.staged || [];
    const unstaged = ov.unstaged || [];
    const untracked = (ov.untracked || []).map(p => ({ path: p, code: '?' }));
    const conflicts = ov.conflicts || [];
    const unstagedAll = [...unstaged, ...untracked];

    let html = '';

    // In-progress merge/rebase/cherry-pick/revert — the escape hatch from conflicts.
    if (ov.in_progress) {
        const op = ov.in_progress;
        const skipBtn = op !== 'merge' ? `<button class="gp-mini" data-act="seq-skip">Skip</button>` : '';
        html += `<div class="gp-section">
            <div style="background:var(--color-retry-bg); border:1px solid rgba(249,115,22,0.4); border-radius:10px; padding:0.85rem 1rem;">
                <div style="font-weight:700; color:var(--color-retry); margin-bottom:0.35rem;">⏸ ${escapeHTML(op)} in progress</div>
                <div style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:0.7rem;">
                    Resolve any conflicts below (stage the fixed files), then <strong>Continue</strong>. Or <strong>Abort</strong> to undo this ${escapeHTML(op)} entirely.</div>
                <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                    <button class="gp-mini good" data-act="seq-continue">Continue ${escapeHTML(op)}</button>
                    ${skipBtn}
                    <button class="gp-mini danger" data-act="seq-abort">Abort ${escapeHTML(op)}</button>
                </div>
            </div></div>`;
    }

    if (conflicts.length) {
        html += `<div class="gp-section">
            <div class="gp-section-head"><h3 style="color:var(--color-failed)">⚠ Conflicts <span class="gp-count">${conflicts.length}</span></h3></div>
            <div class="gp-filelist">${conflicts.map(f => fileRow(f, 'conflict')).join('')}</div>
        </div>`;
    }

    html += `<div class="gp-section">
        <div class="gp-section-head">
            <h3>Staged <span class="gp-count">${staged.length}</span></h3>
            ${staged.length ? `<button class="gp-mini" data-act="unstage-all">Unstage all</button>` : ''}
        </div>
        ${staged.length ? `<div class="gp-filelist">${staged.map(f => fileRow(f, 'staged')).join('')}</div>` : `<div class="gp-empty">Nothing staged.</div>`}
    </div>`;

    html += `<div class="gp-section">
        <div class="gp-section-head">
            <h3>Changes <span class="gp-count">${unstagedAll.length}</span></h3>
            ${unstagedAll.length ? `<button class="gp-mini good" data-act="stage-all">Stage all</button>` : ''}
        </div>
        ${unstagedAll.length ? `<div class="gp-filelist">${unstagedAll.map(f => fileRow(f, f.code === '?' ? 'untracked' : 'unstaged')).join('')}</div>` : `<div class="gp-empty">No local changes. Working tree clean.</div>`}
    </div>`;

    // Commit box
    html += `<div class="gp-commit-box">
        <textarea id="gp-commit-msg" placeholder="Commit message... (leave blank for a timestamped default)"></textarea>
        <div class="gp-commit-row">
            <label class="gp-checkline"><input type="checkbox" id="gp-amend"> Amend last commit</label>
            <div style="display:flex; gap:0.5rem;">
                <button class="btn btn-secondary gp-quick" data-act="commit" data-push="0">Commit</button>
                <button class="btn btn-primary gp-quick" data-act="commit" data-push="1">Commit &amp; Push</button>
            </div>
        </div>
    </div>`;

    // Diff viewer slot
    html += `<div id="gp-diff-slot"></div>`;

    pane.innerHTML = html;
    gpBindActions(pane);
}

// ---- HISTORY tab ----
async function gpRenderHistory() {
    const pane = document.getElementById('gp-pane-history');
    pane.innerHTML = `<div class="gp-empty">Loading history…</div>`;
    const [data, reflog] = await Promise.all([gitData('log', { limit: 80 }), gitData('reflog', { limit: 40 })]);
    if (!data.ok) { pane.innerHTML = `<div class="gp-empty">${escapeHTML(data.error || 'Could not load history.')}</div>`; return; }

    const rows = (data.commits || []).map(c => {
        const refs = c.refs ? `<span class="gp-commit-refs">${escapeHTML(c.refs)}</span>` : '';
        return `<div class="gp-commit">
            <span class="gp-sha">${escapeHTML(c.short)}</span>
            <div class="gp-commit-main">
                <div class="gp-commit-subject">${escapeHTML(c.subject)}${refs}</div>
                <div class="gp-commit-meta">${escapeHTML(c.author)} · ${escapeHTML(c.date)}</div>
            </div>
            <div class="gp-commit-actions">
                <button class="gp-mini" data-act="view-commit" data-sha="${escapeHTML(c.sha)}">View</button>
                <button class="gp-mini" data-act="revert" data-sha="${escapeHTML(c.sha)}">Revert</button>
                <button class="gp-mini" data-act="cherry-pick" data-sha="${escapeHTML(c.sha)}">Cherry-pick</button>
                <button class="gp-mini" data-act="undo-keep" data-sha="${escapeHTML(c.sha)}">Undo→Here (keep files)</button>
                <button class="gp-mini danger" data-act="hard-reset" data-sha="${escapeHTML(c.sha)}">Hard Reset</button>
                <button class="gp-mini" data-act="tag-at" data-sha="${escapeHTML(c.sha)}">Tag</button>
            </div>
        </div>`;
    }).join('') || `<div class="gp-empty">No commits yet.</div>`;

    const refRows = (reflog.entries || []).map(r =>
        `<div class="gp-row"><div class="gp-row-main">
            <div class="gp-row-title"><span class="gp-sha">${escapeHTML(r.short)}</span> ${escapeHTML(r.selector)}</div>
            <div class="gp-row-sub">${escapeHTML(r.subject)}</div></div>
            <div class="gp-row-actions">
                <button class="gp-mini" data-act="view-commit" data-sha="${escapeHTML(r.short)}">View</button>
                <button class="gp-mini danger" data-act="reflog-restore" data-sel="${escapeHTML(r.selector || r.short)}">Restore here</button>
            </div></div>`
    ).join('') || `<div class="gp-empty">No reflog entries.</div>`;

    pane.innerHTML = `
        <div id="gp-hist-diff-slot"></div>
        <div class="gp-section">
            <div class="gp-section-head"><h3>Commit History <span class="gp-count">${(data.commits||[]).length}</span></h3>
            <span class="gp-hint">Newest first</span></div>
            <div>${rows}</div>
        </div>
        <div class="gp-section">
            <div class="gp-section-head"><h3>Reflog — recovery <span class="gp-count">${(reflog.entries||[]).length}</span></h3>
            <span class="gp-hint">Every state HEAD has been in. Use "Restore here" to undo a bad reset/op.</span></div>
            <div>${refRows}</div>
        </div>`;
    gpBindActions(pane);
}

async function gpShowCommit(sha) {
    const slot = document.getElementById('gp-hist-diff-slot');
    if (!slot) return;
    slot.innerHTML = `<div class="gp-section"><div class="gp-section-head"><h3>Commit ${escapeHTML(sha.slice(0,10))}</h3>
        <button class="gp-mini" id="gp-commit-diff-close">Close</button></div><div class="gp-diff">Loading…</div></div>`;
    const data = await gitData('show', { sha });
    slot.querySelector('.gp-diff').innerHTML = colorizeDiff(data.diff || '(no content)');
    document.getElementById('gp-commit-diff-close').addEventListener('click', () => { slot.innerHTML = ''; });
    slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---- BRANCHES tab ----
async function gpRenderBranches() {
    const pane = document.getElementById('gp-pane-branches');
    pane.innerHTML = `<div class="gp-empty">Loading branches…</div>`;
    const [data, tagsData] = await Promise.all([gitData('branches'), gitData('tags')]);
    if (!data.ok) { pane.innerHTML = `<div class="gp-empty">${escapeHTML(data.error || 'Could not load branches.')}</div>`; return; }

    const localRows = (data.local || []).map(b => {
        const cur = b.current ? `<span class="gp-current-tag">current</span>` : '';
        const up = b.upstream ? `<div class="gp-row-sub">tracks ${escapeHTML(b.upstream)}</div>` : '';
        let actions = '';
        if (!b.current) {
            actions += `<button class="gp-mini good" data-act="branch-switch" data-branch="${escapeHTML(b.name)}">Switch</button>
                        <button class="gp-mini" data-act="branch-merge" data-branch="${escapeHTML(b.name)}">Merge into current</button>
                        <button class="gp-mini" data-act="branch-rebase" data-branch="${escapeHTML(b.name)}">Rebase onto</button>
                        <button class="gp-mini danger" data-act="branch-delete" data-branch="${escapeHTML(b.name)}">Delete</button>`;
        }
        return `<div class="gp-row"><div class="gp-row-main">
            <div class="gp-row-title">${escapeHTML(b.name)} ${cur}</div>${up}</div>
            <div class="gp-row-actions">${actions}</div></div>`;
    }).join('') || `<div class="gp-empty">No local branches.</div>`;

    const remoteRows = (data.remote || []).map(r => {
        return `<div class="gp-row"><div class="gp-row-main"><div class="gp-row-title">${escapeHTML(r)}</div></div>
            <div class="gp-row-actions">
                <button class="gp-mini good" data-act="branch-track" data-branch="${escapeHTML(r)}">Checkout locally</button>
            </div></div>`;
    }).join('') || `<div class="gp-empty">No remote branches.</div>`;

    const tags = (tagsData.tags || []);
    const tagRows = tags.length ? tags.map(t =>
        `<div class="gp-row"><div class="gp-row-main"><div class="gp-row-title">${escapeHTML(t)}</div></div>
        <div class="gp-row-actions">
            <button class="gp-mini good" data-act="tag-push" data-tag="${escapeHTML(t)}">Push</button>
            <button class="gp-mini danger" data-act="tag-delete" data-tag="${escapeHTML(t)}">Delete</button>
        </div></div>`
    ).join('') : `<div class="gp-empty">No tags.</div>`;

    pane.innerHTML = `
        <div class="gp-section">
            <div class="gp-section-head"><h3>Local Branches <span class="gp-count">${(data.local||[]).length}</span></h3>
                <button class="gp-mini good" data-act="branch-new">+ New branch</button></div>
            <div>${localRows}</div>
        </div>
        <div class="gp-section">
            <div class="gp-section-head"><h3>Remote Branches <span class="gp-count">${(data.remote||[]).length}</span></h3></div>
            <div>${remoteRows}</div>
        </div>
        <div class="gp-section">
            <div class="gp-section-head"><h3>Tags <span class="gp-count">${tags.length}</span></h3></div>
            <div>${tagRows}</div>
        </div>`;
    gpBindActions(pane);
}

// ---- REMOTES tab ----
async function gpRenderRemotes() {
    const pane = document.getElementById('gp-pane-remotes');
    pane.innerHTML = `<div class="gp-empty">Loading remotes…</div>`;
    const data = await gitData('remotes');
    if (!data.ok) { pane.innerHTML = `<div class="gp-empty">${escapeHTML(data.error || 'Could not load remotes.')}</div>`; return; }

    const rows = (data.remotes || []).map(r => {
        return `<div class="gp-row"><div class="gp-row-main">
            <div class="gp-row-title">${escapeHTML(r.name)}</div>
            <div class="gp-row-sub">${escapeHTML(r.fetch || r.push || '')}</div></div>
            <div class="gp-row-actions">
                <button class="gp-mini" data-act="remote-edit" data-name="${escapeHTML(r.name)}" data-url="${escapeHTML(r.fetch || r.push || '')}">Edit URL</button>
                <button class="gp-mini danger" data-act="remote-remove" data-name="${escapeHTML(r.name)}">Remove</button>
            </div></div>`;
    }).join('') || `<div class="gp-empty">No remotes configured.</div>`;

    pane.innerHTML = `<div class="gp-section">
        <div class="gp-section-head"><h3>Remotes <span class="gp-count">${(data.remotes||[]).length}</span></h3>
            <button class="gp-mini good" data-act="remote-new">+ Add remote</button></div>
        <div>${rows}</div>
        <p class="gp-hint" style="margin-top:0.75rem;">"origin" is the remote your backups push to. Editing it here updates where this repo syncs.</p>
    </div>`;
    gpBindActions(pane);
}

// ---- STASH tab ----
async function gpRenderStash() {
    const pane = document.getElementById('gp-pane-stash');
    pane.innerHTML = `<div class="gp-empty">Loading stashes…</div>`;
    const data = await gitData('stashes');
    if (!data.ok) { pane.innerHTML = `<div class="gp-empty">${escapeHTML(data.error || 'Could not load stashes.')}</div>`; return; }

    const rows = (data.stashes || []).map(s => {
        return `<div class="gp-row"><div class="gp-row-main">
            <div class="gp-row-title">${escapeHTML(s.ref)}</div>
            <div class="gp-row-sub">${escapeHTML(s.message)} · ${escapeHTML(s.age)}</div></div>
            <div class="gp-row-actions">
                <button class="gp-mini good" data-act="stash-pop" data-ref="${escapeHTML(s.ref)}">Pop</button>
                <button class="gp-mini" data-act="stash-apply" data-ref="${escapeHTML(s.ref)}">Apply</button>
                <button class="gp-mini danger" data-act="stash-drop" data-ref="${escapeHTML(s.ref)}">Drop</button>
            </div></div>`;
    }).join('') || `<div class="gp-empty">No stashes.</div>`;

    pane.innerHTML = `<div class="gp-section">
        <div class="gp-section-head"><h3>Stashes <span class="gp-count">${(data.stashes||[]).length}</span></h3>
            <button class="gp-mini good" data-act="stash-save">Stash changes</button></div>
        <div>${rows}</div>
        <p class="gp-hint" style="margin-top:0.75rem;">A stash shelves your uncommitted changes so the working tree is clean, without committing.</p>
    </div>`;
    gpBindActions(pane);
}

// ---- TERMINAL tab ----
let gpTermHistory = [];
async function gpRenderTerminal() {
    const pane = document.getElementById('gp-pane-terminal');
    if (pane.dataset.built === '1') return; // keep output across refreshes
    pane.dataset.built = '1';
    pane.innerHTML = `
        <div class="gp-section">
            <div class="gp-section-head"><h3>Git Terminal</h3><span class="gp-hint">Type any git command. Only <code>git</code> runs — no shell.</span></div>
            <div class="gp-terminal-out" id="gp-term-out">Welcome to the visual git terminal.\nExamples:  status   ·   log --oneline -10   ·   diff   ·   show HEAD\n</div>
            <div class="gp-terminal-input-row">
                <span class="gp-prompt">$ git</span>
                <input type="text" id="gp-term-input" placeholder="status" autocomplete="off" spellcheck="false">
                <button class="btn btn-primary" id="gp-term-run">Run</button>
            </div>
        </div>`;
    const input = document.getElementById('gp-term-input');
    const run = document.getElementById('gp-term-run');
    const exec = async () => {
        const cmd = input.value.trim();
        if (!cmd) return;
        gpTermHistory.push(cmd);
        const out = document.getElementById('gp-term-out');
        const res = await gitAction('terminal', { command: cmd });
        const block = document.createElement('div');
        const cmdLine = document.createElement('div');
        cmdLine.className = 't-cmd';
        cmdLine.textContent = `$ git ${cmd}`;
        block.appendChild(cmdLine);
        const body = document.createElement('div');
        if (!res.success) body.className = 't-err';
        body.textContent = res.output || res.message || '';
        block.appendChild(body);
        out.appendChild(block);
        out.scrollTop = out.scrollHeight;
        input.value = '';
        // A terminal command may have changed state — refresh header silently.
        const ov = await gitData('overview');
        gpState.overview = ov;
        gpRenderHeader(ov);
    };
    run.addEventListener('click', exec);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') exec(); });
    input.focus();
}

// ---- Diff viewer (changes tab) ----
async function gpShowDiff(file, staged) {
    const slot = document.getElementById('gp-diff-slot');
    if (!slot) return;
    slot.innerHTML = `<div class="gp-section"><div class="gp-section-head"><h3>Diff: ${escapeHTML(file)}</h3>
        <button class="gp-mini" id="gp-diff-close">Close</button></div><div class="gp-diff">Loading…</div></div>`;
    const data = await gitData('diff', { file, staged: staged ? '1' : '0' });
    const box = slot.querySelector('.gp-diff');
    box.innerHTML = colorizeDiff(data.diff || '(no differences)');
    document.getElementById('gp-diff-close').addEventListener('click', () => { slot.innerHTML = ''; });
    slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function colorizeDiff(text) {
    return text.split('\n').map(line => {
        const e = escapeHTML(line);
        if (line.startsWith('+++') || line.startsWith('---')) return `<span class="d-meta">${e}</span>`;
        if (line.startsWith('@@')) return `<span class="d-hunk">${e}</span>`;
        if (line.startsWith('+')) return `<span class="d-add">${e}</span>`;
        if (line.startsWith('-')) return `<span class="d-del">${e}</span>`;
        if (line.startsWith('diff ') || line.startsWith('index ')) return `<span class="d-meta">${e}</span>`;
        return e;
    }).join('\n');
}

// ---- Action dispatch (delegation) ----
function gpBindActions(container) {
    container.querySelectorAll('[data-act]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            gpDispatch(el.dataset, el);
        });
    });
}

async function gpDispatch(d, el) {
    const act = d.act;
    switch (act) {
        // --- staging ---
        case 'stage-file': return runGitAction('stage', { files: [d.file] }, { silentSuccess: true });
        case 'unstage-file': return runGitAction('unstage', { files: [d.file] }, { silentSuccess: true });
        case 'stage-all': return runGitAction('stage', { all: true }, { silentSuccess: true });
        case 'unstage-all': return runGitAction('unstage', { all: true }, { silentSuccess: true });
        case 'diff': return gpShowDiff(d.file, d.staged === '1');
        case 'untrack-file': {
            const ok = await showConfirm('Untrack file',
                `Stop tracking "${d.file}" but keep it on your disk?\n\nGit will no longer version this file. The file itself is NOT deleted.`,
                { confirmText: 'Untrack' });
            if (ok) return runGitAction('untrack', { files: [d.file] });
            return;
        }
        // --- in-progress sequence (merge/rebase/cherry-pick/revert) ---
        case 'seq-continue': return runGitAction('sequence', { command: 'continue' });
        case 'seq-skip': return runGitAction('sequence', { command: 'skip' });
        case 'seq-abort': {
            const ok = await showConfirm('Abort operation',
                `Undo the in-progress ${gpState.overview.in_progress} and return to the state before it started?`,
                { isDelete: true, confirmText: 'Abort' });
            if (ok) return runGitAction('sequence', { command: 'abort' });
            return;
        }
        case 'discard-file': {
            const ok = await showDanger('Discard changes?',
                `Throw away all uncommitted changes to "${d.file}".`,
                `git checkout -- ${d.file}\n\nThis file will revert to its last committed state. Unsaved edits are gone for good.`,
                'Discard');
            if (ok) return runGitAction('discard', { files: [d.file], include_untracked: d.untracked === '1' });
            return;
        }
        // --- commit ---
        case 'commit': {
            const msg = document.getElementById('gp-commit-msg').value.trim();
            const amend = document.getElementById('gp-amend').checked;
            const result = await runGitAction('commit', { message: msg, amend, stage_all: false }, { refresh: false });
            if (result.success && d.push === '1') {
                const branch = (gpState.overview.branch && gpState.overview.branch.branch) || 'main';
                await runGitAction('push', { remote: 'origin', branch }, { refresh: false });
            }
            return gpRefresh();
        }
        // --- history ---
        case 'view-commit': return gpShowCommit(d.sha);
        case 'reflog-restore': {
            const ok = await showDanger('Restore to this state?',
                `Hard-reset your current branch to ${escapeHTML(d.sel)}.`,
                `git reset --hard ${d.sel}\n\nYour branch will point exactly here. Any commits and uncommitted changes after this state will be lost (though the reflog may still remember them for a while).`,
                'Restore');
            if (ok) return runGitAction('reset', { mode: 'hard', target: d.sel });
            return;
        }
        case 'revert': return runGitAction('revert', { sha: d.sha });
        case 'cherry-pick': return runGitAction('cherry_pick', { sha: d.sha });
        case 'undo-keep': {
            const ok = await showConfirm('Undo to this commit',
                `Move the branch back to ${d.sha.slice(0,8)} but KEEP all your file changes in the working tree?\n\nNothing is deleted; later commits become uncommitted changes you can re-commit.`,
                { confirmText: 'Undo (keep files)' });
            if (ok) return runGitAction('reset', { mode: 'mixed', target: d.sha });
            return;
        }
        case 'hard-reset': {
            const ok = await showDanger('Hard Reset?',
                `Move the branch to ${d.sha.slice(0,8)} and DELETE everything after it.`,
                `git reset --hard ${d.sha.slice(0,8)}\n\nAll commits after this point AND all uncommitted changes will be PERMANENTLY DESTROYED.`,
                'Hard Reset');
            if (ok) return runGitAction('reset', { mode: 'hard', target: d.sha });
            return;
        }
        case 'tag-at': {
            const r = await showInputModal({ title: 'Create Tag', desc: `Tag commit ${d.sha.slice(0,8)}`, label: 'Tag name', label2: 'Message (optional)' });
            if (r.ok && r.value) return runGitAction('tag', { action: 'create', name: r.value, message: r.value2, sha: d.sha });
            return;
        }
        // --- branches ---
        case 'branch-new': {
            const r = await showInputModal({ title: 'New Branch', label: 'Branch name', desc: 'Creates and switches to a new branch from the current HEAD.' });
            if (r.ok && r.value) return runGitAction('branch_create', { name: r.value, checkout: true });
            return;
        }
        case 'branch-switch': return runGitAction('branch_switch', { name: d.branch });
        case 'branch-merge': {
            const ok = await showConfirm('Merge branch',
                `Merge "${d.branch}" into your current branch?`, { confirmText: 'Merge' });
            if (ok) return runGitAction('branch_merge', { name: d.branch });
            return;
        }
        case 'branch-rebase': {
            const ok = await showConfirm('Rebase',
                `Rebase your current branch onto "${d.branch}"?\n\nThis replays your commits on top of ${d.branch}. If conflicts arise you can Continue or Abort from the Changes tab — nothing is lost.`,
                { confirmText: 'Rebase' });
            if (ok) return runGitAction('rebase', { branch: d.branch });
            return;
        }
        case 'branch-track': {
            const local = d.branch.replace(/^[^/]+\//, '');
            return runGitAction('branch_create', { name: local, checkout: true, start_point: d.branch });
        }
        case 'branch-delete': {
            const ok = await showDanger('Delete branch?',
                `Delete the local branch "${d.branch}".`,
                `git branch -D ${d.branch}\n\nIf this branch has commits that aren't merged anywhere else, those commits will be lost.`,
                'Delete branch');
            if (ok) return runGitAction('branch_delete', { name: d.branch, force: true });
            return;
        }
        // --- remotes ---
        case 'remote-new': {
            const r = await showInputModal({ title: 'Add Remote', label: 'Name', value: 'origin', label2: 'URL (https or ssh)' });
            if (r.ok && r.value && r.value2) return runGitAction('remote_add', { name: r.value, url: r.value2 });
            return;
        }
        case 'remote-edit': {
            const r = await showInputModal({ title: 'Edit Remote URL', desc: `Remote: ${d.name}`, label: 'New URL', value: d.url });
            if (r.ok && r.value) return runGitAction('remote_seturl', { name: d.name, url: r.value });
            return;
        }
        case 'remote-remove': {
            const ok = await showConfirm('Remove remote',
                `Remove the remote "${d.name}"? This only unlinks it locally; nothing on the server is deleted.`,
                { isDelete: true, confirmText: 'Remove' });
            if (ok) return runGitAction('remote_remove', { name: d.name });
            return;
        }
        // --- stash ---
        case 'stash-save': {
            const r = await showInputModal({ title: 'Stash Changes', label: 'Message (optional)', desc: 'Shelves your uncommitted changes.' });
            if (r.ok) return runGitAction('stash', { action: 'save', message: r.value, include_untracked: true });
            return;
        }
        case 'stash-pop': return runGitAction('stash', { action: 'pop', ref: d.ref });
        case 'stash-apply': return runGitAction('stash', { action: 'apply', ref: d.ref });
        case 'stash-drop': {
            const ok = await showDanger('Drop stash?',
                `Permanently delete ${d.ref}.`,
                `git stash drop ${d.ref}\n\nThe shelved changes in this stash will be lost.`,
                'Drop');
            if (ok) return runGitAction('stash', { action: 'drop', ref: d.ref });
            return;
        }
        // --- tags ---
        case 'tag-push': return runGitAction('tag', { action: 'push', name: d.tag, remote: 'origin' });
        case 'tag-delete': {
            const ok = await showConfirm('Delete tag', `Delete tag "${d.tag}"?`, { isDelete: true, confirmText: 'Delete' });
            if (ok) return runGitAction('tag', { action: 'delete', name: d.tag });
            return;
        }
        default:
            console.warn('Unknown gp action:', act);
    }
}
