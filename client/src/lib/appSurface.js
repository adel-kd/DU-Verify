const configuredSurface = String(import.meta.env.VITE_APP_SURFACE || '').toLowerCase();

export const isDeveloperSurface =
  configuredSurface === 'developer' ||
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
