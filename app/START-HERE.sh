#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="seller-communication-portal"
PROJECT_NUMBER="795035951703"
SCRIPT_TITLE="Seller Communication Portal Live Sync"
FIREBASE_VERSION="15.28.1"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PUBLIC_FILE="$ROOT_DIR/public/index.html"
CLASP_VERSION="3.3.0"
CLASP=(npx -y @google/clasp@"$CLASP_VERSION")
FIREBASE=(npx -y firebase-tools@"$FIREBASE_VERSION")
STATE_DIR="${HOME}/.seller-comms-portal"
STATE_FILE="$STATE_DIR/live-sync.env"
mkdir -p "$STATE_DIR"

say(){ printf '%s\n' "$*"; }
stop(){ say; say "STOP: $*"; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || stop "Missing required command: $1"; }
warm_tool(){
  local label="$1"; shift
  local out err pid elapsed=0 rc
  out="$(mktemp)"; err="$(mktemp)"
  say "  Preparing $label. First run may download npm packages; heartbeat every 5 seconds."
  "$@" --version >"$out" 2>"$err" & pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    sleep 5
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    elapsed=$((elapsed+5))
    say "    ... still working (${elapsed} sec)"
    if (( elapsed >= 300 )); then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      cat "$err" >&2 || true
      rm -f "$out" "$err"
      stop "$label bootstrap timed out after 300 seconds"
    fi
  done
  if wait "$pid"; then rc=0; else rc=$?; fi
  if (( rc != 0 )); then
    cat "$err" >&2 || true
    rm -f "$out" "$err"
    stop "Could not prepare $label from npm"
  fi
  say "  OK: $label ready ($(tr -d '\r\n' <"$out"))"
  rm -f "$out" "$err"
}

say
say '=================================================================='
say ' Seller Communication Portal - v4.6.9 RESOLVER-REPAIR RELEASE'
say ' functional baseline 4.6.0 | UI 4.6.8 | Portal 4.6.9 | resolver repair | project lock'
say '=================================================================='
say

say '[1/7] Local preflight...'
for cmd in node npm npx python3 grep sed awk timeout; do need "$cmd"; done
[[ -f "$PUBLIC_FILE" ]] || stop "Missing public/index.html"
[[ -f "$BACKEND_DIR/appsscript.json" ]] || stop "Missing backend/appsscript.json"
[[ -f "$ROOT_DIR/.firebaserc" ]] || stop "Missing .firebaserc"
[[ -f "$ROOT_DIR/firebase.json" ]] || stop "Missing firebase.json"
python3 - "$PUBLIC_FILE" <<'PY' || stop "Frontend contract is invalid"
import re,sys
s=open(sys.argv[1],encoding="utf-8").read()
if 'data-functional-baseline="4.6.0"' not in s:
    raise SystemExit("functional baseline marker must be v4.6.0")
m=re.search(r'data-ui-version="(4\.6\.(\d+))"',s)
if not m or int(m.group(2)) < 5:
    raise SystemExit("UI version must be on the approved v4.6.5+ patch line")
p=re.search(r'data-portal-version="(4\.6\.(\d+))"',s)
if not p or int(p.group(2)) < 9:
    raise SystemExit("Portal version must be on the v4.6.9+ release line")
print(f"  OK: functional baseline v4.6.0 / UI v{m.group(1)} / Portal v{p.group(1)}")
PY
grep -Eq '"default"[[:space:]]*:[[:space:]]*"seller-communication-portal"' "$ROOT_DIR/.firebaserc" || stop "Wrong Firebase target"
if grep -Eq '"(functions|firestore|storage)"[[:space:]]*:' "$ROOT_DIR/firebase.json"; then stop "firebase.json is not Hosting-only"; fi
if grep -R -q 'PEOPLE_SEED_V460' "$ROOT_DIR/public"; then stop "People seed marker found in public assets"; fi
[[ -f "$BACKEND_DIR/PeopleSeed.gs" ]] || stop "PeopleSeed.gs missing"
[[ -f "$ROOT_DIR/imports/seller-comms-people-import-ready-v4.6.csv" ]] || stop "People import audit CSV missing"
say "  OK: Node $(node --version) / npm $(npm --version)"
warm_tool "Firebase CLI $FIREBASE_VERSION" "${FIREBASE[@]}"
warm_tool "Google Apps Script CLI $CLASP_VERSION" "${CLASP[@]}"
say "  OK: CLI bootstrap complete."

