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

export function getRoleDashboardRoute(role) {
  return ROLE_HOME_ROUTES[role] || '/login';
}

export function isAccountHolder(role) {
  return role === ROLES.ACCOUNT_HOLDER;
}

export function isAdmin(role) {
  return role === ROLES.ADMIN;
}

export function isAuditor(role) {
  return role === ROLES.AUDITOR;
}

export default {
  ROLES,
  ROLE_LABELS,
  ROLE_HOME_ROUTES,
  getRoleDashboardRoute,
  isAccountHolder,
  isAdmin,
  isAuditor,
};
