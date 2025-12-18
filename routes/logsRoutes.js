const express = require('express');
const router = express.Router();
const path = require('path');
require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const { requireSuperAdmin } = require('../middleware/permissions');

// Serve the logs HTML page (super admin only)
function serveLogsPage(req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'logs.html'));
}

// Get all activity logs (super admin only)
router.get('/api', requireSuperAdmin(), async (req, res) => {
  const startTime = Date.now();
  console.log('[LOGS API] ✓ Middleware passed, route handler executing');
  console.log('[LOGS API] Request received:', {
    url: req.url,
    query: req.query,
    timestamp: new Date().toISOString()
  });

  try {
    const { page = 1, limit = 50, user_id, action, resource_type, start_date, end_date } = req.query;
    console.log('[LOGS API] Parsed query params:', { page, limit, user_id, action, resource_type, start_date, end_date });
    
    const queryParams = {
      page: parseInt(page),
      limit: parseInt(limit),
      where: {
        type: 'activity-logs'
      },
      sort: 'date_created desc'
    };

    // Apply filters
    if (user_id) {
      queryParams.where['content.user_id'] = user_id;
    }

    if (action) {
      queryParams.where['content.action'] = action;
    }

    if (resource_type) {
      queryParams.where['content.resource_type'] = resource_type;
    }

    if (start_date || end_date) {
      queryParams.where['content.date_created'] = {};
      if (start_date) {
        queryParams.where['content.date_created'].$gte = start_date;
      }
      if (end_date) {
        queryParams.where['content.date_created'].$lte = end_date;
      }
    }

    console.log('[LOGS API] Calling Swell API with queryParams:', JSON.stringify(queryParams, null, 2));
    const swellCallStartTime = Date.now();
    
    // Try querying the specific endpoint first (matches how we create logs)
    let logs;
    try {
      // Try the specific endpoint first
      const endpointParams = { ...queryParams };
      delete endpointParams.where.type; // Remove type from where clause when using specific endpoint
      logs = await swell.get('/content/activity-logs', endpointParams);
      console.log('[LOGS API] Successfully fetched from /content/activity-logs endpoint');
    } catch (endpointError) {
      console.log('[LOGS API] /content/activity-logs endpoint failed, trying /content with type filter:', endpointError.message);
      // Fallback to /content with type filter
      logs = await swell.get('/content', queryParams);
      console.log('[LOGS API] Successfully fetched from /content endpoint');
    }
    
    const swellCallDuration = Date.now() - swellCallStartTime;
    console.log('[LOGS API] Swell API call completed:', {
      duration: `${swellCallDuration}ms`,
      resultsCount: logs.results?.length || 0,
      totalCount: logs.count || 0,
      page: logs.page || parseInt(page),
      pages: logs.pages || logs.page_count || 0,
      rawResponse: JSON.stringify(logs).substring(0, 200) // First 200 chars for debugging
    });
    
    // Normalize response - Swell might return different structures for different endpoints
    const results = logs.results || logs.data || [];
    const totalCount = logs.count || logs.total || 0;
    const currentPage = logs.page || parseInt(page);
    const pageCount = logs.pages || logs.page_count || Math.ceil(totalCount / parseInt(limit));
    
    console.log('[LOGS API] Normalized response:', {
      resultsCount: results.length,
      totalCount: totalCount,
      currentPage: currentPage,
      pageCount: pageCount
    });
    
    const responseData = {
      success: true,
      data: results,
      pagination: {
        page: currentPage,
        limit: parseInt(limit),
        count: totalCount,
        pages: pageCount
      }
    };
    
    console.log('[LOGS API] Preparing response, total request time:', `${Date.now() - startTime}ms`);
    res.json(responseData);
    console.log('[LOGS API] Response sent successfully');
  } catch (error) {
    const errorDuration = Date.now() - startTime;
    console.error('[LOGS API] Error fetching logs:', {
      error: error.message,
      stack: error.stack,
      duration: `${errorDuration}ms`,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logs',
      error: error.message
    });
  }
});

// Get a single log entry
router.get('/api/:id', requireSuperAdmin(), async (req, res) => {
  try {
    const { id } = req.params;
    const log = await swell.get(`/content/${id}`);
    
    if (log.type !== 'activity-logs') {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }
    
    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('Error fetching log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch log',
      error: error.message
    });
  }
});

// Get available filter options (actions, resource types)
router.get('/api/filters/options', requireSuperAdmin(), async (req, res) => {
  const startTime = Date.now();
  console.log('[FILTERS OPTIONS API] ✓ Middleware passed, route handler executing');
  console.log('[FILTERS OPTIONS API] Request received:', {
    url: req.url,
    timestamp: new Date().toISOString()
  });

  try {
    const queryParams = {
      where: { type: 'activity-logs' },
      limit: 1000
    };
    
    console.log('[FILTERS OPTIONS API] Calling Swell API with queryParams:', JSON.stringify(queryParams, null, 2));
    const swellCallStartTime = Date.now();
    
    // Get all logs to extract unique values (in production, you might want to cache this)
    // Try querying the specific endpoint first (matches how we create logs)
    let allLogs;
    try {
      // Try the specific endpoint first
      const endpointParams = { ...queryParams };
      delete endpointParams.where.type; // Remove type from where clause when using specific endpoint
      allLogs = await swell.get('/content/activity-logs', endpointParams);
      console.log('[FILTERS OPTIONS API] Successfully fetched from /content/activity-logs endpoint');
    } catch (endpointError) {
      console.log('[FILTERS OPTIONS API] /content/activity-logs endpoint failed, trying /content with type filter:', endpointError.message);
      // Fallback to /content with type filter
      allLogs = await swell.get('/content', queryParams);
      console.log('[FILTERS OPTIONS API] Successfully fetched from /content endpoint');
    }
    
    const swellCallDuration = Date.now() - swellCallStartTime;
    console.log('[FILTERS OPTIONS API] Swell API call completed:', {
      duration: `${swellCallDuration}ms`,
      resultsCount: allLogs.results?.length || 0,
      totalCount: allLogs.count || 0
    });

    console.log('[FILTERS OPTIONS API] Processing logs to extract unique values...');
    const processingStartTime = Date.now();
    
    const actions = [...new Set((allLogs.results || []).map(log => log.content?.action).filter(Boolean))];
    const resourceTypes = [...new Set((allLogs.results || []).map(log => log.content?.resource_type).filter(Boolean))];

    const processingDuration = Date.now() - processingStartTime;
    console.log('[FILTERS OPTIONS API] Processing completed:', {
      duration: `${processingDuration}ms`,
      actionsCount: actions.length,
      resourceTypesCount: resourceTypes.length
    });

    const responseData = {
      success: true,
      data: {
        actions: actions.sort(),
        resource_types: resourceTypes.sort()
      }
    };
    
    console.log('[FILTERS OPTIONS API] Preparing response, total request time:', `${Date.now() - startTime}ms`);
    res.json(responseData);
    console.log('[FILTERS OPTIONS API] Response sent successfully');
  } catch (error) {
    const errorDuration = Date.now() - startTime;
    console.error('[FILTERS OPTIONS API] Error fetching filter options:', {
      error: error.message,
      stack: error.stack,
      duration: `${errorDuration}ms`,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch filter options',
      error: error.message
    });
  }
});

// Export both the page handler and the router
module.exports = serveLogsPage;
module.exports.router = router;

