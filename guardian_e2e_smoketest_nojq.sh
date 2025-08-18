#!/usr/bin/env bash
# guardian_e2e_smoketest_nojq.sh (seed-aware, fixed)
# Uses seeded staff:
#   Admin:    alex.admin@example.test / Admin#1234
#   Nurse:    olivia.nurse@example.test / Nurse#1234
#   Caretaker cora.caretaker@example.test / Caretaker#1234
# Creates one new patient user each run and exercises all flows.

set -euo pipefail
set -o errtrace
trap 'echo "💥 Error on line $LINENO: $BASH_COMMAND" >&2' ERR

# ---------- Config ----------
BASE_URL="${BASE_URL:-http://localhost:3000}"
API="${BASE_URL%/}/api/v1"

require_env() { local n="$1"; [[ -n "${!n:-}" ]] || { echo "ERROR: $n is required"; exit 1; }; }
require_bin() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 is required"; exit 1; }; }

require_bin curl
require_env ADMIN_EMAIL      # e.g. alex.admin@example.test
require_env ADMIN_PASSWORD   # e.g. Admin#1234

# Seeded staff (from seedData.js)
SEED_NURSE_EMAIL="${SEED_NURSE_EMAIL:-olivia.nurse@example.test}"
SEED_NURSE_PASS="${SEED_NURSE_PASS:-Nurse#1234}"
SEED_CARE_EMAIL="${SEED_CARE_EMAIL:-cora.caretaker@example.test}"
SEED_CARE_PASS="${SEED_CARE_PASS:-Caretaker#1234}"

# Fresh patient user for /patients/me
TS="$(date +%s)"; RND="$(printf '%04d' $((RANDOM%10000)))"
PAT_EMAIL="patient_${TS}_${RND}@example.com"; PAT_PASS="Patient#${RND}Aa"

TMP_DIR="$(mktemp -d)"; trap 'rm -rf "$TMP_DIR"' EXIT

# ---------- Helpers ----------
AUTH_OPTS=()
set_auth()   { AUTH_OPTS=(-H "Authorization: Bearer $1"); }
clear_auth() { AUTH_OPTS=(); }
urlenc()     { printf %s "$1" | sed -E 's/@/%40/g'; }

# Curl wrapper (retries + timeout). Writes body to $1, echoes http_code.
_curl_capture() {
  local outfile="$1"; shift
  : > "$outfile"
  set +e
  local http_code
  http_code=$(curl --retry 2 --retry-delay 1 --max-time 20 \
    -sS -o "$outfile" -w "%{http_code}" "$@")
  local rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then echo "CURL_ERR:$rc"; else echo "$http_code"; fi
}

