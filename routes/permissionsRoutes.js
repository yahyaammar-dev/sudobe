const express = require('express');
const router = express.Router();
const path = require('path');
require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const { requireSuperAdmin, clearRolePermissionsCache } = require('../middleware/permissions');
const ActivityLogger = require('../services/activityLogger');

// Serve the permissions management HTML page (super admin only)
function servePermissionsPage(req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'permissions.html'));
}

// Get all permissions (for reference - these are defined in config)
router.get('/api/permissions/list', requireSuperAdmin(), async (req, res) => {
  console.log('[PERMISSIONS API] GET /api/permissions/list called');
  try {
    console.log('[PERMISSIONS API] Loading permissions config...');
    const { PERMISSIONS } = require('../config/permissions');
    console.log('[PERMISSIONS API] Permissions loaded, count:', Object.keys(PERMISSIONS).length);
    
    const permissionsList = Object.values(PERMISSIONS).map(perm => ({
      key: perm,
      name: perm.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: getPermissionDescription(perm)
    }));
    
    console.log('[PERMISSIONS API] Sending permissions list, count:', permissionsList.length);
    res.json({
      success: true,
      data: permissionsList
    });
    console.log('[PERMISSIONS API] Response sent successfully');
  } catch (error) {
    console.error('[PERMISSIONS API] Error fetching permissions:', error);
    console.error('[PERMISSIONS API] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch permissions',
      error: error.message
    });
  }
});

