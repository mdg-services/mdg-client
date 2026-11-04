/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Sentry DSN. Empty/absent ⇒ error reporting is not loaded at all. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENV?: string;
  /** Commit SHA or version, so a report names the bundle it came from. */
  readonly VITE_RELEASE?: string;
  /**
   * Comma list of the extension origins whose sign-in message the embedded app
   * believes (ADR 0032 §6). Empty ⇒ the published Dealer Kavach extension alone.
   */
  readonly VITE_EXTENSION_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
