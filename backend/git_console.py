"""git_console.py — Visual Git Control Panel engine.

This module turns raw git commands into structured, GUI-friendly operations so
the user can do *every* git task by clicking instead of typing. It is a sibling
of git_runner.py:

  - git_runner.py  -> the automated BACKUP engine (safe, never destructive).
  - git_console.py -> the manual CONTROL PANEL engine (full power, including
                      destructive ops that the user explicitly confirms in the UI).

Design rules:
  * Everything goes through run_git(), which always sets GIT_TERMINAL_PROMPT=0
    (via get_git_env) so git can never hang waiting for a password.
  * Read/query functions return rich dicts the frontend renders directly.
  * Action functions return {"success": bool, "message": str, "output": str}.
  * This module NEVER decides whether a destructive op is "allowed" — the UI
    gates destructive actions behind an explicit confirm overlay. The backend
    simply executes what it is asked, and logs anything that changes the repo.
  * The automated backup engine (git_runner.run_backup) is untouched.
"""

import os
import re
import shlex
import subprocess
from datetime import datetime

from backend import config_manager
from backend import logger
from backend.git_runner import (
    get_git_env,
    check_git_installed,
    extract_host,
    check_internet,
)

# Unit separator used to split structured git output safely (won't appear in
# normal text such as commit messages, author names, or file paths).
US = "\x1f"
RS = "\x1e"


# ---------------------------------------------------------------------------
# Core executor
# ---------------------------------------------------------------------------

def run_git(path, args, timeout=120, input_text=None, require_repo=True):
    """Run a single git command inside `path` and return a structured result.

    Returns a dict: {ok, returncode, stdout, stderr, command}.
    Never raises — every failure mode is reported in the dict.
    """
    command = "git " + " ".join(args)

    if not check_git_installed():
        return {"ok": False, "returncode": -1, "stdout": "",
                "stderr": "Git is not installed or not in PATH.", "command": command}

    if not path or not os.path.isdir(path):
        return {"ok": False, "returncode": -1, "stdout": "",
                "stderr": f"Folder does not exist: {path}", "command": command}

    if require_repo and not os.path.isdir(os.path.join(path, ".git")):
        return {"ok": False, "returncode": -1, "stdout": "",
                "stderr": "This folder is not a Git repository yet. "
                          "Run a backup once (Run Now) to initialize it.",
                "command": command}

    env = get_git_env()
    try:
        res = subprocess.run(
            ["git"] + args,
            cwd=path, capture_output=True, text=True, env=env,
            timeout=timeout, input=input_text,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "returncode": -1, "stdout": "",
                "stderr": f"Command timed out after {timeout}s: {command}", "command": command}
    except Exception as e:  # pragma: no cover - defensive
        return {"ok": False, "returncode": -1, "stdout": "",
                "stderr": f"Failed to run git: {e}", "command": command}

    return {
        "ok": res.returncode == 0,
        "returncode": res.returncode,
        "stdout": res.stdout or "",
        "stderr": res.stderr or "",
        "command": command,
    }


def _resolve(project_id):
    """Resolve a project id to (project, path, error_message)."""
    project = config_manager.get_project(project_id)
    if not project:
        return None, None, "Project not found."
    path = project.get("path")
    if not path or not os.path.isdir(path):
        return project, None, f"Folder missing: {path} does not exist."
    return project, path, None


def _is_repo(path):
    return bool(path) and os.path.isdir(os.path.join(path, ".git"))


def _inprogress(path):
    """Detect an in-progress merge/rebase/cherry-pick/revert that may need
    --abort or --continue. Returns the operation name or None."""
    g = os.path.join(path, ".git")
    if os.path.isdir(os.path.join(g, "rebase-merge")) or os.path.isdir(os.path.join(g, "rebase-apply")):
        return "rebase"
    if os.path.exists(os.path.join(g, "MERGE_HEAD")):
        return "merge"
    if os.path.exists(os.path.join(g, "CHERRY_PICK_HEAD")):
        return "cherry-pick"
    if os.path.exists(os.path.join(g, "REVERT_HEAD")):
        return "revert"
    return None


def _result(ok, message, output=""):
    return {"success": bool(ok), "message": message, "output": output or ""}


def _from_run(res, success_msg, fail_prefix="Operation failed"):
    """Turn a run_git result into a standard action result."""
    if res["ok"]:
        out = (res["stdout"] or res["stderr"] or "").strip()
        return _result(True, success_msg, out)
    err = (res["stderr"] or res["stdout"] or "").strip()
    return _result(False, f"{fail_prefix}: {err}" if err else fail_prefix, err)