firebase_project_json(){ timeout 90s "${FIREBASE[@]}" projects:list --json --non-interactive 2>/dev/null || return 1; }
verify_firebase_project(){
  local jf
  jf="$(mktemp)"
  if ! firebase_project_json >"$jf"; then rm -f "$jf"; return 1; fi
  python3 - "$jf" "$PROJECT_ID" "$PROJECT_NUMBER" <<'PY'
import json,sys
path,pid,pnum=sys.argv[1],sys.argv[2],sys.argv[3]
try: data=json.load(open(path,encoding='utf-8'))
except Exception: raise SystemExit(1)
rows=data.get('result',[]) if isinstance(data,dict) else data
for p in rows:
    if str(p.get('projectId',''))==pid:
        if str(p.get('projectNumber',''))!=pnum: raise SystemExit(2)
        print(f"{pid} / {pnum}")
        raise SystemExit(0)
raise SystemExit(1)
PY
  local rc=$?
  rm -f "$jf"
  return $rc
}

say '[2/7] Firebase sign-in and hard project lock (no gcloud)...'
if ! VERIFIED="$(verify_firebase_project)"; then
  say '  Firebase session is not ready. Opening the visible Firebase login flow now.'
  say '  Complete sign-in with the corporate account; this same script will resume.'
  "${FIREBASE[@]}" login --reauth || stop "Firebase login failed"
  VERIFIED="$(verify_firebase_project)" || stop "Authorized Firebase account cannot verify $PROJECT_ID / $PROJECT_NUMBER"
fi
"${FIREBASE[@]}" use "$PROJECT_ID" >/dev/null
say "  OK: $VERIFIED"

say '[3/7] Apps Script authorization...'
CLASP_LIST_FILE="$(mktemp)"; trap 'rm -f "$CLASP_LIST_FILE"' EXIT
if ! timeout 60s "${CLASP[@]}" list >"$CLASP_LIST_FILE" 2>/dev/null; then
  say '  Apps Script session is not ready. Opening the visible clasp login flow now.'
  say '  Complete the URL/code authorization; this same script will resume.'
  "${CLASP[@]}" login --no-localhost || stop "clasp login failed"
  timeout 60s "${CLASP[@]}" list >"$CLASP_LIST_FILE" 2>/dev/null || stop "clasp authorization did not become ready"
fi
say '  OK: Apps Script account authorized.'

say '[4/7] Reusing the Live Sync Apps Script project...'
CURRENT_DEPLOY_ID="$(grep -Eo 'https://script.google.com/a/macros/shopee.com/s/AKfy[A-Za-z0-9_-]+/exec' "$PUBLIC_FILE" | head -n1 | sed -E 's#^.*/s/([^/]+)/exec$#\1#' || true)"
EXISTING_SCRIPT_ID=""
if [[ -f "$BACKEND_DIR/.clasp.json" ]]; then
  EXISTING_SCRIPT_ID="$(python3 - "$BACKEND_DIR/.clasp.json" <<'PY'
