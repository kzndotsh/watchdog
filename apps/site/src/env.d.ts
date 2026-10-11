/// <reference types="astro/client" />

// oxlint-disable-next-line typescript/consistent-type-definitions -- merges with astro/client's global ImportMetaEnv
interface ImportMetaEnv {
  readonly PUBLIC_APP_URL: string;
}

// oxlint-disable-next-line typescript/consistent-type-definitions -- merges with astro/client's global ImportMeta
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
