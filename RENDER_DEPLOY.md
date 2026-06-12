# Yahoo Options API - Render Deployment

This is a Yahoo Finance options data API proxy.

## Render Setup (Recommended)

### Quick Deploy to Render:

1. **Create Render Account**
   - Go to [render.com](https://render.com/)
   - Sign up with your GitHub account

2. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `msrafi/optionAnalysis`
   - Configure:

3. **Service Configuration**
   ```
   Name: yahoo-options-api
   Region: Choose closest to you
   Branch: main
   Root Directory: (leave empty)
   Runtime: Node
   Build Command: npm install
   Start Command: node server/yahooServer.js
   ```

4. **Environment Variables**
   ```
   PORT=10000
   NODE_ENV=production
   ```

5. **Instance Type**
   - Select: **Free** (512 MB RAM, spins down after 15min inactivity)
   - Or **Starter $7/month** (no spin down, always on)

6. **Deploy**
   - Click "Create Web Service"
   - Wait 2-3 minutes for initial deploy
   - Copy your service URL (e.g., `https://yahoo-options-api.onrender.com`)

### Update Frontend

After deploying to Render, update your frontend environment variable:

**`.env.production`**
```env
VITE_YAHOO_API_BASE=https://yahoo-options-api.onrender.com
```

Then rebuild and redeploy:
```bash
npm run build
npm run deploy
```

## API Endpoints

- Health check: `GET /health`
- Options data: `GET /api/yahoo/options/:symbol?date=<unix_timestamp>`
- Most active: `GET /api/yahoo/most-active`

## Free Tier Comparison

| Platform | RAM | Bandwidth | Sleeps | Cost |
|----------|-----|-----------|--------|------|
| Railway | 512MB | 100GB | Often | $5/mo limit |
| Render | 512MB | 100GB | After 15min | Free |
| Fly.io | 256MB | 160GB | No sleep | Free (3 VMs) |
| Vercel | N/A | 100GB | No sleep | Free |

## Support

Service URL: https://optionanalysis-production.up.railway.app (Railway)
New URL: (Update after Render deployment)

Frontend: https://msrafi.github.io/optionAnalysis/