# ---------------------------------------------------------------------------
# Query helpers (read-only) — power the panel tabs
# ---------------------------------------------------------------------------

def _parse_branch_line(line):
    """Parse the `## ...` header line from `git status -b --porcelain`."""
    info = {"branch": "", "upstream": "", "ahead": 0, "behind": 0,
            "detached": False, "no_commits": False}
    rest = line[2:].strip()  # strip leading "##"

    if rest.startswith("No commits yet on "):
        info["branch"] = rest[len("No commits yet on "):].strip()
        info["no_commits"] = True
        return info
    if rest.startswith("HEAD (no branch)"):
        info["detached"] = True
        info["branch"] = "HEAD (detached)"
        return info

    track = ""
    main_part = rest
    if " [" in rest and rest.rstrip().endswith("]"):
        main_part, track = rest.split(" [", 1)
        track = track.rstrip("]")

    if "..." in main_part:
        b, up = main_part.split("...", 1)
        info["branch"] = b.strip()
        info["upstream"] = up.strip()
    else:
        info["branch"] = main_part.strip()

    if track:
        m = re.search(r"ahead (\d+)", track)
        if m:
            info["ahead"] = int(m.group(1))
        m = re.search(r"behind (\d+)", track)
        if m:
            info["behind"] = int(m.group(1))
    return info


def _unquote(p):
    p = p.strip()
    if p.startswith('"') and p.endswith('"'):
        p = p[1:-1]
    return p


def get_overview(project_id):
    """Full working-tree state: branch, upstream, ahead/behind, and file lists."""
    project, path, err = _resolve(project_id)
    if err:
        return {"ok": False, "error": err}
    if not _is_repo(path):
        return {"ok": True, "is_repo": False, "path": path,
                "origin": project.get("origin", ""), "branch_config": project.get("branch", "main")}

    res = run_git(path, ["status", "-b", "--porcelain", "--untracked-files=all"])
    if not res["ok"]:
        return {"ok": False, "error": res["stderr"] or "git status failed"}

    branch = {"branch": "", "upstream": "", "ahead": 0, "behind": 0,
              "detached": False, "no_commits": False}
    staged, unstaged, untracked, conflicts = [], [], [], []

    for line in res["stdout"].splitlines():
        if not line:
            continue
        if line.startswith("##"):
            branch = _parse_branch_line(line)
            continue
        xy = line[:2]
        rest = line[3:]
        x, y = xy[0], xy[1]

        if "->" in rest:  # rename: "old -> new"
            rest = rest.split("->", 1)[1]
        pathname = _unquote(rest)

        if xy == "??":
            untracked.append(pathname)
            continue
        if "U" in xy or xy in ("DD", "AA"):
            conflicts.append({"path": pathname, "code": xy})
            continue
        if x not in (" ", "?"):
            staged.append({"path": pathname, "code": x})
        if y not in (" ", "?"):
            unstaged.append({"path": pathname, "code": y})

    return {
        "ok": True,
        "is_repo": True,
        "path": path,
        "origin": project.get("origin", ""),
        "branch": branch,
        "staged": staged,
        "unstaged": unstaged,
        "untracked": untracked,
        "conflicts": conflicts,
        "clean": not (staged or unstaged or untracked or conflicts),
        "in_progress": _inprogress(path),
    }


def get_log(project_id, limit=60, branch=None):
    """Recent commit history as a list of dicts."""
    project, path, err = _resolve(project_id)
    if err:
        return {"ok": False, "error": err}
    if not _is_repo(path):
        return {"ok": True, "commits": []}

    fmt = US.join(["%H", "%h", "%an", "%ae", "%ad", "%s", "%D"])
    args = ["log", f"--pretty=format:{fmt}{RS}", "--date=format:%Y-%m-%d %H:%M",
            f"-n{int(limit)}"]
    if branch:
        args.append(branch)
    res = run_git(path, args)
    if not res["ok"]:
        # Empty repo (no commits yet) is not an error for the UI.
        if "does not have any commits yet" in res["stderr"] or "bad revision" in res["stderr"]:
            return {"ok": True, "commits": []}
        return {"ok": False, "error": res["stderr"]}

    commits = []
    for chunk in res["stdout"].split(RS):
        chunk = chunk.strip("\n")
        if not chunk:
            continue
        parts = chunk.split(US)
        if len(parts) < 6:
            continue
        full, short, an, ae, ad, subject = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
        refs = parts[6] if len(parts) > 6 else ""
        commits.append({
            "sha": full, "short": short, "author": an, "email": ae,
            "date": ad, "subject": subject, "refs": refs.strip(),
        })
    return {"ok": True, "commits": commits}


