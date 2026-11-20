// Demo mode: a copy of the website that runs entirely in the browser on recorded sample data,
// so it can be published on a static host such as GitHub Pages ("npm run build:demo").
// In the normal app IS_DEMO is false and nothing below changes anything.

export const IS_DEMO = import.meta.env.MODE === 'demo';

// The folder the website is served from: "/" normally, "/GPMP/" on GitHub Pages
export const BASE_URL = import.meta.env.BASE_URL;

// Address of a file in public/ (e.g. the logo) that also works under a sub-folder
export function asset(path) {
  return `${BASE_URL}${String(path).replace(/^\//, '')}`;
}

// Shown under the login form and in the demo badge
export const DEMO_PASSWORD_HINT = 'Gpmp@2026';
