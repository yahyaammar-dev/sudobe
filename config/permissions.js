/**
 * Roles and Permissions Configuration
 * 
 * This file defines:
 * - Available roles in the system
 * - Permissions for each role
 * - Helper functions for checking permissions
 */

// Define all available permissions in the system
const PERMISSIONS = {
  // Order permissions
  VIEW_ORDERS: 'view_orders',
  CREATE_ORDER: 'create_order',
  EDIT_ORDER: 'edit_order',
  DELETE_ORDER: 'delete_order',
  
  // Customer permissions
  VIEW_CUSTOMERS: 'view_customers',
  CREATE_CUSTOMER: 'create_customer',
  EDIT_CUSTOMER: 'edit_customer',
  DELETE_CUSTOMER: 'delete_customer',
  
  // Factory permissions
  VIEW_FACTORIES: 'view_factories',
  CREATE_FACTORY: 'create_factory',
  EDIT_FACTORY: 'edit_factory',
  DELETE_FACTORY: 'delete_factory',
  
  // Shipping rates permissions
  VIEW_SHIPPING_RATES: 'view_shipping_rates',
  CREATE_SHIPPING_RATE: 'create_shipping_rate',
  EDIT_SHIPPING_RATE: 'edit_shipping_rate',
  DELETE_SHIPPING_RATE: 'delete_shipping_rate',
  
  // Content permissions
  VIEW_BANNERS: 'view_banners',
  CREATE_BANNER: 'create_banner',
  EDIT_BANNER: 'edit_banner',
  DELETE_BANNER: 'delete_banner',
  
  VIEW_PROTECTIONS: 'view_protections',
  CREATE_PROTECTION: 'create_protection',
  EDIT_PROTECTION: 'edit_protection',
  DELETE_PROTECTION: 'delete_protection',
  
  VIEW_IMAGES: 'view_images',
  UPLOAD_IMAGE: 'upload_image',
  DELETE_IMAGE: 'delete_image',
  
  VIEW_PRODUCTS: 'view_products',
  IMPORT_PRODUCTS: 'import_products',
  EXPORT_PRODUCTS: 'export_products',
  
  // Admin permissions
  VIEW_LOGS: 'view_logs',
  MANAGE_USERS: 'manage_users',
  MANAGE_ROLES: 'manage_roles',
  VIEW_QA_REPORTS: 'view_qa_reports',
};

// Define roles and their permissions
const ROLE_PERMISSIONS = {
  'super_admin': [
    // Super admin has all permissions
    ...Object.values(PERMISSIONS)
  ],
  
  'operator': [
    // Operator has limited permissions - can manage orders and view most things
    PERMISSIONS.VIEW_ORDERS,
    PERMISSIONS.CREATE_ORDER,
    PERMISSIONS.EDIT_ORDER,
    PERMISSIONS.DELETE_ORDER,
    PERMISSIONS.VIEW_CUSTOMERS,
    PERMISSIONS.VIEW_FACTORIES,
    PERMISSIONS.VIEW_SHIPPING_RATES,
    PERMISSIONS.VIEW_BANNERS,
    PERMISSIONS.VIEW_PROTECTIONS,
    PERMISSIONS.VIEW_IMAGES,
    PERMISSIONS.VIEW_PRODUCTS,
    PERMISSIONS.VIEW_QA_REPORTS,
  ],
};

// Available roles
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  OPERATOR: 'operator',
};

/**
 * Get permissions for a role
 * @param {string} role - The role name
 * @returns {string[]} Array of permission strings
 */
function getPermissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role has a specific permission
 * @param {string} role - The role name
 * @param {string} permission - The permission to check
 * @returns {boolean}
 */
function roleHasPermission(role, permission) {
  const permissions = getPermissionsForRole(role);
  return permissions.includes(permission);
}

/**
 * Check if user has a specific role
 * @param {string} userRole - The user's role
 * @param {string} requiredRole - The role to check for
 * @returns {boolean}
 */
function hasRole(userRole, requiredRole) {
  // Super admin always returns true for any role check
  if (userRole === ROLES.SUPER_ADMIN) {
    return true;
  }
  return userRole === requiredRole;
}

/**
 * Check if user has a specific permission
 * @param {string} userRole - The user's role
 * @param {string} permission - The permission to check
 * @returns {boolean}
 */
function hasPermission(userRole, permission) {
  // Super admin has all permissions
  if (userRole === ROLES.SUPER_ADMIN) {
    return true;
  }
  return roleHasPermission(userRole, permission);
}

module.exports = {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  roleHasPermission,
  hasRole,
  hasPermission,
};

