/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override the API base URL. Defaults to "/api" (proxied by Vite in dev, nginx in Docker). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