def get_branches(project_id):
    """Local and remote branches plus the current branch."""
    project, path, err = _resolve(project_id)
    if err:
        return {"ok": False, "error": err}
    if not _is_repo(path):
        return {"ok": True, "current": "", "local": [], "remote": []}

    cur = run_git(path, ["rev-parse", "--abbrev-ref", "HEAD"])
    current = cur["stdout"].strip() if cur["ok"] else ""

    local = []
    lr = run_git(path, ["for-each-ref", "--sort=-committerdate",
                        f"--format=%(refname:short){US}%(objectname:short){US}%(upstream:short)",
                        "refs/heads"])
    if lr["ok"]:
        for line in lr["stdout"].splitlines():
            if not line.strip():
                continue
            p = line.split(US)
            local.append({
                "name": p[0],
                "sha": p[1] if len(p) > 1 else "",
                "upstream": p[2] if len(p) > 2 else "",
                "current": p[0] == current,
            })

    remote = []
    rr = run_git(path, ["for-each-ref", "--sort=-committerdate",
                        f"--format=%(refname:short)", "refs/remotes"])
    if rr["ok"]:
        for line in rr["stdout"].splitlines():
            name = line.strip()
            if name and not name.endswith("/HEAD"):
                remote.append(name)

    return {"ok": True, "current": current, "local": local, "remote": remote}


def get_remotes(project_id):
    """Configured remotes as name -> fetch URL."""
    project, path, err = _resolve(project_id)
    if err:
        return {"ok": False, "error": err}
    if not _is_repo(path):
        return {"ok": True, "remotes": []}

    res = run_git(path, ["remote", "-v"])
    if not res["ok"]:
        return {"ok": False, "error": res["stderr"]}

    seen = {}
    for line in res["stdout"].splitlines():
        m = re.match(r"^(\S+)\s+(\S+)\s+\((fetch|push)\)", line)
        if not m:
            continue
        name, url, kind = m.group(1), m.group(2), m.group(3)
        seen.setdefault(name, {"name": name, "fetch": "", "push": ""})
        seen[name][kind] = url
    return {"ok": True, "remotes": list(seen.values())}


def get_stashes(project_id):
    project, path, err = _resolve(project_id)
    if err:
        return {"ok": False, "error": err}
    if not _is_repo(path):
        return {"ok": True, "stashes": []}
    res = run_git(path, ["stash", "list",
                         f"--pretty=format:%gd{US}%s{US}%cr"])
    stashes = []
    if res["ok"]:
        for i, line in enumerate(res["stdout"].splitlines()):
            if not line.strip():
                continue
            p = line.split(US)
            stashes.append({"index": i, "ref": p[0],
                            "message": p[1] if len(p) > 1 else "",
                            "age": p[2] if len(p) > 2 else ""})
    return {"ok": True, "stashes": stashes}


def get_tags(project_id):
    project, path, err = _resolve(project_id)
    if err:
        return {"ok": False, "error": err}
    if not _is_repo(path):
        return {"ok": True, "tags": []}
    res = run_git(path, ["tag", "--sort=-creatordate"])
    tags = [t.strip() for t in res["stdout"].splitlines() if t.strip()] if res["ok"] else []
    return {"ok": True, "tags": tags}


def get_diff(project_id, file_path, staged=False):
    """Unified diff for a single file (staged or working-tree)."""
    project, path, err = _resolve(project_id)
    if err:
        return {"ok": False, "error": err}
    if not _is_repo(path):
        return {"ok": False, "error": "Not a git repository."}
    args = ["diff", "--no-color"]
    if staged:
        args.append("--cached")
    args += ["--", file_path]
    res = run_git(path, args)
    diff = res["stdout"]
    if not diff.strip() and not staged:
        # Untracked file: show its contents as an added diff-ish preview.
        full = os.path.join(path, file_path)
        if os.path.isfile(full):
            try:
                with open(full, "r", encoding="utf-8", errors="replace") as f:
                    body = f.read(200000)
                diff = "(untracked file — full contents)\n\n" + body
            except Exception:
                diff = "(untracked binary or unreadable file)"
    return {"ok": True, "diff": diff or "(no differences)"}


def get_config(project_id):
    """Repo-local user.name / user.email and a few useful settings."""
    project, path, err = _resolve(project_id)
    if err:
        return {"ok": False, "error": err}
    if not _is_repo(path):
        return {"ok": True, "name": "", "email": ""}

    def _cfg(key):
        r = run_git(path, ["config", "--get", key])
        return r["stdout"].strip() if r["ok"] else ""

    return {"ok": True, "name": _cfg("user.name"), "email": _cfg("user.email")}