import json,sys
try: print(json.load(open(sys.argv[1],encoding='utf-8-sig')).get('scriptId',''))
except Exception: print('')
PY
)"
fi
if [[ -z "$EXISTING_SCRIPT_ID" && -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE" || true
  EXISTING_SCRIPT_ID="${SCRIPT_ID:-}"
fi

script_has_deploy(){
  local sid="$1" did="$2" td out
  [[ -n "$sid" && -n "$did" ]] || return 1
  td="$(mktemp -d)"
  printf '{"scriptId":"%s"}\n' "$sid" > "$td/.clasp.json"
  pushd "$td" >/dev/null
  out="$(timeout 45s "${CLASP[@]}" deployments 2>&1 || true)"
  popd >/dev/null
  rm -rf "$td"
  [[ "$out" == *"$did"* ]]
}

extract_all_clasp_list_ids(){
  python3 - "$CLASP_LIST_FILE" <<'PY'
import re,sys
text=open(sys.argv[1],encoding='utf-8',errors='ignore').read()
seen=[]
for x in re.findall(r'(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{30,})(?![A-Za-z0-9_-])',text):
    if x.startswith('AKfy'): continue
    if x not in seen: seen.append(x)
for x in seen: print(x)
PY
}

extract_title_ids(){
  python3 - "$CLASP_LIST_FILE" "$SCRIPT_TITLE" <<'PY'
import re,sys
lines=open(sys.argv[1],encoding='utf-8',errors='ignore').read().splitlines(); title=sys.argv[2].lower(); seen=[]
for line in lines:
    if title not in line.lower(): continue
    for x in re.findall(r'[A-Za-z0-9_-]{30,}',line):
        if x.startswith('AKfy'): continue
        if x not in seen: seen.append(x)
for x in seen: print(x)
PY
}

extract_home_clasp_ids(){
  python3 - "$HOME" <<'PY'
import json,os,sys
root=sys.argv[1]; seen=[]
for base,dirs,files in os.walk(root):
    rel=os.path.relpath(base,root)
    depth=0 if rel=='.' else rel.count(os.sep)+1
    if depth>6:
        dirs[:]=[]; continue
    dirs[:]=[d for d in dirs if d not in {'.npm','.cache','.config','.local','node_modules'}]
    if '.clasp.json' not in files: continue
    path=os.path.join(base,'.clasp.json')
    try:
        sid=str(json.load(open(path,encoding='utf-8-sig')).get('scriptId','')).strip()
    except Exception:
        sid=''
    if sid and sid not in seen:
        seen.append(sid)
for sid in seen: print(sid)
PY
}

resolve_deployment_owner(){
  local did="$1" sid checked=0
  local -a candidates=() hits=() all_ids=() title_ids=() home_ids=()
  mapfile -t title_ids < <(extract_title_ids)
  mapfile -t home_ids < <(extract_home_clasp_ids)
  mapfile -t all_ids < <(extract_all_clasp_list_ids)
  [[ -n "${SELLER_COMMS_SCRIPT_ID:-}" ]] && candidates+=("$SELLER_COMMS_SCRIPT_ID")
  [[ -n "$EXISTING_SCRIPT_ID" ]] && candidates+=("$EXISTING_SCRIPT_ID")
  candidates+=("${home_ids[@]:-}" "${title_ids[@]:-}" "${all_ids[@]:-}")
  mapfile -t candidates < <(printf '%s\n' "${candidates[@]}" | awk 'NF && !seen[$0]++')
  say "  Resolver: checking ${#candidates[@]} visible/local Apps Script candidate(s) against deployment $did..." >&2
  for sid in "${candidates[@]:-}"; do
    [[ -n "$sid" ]] || continue
    checked=$((checked+1))
    if script_has_deploy "$sid" "$did"; then hits+=("$sid"); fi
    if (( checked % 10 == 0 )); then say "    ... checked $checked candidate(s)" >&2; fi
  done
  if [[ ${#hits[@]} -eq 1 ]]; then
    printf '%s\n' "${hits[0]}"
    return 0
  fi
  if [[ ${#hits[@]} -gt 1 ]]; then
    say "STOP: More than one Apps Script project claims deployment $did" >&2
    return 2
  fi
  return 1
}

SCRIPT_ID=""
if [[ -n "$CURRENT_DEPLOY_ID" ]]; then
  if SCRIPT_ID="$(resolve_deployment_owner "$CURRENT_DEPLOY_ID")"; then
    say '  OK: live deployment owner resolved without creating a new project.'
  else
    stop "Portal contains live backend $CURRENT_DEPLOY_ID, but its owning Apps Script project is not visible to this authorized account. No duplicate was created."
  fi
elif [[ -n "$EXISTING_SCRIPT_ID" ]]; then
  SCRIPT_ID="$EXISTING_SCRIPT_ID"
else
  mapfile -t TITLE_IDS < <(extract_title_ids)
  if [[ ${#TITLE_IDS[@]} -eq 1 ]]; then
    SCRIPT_ID="${TITLE_IDS[0]}"
  elif [[ ${#TITLE_IDS[@]} -gt 1 ]]; then
    stop "Multiple Apps Script projects match '$SCRIPT_TITLE' and no live deployment ID is available to disambiguate them."
  fi
fi

if [[ -z "$SCRIPT_ID" ]]; then
  if [[ -n "$CURRENT_DEPLOY_ID" ]]; then stop "Portal contains live backend $CURRENT_DEPLOY_ID, but the owning Apps Script project could not be resolved. No duplicate was created."; fi
  say '  No live backend exists yet; creating the first Apps Script project.'
  TMP_DIR="$(mktemp -d)"
  pushd "$TMP_DIR" >/dev/null
  if ! "${CLASP[@]}" create --title "$SCRIPT_TITLE" --type standalone; then
    say '  Apps Script API may be disabled. Enable it once at https://script.google.com/home/usersettings then rerun.'
    exit 3
  fi
  SCRIPT_ID="$(python3 - .clasp.json <<'PY'
import json
print(json.load(open('.clasp.json',encoding='utf-8-sig'))['scriptId'])
PY
)"
  popd >/dev/null
  rm -rf "$TMP_DIR"
fi
printf '{"scriptId":"%s"}\n' "$SCRIPT_ID" > "$BACKEND_DIR/.clasp.json"
printf 'SCRIPT_ID=%q\n' "$SCRIPT_ID" > "$STATE_FILE"
say "  OK: Script ID $SCRIPT_ID"
[[ -z "$CURRENT_DEPLOY_ID" ]] || say "  Live deployment to preserve: $CURRENT_DEPLOY_ID"

say '[5/7] Pushing backend and preserving the Web App URL...'
pushd "$BACKEND_DIR" >/dev/null
"${CLASP[@]}" push --force
DEPLOYMENTS_OUT="$(${CLASP[@]} deployments 2>&1 || true)"
DEPLOY_ID=""
if [[ -n "$CURRENT_DEPLOY_ID" ]]; then
  printf '%s\n' "$DEPLOYMENTS_OUT" | grep -q "$CURRENT_DEPLOY_ID" || stop "Deployment $CURRENT_DEPLOY_ID is not owned by Script ID $SCRIPT_ID. Refusing to replace the live URL."
  say "  Updating existing deployment: $CURRENT_DEPLOY_ID"
  "${CLASP[@]}" deploy --deploymentId "$CURRENT_DEPLOY_ID" --description "Seller Communication Portal v4.6.9 Resolver-Repair Release"
  DEPLOY_ID="$CURRENT_DEPLOY_ID"
else
  DEPLOY_OUT="$(${CLASP[@]} deploy --description "Seller Communication Portal v4.6.9 Resolver-Repair Release" 2>&1)" || { printf '%s\n' "$DEPLOY_OUT"; stop "Apps Script deployment failed"; }
  DEPLOY_ID="$(printf '%s\n' "$DEPLOY_OUT" | grep -Eo 'AKfy[A-Za-z0-9_-]+' | head -n1 || true)"
  if [[ -z "$DEPLOY_ID" ]]; then
    DEPLOY_ID="$(${CLASP[@]} deployments 2>&1 | grep -Eo 'AKfy[A-Za-z0-9_-]+' | tail -n1 || true)"
  fi
fi
popd >/dev/null
[[ -n "$DEPLOY_ID" ]] || stop "Could not determine Apps Script deployment ID"
ENDPOINT="https://script.google.com/a/macros/shopee.com/s/${DEPLOY_ID}/exec"
SETUP_URL="${ENDPOINT}?action=setup"
printf 'SCRIPT_ID=%q\nDEPLOY_ID=%q\n' "$SCRIPT_ID" "$DEPLOY_ID" > "$STATE_FILE"

say '[6/7] Updating frontend endpoint and deploying Firebase Hosting only...'
python3 - "$PUBLIC_FILE" "$ENDPOINT" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1]); endpoint=sys.argv[2]
s=p.read_text(encoding='utf-8')
s2,n=re.subn(r"const DEFAULT_ENDPOINT='[^']*';", "const DEFAULT_ENDPOINT='"+endpoint+"';", s, count=1)
if n != 1: raise SystemExit('DEFAULT_ENDPOINT marker not found exactly once')
p.write_text(s2,encoding='utf-8')
PY
pushd "$ROOT_DIR" >/dev/null
"${FIREBASE[@]}" deploy --project "$PROJECT_ID" --only hosting --non-interactive
popd >/dev/null

say '[7/7] Opening one-time Live Sync setup...'
python3 - "$SETUP_URL" <<'PY' || true
import sys,webbrowser
webbrowser.open(sys.argv[1])
PY
say
say '=================================================================='
say ' ONE-CLICK v4.6.9 RESOLVER-REPAIR RELEASE COMPLETE'
say " Backend: $ENDPOINT"
say ' Portal:  https://seller-communication-portal.web.app/?mode=ADMIN#settings'
say '=================================================================='
say 'If Google asks for Workspace authorization, approve it once.'
say 'When the setup page says LIVE SYNC READY, refresh Portal > People & Roles / Requests.'
