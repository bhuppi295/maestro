// Single source of truth lives in src/types/index.ts (see #13).
// This barrel keeps webview import paths stable while guaranteeing the
// extension and webview can never drift apart again.
export * from '../../src/types/index';
