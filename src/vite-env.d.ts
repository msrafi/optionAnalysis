/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_FINNHUB_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

