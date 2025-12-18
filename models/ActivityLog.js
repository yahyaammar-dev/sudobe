/**
 * Activity Log Model
 * 
 * This represents the structure for activity logs stored in Swell
 * We'll use Swell's content model to store logs
 * 
 * Swell Model: content/activity-logs
 * 
 * Fields:
 * - user_id (string, required): ID of the user who performed the action
 * - user_email (string): Email of the user for easier identification
 * - action (string, required): The action performed (e.g., 'create_order', 'edit_customer')
 * - resource_type (string, required): Type of resource (e.g., 'order', 'customer', 'factory')
 * - resource_id (string): ID of the resource that was affected
 * - description (string): Human-readable description of the action
 * - metadata (object): Additional data about the action (e.g., old values, new values, IP address)
 * - ip_address (string): IP address of the user
 * - user_agent (string): User agent string
 * - date_created (date): Timestamp of when the action occurred
 */

module.exports = {
  // This is just documentation - actual model is in Swell
  // To create this model in Swell:
  // 1. Go to Swell Dashboard > Settings > Content
  // 2. Create a new content type called "activity-logs"
  // 3. Add fields:
  //    - user_id (text, required)
  //    - user_email (text)
  //    - action (text, required)
  //    - resource_type (text, required)
  //    - resource_id (text)
  //    - description (text, textarea)
  //    - metadata (object/json)
  //    - ip_address (text)
  //    - user_agent (text)
};