// Get all roles and their permissions
router.get('/api/roles', requireSuperAdmin(), async (req, res) => {
  console.log('[PERMISSIONS API] GET /api/roles called');
  try {
    console.log('[PERMISSIONS API] Loading permissions config...');
    const { ROLES, ROLE_PERMISSIONS } = require('../config/permissions');
    console.log('[PERMISSIONS API] Config loaded, ROLES:', Object.keys(ROLES));
    
    // Try to fetch custom role-permissions from Swell first
    let swellRolePermissions = {};
    try {
      console.log('[PERMISSIONS API] GET - Fetching role-permissions from Swell...');
      
      let allContent = null;
      let rolePermsDocs = [];
      
      // Try querying the specific endpoint first (like /content/role-permissions)
      try {
        console.log('[PERMISSIONS API] GET - Trying /content/role-permissions endpoint...');
        allContent = await Promise.race([
          swell.get('/content/role-permissions', { limit: 1000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        rolePermsDocs = (allContent.results || []).filter(item => 
          item && item.content && item.content.role_key
        );
        console.log('[PERMISSIONS API] GET - Fetched from /content/role-permissions, found:', rolePermsDocs.length);
      } catch (endpointError) {
        console.log('[PERMISSIONS API] GET - /content/role-permissions failed, trying /content with where clause:', endpointError.message);
        // Fallback to /content with where clause
        allContent = await Promise.race([
          swell.get('/content', { 
            where: { type: 'role-permissions' },
            limit: 1000 
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        
        console.log('[PERMISSIONS API] GET - Fetched from /content with where clause, total items:', allContent.results?.length || 0);
        
        // Filter for role-permissions documents
        rolePermsDocs = (allContent.results || []).filter(item => 
          item && item.type === 'role-permissions' && item.content && item.content.role_key
        );
      }
      
      console.log('[PERMISSIONS API] GET - Found role-permissions documents:', rolePermsDocs.length);
      
      // Log all documents found for debugging
      if (rolePermsDocs.length > 0) {
        console.log('[PERMISSIONS API] GET - Documents found:');
        rolePermsDocs.forEach((doc, index) => {
          console.log(`[PERMISSIONS API] GET - Document ${index + 1}:`, {
            id: doc.id,
            type: doc.type,
            role_key: doc.content?.role_key,
            permissions_count: Array.isArray(doc.content?.permissions) ? doc.content.permissions.length : 'not array',
            permissions_type: typeof doc.content?.permissions
          });
        });
      }
      
      // Build a map of role_key -> permissions from Swell
      // Group by role_key and use the most recent document for each role
      const roleDocsMap = {};
      rolePermsDocs.forEach(doc => {
        const roleKey = doc.content.role_key;
        if (!roleDocsMap[roleKey]) {
          roleDocsMap[roleKey] = [];
        }
        roleDocsMap[roleKey].push(doc);
      });
      
      // For each role, use the most recent document
      Object.keys(roleDocsMap).forEach(roleKey => {
        const docs = roleDocsMap[roleKey];
        // Sort by date_created descending
        docs.sort((a, b) => {
          const dateA = new Date(a.date_created || 0);
          const dateB = new Date(b.date_created || 0);
          return dateB - dateA;
        });
        
        const doc = docs[0]; // Use most recent
        let perms = doc.content.permissions || [];
        
        // Handle case where permissions is stored as JSON string (long text field)
        if (typeof perms === 'string') {
          try {
            // Try parsing as JSON first
            perms = JSON.parse(perms);
            console.log('[PERMISSIONS API] GET - Parsed permissions from JSON string for role:', roleKey);
          } catch (e) {
            // If JSON parse fails, it might be comma-separated (old format)
            // Try splitting by comma
            if (perms.includes(',')) {
              console.log('[PERMISSIONS API] GET - Found comma-separated permissions (old format), converting to array for role:', roleKey);
              perms = perms.split(',').map(p => p.trim()).filter(p => p);
            } else {
              console.error('[PERMISSIONS API] GET - Error parsing permissions for role:', roleKey, e);
              perms = [];
            }
          }
        }
        
        // Ensure it's an array
        if (!Array.isArray(perms)) {
          console.warn('[PERMISSIONS API] GET - Permissions is not an array for role:', roleKey, 'converting to array');
          perms = [];
        }
        
        swellRolePermissions[roleKey] = perms;
        console.log('[PERMISSIONS API] GET - Role:', roleKey, 'has', perms.length, 'permissions from Swell (using most recent document)');
        
        // Log warning if multiple documents exist
        if (docs.length > 1) {
          console.warn('[PERMISSIONS API] GET - Found', docs.length, 'documents for role', roleKey, '- using most recent, consider cleaning up duplicates');
        }
      });
      
      console.log('[PERMISSIONS API] GET - Swell role-permissions map:', Object.keys(swellRolePermissions));
      
      if (Object.keys(swellRolePermissions).length === 0) {
        console.log('[PERMISSIONS API] GET - No custom role-permissions found in Swell, using config file defaults');
      }
    } catch (error) {
      console.log('[PERMISSIONS API] GET - Could not fetch from Swell, using config defaults:', error.message);
      console.error('[PERMISSIONS API] GET - Swell error details:', error);
      // Continue with config defaults
    }
    
    // Build roles data, using Swell permissions if available, otherwise config defaults
    console.log('[PERMISSIONS API] GET - Building roles data...');
    console.log('[PERMISSIONS API] GET - Swell permissions available for roles:', Object.keys(swellRolePermissions));
    console.log('[PERMISSIONS API] GET - Config roles available:', Object.keys(ROLE_PERMISSIONS));
    
    const rolesData = Object.keys(ROLES).map(roleKey => {
      const role = ROLES[roleKey];
      
      // Check if Swell has custom permissions for this role
      const hasSwellData = !!swellRolePermissions[role];
      const configPermissions = ROLE_PERMISSIONS[role] || [];
      
      // Use Swell permissions if available, otherwise fall back to config
      const permissions = hasSwellData ? swellRolePermissions[role] : configPermissions;
      const isCustom = hasSwellData;
      const source = hasSwellData ? 'Swell' : 'Config';
      
      console.log('[PERMISSIONS API] GET - Role:', role);
      console.log('[PERMISSIONS API] GET -   - Has Swell data:', hasSwellData);
      console.log('[PERMISSIONS API] GET -   - Source:', source);
      console.log('[PERMISSIONS API] GET -   - Config permissions count:', configPermissions.length);
      console.log('[PERMISSIONS API] GET -   - Final permissions count:', permissions.length);
      console.log('[PERMISSIONS API] GET -   - Config file path: config/permissions.js, ROLE_PERMISSIONS[' + role + ']');
      
      return {
        key: role,
        name: role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        permissions: permissions,
        isCustom: isCustom,
        source: source // Add source to response for debugging
      };
    });
    
    console.log('[PERMISSIONS API] Roles data prepared, count:', rolesData.length);
    console.log('[PERMISSIONS API] Sending response...');
    res.json({
      success: true,
      data: rolesData
    });
    console.log('[PERMISSIONS API] Response sent successfully');
  } catch (error) {
    console.error('[PERMISSIONS API] Error fetching roles:', error);
    console.error('[PERMISSIONS API] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: error.message
    });
  }
});

// Update role permissions
router.put('/api/roles/:roleKey/permissions', requireSuperAdmin(), async (req, res) => {
  try {
    const { roleKey } = req.params;
    const { permissions } = req.body;
    
    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'Permissions must be an array'
      });
    }
    
    // Validate permissions
    const { PERMISSIONS } = require('../config/permissions');
    const validPermissions = Object.values(PERMISSIONS);
    const invalidPerms = permissions.filter(p => !validPermissions.includes(p));
    
    if (invalidPerms.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid permissions: ${invalidPerms.join(', ')}`
      });
    }
    
    // Validate role
    const { ROLES } = require('../config/permissions');
    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(roleKey)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Valid roles are: ${validRoles.join(', ')}`
      });
    }
    
    // Try to find existing role-permissions document(s)
    let roleDoc = null;
    let allRoleDocs = [];
    try {
      console.log('[PERMISSIONS API] PUT - Searching for existing role-permissions document for role:', roleKey);
      
      // Try querying the specific endpoint first
      try {
        const allContent = await Promise.race([
          swell.get('/content/role-permissions', { limit: 1000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
        
        // Find all documents for this role_key
        allRoleDocs = (allContent.results || []).filter(item => 
          item && item.content && item.content.role_key === roleKey
        );
        
        console.log('[PERMISSIONS API] PUT - Fetched from /content/role-permissions, found', allRoleDocs.length, 'documents for role:', roleKey);
      } catch (endpointError) {
        console.log('[PERMISSIONS API] PUT - /content/role-permissions failed, trying /content with where clause:', endpointError.message);
        // Fallback to /content with where clause
      const allContent = await Promise.race([
          swell.get('/content', { 
            where: { 
              type: 'role-permissions',
              'content.role_key': roleKey
            },
            limit: 1000 
          }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);
      
        allRoleDocs = (allContent.results || []).filter(item => 
          item && item.content && item.content.role_key === roleKey
        );
        
        console.log('[PERMISSIONS API] PUT - Fetched from /content with where clause, found', allRoleDocs.length, 'documents');
      }
      
      // Get the most recent document (or any one if multiple exist)
      if (allRoleDocs.length > 0) {
        // Sort by date_created descending and get the most recent
        allRoleDocs.sort((a, b) => {
          const dateA = new Date(a.date_created || 0);
          const dateB = new Date(b.date_created || 0);
          return dateB - dateA;
        });
        roleDoc = allRoleDocs[0];
        console.log('[PERMISSIONS API] PUT - Found', allRoleDocs.length, 'existing document(s), using most recent:', roleDoc.id);
        console.log('[PERMISSIONS API] PUT - Current permissions in Swell:', JSON.stringify(roleDoc.content?.permissions));
        
        // If there are multiple documents, we'll delete the old ones after updating
        if (allRoleDocs.length > 1) {
          console.log('[PERMISSIONS API] PUT - Warning: Found', allRoleDocs.length, 'documents for role', roleKey, '- will delete old ones after update');
        }
      } else {
        console.log('[PERMISSIONS API] PUT - No existing document found, will create new one');
      }
    } catch (error) {
      console.log('[PERMISSIONS API] PUT - Error finding existing role document:', error.message);
      console.error('[PERMISSIONS API] PUT - Error details:', error);
      // Document doesn't exist, will create new one
    }
    
    const roleName = roleKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    // Since permissions field is "long text" in Swell, we need to JSON.stringify the array
    // This ensures it's stored as a JSON string that can be parsed back to an array
    const permissionsToSave = Array.isArray(permissions) ? JSON.stringify(permissions) : JSON.stringify([]);
    
    console.log('[PERMISSIONS API] PUT - Permissions array length:', permissions.length);
    console.log('[PERMISSIONS API] PUT - Permissions as JSON string length:', permissionsToSave.length);
    
    const roleData = {
      active: true,
      content: {
        role_key: roleKey,
        role_name: roleName,
        permissions: permissionsToSave // JSON string for long text field
      }
    };
    
    console.log('[PERMISSIONS API] PUT - Role data structure:', {
      active: roleData.active,
      content_keys: Object.keys(roleData.content),
      permissions_type: Array.isArray(roleData.content.permissions) ? 'Array' : typeof roleData.content.permissions,
      permissions_count: roleData.content.permissions.length
    });
    
    console.log('[PERMISSIONS API] PUT - Preparing to save to Swell with permissions:', permissions);
    console.log('[PERMISSIONS API] PUT - Permissions type:', Array.isArray(permissions) ? 'Array' : typeof permissions);
    
    let updated;
    if (roleDoc) {
      // Update existing - use the specific content type endpoint
      console.log('[PERMISSIONS API] PUT - Updating existing Swell document:', roleDoc.id);
      try {
        // Use the specific endpoint format: /content/role-permissions/{id}
        updated = await swell.put(`/content/role-permissions/${roleDoc.id}`, roleData);
        console.log('[PERMISSIONS API] PUT - Successfully updated Swell document:', updated?.id);
        console.log('[PERMISSIONS API] PUT - Updated permissions in Swell:', updated?.content?.permissions);
        console.log('[PERMISSIONS API] PUT - Full response:', JSON.stringify(updated, null, 2));
      } catch (error) {
        console.error('[PERMISSIONS API] PUT - Error updating Swell document:', error);
        console.error('[PERMISSIONS API] PUT - Error response:', error.response?.data || error.message);
        throw error;
      }
    } else {
      // Create new - try both endpoint formats
      console.log('[PERMISSIONS API] PUT - Creating new Swell document');
      console.log('[PERMISSIONS API] PUT - Role data to save:', JSON.stringify(roleData, null, 2));
      
      try {
        // Try using /content/role-permissions endpoint first (like other content types)
        try {
          updated = await swell.post('/content/role-permissions', roleData);
          console.log('[PERMISSIONS API] PUT - Successfully created using /content/role-permissions');
        } catch (endpointError) {
          console.log('[PERMISSIONS API] PUT - /content/role-permissions failed, trying /content with type:', endpointError.message);
          // Fallback to /content with type in body
      updated = await swell.post('/content', {
        type: 'role-permissions',
        ...roleData
      });
          console.log('[PERMISSIONS API] PUT - Successfully created using /content with type');
        }
        
        if (!updated) {
          throw new Error('Swell POST returned undefined - no response from API');
        }
        
        console.log('[PERMISSIONS API] PUT - Successfully created Swell document');
        console.log('[PERMISSIONS API] PUT - Document ID:', updated.id);
        console.log('[PERMISSIONS API] PUT - Saved permissions in Swell:', updated.content?.permissions);
        console.log('[PERMISSIONS API] PUT - Full response:', JSON.stringify(updated, null, 2));
      } catch (error) {
        console.error('[PERMISSIONS API] PUT - Error creating Swell document:', error);
        console.error('[PERMISSIONS API] PUT - Error details:', error.response?.data || error.message);
        console.error('[PERMISSIONS API] PUT - Error stack:', error.stack);
        throw error;
      }
      
      // Delete old duplicate documents if there were multiple
      if (allRoleDocs.length > 1) {
        console.log('[PERMISSIONS API] PUT - Cleaning up', allRoleDocs.length - 1, 'old duplicate document(s)...');
        for (let i = 1; i < allRoleDocs.length; i++) {
          try {
            await swell.delete(`/content/${allRoleDocs[i].id}`);
            console.log('[PERMISSIONS API] PUT - Deleted old document:', allRoleDocs[i].id);
          } catch (deleteError) {
            console.error('[PERMISSIONS API] PUT - Error deleting old document:', allRoleDocs[i].id, deleteError.message);
          }
        }
      }
    }
    
    // Clear the cache so fresh permissions are loaded
    clearRolePermissionsCache();
    console.log('[PERMISSIONS API] PUT - Cache cleared');
    
    // Log the activity
    ActivityLogger.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'manage_roles',
      resourceType: 'role',
      resourceId: roleKey,
      description: `Updated permissions for role ${roleName}`,
      metadata: { roleKey, roleName, permissions },
      req
    });
    
    res.json({
      success: true,
      message: 'Role permissions updated successfully',
      data: {
        key: roleKey,
        name: roleName,
        permissions: permissions
      }
    });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update role permissions',
      error: error.message
    });
  }
});

// Get all users with their roles
router.get('/api/users', requireSuperAdmin(), async (req, res) => {
  console.log('[PERMISSIONS API] GET /api/users called');
  try {
    console.log('[PERMISSIONS API] Fetching users from Swell...');
    const users = await swell.get('/content/cms-users', {
      limit: 1000
    });
    console.log('[PERMISSIONS API] Users fetched successfully, count:', users.results?.length || 0);
    
    const usersData = (users.results || []).map(user => ({
      id: user.id,
      email: user.content?.email || '',
      name: user.content?.name || '',
      role: user.content?.role || null,
      active: user.active !== false
    }));
    
    console.log('[PERMISSIONS API] Returning users data, count:', usersData.length);
    res.json({
      success: true,
      data: usersData
    });
  } catch (error) {
    console.error('[PERMISSIONS API] Error fetching users:', error);
    console.error('[PERMISSIONS API] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// Update user role
router.put('/api/users/:id/role', requireSuperAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role is required'
      });
    }
    
    // Validate role
    const { ROLES } = require('../config/permissions');
    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Valid roles are: ${validRoles.join(', ')}`
      });
    }
    
    // Get current user
    const user = await swell.get(`/content/cms-users/${id}`);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get old role for logging
    const oldRole = user.content?.role || null;
    
    // Update user role
    const updated = await swell.put(`/content/cms-users/${id}`, {
      content: {
        ...user.content,
        role: role
      }
    });
    
    // Log the activity
    ActivityLogger.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: 'manage_users',
      resourceType: 'user',
      resourceId: id,
      description: `Updated user role from ${oldRole || 'none'} to ${role} for user ${updated.content?.email || id}`,
      metadata: { userId: id, oldRole, newRole: role, userEmail: updated.content?.email },
      req
    });
    
    res.json({
      success: true,
      message: 'User role updated successfully',
      data: {
        id: updated.id,
        email: updated.content?.email || '',
        role: updated.content?.role || null
      }
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user role',
      error: error.message
    });
  }
});

// Helper function to get permission descriptions
function getPermissionDescription(permission) {
  const descriptions = {
    'view_orders': 'View orders list',
    'create_order': 'Create new orders',
    'edit_order': 'Edit existing orders',
    'delete_order': 'Delete orders',
    'view_customers': 'View customers list',
    'create_customer': 'Create new customers',
    'edit_customer': 'Edit existing customers',
    'delete_customer': 'Delete customers',
    'view_factories': 'View factories list',
    'create_factory': 'Create new factories',
    'edit_factory': 'Edit existing factories',
    'delete_factory': 'Delete factories',
    'view_shipping_rates': 'View shipping rates',
    'create_shipping_rate': 'Create shipping rates',
    'edit_shipping_rate': 'Edit shipping rates',
    'delete_shipping_rate': 'Delete shipping rates',
    'view_banners': 'View banners',
    'create_banner': 'Create banners',
    'edit_banner': 'Edit banners',
    'delete_banner': 'Delete banners',
    'view_protections': 'View protections',
    'create_protection': 'Create protections',
    'edit_protection': 'Edit protections',
    'delete_protection': 'Delete protections',
    'view_images': 'View images',
    'upload_image': 'Upload images',
    'delete_image': 'Delete images',
    'view_products': 'View products',
    'import_products': 'Import products',
    'export_products': 'Export products',
    'view_logs': 'View activity logs',
    'manage_users': 'Manage users',
    'manage_roles': 'Manage roles and permissions',
    'view_qa_reports': 'View QC/QA reports'
  };
  
  return descriptions[permission] || permission.replace(/_/g, ' ');
}

// Export both the page handler and the router
module.exports = servePermissionsPage;
module.exports.router = router;

