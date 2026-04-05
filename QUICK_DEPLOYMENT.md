# Quick Deployment Guide (5 Minutes)

## TL;DR

Your app has **two parts**:
- **Frontend** → Deploy to Netlify
- **Backend** → Deploy to Railway/Render/Heroku

## 1️⃣ Deploy Backend (3 min)

### Using Railway (Easiest)
```
1. Go to https://railway.app
2. Click "Create New Project"
3. Select "Deploy from GitHub" or upload ZIP
4. Set environment variables:
   - SUPABASE_URL=https://0ec90b57d6e95fcbda19832f.supabase.co
   - SUPABASE_ANON_KEY=[get from Supabase]
   - OPENAI_API_KEY=[get from OpenAI]
   - PORT=3001
   - NODE_ENV=production
5. Wait for deployment
6. Copy your URL from Railway dashboard
```

## 2️⃣ Update Frontend URLs (1 min)

Edit these files with your backend URL:

**index.html** (line 2641):
```javascript
const API_BASE = 'https://YOUR-BACKEND-URL-HERE.railway.app';
```

**ai-features.js** (line 1):
```javascript
const SERVER_URL = 'https://YOUR-BACKEND-URL-HERE.railway.app';
```

## 3️⃣ Deploy to Netlify (1 min)

### Simplest Method - Drag & Drop
```
1. Go to https://app.netlify.com
2. Drag your project folder onto the page
3. Done! ✓
```

### Alternative - GitHub
```
1. Push to GitHub
2. Go to https://app.netlify.com
3. "New site from Git" → select repo → deploy
```

## ✅ Verify It Works

After deployment:
1. Visit your Netlify URL
2. Open DevTools (F12) → Console
3. Should see no red errors
4. Try updating a setting
5. Check Network tab - API calls should show `200` status

## Need Help?

- **Frontend issues** → Check `NETLIFY_DEPLOYMENT_GUIDE.md`
- **Full checklist** → See `DEPLOYMENT_CHECKLIST.md`
- **Local development** → Run `npm start`

## API Keys Needed

Get these before deploying:
- OpenAI: https://platform.openai.com/api-keys
- Supabase: https://app.supabase.com (project settings)

---

**That's it! Your app is production-ready.** 🚀
