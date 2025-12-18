/**
 * Client-side Permissions Helper Functions
 * 
 * These functions work with user data stored in localStorage/sessionStorage
 * or can be called with user role data
 * 
 * Usage:
 * - Store user role in localStorage after login: localStorage.setItem('userRole', 'super_admin')
 * - Call hasPermission('edit_order') or hasRole('admin') in your JavaScript
 */

// Available roles
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  OPERATOR: 'operator',
};

// Permissions mapping (same as backend)
const ROLE_PERMISSIONS = {
  'super_admin': [
    // Super admin has all permissions
    'view_orders', 'create_order', 'edit_order', 'delete_order',
    'view_customers', 'create_customer', 'edit_customer', 'delete_customer',
    'view_factories', 'create_factory', 'edit_factory', 'delete_factory',
    'view_shipping_rates', 'create_shipping_rate', 'edit_shipping_rate', 'delete_shipping_rate',
    'view_banners', 'create_banner', 'edit_banner', 'delete_banner',
    'view_protections', 'create_protection', 'edit_protection', 'delete_protection',
    'view_images', 'upload_image', 'delete_image',
    'view_products', 'import_products', 'export_products',
    'view_logs', 'manage_users', 'manage_roles', 'view_qa_reports',
  ],
  'operator': [
    'view_orders', 'create_order', 'edit_order', 'delete_order',
    'view_customers', 'view_factories', 'view_shipping_rates',
    'view_banners', 'view_protections', 'view_images', 'view_products',
    'view_qa_reports',
  ],
};

/**
 * Get the current user's role
 * @returns {string|null} The user's role or null
 */
function getUserRole() {
  // Try to get from localStorage first
  const role = localStorage.getItem('userRole');
  if (role) return role;
  
  // Try to get from global variable (set by server-side rendering)
  if (typeof window !== 'undefined' && window.currentUserRole) {
    return window.currentUserRole;
  }
  
  return null;
}

/**
 * Check if user has a specific role
 * @param {string} requiredRole - The role to check for
 * @param {string} userRole - Optional: user's role (if not provided, will fetch from storage)
 * @returns {boolean}
 */
function hasRole(requiredRole, userRole = null) {
  const role = userRole || getUserRole();
  
  if (!role) return false;
  
  // Super admin always returns true for any role check
  if (role === ROLES.SUPER_ADMIN) {
    return true;
  }
  
  return role === requiredRole;
}

/**
 * Check if user has a specific permission
 * @param {string} permission - The permission to check
 * @param {string} userRole - Optional: user's role (if not provided, will fetch from storage)
 * @returns {boolean}
 */
function hasPermission(permission, userRole = null) {
  const role = userRole || getUserRole();
  
  if (!role) return false;
  
  // Super admin has all permissions
  if (role === ROLES.SUPER_ADMIN) {
    return true;
  }
  
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Set user role in localStorage (called after login)
 * @param {string} role - The user's role
 */
function setUserRole(role) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('userRole', role);
  }
  if (typeof window !== 'undefined') {
    window.currentUserRole = role;
  }
}

/**
 * Clear user role (called on logout)
 */
function clearUserRole() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('userRole');
  }
  if (typeof window !== 'undefined') {
    window.currentUserRole = null;
  }
}

// Export functions for use in other scripts
if (typeof window !== 'undefined') {
  window.hasPermission = hasPermission;
  window.hasRole = hasRole;
  window.setUserRole = setUserRole;
  window.clearUserRole = clearUserRole;
  window.ROLES = ROLES;
}

// Also export for Node.js/CommonJS if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hasPermission,
    hasRole,
    setUserRole,
    clearUserRole,
    ROLES,
  };
}