# req METHOD PATH [JSON] [EXPECTED_STATUSES] [OUTFILE]
req() {
  local method="$1"
  local path="$2"
  shift 2

  # Safe defaults so set -u never trips:
  local data=""
  local expects="200"
  local out=""

  # Positional optional args without brittle shifts
  if (( $# >= 1 )); then data="$1"; fi
  if (( $# >= 2 )); then expects="$2"; fi
  if (( $# >= 3 )); then out="$3"; fi

  IFS=',' read -r -a expect_arr <<< "$expects"

  local url="${API}${path}"
  local RES_FILE="$TMP_DIR/res.json"
  local code

  if [[ -n "$data" ]]; then
    code=$(_curl_capture "$RES_FILE" -X "$method" "$url" -H "Content-Type: application/json" "${AUTH_OPTS[@]}" --data "$data")
  else
    code=$(_curl_capture "$RES_FILE" -X "$method" "$url" "${AUTH_OPTS[@]}")
  fi

  if [[ "$code" == CURL_ERR:* ]]; then
    echo "FAILED: $method $path — curl error ${code#CURL_ERR:}"
    echo "URL: $url"
    exit 1
  fi

  echo "HTTP $code — $method $path"

  local ok="no"
  for e in "${expect_arr[@]}"; do
    [[ "$code" == "$e" ]] && ok="yes" && break
  done
  if [[ "$ok" != "yes" ]]; then
    echo "FAILED: $method $path (expected one of: ${expects} got $code)"
    echo "URL: $url"
    echo "Response:"; cat "$RES_FILE"
    exit 1
  fi

  # Guard for nounset even if out is empty
  if [[ -n "${out:-}" ]]; then
    cp "$RES_FILE" "$out"
  fi
}


req_quiet() { req "$@" >/dev/null; }

extract_token() { grep -oE '("token"|"accessToken"|"jwt")\s*:\s*"[^"]+"' "$1" | head -n1 | sed -E 's/.*:\s*"([^"]+)".*/\1/'; }
extract_id()    { local id; id="$(grep -oE '"_id"\s*:\s*"[^"]+"' "$1" | head -n1 | sed -E 's/.*:\s*"([^"]+)".*/\1/')"; [[ -z "$id" ]] && id="$(grep -oE '"id"\s*:\s*"[^"]+"' "$1" | head -n1 | sed -E 's/.*:\s*"([^"]+)".*/\1/')"; echo -n "$id"; }
first_user_id_from_list() { grep -oE '"_id"\s*:\s*"[^"]+"' "$1" | head -n1 | sed -E 's/.*:\s*"([^"]+)".*/\1/'; }

get_token() {
  local e="$1"; local p="$2"; local O="$TMP_DIR/login.json"
  clear_auth
  req_quiet POST "/users/login" "{\"email\":\"$e\",\"password\":\"$p\"}" 200 "$O"
  extract_token "$O"
}

# FIXED: use local param + silent req
find_user_id() {
  local email="$1"
  local safe="$(printf %s "$email" | tr -cd '[:alnum:]')"
  local out="$TMP_DIR/find_${safe}.json"
  req_quiet GET "/admin/users?query=$(urlenc "$email")" "" 200 "$out"
  first_user_id_from_list "$out"
}

# ---------- Flow ----------
echo "== Admin login =="
ADMIN_TOKEN="$(get_token "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}")"
set_auth "$ADMIN_TOKEN"

# Admin ID (sanity)
req GET "/admin/users?query=$(urlenc "$ADMIN_EMAIL")" "" 200 "$TMP_DIR/admin_user.json"
ADMIN_ID="$(first_user_id_from_list "$TMP_DIR/admin_user.json")"
echo "ADMIN_ID: $ADMIN_ID"

# Use seeded staff (must exist in DB)
echo "== Use seeded Nurse & Caretaker =="
NURSE_ID="$(find_user_id "$SEED_NURSE_EMAIL")"
CARE_ID="$(find_user_id "$SEED_CARE_EMAIL")"
if [[ -z "$NURSE_ID" || -z "$CARE_ID" ]]; then
  echo "Seeded staff not found. Seed your DB first (olivia.nurse / cora.caretaker)."; exit 1
fi
echo "NURSE_ID: $NURSE_ID"
echo "CARETAKER_ID: $CARE_ID"

# Approvals & Roles (idempotent)
echo "== Admin approves & sets roles (idempotent) =="
req PUT "/admin/users/${NURSE_ID}/approve" "" "200,204,409"
req PUT "/admin/users/${CARE_ID}/approve"  "" "200,204,409"
req PUT "/admin/users/${NURSE_ID}/role" "{\"newRole\":\"nurse\"}" "200,204,409"
req PUT "/admin/users/${CARE_ID}/role"  "{\"newRole\":\"caretaker\"}" "200,204,409"

# Create a fresh patient user (only new account)
echo "== Register & approve Patient User =="
clear_auth
req POST "/users/register" "{\"fullName\":\"Patient $TS\",\"email\":\"$PAT_EMAIL\",\"password\":\"$PAT_PASS\",\"confirmPassword\":\"$PAT_PASS\"}" "200,201" "$TMP_DIR/patient_user_reg.json"
set_auth "$ADMIN_TOKEN"
req GET "/admin/users?query=$(urlenc "$PAT_EMAIL")" "" 200 "$TMP_DIR/pat_lookup.json"
PAT_USER_ID="$(first_user_id_from_list "$TMP_DIR/pat_lookup.json")"
echo "PAT_USER_ID: $PAT_USER_ID"
req PUT "/admin/users/${PAT_USER_ID}/approve" "" "200,204,409"
req PUT "/admin/users/${PAT_USER_ID}/role" "{\"newRole\":\"patient\"}" "200,204,409"

# Nurse login (seeded nurse)
echo "== Nurse login =="
NURSE_TOKEN="$(get_token "$SEED_NURSE_EMAIL" "$SEED_NURSE_PASS")"
set_auth "$NURSE_TOKEN"

echo "== Nurse: PATCH /users/profile =="
req PATCH "/users/profile" "{\"fullName\":\"Olivia Nurse ${TS}\"}" 200

# Credentials lifecycle (nurse)
echo "== Nurse: Credentials CRUD =="
req POST "/credentials" "{\"type\":\"AHPRA\",\"identifier\":\"AHPRA-${TS}\",\"issuer\":\"AHPRA\",\"notes\":\"seed-aware test\"}" 201 "$TMP_DIR/cred_create.json"
CRED_ID="$(extract_id "$TMP_DIR/cred_create.json")"
req GET "/credentials/me" "" 200 "$TMP_DIR/cred_me.json"
req PATCH "/credentials/${CRED_ID}" "{\"notes\":\"updated note\"}" 200

# Admin verify/unverify
set_auth "$ADMIN_TOKEN"
req GET "/credentials/admin?userId=${NURSE_ID}" "" 200 "$TMP_DIR/cred_admin_list.json"
req POST "/credentials/admin/${CRED_ID}/verify" "" "200,204"
req POST "/credentials/admin/${CRED_ID}/unverify" "" "200,204"

# Nurse delete credential
set_auth "$NURSE_TOKEN"
req DELETE "/credentials/${CRED_ID}" "" "200,204"

# Patient record lifecycle (nurse)
echo "== Nurse: Patients & Logs =="
DOB="2000-01-15"
req POST "/patients" "{\"fullName\":\"PatientCase ${TS}\",\"dateOfBirth\":\"$DOB\",\"user\":\"$PAT_USER_ID\",\"emergencyContact\":\"EC Person\",\"medicalSummary\":\"summary\",\"description\":\"desc\"}" 201 "$TMP_DIR/patient_create.json"
PATIENT_ID="$(extract_id "$TMP_DIR/patient_create.json")"
req GET "/patients/assigned" "" 200 "$TMP_DIR/patients_assigned.json"

NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
req POST "/patients/${PATIENT_ID}/logs" "{\"title\":\"Round ${TS}\",\"description\":\"Vitals ok\",\"timestamp\":\"$NOW_ISO\"}" 201 "$TMP_DIR/log_create.json"
LOG_ID="$(extract_id "$TMP_DIR/log_create.json")"
req GET "/patients/${PATIENT_ID}/logs" "" 200 "$TMP_DIR/logs_list.json"
req DELETE "/patients/${PATIENT_ID}/logs/${LOG_ID}" "" "200,204"

# Admin assigns nurse+caretaker & roster
set_auth "$ADMIN_TOKEN"
req PUT "/admin/patients/${PATIENT_ID}/assign?nurseId=${NURSE_ID}&caretakerId=${CARE_ID}" "" "200,204,409"
req GET "/admin/patients/roster?limit=10" "" 200 "$TMP_DIR/roster.json"

# Patient self endpoints + wifi-csi
echo "== Patient self endpoints =="
PAT_TOKEN="$(get_token "$PAT_EMAIL" "$PAT_PASS")"; set_auth "$PAT_TOKEN"
req GET "/patients/me" "" 200 "$TMP_DIR/patient_me.json"
req GET "/patients/me/logs?limit=10" "" "200,403" "$TMP_DIR/patient_me_logs.json"
CSI_NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
req POST "/wifi-csi" "{\"timestamp\":\"$CSI_NOW\",\"csi_data\":{\"sample\":[1,2,3],\"device\":\"dev-1\"}}" 201
req GET "/wifi-csi?limit=5" "" 200 "$TMP_DIR/csi_list_1.json"

# Reset password flows
echo "== Password reset flows =="
clear_auth
req POST "/users/reset-password-request" "{\"email\":\"$PAT_EMAIL\"}" "200,400"
set_auth "$ADMIN_TOKEN"
req POST "/admin/users/${PAT_USER_ID}/reset-password" "" "200,204"

# Tickets + metrics
echo "== Admin: Tickets & Metrics =="
# Create a ticket
req POST "/admin/tickets" "{\"subject\":\"Support ${TS}\",\"description\":\"E2E ticket created\"}" 201 "$TMP_DIR/ticket.json"
TICKET_ID="$(extract_id "$TMP_DIR/ticket.json")"

# Fetch tickets so we can read a valid enum value for status
req GET "/admin/tickets" "" 200 "$TMP_DIR/tickets.json"

# Parse the current status from the list (first match); fallback to OPEN if parse fails
CURRENT_STATUS="$(grep -oE '\"status\"\s*:\s*\"[^\"]+\"' "$TMP_DIR/tickets.json" | head -n1 | sed -E 's/.*:\s*\"([^\"]+)\".*/\1/')"
CURRENT_STATUS="${CURRENT_STATUS:-OPEN}"

# Update the ticket using the *existing valid* status value, and just change description
req PUT "/admin/tickets/${TICKET_ID}" "{\"status\":\"$CURRENT_STATUS\",\"description\":\"E2E updated $(date +%s)\"}" "200,204"

# Metrics
req GET "/admin/metrics" "" 200 "$TMP_DIR/metrics.json"


# Cleanup: only delete the freshly created patient user (do NOT delete seeded staff)
echo "== Cleanup (delete created patient user) =="
req DELETE "/admin/users/${PAT_USER_ID}" "" "200,204"

echo "✅ E2E smoketest (seed-aware, jq-free) PASSED"
