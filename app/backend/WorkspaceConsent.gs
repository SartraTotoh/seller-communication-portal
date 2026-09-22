/**
 * v4.9.3R4 Workspace access policy.
 * The web app runs as the deployment owner so Portal users do not need to
 * authorize the backend's Drive/Sheets scopes individually.
 * User identity remains fail-closed through Session.getActiveUser().
 */
function portalSetupConsentGate_(){
  return null;
}
