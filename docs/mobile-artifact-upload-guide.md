# Mobile Web Artifact Upload Guide (No Terminal)

Use this after the **Mobile Web Build** GitHub Action finishes.

## 1) Open the workflow run
1. Go to your repository on GitHub.
2. Click the **Actions** tab.
3. Click **Mobile Web Build** in the left sidebar.
4. Open the latest successful run.

## 2) Download the built site files
1. Scroll to the **Artifacts** section on the run summary page.
2. Click **mobile-web-dist** to download the zip file.
3. Unzip it on your computer.

You should now have static site files like `index.html`, `assets/`, `manifest.webmanifest`, and `sw.js`.

## 3) Upload to your web host
Use your hosting provider's web dashboard (for example: Netlify, Vercel, Cloudflare Pages, cPanel File Manager, S3 console, etc.):

1. Open your host's file upload area for your site.
2. Upload **all contents** from the unzipped `mobile-web-dist` folder.
3. Make sure `index.html` is at the site root.
4. Publish/save changes.

## 4) Quick check on your phone
1. Open your site URL.
2. Confirm the app loads.
3. (Optional) Add it to home screen to verify PWA install behavior.

## Notes
- This workflow does **not** replace desktop installer workflows.
- It only builds and packages the mobile web app artifact.
