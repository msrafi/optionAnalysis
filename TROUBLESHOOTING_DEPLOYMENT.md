# Deployment Troubleshooting Guide

## 🔍 Quick Diagnostic Steps

### Step 1: Check GitHub Pages Settings

**The most common issue is incorrect GitHub Pages configuration.**

1. Go to your repository: https://github.com/msrafi/optionAnalysis
2. Click **Settings** (top navigation)
3. Scroll down to **Pages** (left sidebar)
4. Under **"Build and deployment"**, check:
   - ✅ **Source** should be set to **"GitHub Actions"** (NOT "Deploy from a branch")
   - ✅ If you see "Deploy from a branch", change it to "GitHub Actions"

**If you need to change it:**
- Click the dropdown under "Source"
- Select **"GitHub Actions"**
- Save the changes

### Step 2: Check GitHub Actions Status

1. Go to your repository: https://github.com/msrafi/optionAnalysis
2. Click **Actions** (top navigation)
3. Look for the latest workflow run
4. Check if it:
   - ✅ Shows a green checkmark (success)
   - ❌ Shows a red X (failure)

**If it failed:**
- Click on the failed workflow
- Check the error logs in the "Build" or "Deploy" step
- Common issues:
  - Build errors (TypeScript/compilation issues)
  - Missing dependencies
  - Path issues

### Step 3: Verify Deployment URL

Your app should be available at:
**https://msrafi.github.io/optionAnalysis/**

**Common URL issues:**
- ❌ `https://msrafi.github.io/optionAnalysis` (missing trailing slash) - **This will cause 404**
- ✅ `https://msrafi.github.io/optionAnalysis/` (with trailing slash) - **Correct**

### Step 4: Test the Build Locally

Before deploying, test your build locally:

```bash
npm run build
npm run preview
```

Then visit: `http://localhost:4173/optionAnalysis/`

If this works, the issue is likely with GitHub Pages configuration, not your code.

## 🛠️ Common Issues and Solutions

### Issue 1: "404 Not Found" on the deployment URL

**Symptoms:**
- The deployment URL shows a 404 error
- Assets (CSS, JS) might not load

**Solutions:**

1. **Check GitHub Pages Source:**
   - Must be set to "GitHub Actions" (not "Deploy from a branch")
   - See Step 1 above

2. **Verify the base path:**
   - Check `vite.config.ts` - should have: `base: '/optionAnalysis/'`
   - Make sure there's a trailing slash

3. **Check for .nojekyll file:**
   - There should be a `.nojekyll` file in `public/` folder
   - This prevents Jekyll from processing your files
   - Should be automatically copied to `dist/` during build

4. **Wait for deployment:**
   - After pushing changes, wait 1-2 minutes for GitHub Actions to complete
   - Check the Actions tab to confirm deployment finished

### Issue 2: "Page not found" or blank page

**Symptoms:**
- URL loads but shows blank page or "Page not found"
- Browser console shows errors

**Solutions:**

1. **Hard refresh your browser:**
   - Chrome/Edge: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
   - Firefox: `Ctrl+F5` or `Cmd+Shift+R`
   - Safari: `Cmd+Option+R`

2. **Clear browser cache:**
   - Open DevTools (F12)
   - Right-click the refresh button
   - Select "Empty Cache and Hard Reload"

3. **Check browser console for errors:**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for red error messages
   - Common issues:
     - Failed to fetch assets (path issues)
     - Service worker errors
     - JavaScript errors

### Issue 3: Assets not loading (CSS/JS broken)

**Symptoms:**
- Page loads but styling is broken
- JavaScript doesn't work
- Console shows 404 errors for assets

**Solutions:**

1. **Verify base path:**
   - All assets should be prefixed with `/optionAnalysis/`
   - Check `vite.config.ts`: `base: '/optionAnalysis/'`

2. **Check build output:**
   ```bash
   npm run build
   ls -la dist/
   ```
   - Should see: `index.html`, `assets/`, `.nojekyll`, etc.

3. **Verify GitHub Actions build succeeded:**
   - Check Actions tab for build errors
   - Ensure all files are uploaded to artifact

### Issue 4: GitHub Actions workflow fails

**Symptoms:**
- Workflow shows red X in Actions tab
- Deployment never completes

**Solutions:**

1. **Check workflow logs:**
   - Click on the failed workflow
   - Expand each step to see error messages
   - Common errors:
     - `npm ci` fails → Check `package-lock.json` is committed
     - Build fails → Check for TypeScript/compilation errors
     - Missing files → Ensure all required files are in repo

2. **Run build locally:**
   ```bash
   npm ci
   npm run build
   ```
   - If this fails locally, fix the errors first

3. **Check Node.js version:**
   - Workflow uses Node 18
   - Your local Node version might differ
   - Try running with Node 18 locally

### Issue 5: Changes not appearing after deployment

**Symptoms:**
- Pushed changes but site still shows old version
- New data files not appearing

**Solutions:**

1. **Clear service worker cache:**
   - Open browser console
   - Run: `clearAllCaches()`
   - Or manually unregister service worker (see HOW_TO_SEE_NEW_DATA.md)

2. **Hard refresh browser:**
   - `Ctrl+Shift+R` or `Cmd+Shift+R`

3. **Verify deployment completed:**
   - Check Actions tab - should show green checkmark
   - Wait 1-2 minutes after workflow completes

4. **Check data files:**
   - Ensure data files are committed to repository
   - Run `npm run update-all-data` before building

## 📋 Deployment Checklist

Before reporting an issue, verify:

- [ ] GitHub Pages Source is set to "GitHub Actions"
- [ ] Latest commit pushed to `main` branch
- [ ] GitHub Actions workflow completed successfully (green checkmark)
- [ ] Using correct URL: `https://msrafi.github.io/optionAnalysis/` (with trailing slash)
- [ ] Tried hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`)
- [ ] Cleared browser cache
- [ ] Local build works: `npm run build && npm run preview`
- [ ] No errors in browser console (F12)

## 🔄 Manual Deployment (Alternative)

If GitHub Actions isn't working, you can deploy manually:

```bash
# Build the app
npm run build

# Deploy to gh-pages branch
npm run deploy
```

Then in GitHub Settings → Pages:
- Set Source to "Deploy from a branch"
- Select branch: `gh-pages`
- Select folder: `/ (root)`

## 📞 Still Not Working?

If none of these solutions work:

1. **Check the exact error:**
   - What URL are you visiting?
   - What error message do you see?
   - Screenshot of the error

2. **Check browser console:**
   - Open DevTools (F12)
   - Go to Console tab
   - Copy any red error messages

3. **Check GitHub Actions logs:**
   - Go to Actions tab
   - Click on latest workflow run
   - Copy any error messages from failed steps

4. **Verify repository settings:**
   - Make sure repository is public (or you have GitHub Pro/Team)
   - Check that Pages feature is enabled

## ✅ Expected Behavior

When everything is working correctly:

1. **GitHub Actions:**
   - Workflow runs automatically on push to `main`
   - Shows green checkmark when complete
   - Takes 1-3 minutes to deploy

2. **Deployed Site:**
   - URL: `https://msrafi.github.io/optionAnalysis/` loads correctly
   - All assets (CSS, JS, images) load
   - App functionality works as expected
   - Data files are accessible

3. **Browser:**
   - No console errors
   - All resources load successfully (check Network tab in DevTools)

---

**Last Updated:** Created to help diagnose and fix deployment issues.

