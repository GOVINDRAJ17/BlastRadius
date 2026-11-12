#!/usr/bin/env bash
# ==============================================================================
# BlastRadius 2.0 - Fault Tolerance & Load Balancing Failover Demo (Bash)
# ==============================================================================

TARGET_URL="${1:-http://localhost:8080/health}"
STATUS_URL="${2:-http://localhost:8080/api/infra/status}"

echo "=========================================================="
echo "  BlastRadius 2.0 - NGINX Load Balancing & Failover Test"
echo "=========================================================="

send_batch() {
  local count="$1"
  local phase="$2"
  echo ""
  echo ">>> Running $phase ($count requests to $TARGET_URL)..."

  local tally_api1=0
  local tally_api2=0
  local tally_api3=0
  local tally_other=0
  local errors=0

  for i in $(seq 1 "$count"); do
    resp=$(curl -s -m 3 "$TARGET_URL") || { ((errors++)); continue; }
    instance=$(echo "$resp" | grep -o '"instance_id":"[^"]*' | cut -d'"' -f4)
    case "$instance" in
      api-1) ((tally_api1++)) ;;
      api-2) ((tally_api2++)) ;;
      api-3) ((tally_api3++)) ;;
      *) ((tally_other++)) ;;
    esac
  done

  echo "--- Results for $phase ---"
  echo "  * Replica api-1 : $tally_api1"
  echo "  * Replica api-2 : $tally_api2"
  echo "  * Replica api-3 : $tally_api3"
  if [ "$tally_other" -gt 0 ]; then
    echo "  * Unknown : $tally_other"
  fi
  echo "  * Failed/5xx   : $errors errors"
}

# 1. Baseline
send_batch 30 "Phase 1: All 3 Replicas Online"

# 2. Stop api-2
echo ""
echo ">>> Stopping api-2 (simulating sudden container failure)..."
docker compose stop api-2
sleep 2

# 3. Failover
send_batch 30 "Phase 2: api-2 Offline (Failover Verification)"

# 4. Check status
echo ""
echo ">>> Checking $STATUS_URL..."
curl -s "$STATUS_URL" || true
echo ""

# 5. Restart api-2
echo ""
echo ">>> Restarting api-2 (simulating container recovery)..."
docker compose start api-2
sleep 6

send_batch 30 "Phase 3: api-2 Recovered (Full Cluster Restored)"

echo ""
echo "=========================================================="
echo "  Failover and Recovery Verification Complete!"
echo "=========================================================="

