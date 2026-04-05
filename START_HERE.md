# Quick Start - Test the Chat Locally

## Problem You Had
The HTML was trying to connect to `https://carsons.shawnryder.com` instead of your local server, so the chat wasn't working correctly.

## Fixed!
✅ HTML now configured to use `http://localhost:3000`
✅ OpenAI API key is working correctly
✅ Vehicle search is working correctly
✅ All backend logic is functioning

## How to Test Now

### 1. Start the Backend Server

```bash
npm start
```

This will start the server on `http://localhost:3000`

You should see:
- ✅ OpenAI API key loaded
- ✅ Using model: gpt-4o-mini
- ✅ Inventory loaded: 16 vehicles

### 2. Open the Test Page

Open `index.html` in your browser:
- **Mac**: `open index.html`
- **Windows**: Just double-click index.html
- **Linux**: `xdg-open index.html`

### 3. Test the Chat

Click the chat bubble in the bottom-right corner and try these tests:

**Test 1 - Vehicle Search:**
- Type: "any fords?"
- **Expected**: Should show 2 Ford vehicles (Escape and Bronco Sport)

**Test 2 - Make Search:**
- Type: "nissan"
- **Expected**: Should show 2 Nissan vehicles (Rogue and Kicks)

**Test 3 - Body Type:**
- Type: "suvs"
- **Expected**: Should show multiple SUVs

**Test 4 - General Question:**
- Type: "what are your hours?"
- **Expected**: AI responds with dealership hours

## Debugging

### Check if Backend is Running

Visit: `http://localhost:3000/api/health`

Expected response:
```json
{
  "status": "ok",
  "inventory": 16,
  "openai": "configured",
  "model": "gpt-4o-mini"
}
```

### Test OpenAI API Directly

Visit: `http://localhost:3000/api/test-openai`

Expected response:
```json
{
  "status": "success",
  "model": "gpt-4o-mini",
  "response": "API test successful."
}
```

### Check Console Logs

**Backend Console** (Terminal):
- Watch for: "📥 Chat request received"
- Should show: "🔍 Searching inventory with query"
- Should show: "✓ Found X vehicles"
- Should show: "✓ OpenAI response received"

**Browser Console** (F12):
- Should NOT show any errors
- Should show successful API calls

## Common Issues

### "Connection Refused" Error
✅ Make sure backend server is running (`npm start`)
✅ Check port 3000 isn't used by another app

### "Chat Not Appearing"
✅ Clear browser cache and reload page
✅ Check browser console for JavaScript errors

### "Generic Responses Only"
✅ Check backend console - OpenAI should be called
✅ Visit `/api/test-openai` to verify API key works
✅ Check vehicle search is finding results

## What's Different Now

### Before:
- Frontend → `https://carsons.shawnryder.com` (remote, not running)
- Result: Fallback responses or errors

### After:
- Frontend → `http://localhost:3000` (your local server)
- Result: Full AI responses with vehicle search

## Next Steps

Once everything works locally:

1. Update `.env` with your production values
2. Deploy to Netlify or your hosting
3. Update `serverUrl` to your production URL
4. Test on production domain

## Files Modified

- `index.html` - Added chat widget initialization pointing to localhost:3000
- `ai-backend.js` - Fixed model name, added logging, improved fallbacks
- Fixed OpenAI API integration

The system is now ready to test!