def get_reflog(project_id, limit=50):
    """HEAD reflog — the recovery safety net (undo a hard reset / bad op)."""
    project, path, err = _resolve(project_id)
    if err:
        return {"ok": False, "error": err}
    if not _is_repo(path):
        return {"ok": True, "entries": []}
    res = run_git(path, ["reflog", f"--format=%h{US}%gd{US}%gs", f"-n{int(limit)}"])
    entries = []
    if res["ok"]:
        for line in res["stdout"].splitlines():
            if not line.strip():
                continue
            p = line.split(US)
            entries.append({"short": p[0],
                            "selector": p[1] if len(p) > 1 else "",
                            "subject": p[2] if len(p) > 2 else ""})
    return {"ok": True, "entries": entries}


def get_show(project_id, sha):
    """Full diff of a single commit (for the History 'View' button)."""
    project, path, err = _resolve(project_id)
    if err:
        return {"ok": False, "error": err}
    if not _is_repo(path) or not sha:
        return {"ok": False, "error": "Not a git repository or no commit specified."}
    res = run_git(path, ["show", "--no-color", "--stat", "-p", sha])
    return {"ok": True, "diff": res["stdout"] if res["ok"] else (res["stderr"] or "(could not load commit)")}


QUERIES = {
    "overview": lambda pid, params: get_overview(pid),
    "log": lambda pid, params: get_log(pid, int(params.get("limit", 60)), params.get("branch")),
    "branches": lambda pid, params: get_branches(pid),
    "remotes": lambda pid, params: get_remotes(pid),
    "stashes": lambda pid, params: get_stashes(pid),
    "tags": lambda pid, params: get_tags(pid),
    "diff": lambda pid, params: get_diff(pid, params.get("file", ""), _truthy(params.get("staged"))),
    "config": lambda pid, params: get_config(pid),
    "reflog": lambda pid, params: get_reflog(pid, int(params.get("limit", 50))),
    "show": lambda pid, params: get_show(pid, params.get("sha", "")),
}


def query(project_id, kind, params):
    fn = QUERIES.get(kind)
    if not fn:
        return {"ok": False, "error": f"Unknown query: {kind}"}
    try:
        return fn(project_id, params or {})
    except Exception as e:  # pragma: no cover - defensive
        return {"ok": False, "error": str(e)}


def _truthy(v):
    return str(v).lower() in ("1", "true", "yes", "on")


# ---------------------------------------------------------------------------
# Action helpers (mutating) — each returns {success, message, output}
# ---------------------------------------------------------------------------

def _files_list(params):
    files = params.get("files")
    if isinstance(files, str):
        files = [files]
    return [f for f in (files or []) if f and f.strip()]


def _log(project, status, message, res=None):
    """Log a control-panel operation against the project's name."""
    name = project.get("name", "Console") if project else "Console"
    stdout = res.get("stdout", "") if res else ""
    stderr = res.get("stderr", "") if res else ""
    logger.log_event(name, status, message, stdout=stdout, stderr=stderr)


def act_stage(path, params, project):
    if params.get("all"):
        res = run_git(path, ["add", "-A"])
        return _from_run(res, "Staged all changes.", "Failed to stage")
    files = _files_list(params)
    if not files:
        return _result(False, "No files specified to stage.")
    res = run_git(path, ["add", "--"] + files)
    return _from_run(res, f"Staged {len(files)} file(s).", "Failed to stage")


def act_unstage(path, params, project):
    if params.get("all"):
        res = run_git(path, ["reset", "-q", "HEAD", "--"])
        return _from_run(res, "Unstaged all changes.", "Failed to unstage")
    files = _files_list(params)
    if not files:
        return _result(False, "No files specified to unstage.")
    res = run_git(path, ["reset", "-q", "HEAD", "--"] + files)
    return _from_run(res, f"Unstaged {len(files)} file(s).", "Failed to unstage")


def act_discard(path, params, project):
    """DESTRUCTIVE: throw away uncommitted changes to the given files."""
    files = _files_list(params)
    if not files:
        return _result(False, "No files specified to discard.")
    # Restore tracked files; delete untracked ones the user explicitly listed.
    res = run_git(path, ["checkout", "--", *files])
    # For untracked files, checkout errors — remove them from disk on request.
    if not res["ok"] and params.get("include_untracked"):
        run_git(path, ["clean", "-fd", "--", *files])
        res = {"ok": True, "stdout": "", "stderr": "", "returncode": 0,
               "command": "git clean -fd"}
    out = _from_run(res, f"Discarded changes in {len(files)} file(s).", "Failed to discard")
    if out["success"]:
        _log(project, "WARNING", f"Discarded local changes in {len(files)} file(s).")
    return out


