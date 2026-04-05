# Deployment Checklist - Netlify Ready

## Pre-Deployment Verification

### Frontend Files ✓
- [x] `index.html` - Admin dashboard (ready)
- [x] `ai-features.js` - Persona management (ready)
- [x] `chat-widget.js` - Embedded widget (ready)
- [x] `ai-integration.js` - API integration (ready)
- [x] `dealer-ai-chat.html` - Chat interface (ready)
- [x] `embed-test.html` - Widget test page (ready)
- [x] `inventory.json` - Vehicle data (ready)

### Configuration Files ✓
- [x] `.env` - Cleaned (sensitive keys removed)
- [x] `.gitignore` - Prevents secret leaks
- [x] `netlify.toml` - Netlify configuration ready
- [x] `package.json` - Dependencies defined
- [x] `package-lock.json` - Lock file present

### Database Setup ✓
- [x] Supabase database instance created
- [x] `ce_leads` table (with RLS)
- [x] `ce_chat_sessions` table (with RLS)
- [x] `ce_conversations` table (with RLS)
- [x] `ce_training_data` table (with RLS)
- [x] `ce_settings` table (with RLS)
- [x] `ce_ai_personas` table (with RLS)
- [x] `ce_appointments` table (with RLS)
- [x] `ce_webhook_logs` table (with RLS)
- [x] All migrations applied successfully

### API Keys Required
You need to obtain these before deploying:

- [ ] **OPENAI_API_KEY** (from https://platform.openai.com/api-keys)
- [ ] **SUPABASE_ANON_KEY** (from Supabase dashboard)
- [ ] **SUPABASE_URL** (from Supabase dashboard)
- [ ] (Optional) **TWILIO_ACCOUNT_SID** for SMS
- [ ] (Optional) **TWILIO_AUTH_TOKEN** for SMS

## Deployment Steps

### Step 1: Deploy Backend (Choose One)

#### Option A: Railway (Recommended)
- [ ] Create Railway account at https://railway.app
- [ ] Create new project
- [ ] Set environment variables:
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_ANON_KEY`
  - [ ] `OPENAI_API_KEY`
  - [ ] `PORT`
  - [ ] `NODE_ENV=production`
- [ ] Deploy with `npm start`
- [ ] Copy your backend URL: `https://your-app-railway.app`

#### Option B: Render
- [ ] Create Render account at https://render.com
- [ ] Create Web Service
- [ ] Set start command: `npm start`
- [ ] Set environment variables (same as above)
- [ ] Copy your backend URL: `https://your-app.onrender.com`

#### Option C: Heroku
- [ ] Create Heroku account
- [ ] Set environment variables
- [ ] Deploy repository
- [ ] Copy your backend URL: `https://your-app.herokuapp.com`

### Step 2: Update Frontend API URLs

Before uploading to Netlify, update the backend URL:

- [ ] Edit `index.html` line 2641:
  ```javascript
  const API_BASE = 'https://your-backend-url.com';
  ```

- [ ] Edit `ai-features.js` line 1:
  ```javascript
  const SERVER_URL = 'https://your-backend-url.com';
  ```

### Step 3: Run Build Test

```bash
npm run build
```

Expected output:
```
Build successful: All scripts validated
```

### Step 4: Deploy to Netlify

#### Option A: Manual Upload (Simplest)
1. [ ] Go to https://app.netlify.com
2. [ ] Create account if needed
3. [ ] Click "Add new site" → "Deploy manually"
4. [ ] Drag and drop your project folder
5. [ ] Site deploys automatically
6. [ ] Copy your Netlify URL: `https://your-site.netlify.app`

#### Option B: GitHub Integration
1. [ ] Push code to GitHub
2. [ ] Go to https://app.netlify.com
3. [ ] Click "New site from Git"
4. [ ] Select your GitHub repository
5. [ ] Build settings:
   - [ ] Build command: `npm run build`
   - [ ] Publish directory: `.`
6. [ ] Deploy
7. [ ] Copy your Netlify URL

#### Option C: Netlify CLI
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

### Step 5: Test Deployment

After deployment completes:

#### Frontend Verification
- [ ] Visit your Netlify URL
- [ ] Admin dashboard loads
- [ ] Chat widget appears (bottom-right)
- [ ] Navigation works
- [ ] Theme toggle works (light/dark)

#### API Connectivity
- [ ] Open browser DevTools (F12)
- [ ] Go to Console tab
- [ ] No red errors about API calls
- [ ] Network tab shows successful API requests
- [ ] Go to Network tab → look for `/api/` requests
- [ ] Should see `200` status codes (success)

#### Feature Testing
- [ ] [ ] Try updating settings
- [ ] [ ] Submit a test lead
- [ ] [ ] Check lead appears in Supabase dashboard
- [ ] [ ] Test chat message (if key configured)
- [ ] [ ] Check analytics page
- [ ] [ ] Try theme switching

## Common Issues & Fixes

### "Cannot find module 'express'"
**Solution**: Backend not properly deployed. Ensure you deployed to Railway/Render/Heroku (not Netlify).

### "API calls failing with 404"
**Solution**: Backend URL not updated in frontend files. Re-check index.html and ai-features.js.

### "API calls failing with CORS error"
**Solution**: Backend CORS configuration issue. Check that backend runs with correct headers.

### "Database queries returning empty"
**Solution**:
- Verify SUPABASE_URL and SUPABASE_ANON_KEY
- Check Supabase RLS policies
- Ensure migrations ran successfully

### "OpenAI API returning 401"
**Solution**: Invalid or missing OPENAI_API_KEY. Get new key from https://platform.openai.com/api-keys

## Post-Deployment

### Security
- [ ] Remove `.env` from git if accidentally committed
- [ ] Rotate API keys monthly
- [ ] Monitor Supabase for unusual activity
- [ ] Set up alerts for API quota warnings

### Monitoring
- [ ] Enable Netlify analytics
- [ ] Set up error tracking (Sentry optional)
- [ ] Monitor backend logs on hosting platform
- [ ] Test critical features weekly

### Custom Domain (Optional)
- [ ] Purchase domain from Namecheap, GoDaddy, etc.
- [ ] Update DNS records to point to Netlify
- [ ] Enable auto HTTPS on Netlify
- [ ] Verify SSL certificate

### Next Features
- [ ] Set up SMS notifications (Twilio)
- [ ] Enable email notifications
- [ ] Add additional AI personas
- [ ] Custom branding adjustments

## Support Resources

| Issue | Resource |
|-------|----------|
| Netlify Help | https://docs.netlify.com |
| Railway Docs | https://railway.app/docs |
| Render Docs | https://render.com/docs |
| Supabase Docs | https://supabase.com/docs |
| OpenAI Docs | https://platform.openai.com/docs |

## Final Status

**Backend**: Ready for deployment to Railway/Render/Heroku
**Frontend**: Ready for deployment to Netlify
**Database**: Fully configured and migrated
**API Keys**: Securely configured in `.env`

**Next Action**: Deploy backend first, then update frontend URLs, then deploy to Netlify.
