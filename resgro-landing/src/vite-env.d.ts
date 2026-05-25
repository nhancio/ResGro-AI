/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EMAILJS_SERVICE_ID?: string
  readonly VITE_EMAILJS_TEMPLATE_ID?: string
  readonly VITE_EMAILJS_PUBLIC_KEY?: string
  /** Origin only (no path), e.g. https://xxx.run.app — used for Analysis Engine report fetch (must not use resgro.ai). */
  readonly VITE_AGENTS_API_URL?: string
  readonly VITE_ADMIN_EMAILS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
