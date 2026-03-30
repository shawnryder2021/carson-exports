# Sales-Focused AI Integration Guide

## ✨ What's New

The chat now acts like a professional **car salesman** when presenting vehicles to leads, using OpenAI to generate compelling, natural sales pitches.

### Before (Static Vehicle Display)
```
2018 Mitsubishi RVR SE 🚗

• VIN: JA4AJ4AW8JU603679
• Year: 2018
• Make/Model: Mitsubishi RVR
• Body Style: SUV
• Mileage: 117,535 km
• Price: $14,777 CAD
```

### After (AI-Generated Sales Pitch)
```
2018 Mitsubishi RVR SE 🚗

[AI-Generated enthusiastic pitch about the vehicle's features, value, and appeal]

• Price: $14,777 CAD
• Mileage: 117,535 km
• VIN: JA4AJ4AW8JU603679

📸 View full photos & specs →
Love this one?
```

---

## 🎯 How It Works

### When User Selects a Vehicle

1. **User searches** for vehicles (e.g., "Show me SUVs")
2. **Search results appear** with numbered options (#1, #2, #3)
3. **User clicks** "#1" or types "#1"
4. **System calls OpenAI** with the vehicle details + a sales-focused prompt
5. **OpenAI generates** a 2-3 sentence compelling pitch about the vehicle
6. **Chat displays** the AI pitch + key specs + link to full listing
7. **User sees** professional, enthusiastic sales presentation

### The Sales Prompt

```
"You are an enthusiastic, knowledgeable car salesman at Carson Exports.
Generate a compelling 2-3 sentence sales pitch for this vehicle to engage
a potential buyer. Be genuine and highlight its value. Keep it under 100 words.

Vehicle: 2018 Mitsubishi RVR, SUV, $14,777 CAD, 117,535 km"
```

The AI responds with something like:
```
"This 2018 Mitsubishi RVR is a fantastic find! With only 117,535 km on the
odometer, it's still in excellent condition and comes with all the reliability
you expect from Mitsubishi. At just $14,777, you're getting a well-maintained,
fuel-efficient SUV that's perfect for both daily driving and weekend adventures."
```

---

## 📋 Updated URLs

**⚠️ IMPORTANT:** The inventory links currently use a placeholder URL. You need to provide the correct URL from your spreadsheet.

### How to Update the Inventory URL

1. **Find** your correct inventory listing URL in your spreadsheet
2. **Edit** `index.html` and find this line (near line 560):
   ```javascript
   const INVENTORY_URL='https://carsonexports.com/inventory'; // UPDATE THIS
   ```
3. **Replace** the URL with your correct one:
   ```javascript
   const INVENTORY_URL='YOUR_CORRECT_INVENTORY_URL_HERE';
   ```
4. **Save** the file
5. **Refresh** the browser to see the updated links

### URL Format

The system expects a URL that can accept a `vin` parameter:

Good examples:
- `https://yoursite.com/inventory?vin=ABC123`
- `https://yoursite.com/vehicles?vin=ABC123`
- `https://yoursite.com/listings?vin=ABC123`

---

## 🚀 Setup (5 Minutes)

### 1. Start the Backend Server

```bash
cd "/Users/shawnryder/Claude Code/Carson Exports Chat"
npm install
npm start
```

**Expected output:**
```
🚗 Carson Exports AI Backend running on http://localhost:3001
```

### 2. Provide Your Inventory URL

Share your correct inventory listing URL so we can update it in the code.

### 3. Open the Chat and Test

1. Open `index.html` in browser
2. Search for vehicles (e.g., "Show me SUVs")
3. Click a vehicle number (e.g., "#1")
4. See the AI-generated sales pitch! 🎉

---

## 🎤 Sales Language Features

The AI presentations now include:

✅ **Enthusiasm & Energy**
- "This is a fantastic find!"
- "Perfect for both daily driving and adventures"
- "Exceptional value"

✅ **Key Value Propositions**
- Low mileage highlights
- Reliability mentions
- Price competitiveness
- Practical benefits

✅ **Call-to-Action**
- "Love this one?"
- Quick reply buttons to proceed

✅ **Professional Tone**
- Genuine (not overly salesy)
- Knowledgeable
- Customer-focused

---

## 🔧 Configuration

### Customize Sales Language

To change how the bot presents vehicles, edit the sales prompt in `processVehicleInterest()`:

Current prompt (line ~725):
```javascript
const prompt=`You are an enthusiastic, knowledgeable car salesman at Carson Exports.
Generate a compelling 2-3 sentence sales pitch for this vehicle to engage a potential
buyer. Be genuine and highlight its value. Keep it under 100 words.
Vehicle: ${v.year} ${v.make} ${v.model}, ${v.bodyStyle}, $${v.price.toLocaleString()} CAD, ${v.mileage.toLocaleString()} km`;
```

You can customize this to:
- Emphasize different vehicle features
- Adjust tone (more casual, luxury-focused, etc.)
- Target specific customer segments
- Include dealership-specific selling points

Example customization for luxury vehicles:
```javascript
const prompt=`You are a luxury car specialist at Carson Exports. Create an
elegant 2-3 sentence pitch highlighting the sophisticated features and
prestige of this vehicle. Keep it under 100 words.
Vehicle: ${v.year} ${v.make} ${v.model}, ${v.bodyStyle}, $${v.price.toLocaleString()} CAD, ${v.mileage.toLocaleString()} km`;
```

---

## 🛡️ Error Handling

If the AI backend is not running:

1. **Chat still works** - Falls back to standard vehicle information
2. **Console shows warning** - "⚠️ AI Backend not responding"
3. **Fix:** Start the backend with `npm start`

---

## 📊 What Gets Sent to OpenAI

**Minimal data** is sent:
- Vehicle year, make, model
- Body style
- Price
- Mileage
- VIN is NOT sent to OpenAI (only used for links)

**NOT sent to OpenAI:**
- Customer information
- Personal data
- Payment details
- Any sensitive information

---

## 💰 Cost Impact

Each vehicle pitch costs approximately **$0.0005 USD** on OpenAI's API.

Example costs:
- 100 vehicle presentations = $0.05
- 1,000 presentations = $0.50
- 10,000 presentations = $5.00

---

## 🎯 Lead Engagement Flow

```
1. User searches vehicles
   ↓
2. Results displayed (#1, #2, #3, etc.)
   ↓
3. User clicks vehicle number
   ↓
4. AI generates enthusiastic sales pitch
   ↓
5. User sees compelling presentation
   ↓
6. User clicks "Book Test Drive" or "Ask About Financing"
   ↓
7. Lead capture begins
```

---

## 📝 Quick Reference

| Feature | Status | Requirement |
|---------|--------|-------------|
| Vehicle Selection (#1, #2) | ✅ Working | None |
| AI Sales Pitches | ✅ Ready | Backend running |
| Inventory Links | ⏳ Pending | Need your URL |
| Conversation History | ✅ Working | AI backend |
| Fallback (No AI) | ✅ Working | Standard text |

---

## 🚨 Next Steps

1. **Provide inventory URL** from your spreadsheet
2. **Verify backend is running** (`npm start`)
3. **Test vehicle selection** in the chat
4. **See AI-generated pitches** in action!

---

## ❓ FAQ

**Q: What if the backend is down?**
A: The chat still works, but displays standard vehicle specs instead of AI pitches.

**Q: Can I customize the sales pitch?**
A: Yes! Edit the `prompt` variable in `processVehicleInterest()` function.

**Q: How much does this cost?**
A: ~$0.0005 per vehicle presentation. Very inexpensive for the engagement boost!

**Q: Can I use this in production?**
A: Yes! Deploy the backend to production (Heroku, Railway, etc.) and update `BACKEND_URL` in the code.

**Q: What URL do you need from the spreadsheet?**
A: The inventory listing URL that accepts a `vin` parameter, like: `https://yourdomain.com/inventory?vin=ABC123`

---

**Tell us your inventory URL and we'll get this fully live!**
