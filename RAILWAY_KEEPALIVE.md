# Railway Keep-Alive Setup Guide

## Problem
Railway's free tier puts services to sleep after periods of inactivity, causing 502 errors in the frontend.

## Current Solution
The backend now has **aggressive internal keep-alive**:
- Self-pings every **2 minutes** (down from 5 minutes)
- First ping starts after **30 seconds** of startup
- Detailed logging to track uptime and ping status

## External Monitoring (Recommended)

For even better reliability, set up external monitoring to ping your Railway service from outside:

### Option 1: UptimeRobot (Free, Recommended)
1. Go to [uptimerobot.com](https://uptimerobot.com/)
2. Sign up for free account (monitors up to 50 URLs)
3. Add new monitor:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** Railway Yahoo API
   - **URL:** `https://optionanalysis-production.up.railway.app/health`
   - **Monitoring Interval:** 5 minutes (free tier)
4. Save and activate

### Option 2: Cron-Job.org (Free)
1. Go to [cron-job.org](https://cron-job.org/)
2. Sign up for free account
3. Create new cron job:
   - **Title:** Keep Railway Alive
   - **URL:** `https://optionanalysis-production.up.railway.app/health`
   - **Schedule:** Every 2 minutes
   - **HTTP Method:** GET
4. Enable and save

### Option 3: Better Stack (Free, with alerts)
1. Go to [betterstack.com/uptime](https://betterstack.com/uptime)
2. Sign up for free (monitors up to 10 URLs)
3. Add monitor:
   - **URL:** `https://optionanalysis-production.up.railway.app/health`
   - **Check Interval:** 1 minute
   - **Email alerts:** Enable for downtime notifications
4. Save

## Verify It's Working

Check Railway logs to confirm pings are coming through:
```bash
# Check internal pings (every 2 min)
[keep-alive] ✓ Self-ping successful, uptime: 120.5

# Check external pings (shows in request logs)
GET /health 200 - 5ms
```

## Railway Free Tier Limits
- **$5/month** usage limit
- **512 MB RAM**
- **100 GB bandwidth**
- Service sleeps after inactivity

If the backend continues to have issues, consider upgrading to Railway's Hobby plan ($5/month) or migrating to:
- **Render** (better free tier, no sleep after 15min inactivity)
- **Fly.io** (3 VMs free, better resource limits)
- **Vercel Serverless** (better for API endpoints, auto-scales)

## Current Status
Backend URL: https://optionanalysis-production.up.railway.app

Check health: https://optionanalysis-production.up.railway.app/health

Expected response:
```json
{
  "ok": true,
  "service": "yahoo-options-api",
  "timestamp": "2026-06-12T01:35:00.000Z",
  "uptime": 245.5
}
```
