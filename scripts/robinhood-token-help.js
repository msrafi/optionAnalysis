#!/usr/bin/env node

console.log(`
Robinhood session token setup (no new signup — uses your existing account)

1. Open https://robinhood.com in Chrome and make sure you are logged in.
2. Open DevTools → Network tab.
3. Refresh the page or open any stock/options page.
4. Click a request to api.robinhood.com.
5. In Request Headers, copy the value after "Bearer " in Authorization.
6. Add it to .env.local:

   ROBINHOOD_BROKERAGE_TOKEN=paste_token_here

7. Restart the options server: npm run yahoo-server

Test:
   curl -i "http://localhost:8788/api/robinhood/options/SPY"

Notes:
- Tokens expire like a normal web session. Refresh when you get 401 errors.
- Keep the token private — it grants access to your Robinhood account reads.
- This uses Robinhood's unofficial private API. Use for personal analysis only.
`);
