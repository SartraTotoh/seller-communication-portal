/**
 * Seller Comms canonical URL contract — source-only, not yet deployed.
 * Route metadata is explicit so L2-L5 Back always resolves to a parent,
 * even after direct entry, refresh or an expired browser history.
 * No auth tokens, sessions or personal data belong in URLs.
 */
const STATIC = Object.freeze({
  '/': { page:'dashboard', level:1, parent:null, title:'Dashboard' },
  '/request': { page:'requests', level:2, parent:'/', title:'Requests' },
  '/request/newrequest': { page:'newrequest', level:3, parent:'/request', title:'New Request' },
  '/request/massrequest': { page:'massrequest', level:3, parent:'/request', title:'Mass Request' },
  '/published': { page:'published', level:2, parent:'/', title:'Published Library' },
  '/published/social': { page:'published-social', level:3, parent:'/published', title:'Social Media' },
  '/published/articles': { page:'published-articles', level:3, parent:'/published', title:'Articles & Courses' },
  '/published/sc': { page:'published-sc', level:3, parent:'/published', title:'Seller Centre' },
  '/published/pn': { page:'published-pn', level:3, parent:'/published', title:'Push Notifications' }
});
const REQUEST_ID = /^[A-Za-z0-9_-]{1,110}$/;

export function canonicalPath(raw) {
  const value=String(raw || '/').split('?')[0].split('#')[0];
  if (!value.startsWith('/') || value.includes('//') || /%(?:2f|5c|00)/i.test(value)) {
    return null;
  }
  const normal=value.length>1?value.replace(/\/+$/,''):value;
  if (normal.length>300) return null;
  return normal;
}
export function resolveRoute(raw) {
  const path=canonicalPath(raw);
  if (!path) return {page:'not-found',path:'/',parent:'/',level:1,status:404};
  const known=STATIC[path];
  if (known) return {...known,path,status:200};
  // Named page levels remain explicit; not inferred from URL depth.
  let match=path.match(/^\/request\/detail\/([A-Za-z0-9_-]+)$/);
  if (match && REQUEST_ID.test(match[1])) {
    return {page:'request-detail',path,parent:'/request',level:3,status:200,requestId:match[1],title:'Request Detail'};
  }
  match=path.match(/^\/request\/detail\/([A-Za-z0-9_-]+)\/edit$/);
  if (match && REQUEST_ID.test(match[1])) {
    return {page:'request-edit',path,parent:'/request/detail/'+match[1],level:4,status:200,requestId:match[1],title:'Edit Request'};
  }
  match=path.match(/^\/request\/detail\/([A-Za-z0-9_-]+)\/review$/);
  if (match && REQUEST_ID.test(match[1])) {
    return {page:'request-review',path,parent:'/request/detail/'+match[1]+'/edit',level:5,status:200,requestId:match[1],title:'Review Request'};
  }
  return {page:'not-found',path,parent:'/',level:1,status:404,title:'Page Not Found'};
}

export function createRouteController({history,location,eventTarget,render,canLeave=()=>true}) {
  if (!history || !location || !eventTarget || typeof render!=='function') throw Error('ROUTER_DEPENDENCIES_REQUIRED');
  let current=resolveRoute(location.pathname);
  let started=false;
  const notify=()=>render({...current,showBack:current.level>=2,backHref:current.parent});
  function navigate(path,{replace=false}={}) {
    const next=resolveRoute(path);
    if (next.status===404) return false;
    if (!canLeave(current,next)) return false;
    if (next.path!==current.path) {
      history[replace?'replaceState':'pushState']({portalRoute:next.path},'',next.path);
      current=next;
    }
    notify();
    return true;
  }
  function back() {
    if (current.level<2 || !current.parent) return false;
    // Fixed parent is safe after refresh/deep link, unlike history.back().
    return navigate(current.parent);
  }
  function onPop() {
    const next=resolveRoute(location.pathname);
    if (!canLeave(current,next)) {
      history.replaceState({portalRoute:current.path},'',current.path);
      return;
    }
    current=next;
    notify();
  }
  return Object.freeze({
    start() {
      if(started)return;
      started=true;
      eventTarget.addEventListener('popstate',onPop);
      notify();
    },
    navigate,back,current:()=>({...current}),
    stop() {
      if(!started)return;
      started=false;
      eventTarget.removeEventListener('popstate',onPop);
    }
  });
}