def act_commit(path, params, project):
    message = (params.get("message") or "").strip()
    amend = bool(params.get("amend"))
    if not message and not amend:
        message = f"Manual commit - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    if params.get("stage_all"):
        run_git(path, ["add", "-A"])
    args = ["commit"]
    if amend:
        args.append("--amend")
    if message:
        args += ["-m", message]
    elif amend:
        args.append("--no-edit")
    res = run_git(path, args)
    if not res["ok"]:
        low = (res["stderr"] + res["stdout"]).lower()
        if "nothing to commit" in low:
            return _result(False, "Nothing staged to commit.")
        return _from_run(res, "", "Commit failed")
    verb = "Amended commit" if amend else "Committed"
    _log(project, "SUCCESS", f"{verb} via control panel: \"{message or '(no message change)'}\"", res)
    return _result(True, f"{verb} successfully.", res["stdout"] or res["stderr"])


def act_push(path, params, project):
    remote = params.get("remote") or "origin"
    branch = params.get("branch")
    force = bool(params.get("force"))
    set_upstream = bool(params.get("set_upstream", True))
    if not branch:
        cur = run_git(path, ["rev-parse", "--abbrev-ref", "HEAD"])
        branch = cur["stdout"].strip() if cur["ok"] else "main"

    args = ["push"]
    if set_upstream:
        args.append("-u")
    if force:
        args.append("--force-with-lease")  # safer than raw --force
    args += [remote, branch]
    res = run_git(path, args, timeout=120)
    if res["ok"]:
        _log(project, "SUCCESS",
             f"{'Force-pushed' if force else 'Pushed'} {branch} -> {remote} via control panel.", res)
        return _result(True, f"{'Force-pushed' if force else 'Pushed'} {branch} to {remote}.",
                       res["stdout"] or res["stderr"])
    return _from_run(res, "", "Push failed")


def act_pull(path, params, project):
    remote = params.get("remote") or "origin"
    branch = params.get("branch")
    rebase = bool(params.get("rebase"))
    if not branch:
        cur = run_git(path, ["rev-parse", "--abbrev-ref", "HEAD"])
        branch = cur["stdout"].strip() if cur["ok"] else "main"
    args = ["pull"]
    if rebase:
        args.append("--rebase")
    args += [remote, branch]
    res = run_git(path, args, timeout=120)
    if res["ok"]:
        _log(project, "SUCCESS", f"Pulled {branch} from {remote} via control panel.", res)
        return _result(True, f"Pulled {branch} from {remote}.", res["stdout"] or res["stderr"])
    return _from_run(res, "", "Pull failed")


def act_fetch(path, params, project):
    remote = params.get("remote") or "origin"
    args = ["fetch", "--prune", remote] if remote else ["fetch", "--all", "--prune"]
    res = run_git(path, args, timeout=120)
    return _from_run(res, f"Fetched from {remote}.", "Fetch failed")


def act_branch_create(path, params, project):
    name = (params.get("name") or "").strip()
    if not name:
        return _result(False, "Branch name is required.")
    checkout = bool(params.get("checkout", True))
    start = params.get("start_point")
    args = (["checkout", "-b", name] if checkout else ["branch", name])
    if start:
        args.append(start)
    res = run_git(path, args)
    if res["ok"]:
        _log(project, "SUCCESS", f"Created branch '{name}' via control panel.", res)
    return _from_run(res, f"Created branch '{name}'.", "Failed to create branch")


def act_branch_switch(path, params, project):
    name = (params.get("name") or "").strip()
    if not name:
        return _result(False, "Branch name is required.")
    res = run_git(path, ["checkout", name])
    if res["ok"]:
        _log(project, "SUCCESS", f"Switched to branch '{name}' via control panel.", res)
    return _from_run(res, f"Switched to '{name}'.", "Failed to switch branch")


def act_branch_merge(path, params, project):
    name = (params.get("name") or "").strip()
    if not name:
        return _result(False, "Branch to merge is required.")
    args = ["merge"]
    if params.get("no_ff"):
        args.append("--no-ff")
    args.append(name)
    res = run_git(path, args)
    if res["ok"]:
        _log(project, "SUCCESS", f"Merged '{name}' via control panel.", res)
        return _result(True, f"Merged '{name}'.", res["stdout"] or res["stderr"])
    low = (res["stdout"] + res["stderr"]).lower()
    if "conflict" in low:
        return _result(False, f"Merge produced conflicts. Resolve them in the Changes tab, "
                              f"then commit. (git output below)", res["stdout"] + "\n" + res["stderr"])
    return _from_run(res, "", "Merge failed")


