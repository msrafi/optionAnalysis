# Stock Price API Setup Guide

## ⚠️ CORS Error Fix

You're seeing CORS errors because Yahoo Finance blocks browser requests. Here are your options:

---

## ✅ Solution 1: Use Finnhub API (Recommended)

Finnhub provides real-time NASDAQ data with proper CORS support.

### Steps:

1. **Sign up for free API key:**
   - Go to [https://finnhub.io/register](https://finnhub.io/register)
   - Create a free account
   - Copy your API key

2. **Create `.env` file** in project root:
   ```bash
   # In the project root directory
   touch .env
   ```

3. **Add your API key to `.env`:**
   ```env
   VITE_FINNHUB_API_KEY=your_actual_api_key_here
   ```

4. **Restart the development server:**
   ```bash
   npm run dev
   ```

### Result:
✅ Real-time NASDAQ prices  
✅ No CORS issues  
✅ 60 API calls/minute (free tier)

---

## ✅ Solution 2: Use CORS Proxy (Already Implemented)

I've added a CORS proxy fallback that should work automatically:

- First tries direct Yahoo Finance API
- If CORS fails, automatically uses `allorigins.win` proxy
- No configuration needed

### Result:
✅ Works without API key  
⚠️ Slightly slower (proxy adds latency)  
⚠️ Depends on third-party proxy service

---

## 🔍 How to Verify It's Working

After setting up, you should see in the console:

**With Finnhub:**
```
✓ Fetched price from Finnhub (NASDAQ) for AAPL: $150.25
```

**With CORS Proxy:**
```
Yahoo Finance direct access failed, trying CORS proxy...
✓ Fetched price from Yahoo Finance for TSLA: $245.30
```

---

## 🐛 Troubleshooting

### Still seeing CORS errors?

1. **Check `.env` file exists** in project root (same level as `package.json`)
2. **Restart dev server** after creating `.env`
3. **Clear browser cache** and reload

### Finnhub API not working?

1. **Verify API key** is correct in `.env`
2. **Check format:** `VITE_FINNHUB_API_KEY=your_key` (no quotes)
3. **Restart server** after any `.env` changes

### Need help?

Check the browser console for detailed error messages.

