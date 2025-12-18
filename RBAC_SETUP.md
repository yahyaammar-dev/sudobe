# Roles and Permissions System Setup Guide

## Overview

This system implements Role-Based Access Control (RBAC) with activity logging for the CMS.

## Components Created

### 1. Permissions Configuration (`config/permissions.js`)
- Defines all available permissions
- Maps roles to their permissions
- Provides helper functions: `hasPermission()`, `hasRole()`

### 2. Permission Middleware (`middleware/permissions.js`)
- `requirePermission(permission)` - Middleware to check permissions
- `requireRole(role)` - Middleware to check roles
- `requireSuperAdmin()` - Middleware for super admin only

### 3. Activity Logger (`services/activityLogger.js`)
- Logs all user actions
- Stores logs in Swell content model
- Helper methods for common actions

### 4. Logs Management (`routes/logsRoutes.js` + `public/logs.html`)
- View all activity logs (super admin only)
- Filter logs by action, resource type, user, date
- Pagination support

### 5. Client-side Helpers (`public/js/permissions.js`)
- `hasPermission(permission)` - Check permissions in frontend
- `hasRole(role)` - Check roles in frontend
- `setUserRole(role)` - Store user role after login
- `clearUserRole()` - Clear role on logout

## Setup Instructions

### Step 1: Create Swell Content Model for Activity Logs

1. Go to Swell Dashboard → Settings → Content
2. Click "Create Content Type"
3. Name: `activity-logs`
4. Add the following fields:
   - `user_id` (Text, Required)
   - `user_email` (Text)
   - `action` (Text, Required)
   - `resource_type` (Text, Required)
   - `resource_id` (Text)
   - `description` (Text/Textarea)
   - `metadata` (Object/JSON)
   - `ip_address` (Text)
   - `user_agent` (Text)
   - `date_created` (Date)

### Step 2: Store User Role in Swell Account

**Option A: Use Account Content Field (Recommended)**
- Go to Swell Dashboard → Settings → Account Fields
- Add a custom field: `role` (Text)
- Store role values: `super_admin` or `operator`

**Option B: Use CMS User Content**
- If using CMS users, add `role` field to `cms-users` content type

### Step 3: Update Authentication Flow

After user login, set their role:

```javascript
// In your auth route after successful login
const userRole = user.content?.role || null;
setUserRole(userRole); // Stores in localStorage for frontend

// In JWT token or session, include role:
req.user = {
  id: user.id,
  email: user.email,
  role: userRole,
  content: { role: userRole }
};
```

### Step 4: Update Routes with Permissions

Example usage in routes:

```javascript
const { requirePermission, PERMISSIONS } = require('../middleware/permissions');

// Protect route with permission
router.get('/api', requirePermission(PERMISSIONS.VIEW_ORDERS), async (req, res) => {
  // Route handler
});

// Log activities
ActivityLogger.logOrderCreated(req.user.id, req.user.email, orderId, orderData, req);
```

### Step 5: Use in Frontend

```javascript
// Check permissions to conditionally render UI
if (hasPermission('edit_order')) {
  // Show edit button
}

if (hasRole('super_admin')) {
  // Show admin panel
}

// After login, set user role
setUserRole('super_admin'); // or 'operator'

// On logout, clear role
clearUserRole();
```

## Available Roles

- **super_admin**: Has all permissions
- **operator**: Limited permissions (view most things, manage orders)

## Available Permissions

See `config/permissions.js` for complete list. Common ones:
- `view_orders`, `create_order`, `edit_order`, `delete_order`
- `view_customers`, `create_customer`, `edit_customer`, `delete_customer`
- `view_factories`, `create_factory`, `edit_factory`, `delete_factory`
- `view_logs` (super admin only)
- `manage_users`, `manage_roles` (super admin only)

## Example: Conditionally Render Based on Permissions

```html
<!-- In your HTML -->
<button id="editBtn" style="display: none;" onclick="editOrder()">Edit</button>

<script>
if (hasPermission('edit_order')) {
  document.getElementById('editBtn').style.display = 'block';
}
</script>
```

## Adding New Permissions

1. Add to `PERMISSIONS` object in `config/permissions.js`
2. Add to `ROLE_PERMISSIONS` for appropriate roles
3. Use `requirePermission(PERMISSIONS.YOUR_NEW_PERMISSION)` in routes
4. Use `hasPermission('your_new_permission')` in frontend

## Notes

- Super admin always has all permissions
- Activity logs are only visible to super admin
- Roles are stored in Swell account/content `role` field
- Frontend permissions helpers use localStorage for role storage