def act_branch_delete(path, params, project):
    """DESTRUCTIVE if force=True (-D drops unmerged commits)."""
    name = (params.get("name") or "").strip()
    if not name:
        return _result(False, "Branch name is required.")
    force = bool(params.get("force"))
    res = run_git(path, ["branch", "-D" if force else "-d", name])
    if res["ok"]:
        _log(project, "WARNING", f"Deleted branch '{name}'{' (forced)' if force else ''} via control panel.", res)
        return _result(True, f"Deleted branch '{name}'.", res["stdout"] or res["stderr"])
    low = res["stderr"].lower()
    if "not fully merged" in low:
        return _result(False, f"Branch '{name}' is not fully merged. "
                              f"Use force delete to remove it anyway.", res["stderr"])
    return _from_run(res, "", "Failed to delete branch")


def act_remote_add(path, params, project):
    name = (params.get("name") or "").strip()
    url = (params.get("url") or "").strip()
    if not name or not url:
        return _result(False, "Both remote name and URL are required.")
    res = run_git(path, ["remote", "add", name, url])
    if res["ok"]:
        _log(project, "SUCCESS", f"Added remote '{name}' -> {url} via control panel.", res)
    return _from_run(res, f"Added remote '{name}'.", "Failed to add remote")


def act_remote_seturl(path, params, project):
    name = (params.get("name") or "").strip()
    url = (params.get("url") or "").strip()
    if not name or not url:
        return _result(False, "Both remote name and URL are required.")
    res = run_git(path, ["remote", "set-url", name, url])
    if res["ok"]:
        _log(project, "SUCCESS", f"Updated remote '{name}' -> {url} via control panel.", res)
    return _from_run(res, f"Updated remote '{name}'.", "Failed to update remote")


def act_remote_remove(path, params, project):
    name = (params.get("name") or "").strip()
    if not name:
        return _result(False, "Remote name is required.")
    res = run_git(path, ["remote", "remove", name])
    if res["ok"]:
        _log(project, "WARNING", f"Removed remote '{name}' via control panel.", res)
    return _from_run(res, f"Removed remote '{name}'.", "Failed to remove remote")


def act_reset(path, params, project):
    """DESTRUCTIVE when mode='hard': discards working-tree changes."""
    mode = (params.get("mode") or "mixed").lower()
    target = (params.get("target") or "HEAD").strip()
    if mode not in ("soft", "mixed", "hard"):
        return _result(False, f"Invalid reset mode: {mode}")
    res = run_git(path, ["reset", f"--{mode}", target])
    if res["ok"]:
        status = "WARNING" if mode == "hard" else "SUCCESS"
        _log(project, status, f"Reset --{mode} to {target} via control panel.", res)
        return _result(True, f"Reset --{mode} to {target}.", res["stdout"] or res["stderr"])
    return _from_run(res, "", "Reset failed")


def act_revert(path, params, project):
    sha = (params.get("sha") or "").strip()
    if not sha:
        return _result(False, "Commit SHA is required.")
    res = run_git(path, ["revert", "--no-edit", sha])
    if res["ok"]:
        _log(project, "SUCCESS", f"Reverted commit {sha[:8]} via control panel.", res)
        return _result(True, f"Reverted commit {sha[:8]}.", res["stdout"] or res["stderr"])
    low = (res["stdout"] + res["stderr"]).lower()
    if "conflict" in low:
        return _result(False, "Revert produced conflicts. Resolve them in the Changes tab, then commit.",
                       res["stdout"] + "\n" + res["stderr"])
    return _from_run(res, "", "Revert failed")


def act_cherry_pick(path, params, project):
    sha = (params.get("sha") or "").strip()
    if not sha:
        return _result(False, "Commit SHA is required.")
    res = run_git(path, ["cherry-pick", sha])
    if res["ok"]:
        _log(project, "SUCCESS", f"Cherry-picked {sha[:8]} via control panel.", res)
        return _result(True, f"Cherry-picked {sha[:8]}.", res["stdout"] or res["stderr"])
    low = (res["stdout"] + res["stderr"]).lower()
    if "conflict" in low:
        return _result(False, "Cherry-pick produced conflicts. Resolve them in the Changes tab, then commit.",
                       res["stdout"] + "\n" + res["stderr"])
    return _from_run(res, "", "Cherry-pick failed")


