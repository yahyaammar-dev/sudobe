/**
 * Shared Sidebar Component
 * This file contains the sidebar HTML structure and rendering logic
 * to avoid duplication across all pages.
 * 
 * IMPORTANT: This script requires permissions.js to be loaded first
 */

// Sidebar menu items configuration with required permissions
const sidebarMenuItems = [
  { href: '/sudobe/api/content?section=banners-list', icon: 'bi-inbox', label: 'Banners', id: 'banners', permission: 'view_banners' },
  { href: '/sudobe/api/content?section=protections-list', icon: 'bi-shield-check', label: 'Protections', id: 'protections', permission: 'view_protections' },
  { href: '/sudobe/api/content?section=images-list', icon: 'bi-image', label: 'Images', id: 'images', permission: 'view_images' },
  { href: '/sudobe/api/content?section=products', icon: 'bi-cart', label: 'Products Import Export', id: 'products-import', permission: ['import_products', 'export_products'] },
  { href: '/sudobe/api/content?section=products-list', icon: 'bi-cart', label: 'Products', id: 'products-list', permission: 'view_products' },
  { href: '/qa', icon: 'bi-clipboard-check', label: 'QC Reports', id: 'qa', permission: 'view_qa_reports' },
  { href: '/shipping-rates', icon: 'bi-truck', label: 'Shipping Rates', id: 'shipping-rates', permission: 'view_shipping_rates' },
  { href: '/customers', icon: 'bi-people', label: 'Customers', id: 'customers', permission: 'view_customers' },
  { href: '/factories', icon: 'bi-building', label: 'Factories', id: 'factories', permission: 'view_factories' },
  { href: '/orders', icon: 'bi-receipt', label: 'Orders', id: 'orders', permission: 'view_orders' },
  { href: '/logs', icon: 'bi-clock-history', label: 'Activity Logs', id: 'logs', permission: 'view_logs' },
  { href: '/permissions', icon: 'bi-shield-lock', label: 'Permissions & Roles', id: 'permissions', permission: 'manage_roles' }
];

// Store user role and permissions
let currentUserRole = null;
let userPermissions = [];

/**
 * Get the current page identifier from the URL
 */
function getCurrentPageId() {
  const path = window.location.pathname;
  
  // Map paths to page IDs
  if (path.includes('/customers')) return 'customers';
  if (path.includes('/factories')) return 'factories';
  if (path.includes('/orders')) return 'orders';
  if (path.includes('/logs')) return 'logs';
  if (path.includes('/permissions')) return 'permissions';
  if (path.includes('/shipping-rates')) return 'shipping-rates';
  if (path.includes('/qa')) return 'qa';
  if (path.includes('/sudobe/api/content')) {
    const params = new URLSearchParams(window.location.search);
    const section = params.get('section');
    if (section === 'banners-list') return 'banners';
    if (section === 'protections-list') return 'protections';
    if (section === 'images-list') return 'images';
    if (section === 'products') return 'products-import';
    if (section === 'products-list') return 'products-list';
  }
  
  return null;
}

/**
 * Check if user has permission for a menu item
 * @param {string|string[]} permission - The permission(s) to check (can be array for OR logic)
 * @returns {boolean}
 */
function hasPermissionForMenuItem(permission) {
  if (!permission) return true; // If no permission required, show item
  
  // Handle array of permissions (OR logic - user needs at least one)
  if (Array.isArray(permission)) {
    return permission.some(perm => hasPermissionForMenuItem(perm));
  }
  
  // If we have the hasPermission function from permissions.js, use it
  if (typeof window !== 'undefined' && typeof window.hasPermission === 'function') {
    return window.hasPermission(permission, currentUserRole);
  }
  
  // Fallback: check permissions directly
  if (!currentUserRole) return false;
  
  // Super admin has all permissions
  if (currentUserRole === 'super_admin') return true;
  
  // Check if permission is in user's permissions list
  return userPermissions.includes(permission);
}

/**
 * Filter menu items based on user permissions
 * @returns {Array} Filtered menu items
 */
function getFilteredMenuItems() {
  return sidebarMenuItems.filter(item => {
    return hasPermissionForMenuItem(item.permission);
  });
}

/**
 * Load user role and permissions from API
 * @returns {Promise<void>}
 */
async function loadUserPermissions() {
  try {
    const response = await fetch('/sudobe/api/auth/me');
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.user) {
        currentUserRole = result.user.role;
        
        // Store in localStorage for permissions.js
        if (typeof window !== 'undefined' && typeof window.setUserRole === 'function') {
          window.setUserRole(currentUserRole);
        } else if (typeof localStorage !== 'undefined') {
          localStorage.setItem('userRole', currentUserRole);
        }
        
        // Get permissions for the role
        if (typeof window !== 'undefined' && typeof window.ROLE_PERMISSIONS !== 'undefined') {
          userPermissions = window.ROLE_PERMISSIONS[currentUserRole] || [];
        } else {
          // Fallback: define permissions here if permissions.js not loaded
          const ROLE_PERMISSIONS_FALLBACK = {
            'super_admin': [
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
          userPermissions = ROLE_PERMISSIONS_FALLBACK[currentUserRole] || [];
        }
      }
    }
  } catch (error) {
    console.error('Error loading user permissions:', error);
    // Try to get from localStorage as fallback
    if (typeof localStorage !== 'undefined') {
      currentUserRole = localStorage.getItem('userRole');
    }
  }
}

/**
 * Render the sidebar into the specified container
 * @param {string} containerId - The ID of the container element (default: 'sidebar-container')
 */
async function renderSidebar(containerId = 'sidebar-container') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Sidebar container with ID "${containerId}" not found`);
    return;
  }

  // Load user permissions first
  await loadUserPermissions();

  const currentPageId = getCurrentPageId();
  
  // Filter menu items based on permissions
  const filteredItems = getFilteredMenuItems();
  
  // Add Bootstrap column classes to the container itself
  container.className = 'col-md-3 col-lg-2 sidebar p-0';
  
  const sidebarContent = `
    <div class="p-3">
      <h4 class="mb-3">SODU CMS</h4>
      <div class="list-group">
        ${filteredItems.map(item => {
          const isActive = item.id === currentPageId;
          return `
            <div class="list-group-item ${isActive ? 'active' : ''}" ${item.id === 'orders' ? 'id="orders-menu-item"' : ''}>
              <a href="${item.href}">
                <i class="bi ${item.icon}"></i> ${item.label}
              </a>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  container.innerHTML = sidebarContent;
}

// Store callback functions to call after sidebar is rendered
let sidebarReadyCallbacks = [];

/**
 * Register a callback to be called after sidebar is rendered
 * @param {Function} callback - Function to call after sidebar is rendered
 */
function onSidebarReady(callback) {
  if (typeof callback === 'function') {
    sidebarReadyCallbacks.push(callback);
  }
}

/**
 * Execute all registered callbacks
 */
function executeSidebarReadyCallbacks() {
  sidebarReadyCallbacks.forEach(callback => {
    try {
      callback();
    } catch (error) {
      console.error('Error in sidebar ready callback:', error);
    }
  });
}

// Auto-render sidebar when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await renderSidebar();
    // Execute callbacks after a short delay to ensure DOM is updated
    setTimeout(executeSidebarReadyCallbacks, 0);
  });
} else {
  // DOM is already loaded
  renderSidebar().then(() => {
    // Execute callbacks after a short delay to ensure DOM is updated
    setTimeout(executeSidebarReadyCallbacks, 0);
  });
}

