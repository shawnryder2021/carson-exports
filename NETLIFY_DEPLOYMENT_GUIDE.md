# Netlify Deployment Guide

## Overview

Your Carson Exports AI application is a **full-stack Node.js application** with two components:

- **Frontend**: Static HTML/JavaScript files (can be deployed to Netlify)
- **Backend**: Express.js Node.js server (requires separate hosting)

This guide explains how to deploy both components for production use.

## Architecture

```
┌─────────────────────────┐
│   Netlify CDN           │
│  (Frontend Files)       │
│  ├─ index.html          │
│  ├─ chat-widget.js      │
│  └─ ai-features.js      │
└────────────┬────────────┘
             │ API calls
             ↓
┌─────────────────────────────┐
│  Backend Server             │
│  (Heroku / Railway / etc)   │
│  ├─ /api/chat              │
│  ├─ /api/settings          │
│  ├─ /api/submit-lead       │
│  └─ ... other endpoints    │
└──────────────┬──────────────┘
               │
               ↓
     ┌──────────────────┐
     │   Supabase DB    │
     │   OpenAI API     │
     │   Twilio (SMS)   │
     └──────────────────┘
```

## Step-by-Step Deployment

### 1. Prepare Your Project

#### Remove Sensitive Data
Ensure your `.env` file does NOT contain real API keys (already done in this version).

#### Verify All Files Are Present
```
✓ index.html
✓ chat-widget.js
✓ ai-features.js
✓ ai-integration.js
✓ ai-backend.js
✓ adf-parser.js
✓ package.json
✓ .env (with placeholder values)
✓ .gitignore
✓ netlify.toml
```

### 2. Deploy Backend Separately

Your backend CANNOT run on Netlify's static hosting. You must deploy it to a Node.js-capable platform:

#### Option A: Deploy to Railway (Recommended)
1. Go to https://railway.app
2. Create a new project
3. Connect your GitHub repository (or upload files)
4. Set environment variables:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_ANON_KEY` - Your Supabase anonymous key
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `PORT` - 3001 (or Railway's assigned port)
   - `NODE_ENV` - production

5. Deploy with: `npm start`

#### Option B: Deploy to Render
1. Go to https://render.com
2. Create a new Web Service
3. Connect your repository
4. Set start command: `npm start`
5. Add environment variables (same as Railway)

#### Option C: Deploy to Heroku
1. Go to https://heroku.com
2. Create a new app
3. Connect your repository
4. Add environment variables
5. Deploy with GitHub integration

#### Get Your Backend URL
After deployment, you'll get a URL like:
- Railway: `https://your-app-railway.app`
- Render: `https://your-app.onrender.com`
- Heroku: `https://your-app.herokuapp.com`

### 3. Update Frontend for Backend URL

Before deploying to Netlify, update the API base URL:

**In index.html (Line 2641):**
```javascript
// Change from:
const API_BASE = window.location.origin || 'http://localhost:3001';

// To your backend URL:
const API_BASE = 'https://your-backend-url.onrender.com';
```

**In ai-features.js (Line 1):**
```javascript
// Change from:
const SERVER_URL = window.location.origin || 'http://localhost:3001';

// To your backend URL:
const SERVER_URL = 'https://your-backend-url.onrender.com';
```

**In chat-widget.js (Check CONFIG.serverUrl):**
Ensure it points to your backend or uses dynamic detection.

### 4. Deploy to Netlify

#### Option A: Upload via Netlify Web Dashboard
1. Go to https://netlify.com
2. Click "Add new site" → "Deploy manually"
3. Drag and drop your project folder (or select files)
4. Netlify automatically detects `netlify.toml` configuration
5. Your site deploys instantly!

#### Option B: Connect GitHub Repository
1. Go to https://netlify.com
2. Click "New site from Git"
3. Select your GitHub repository
4. Build settings:
   - Build command: `npm run build`
   - Publish directory: `.` (root)
5. Click "Deploy site"

#### Option C: Use Netlify CLI
```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy from your project directory
netlify deploy --prod
```

### 5. Configure Environment Variables for Netlify

If you used GitHub integration, set environment variables:
1. In Netlify dashboard, go to "Site Settings"
2. Navigate to "Build & Deploy" → "Environment"
3. Click "Edit variables"
4. Add any frontend-specific variables (if needed)

**Note**: Frontend environment variables in Netlify should be prefixed with `REACT_APP_` or `VITE_` for build-time injection. Since this project doesn't use build tools, they're not needed.

### 6. Verify Deployment

After deployment:

1. **Frontend URL**: Visit `https://your-netlify-site.netlify.app`
2. **Check API Connectivity**: Open DevTools Console
   - Should show connection to your backend
   - No CORS errors
   - API responses working

3. **Test Features**:
   - Admin dashboard loads
   - Settings can be updated
   - Chat widget appears
   - Submit a test lead
   - Check database for new records

## Important Considerations

### CORS Configuration
Your backend (Express server) already has CORS enabled. Requests from Netlify domain should work automatically.

### Database Security
- All API keys are stored only on your backend server
- Frontend never exposes sensitive credentials
- Database credentials in `.env` never leave backend

### API Rate Limiting
Backend implements rate limiting on:
- Chat endpoint: 30 requests per minute per IP
- Lead submission: 20 requests per minute per IP

### SSL/HTTPS
- Netlify provides free HTTPS for all sites
- Backend URL must also use HTTPS
- Update API calls if switching from HTTP

## Troubleshooting

### "API calls not working"
- Check backend URL in index.html and ai-features.js
- Verify backend is running and accessible
- Check browser console for CORS errors
- Verify environment variables on backend

### "Database connection failed"
- Confirm SUPABASE_URL and SUPABASE_ANON_KEY on backend
- Verify database migrations ran
- Check Supabase dashboard for connection issues

### "Chat endpoint returns 401"
- Check OPENAI_API_KEY is set on backend
- Verify API key is valid and has credits
- Check API key hasn't been revoked

### "Settings not saving"
- Verify Supabase connection
- Check RLS policies allow authenticated access
- Review network tab for API responses

## File Structure After Deployment

```
Your Netlify Site (Frontend Only)
├── index.html
├── chat-widget.js
├── ai-features.js
├── ai-integration.js
├── dealer-ai-chat.html
├── embed-test.html
├── inventory.json
├── netlify.toml
└── (other documentation files)

Your Backend Server (Node.js)
├── ai-backend.js
├── adf-parser.js
├── package.json
├── .env (with real keys, never committed)
└── node_modules/
```

## Security Best Practices

1. ✅ Never commit `.env` to git
2. ✅ Use different API keys for development/production
3. ✅ Rotate API keys regularly
4. ✅ Enable HTTPS on backend
5. ✅ Use environment variables for all secrets
6. ✅ Keep dependencies updated: `npm audit fix`
7. ✅ Monitor API usage for unusual activity

## Next Steps

1. Deploy backend to Railway/Render/Heroku
2. Update API base URLs in frontend files
3. Deploy frontend to Netlify
4. Test all features
5. Set up custom domain (optional)
6. Enable analytics and monitoring

## Support

For deployment issues:
- Check Netlify logs: Site → Deploys → see build logs
- Check backend logs on hosting platform
- Verify all environment variables are set
- Test API endpoints using curl or Postman