def act_stash(path, params, project):
    action = (params.get("action") or "save").lower()
    if action in ("save", "push"):
        args = ["stash", "push"]
        if params.get("include_untracked"):
            args.append("-u")
        msg = (params.get("message") or "").strip()
        if msg:
            args += ["-m", msg]
        res = run_git(path, args)
        return _from_run(res, "Stashed working-tree changes.", "Stash failed")
    if action in ("pop", "apply", "drop"):
        ref = params.get("ref")
        args = ["stash", action]
        if ref:
            args.append(ref)
        res = run_git(path, args)
        verb = {"pop": "Popped", "apply": "Applied", "drop": "Dropped"}[action]
        if res["ok"] and action == "drop":
            _log(project, "WARNING", f"Dropped a stash via control panel.", res)
        low = (res["stdout"] + res["stderr"]).lower()
        if not res["ok"] and "conflict" in low:
            return _result(False, "Stash apply produced conflicts. Resolve them in the Changes tab.",
                           res["stdout"] + "\n" + res["stderr"])
        return _from_run(res, f"{verb} stash.", "Stash operation failed")
    if action == "clear":
        res = run_git(path, ["stash", "clear"])
        if res["ok"]:
            _log(project, "WARNING", "Cleared all stashes via control panel.", res)
        return _from_run(res, "Cleared all stashes.", "Failed to clear stashes")
    return _result(False, f"Unknown stash action: {action}")


def act_tag(path, params, project):
    action = (params.get("action") or "create").lower()
    name = (params.get("name") or "").strip()
    if not name:
        return _result(False, "Tag name is required.")
    if action == "create":
        msg = (params.get("message") or "").strip()
        args = ["tag", "-a", name, "-m", msg] if msg else ["tag", name]
        res = run_git(path, args)
        if res["ok"]:
            _log(project, "SUCCESS", f"Created tag '{name}' via control panel.", res)
        return _from_run(res, f"Created tag '{name}'.", "Failed to create tag")
    if action == "delete":
        res = run_git(path, ["tag", "-d", name])
        if res["ok"]:
            _log(project, "WARNING", f"Deleted tag '{name}' via control panel.", res)
        return _from_run(res, f"Deleted tag '{name}'.", "Failed to delete tag")
    if action == "push":
        remote = params.get("remote") or "origin"
        res = run_git(path, ["push", remote, name], timeout=120)
        if res["ok"]:
            _log(project, "SUCCESS", f"Pushed tag '{name}' to {remote} via control panel.", res)
        return _from_run(res, f"Pushed tag '{name}' to {remote}.", "Failed to push tag")
    return _result(False, f"Unknown tag action: {action}")


def act_clean(path, params, project):
    """DESTRUCTIVE: permanently delete untracked files (and dirs)."""
    dirs = bool(params.get("dirs", True))
    flags = "-fd" if dirs else "-f"
    res = run_git(path, ["clean", flags])
    if res["ok"]:
        _log(project, "WARNING", "Cleaned untracked files via control panel.", res)
        return _result(True, "Removed untracked files.", res["stdout"] or "(nothing to clean)")
    return _from_run(res, "", "Clean failed")


def act_set_config(path, params, project):
    name = (params.get("name") or "").strip()
    email = (params.get("email") or "").strip()
    out = []
    if name:
        r = run_git(path, ["config", "user.name", name])
        if not r["ok"]:
            return _from_run(r, "", "Failed to set user.name")
        out.append(f"user.name = {name}")
    if email:
        r = run_git(path, ["config", "user.email", email])
        if not r["ok"]:
            return _from_run(r, "", "Failed to set user.email")
        out.append(f"user.email = {email}")
    if not out:
        return _result(False, "Nothing to update.")
    return _result(True, "Updated repository identity.", "\n".join(out))


def act_terminal(path, params, project):
    """Run an arbitrary git command typed by the user (escape hatch).

    Only `git` itself is ever invoked — the input is parsed into argv and passed
    to git via subprocess (no shell), so there is no shell-injection surface.
    A leading 'git' token is optional.
    """
    command = (params.get("command") or "").strip()
    if not command:
        return _result(False, "No command entered.")
    try:
        tokens = shlex.split(command, posix=(os.name != "nt"))
    except ValueError as e:
        return _result(False, f"Could not parse command: {e}")
    if not tokens:
        return _result(False, "No command entered.")
    if tokens[0].lower() == "git":
        tokens = tokens[1:]
    if not tokens:
        return _result(False, "Enter a git subcommand, e.g. 'status' or 'log --oneline'.")

    res = run_git(path, tokens, timeout=120)
    output = (res["stdout"] + ("\n" + res["stderr"] if res["stderr"] else "")).strip()
    if res["ok"]:
        return _result(True, f"$ git {' '.join(tokens)}", output or "(no output)")
    return _result(False, f"$ git {' '.join(tokens)} (exit {res['returncode']})",
                   output or "(no output)")


