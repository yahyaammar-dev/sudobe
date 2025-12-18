const { hasPermission: configHasPermission, hasRole: configHasRole, ROLES, PERMISSIONS, ROLE_PERMISSIONS } = require('../config/permissions');
const { swell } = require('swell-node');
require('dotenv').config();
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);

// Cache for role permissions (refresh on server restart or manually)
let rolePermissionsCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get role permissions from Swell or fallback to config
 */
async function getRolePermissions(role) {
  // Check cache first (with TTL)
  const now = Date.now();
  if (rolePermissionsCache && rolePermissionsCache[role] && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL)) {
    return rolePermissionsCache[role];
  }
  
  // Try to fetch from Swell first
  try {
    let allContent = null;
    let rolePermsDoc = null;
    
    // Try querying the specific endpoint first
    try {
      allContent = await Promise.race([
        swell.get('/content/role-permissions', { limit: 1000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);
      rolePermsDoc = (allContent.results || []).find(item => 
        item && item.content && item.content.role_key === role
      );
    } catch (endpointError) {
      // Fallback to /content with where clause
      allContent = await Promise.race([
        swell.get('/content', { 
          where: { 
            type: 'role-permissions',
            'content.role_key': role
          },
          limit: 1000 
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);
      
      // Find all matching role-permissions documents and use the most recent
      const matchingDocs = (allContent.results || []).filter(item => 
        item && item.content && item.content.role_key === role
      );
      
      if (matchingDocs.length > 0) {
        // Sort by date_created descending and use the most recent
        matchingDocs.sort((a, b) => {
          const dateA = new Date(a.date_created || 0);
          const dateB = new Date(b.date_created || 0);
          return dateB - dateA;
        });
        rolePermsDoc = matchingDocs[0];
        
        if (matchingDocs.length > 1) {
          console.warn('[PERMISSIONS] Found', matchingDocs.length, 'documents for role', role, '- using most recent');
        }
      }
    }
    
    if (rolePermsDoc && rolePermsDoc.content && rolePermsDoc.content.permissions) {
      let permissions = rolePermsDoc.content.permissions;
      
      // Handle case where permissions is stored as JSON string (long text field)
      if (typeof permissions === 'string') {
        try {
          // Try parsing as JSON first
          permissions = JSON.parse(permissions);
          console.log('[PERMISSIONS] Parsed permissions from JSON string for role:', role);
        } catch (e) {
          // If JSON parse fails, it might be comma-separated (old format)
          // Try splitting by comma
          if (permissions.includes(',')) {
            console.log('[PERMISSIONS] Found comma-separated permissions (old format), converting to array for role:', role);
            permissions = permissions.split(',').map(p => p.trim()).filter(p => p);
          } else {
            console.error('[PERMISSIONS] Error parsing permissions for role:', role, e);
            permissions = [];
          }
        }
      }
      
      // Ensure it's an array
      if (!Array.isArray(permissions)) {
        console.warn('[PERMISSIONS] Permissions is not an array for role:', role, 'converting to array');
        permissions = [];
      }
      
      console.log('[PERMISSIONS] Loaded permissions from Swell for role:', role, 'Count:', permissions.length);
      
      // Update cache
      if (!rolePermissionsCache) rolePermissionsCache = {};
      rolePermissionsCache[role] = permissions;
      cacheTimestamp = now;
      
      return permissions;
    } else {
      console.log('[PERMISSIONS] No Swell document found for role:', role, 'using config defaults');
    }
  } catch (error) {
    console.log('[PERMISSIONS] Could not fetch from Swell, using config defaults:', error.message);
    // Continue with config defaults
  }
  
  // Fallback to config file
  const permissions = ROLE_PERMISSIONS[role] || [];
  
  // Update cache
  if (!rolePermissionsCache) rolePermissionsCache = {};
  rolePermissionsCache[role] = permissions;
  cacheTimestamp = now;
  
  return permissions;
}

/**
 * Check if role has permission (with Swell support)
 */
async function checkPermission(userRole, permission) {
  // Super admin always has all permissions
  if (userRole === ROLES.SUPER_ADMIN) {
    return true;
  }
  
  const permissions = await getRolePermissions(userRole);
  return permissions.includes(permission);
}

/**
 * Check if user has role (with Swell support)
 */
function checkRole(userRole, requiredRole) {
  // Super admin always returns true for any role check
  if (userRole === ROLES.SUPER_ADMIN) {
    return true;
  }
  return userRole === requiredRole;
}

/**
 * Middleware to check if user has a specific permission
 * @param {string} permission - The permission to check
 * @returns {Function} Express middleware
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    console.log('[PERMISSIONS] requirePermission middleware called for permission:', permission);
    try {
      // Get user role from the authenticated user (should be set by auth middleware)
      const userRole = req.user?.content?.role || req.user?.role || null;
      console.log('[PERMISSIONS] Extracted userRole:', userRole);
      
      if (!userRole) {
        console.log('[PERMISSIONS] No role assigned, denying access');
        return res.status(403).json({
          success: false,
          message: 'Access denied: No role assigned'
        });
      }
      
      console.log('[PERMISSIONS] Checking permission...');
      const hasPerm = await checkPermission(userRole, permission);
      console.log('[PERMISSIONS] Permission check result:', hasPerm);
      
      if (!hasPerm) {
        console.log('[PERMISSIONS] User does not have permission, denying access');
        return res.status(403).json({
          success: false,
          message: `Access denied: You don't have permission to ${permission}`
        });
      }
      
      console.log('[PERMISSIONS] Permission check passed, calling next()');
      next();
    } catch (error) {
      console.error('[PERMISSIONS] Error in permission check:', error);
      console.error('[PERMISSIONS] Error stack:', error.stack);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message
      });
    }
  };
}

/**
 * Middleware to check if user has a specific role
 * @param {string} role - The role to check
 * @returns {Function} Express middleware
 */
function requireRole(role) {
  return async (req, res, next) => {
    console.log('[PERMISSIONS] requireRole middleware EXECUTING for role:', role);
    console.log('[PERMISSIONS] req.user exists:', !!req.user);
    console.log('[PERMISSIONS] req.user:', JSON.stringify(req.user, null, 2));
    
    try {
      // Check if req.user exists - if not, auth middleware might not have run
      if (!req.user) {
        console.log('[PERMISSIONS] req.user is missing! Auth middleware may not have run.');
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Please login first'
        });
      }
      
      const userRole = req.user?.content?.role || req.user?.role || null;
      console.log('[PERMISSIONS] Extracted userRole:', userRole);
      
      if (!userRole) {
        console.log('[PERMISSIONS] No role assigned to user, denying access');
        return res.status(403).json({
          success: false,
          message: 'Access denied: No role assigned. Please contact administrator.'
        });
      }
      
      console.log('[PERMISSIONS] Checking if user role', userRole, 'matches required role', role);
      const hasRequiredRole = checkRole(userRole, role);
      console.log('[PERMISSIONS] Role check result:', hasRequiredRole);
      
      if (!hasRequiredRole) {
        console.log('[PERMISSIONS] User does not have required role, denying access');
        return res.status(403).json({
          success: false,
          message: `Access denied: Required role ${role}. Your role: ${userRole}`
        });
      }
      
      console.log('[PERMISSIONS] ✓ Role check passed, calling next()');
      next();
    } catch (error) {
      console.error('[PERMISSIONS] ✗ Error in role check:', error);
      console.error('[PERMISSIONS] Error stack:', error.stack);
      return res.status(500).json({
        success: false,
        message: 'Error checking role',
        error: error.message
      });
    }
  };
}

/**
 * Middleware to check if user is super admin
 * @returns {Function} Express middleware
 */
function requireSuperAdmin() {
  console.log('[PERMISSIONS] requireSuperAdmin() called, returning middleware for role:', ROLES.SUPER_ADMIN);
  const middleware = requireRole(ROLES.SUPER_ADMIN);
  console.log('[PERMISSIONS] Middleware function created:', typeof middleware);
  return middleware;
}

/**
 * Clear the role permissions cache
 * Call this when permissions are updated to ensure fresh data
 */
function clearRolePermissionsCache() {
  rolePermissionsCache = null;
  cacheTimestamp = null;
  console.log('[PERMISSIONS] Role permissions cache cleared');
}

module.exports = {
  requirePermission,
  requireRole,
  requireSuperAdmin,
  PERMISSIONS, // Export PERMISSIONS for use in routes
  hasPermission: checkPermission, // Export async version
  hasRole: checkRole, // Export role check
  clearRolePermissionsCache, // Export cache clearing function
};

