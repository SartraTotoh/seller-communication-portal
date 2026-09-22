/**
 * v4.9.3R4.2 Workspace Login Bridge session verifier.
 * The Firebase shell receives a short-lived HMAC session from a separate
 * DOMAIN + USER_ACCESSING auth-only Apps Script. The data backend remains
 * DOMAIN + USER_DEPLOYING so source Sheets/Drive permissions stay centralized.
 */
var PORTAL_HTTP_AUTH_EMAIL_ = '';
const PORTAL_AUTH_SESSION_SECRET = '__SCP_AUTH_SESSION_SECRET__';
const PORTAL_AUTH_SESSION_AUDIENCE = 'seller-communication-portal';
const PORTAL_AUTH_SESSION_MAX_MS = 8 * 60 * 60 * 1000;

function portalAuthBase64Url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}
function portalAuthTimingSafeEqual_(a,b) {
  a=String(a||'');b=String(b||'');
  if(a.length!==b.length)return false;
  var diff=0;for(var i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function portalVerifyWorkspaceSession_(token) {
  token=String(token||'').trim();
  if(!token)throw new Error('WORKSPACE_SESSION_REQUIRED');
  var parts=token.split('.');
  if(parts.length!==2||!parts[0]||!parts[1])throw new Error('WORKSPACE_SESSION_INVALID');
  var expected=portalAuthBase64Url_(Utilities.computeHmacSha256Signature(parts[0],PORTAL_AUTH_SESSION_SECRET,Utilities.Charset.UTF_8));
  if(!portalAuthTimingSafeEqual_(expected,parts[1]))throw new Error('WORKSPACE_SESSION_INVALID');
  var payload={};
  try{payload=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'));}
  catch(ignore){throw new Error('WORKSPACE_SESSION_INVALID');}
  var now=Date.now(),iat=Number(payload.iat||0),exp=Number(payload.exp||0),email=String(payload.email||'').trim().toLowerCase();
  if(String(payload.aud||'')!==PORTAL_AUTH_SESSION_AUDIENCE)throw new Error('WORKSPACE_SESSION_INVALID');
  if(!iat||!exp||exp<=now||exp-iat>PORTAL_AUTH_SESSION_MAX_MS+60000||iat>now+300000)throw new Error('WORKSPACE_SESSION_EXPIRED');
  if(!/^[^\s@]+@(shopee\.com|shopeemobile-external\.com)$/i.test(email))throw new Error('CORPORATE_WORKSPACE_ACCOUNT_REQUIRED');
  return {email:email,iat:iat,exp:exp};
}
function portalAuthorizeHttpSession_(token) {
  var ctx=portalVerifyWorkspaceSession_(token);
  PORTAL_HTTP_AUTH_EMAIL_=ctx.email;
  return ctx;
}
function portalHttpSessionEmail_(){return String(PORTAL_HTTP_AUTH_EMAIL_||'').trim().toLowerCase();}