def act_sequence(path, params, project):
    """Abort / continue / skip an in-progress merge, rebase, cherry-pick or revert.

    This is the escape hatch from a conflicted state, so the user is never stuck.
    """
    cmd = (params.get("command") or "").lower()
    if cmd not in ("abort", "continue", "skip"):
        return _result(False, f"Invalid sequence command: {cmd}")
    state = _inprogress(path)
    if not state:
        return _result(False, "No merge, rebase, cherry-pick or revert is in progress.")
    if cmd == "skip" and state == "merge":
        return _result(False, "Merge does not support --skip. Use abort or continue.")

    # core.editor=true prevents --continue from opening an editor and hanging.
    if cmd == "continue":
        args = ["-c", "core.editor=true", state, "--continue"]
    else:
        args = [state, f"--{cmd}"]
    res = run_git(path, args)
    if res["ok"]:
        status = "WARNING" if cmd == "abort" else "SUCCESS"
        _log(project, status, f"{state} --{cmd} via control panel.", res)
        return _result(True, f"{state} --{cmd} done.", res["stdout"] or res["stderr"])
    low = (res["stdout"] + res["stderr"]).lower()
    if cmd == "continue" and "conflict" in low:
        return _result(False, "There are still unresolved conflicts. Stage the resolved "
                              "files in the Changes tab, then continue again.",
                       res["stdout"] + "\n" + res["stderr"])
    return _from_run(res, "", f"{state} --{cmd} failed")


def act_rebase(path, params, project):
    branch = (params.get("branch") or "").strip()
    if not branch:
        return _result(False, "Target branch to rebase onto is required.")
    res = run_git(path, ["-c", "core.editor=true", "rebase", branch])
    if res["ok"]:
        _log(project, "SUCCESS", f"Rebased onto '{branch}' via control panel.", res)
        return _result(True, f"Rebased current branch onto '{branch}'.", res["stdout"] or res["stderr"])
    low = (res["stdout"] + res["stderr"]).lower()
    if "conflict" in low:
        return _result(False, "Rebase hit conflicts. Resolve them in the Changes tab and "
                              "click Continue, or Abort to undo the rebase.",
                       res["stdout"] + "\n" + res["stderr"])
    return _from_run(res, "", "Rebase failed")


def act_untrack(path, params, project):
    """git rm --cached: stop tracking files but keep them on disk."""
    files = _files_list(params)
    if not files:
        return _result(False, "No files specified to untrack.")
    res = run_git(path, ["rm", "--cached", "--"] + files)
    if res["ok"]:
        _log(project, "WARNING", f"Untracked {len(files)} file(s) (kept on disk) via control panel.", res)
        return _result(True, f"Untracked {len(files)} file(s). They remain on disk; "
                             f"commit to record the removal from the repo.", res["stdout"])
    return _from_run(res, "", "Failed to untrack")


ACTIONS = {
    "stage": act_stage,
    "unstage": act_unstage,
    "discard": act_discard,
    "commit": act_commit,
    "push": act_push,
    "pull": act_pull,
    "fetch": act_fetch,
    "branch_create": act_branch_create,
    "branch_switch": act_branch_switch,
    "branch_merge": act_branch_merge,
    "branch_delete": act_branch_delete,
    "remote_add": act_remote_add,
    "remote_seturl": act_remote_seturl,
    "remote_remove": act_remote_remove,
    "reset": act_reset,
    "revert": act_revert,
    "cherry_pick": act_cherry_pick,
    "stash": act_stash,
    "tag": act_tag,
    "clean": act_clean,
    "set_config": act_set_config,
    "sequence": act_sequence,
    "rebase": act_rebase,
    "untrack": act_untrack,
    "terminal": act_terminal,
}


def perform(project_id, op, params):
    """Dispatch a mutating control-panel operation."""
    project, path, err = _resolve(project_id)
    if err:
        return _result(False, err)
    if not _is_repo(path) and op not in ("terminal",):
        return _result(False, "This folder is not a Git repository yet. "
                              "Click 'Run Now' once to initialize it, then use the control panel.")
    fn = ACTIONS.get(op)
    if not fn:
        return _result(False, f"Unknown operation: {op}")
    try:
        return fn(path, params or {}, project)
    except Exception as e:  # pragma: no cover - defensive
        return _result(False, f"Unexpected error: {e}")
