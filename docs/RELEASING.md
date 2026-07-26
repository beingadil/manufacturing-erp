# Releasing Manufacturing ERP

This document explains how to publish new releases so existing users receive automatic updates.

## One-Time Setup

Before your first release, complete these steps once:

### 1. Create a GitHub Repository

1. Go to https://github.com/new and create a new repository (e.g. `manufacturing-erp`)
2. **Do NOT** initialize it with a README, .gitignore, or license

### 2. Initialize Git Locally

Open a terminal (Git Bash) in the project root and run:

```bash
# Initialize git
git init

# Add all files (except .gitignored ones)
git add .

# Commit
git commit -m "initial commit: Manufacturing ERP v1.0.0"

# Add your GitHub repo as remote
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push
git push -u origin main
```

### 3. Configure the Publish Target

Edit `package.json` and replace the placeholder values in the `build.publish` section with your actual GitHub username and repo name:

```json
"publish": [
  {
    "provider": "github",
    "owner": "YOUR_GITHUB_USERNAME",      ← change this
    "repo": "manufacturing-erp",           ← change this if different
    "releaseType": "release"
  }
]
```

### 4. Create a GitHub Personal Access Token

You need a token so the release script can push tags and the build machine can upload artifacts.

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Give it a name like "Manufacturing ERP Release"
4. Select the **repo** scope (full control of private repositories)
5. Click **Generate token**
6. **Copy the token immediately** — you won't see it again

Set it as an environment variable:

```bash
# For the current terminal session
export GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# Or add it to your shell profile (~/.bashrc or ~/.bash_profile):
echo 'export GH_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"' >> ~/.bashrc
```

---

## Publishing a New Release

### Option A: Automated (Recommended)

Run the release script from **Git Bash** (not cmd.exe):

```bash
bash scripts/publish-release.sh patch
```

Replace `patch` with `minor` or `major` depending on the change:

| Type | Example | When to use |
|------|---------|-------------|
| `patch` | 1.0.0 → 1.0.1 | Bug fixes, small changes |
| `minor` | 1.0.0 → 1.1.0 | New features, backward-compatible |
| `major` | 1.0.0 → 2.0.0 | Breaking changes |

The script will:

1. Bump the version in `package.json` and `src/config/version.ts`
2. Commit the change
3. Tag the commit with `v1.x.x`
4. Push to GitHub
5. Trigger **GitHub Actions** to build and publish the release

Users will see the update automatically within minutes of the workflow completing.

### Option B: Manual

If you prefer to do things step by step:

```bash
# 1. Bump version
npm version patch --no-git-tag-version

# 2. Update version.ts with build number and release date
# (edit src/config/version.ts manually or run the script without pushing)

# 3. Build and publish
npx vite build
npx electron-builder --win --publish always

# 4. Commit and tag
git add package.json src/config/version.ts
git commit -m "chore: bump version to v1.x.x"
git tag v1.x.x
git push origin main --tags
```

---

## How Users Receive Updates

1. The app checks for updates **5 seconds after launch**
2. If a newer version exists on GitHub Releases, it downloads automatically
3. A notification appears: **"Version X.X.X ready to install"**
4. The user clicks **"Restart & Update"** (or the update installs when they quit the app)
5. The app restarts with the new version — **all user data is preserved**

The update UI shows:
- Checking → "Checking for updates..."
- Available → "Version 1.1.0 available" (downloads automatically)
- Downloading → Progress bar with percentage and MB
- Downloaded → "Version 1.1.0 ready to install" with "Restart & Update" button
- Up-to-date → "Up to date (v1.0.0)" — auto-dismisses after 4 seconds

Users can also check manually from **Settings → About & Updates → Check for Updates**.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `sed: -i may not be used with stdin` | Running release script in wrong shell | Use **Git Bash**, not cmd.exe or PowerShell |
| Updates not appearing in app | Publish config not set | Verify `owner` and `repo` in `package.json` `build.publish` |
| `fatal: not a git repository` | Git not initialized | Run `git init` |
| `fatal: remote origin already exists` | Remote already set | Run `git remote set-url origin <url>` |
| `GH_TOKEN not set` | Token not configured | Set `export GH_TOKEN="ghp_..."` |
| GitHub Actions not triggering | No tag pushed | Tag must match `v*.*.*` pattern |
| App shows "Update Error" | No internet or wrong repo | Check network; verify publish config |

---

## Verifying the Update Works

After publishing, you can test on the same machine:

1. Open the **installed** app (not win-unpacked)
2. Go to **Settings → About & Updates**
3. Click **Check for Updates**
4. If you published a newer version, it should find it and download

For a clean test: install the app on a second machine (or a fresh Windows VM) and verify the update notification appears.
