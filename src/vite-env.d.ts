/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_FINNHUB_API_KEY?: string;
  readonly VITE_YAHOO_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

