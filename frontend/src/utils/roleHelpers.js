export const ROLES = {
  ACCOUNT_HOLDER: 'ACCOUNT_HOLDER',
  ADMIN: 'ADMIN',
  AUDITOR: 'AUDITOR',
};

export const ROLE_LABELS = {
  ACCOUNT_HOLDER: 'Account Holder',
  ADMIN: 'System Administrator',
  AUDITOR: 'Compliance Auditor',
};

export const ROLE_HOME_ROUTES = {
  ACCOUNT_HOLDER: '/dashboard',
  ADMIN: '/admin/dashboard',
  AUDITOR: '/auditor/dashboard',
};

export function normalizeAuthUser(rawUser) {
  if (!rawUser) return null;
  const u = rawUser.user || rawUser;
  const roleRaw = u.role || rawUser.role || '';
  const normalizedRole = String(roleRaw).trim().toUpperCase();
  const isActive = u.isActive ?? u.is_active ?? rawUser.isActive ?? rawUser.is_active ?? true;

  return {
    id: u.id || rawUser.id,
    name: u.fullName || u.full_name || u.name || rawUser.fullName || rawUser.name || 'Authorized User',
    fullName: u.fullName || u.full_name || u.name || rawUser.fullName || rawUser.name || 'Authorized User',
    email: u.email || rawUser.email || '',
    role: normalizedRole,
    isActive,
    status: isActive ? 'ACTIVE' : 'SUSPENDED',
    createdAt: u.createdAt || u.created_at || rawUser.createdAt || rawUser.created_at,
  };
}

export function getRoleDashboardRoute(role) {
  const normalized = String(role || '').trim().toUpperCase();
  return ROLE_HOME_ROUTES[normalized] || '/login';
}

export function isAccountHolder(role) {
  return String(role || '').trim().toUpperCase() === ROLES.ACCOUNT_HOLDER;
}

export function isAdmin(role) {
  return String(role || '').trim().toUpperCase() === ROLES.ADMIN;
}

export function isAuditor(role) {
  return String(role || '').trim().toUpperCase() === ROLES.AUDITOR;
}

export function isRouteAllowedForRole(pathname, role) {
  if (!pathname || typeof pathname !== 'string') return false;
  const normalizedRole = String(role || '').trim().toUpperCase();
  const cleanPath = pathname.split('?')[0].split('#')[0];

  // Block authentication and error loop routes
  if (['/login', '/register', '/unauthorized', '/'].includes(cleanPath)) {
    return false;
  }

  // Profile is shared across all authenticated institutional roles
  if (cleanPath === '/profile') {
    return true;
  }

  if (normalizedRole === ROLES.ADMIN) {
    return cleanPath.startsWith('/admin');
  }

  if (normalizedRole === ROLES.AUDITOR) {
    return cleanPath.startsWith('/auditor');
  }

  if (normalizedRole === ROLES.ACCOUNT_HOLDER) {
    return (
      cleanPath === '/dashboard' ||
      cleanPath.startsWith('/accounts') ||
      cleanPath.startsWith('/transactions') ||
      cleanPath.startsWith('/statements')
    );
  }

  return false;
}

export default {
  ROLES,
  ROLE_LABELS,
  ROLE_HOME_ROUTES,
  normalizeAuthUser,
  getRoleDashboardRoute,
  isAccountHolder,
  isAdmin,
  isAuditor,
  isRouteAllowedForRole,
};
