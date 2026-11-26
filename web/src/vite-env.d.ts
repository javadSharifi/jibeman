/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION_INFO__: {
  version: string;
  build: number | null;
  commit: string;
  buildTime: string;
  buildId: string;
};
