const configuredSurface = String(import.meta.env.VITE_APP_SURFACE || '').toLowerCase();
const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const isLocalDeveloperPreview = isLocalHost && (
  window.location.pathname.startsWith('/developers') ||
  sessionStorage.getItem('developer_signup') === '1'
);

export const isDeveloperSurface =
  configuredSurface === 'developer' ||
  isLocalDeveloperPreview ||
  window.location.hostname === 'developer-duverifay.vercel.app' ||
  window.location.hostname === 'dev.duverifay.com';

export const developerPortalUrl =
  import.meta.env.VITE_DEVELOPER_PORTAL_URL ||
  'https://developer-duverifay.vercel.app';

export function authenticatedLanding(user) {
  if (isDeveloperSurface) return '/developers';
  if (!user) return '/login';
  if (user.role === 'admin') return '/admin';
  if (user.role === 'owner') return '/dashboard';
  return '/verify';
}
