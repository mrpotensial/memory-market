#!/bin/bash
# ============================================================================
# Memory Markets - Demo Scenario Runner
# ============================================================================
# Usage:
#   bash scripts/demo-scenarios.sh [scenario]
#
# Scenarios:
#   all          - Run all scenarios sequentially
#   setup        - Verify environment & run tests
#   export       - Export knowledge from ./src
#   import       - Import & query knowledge
#   marketplace  - Sell, list, search, buy flow
#   blockchain   - Wallet, balance, faucet
#   agent        - Autonomous agent demo
#   api          - Start API server
#   clean        - Clean all demo data
#   quick        - Quick demo (export + marketplace + query)
#
# Examples:
#   bash scripts/demo-scenarios.sh setup
#   bash scripts/demo-scenarios.sh quick
#   bash scripts/demo-scenarios.sh all
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

SCENARIO="${1:-help}"

banner() {
  echo ""
  echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}${BOLD}  $1${NC}"
  echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════${NC}"
  echo ""
}

step() {
  echo -e "\n${YELLOW}${BOLD}── $1 ──${NC}\n"
}

info() {
  echo -e "  ${DIM}$1${NC}"
}

run_cmd() {
  echo -e "  ${CYAN}\$ $1${NC}"
  eval "$1"
  echo ""
}

# ============================================================================
# Scenarios
# ============================================================================

scenario_setup() {
  banner "Scenario: Setup & Verification"

  step "1. Check Node.js version"
  run_cmd "node --version"

  step "2. Verify environment"
  run_cmd "npx tsx scripts/verify-env.ts"

  step "3. Run unit tests"
  run_cmd "npm test"

  step "4. TypeScript check"
  run_cmd "npm run lint"

  echo -e "${GREEN}${BOLD}  Setup verified!${NC}\n"
}

scenario_export() {
  banner "Scenario: Context Engine - Export Knowledge"

  step "1. Export source code to .mmctx package"
  info "This will scan files, extract entities (AI), generate embeddings, and save as .mmctx"
  run_cmd "npm run mm -- export ./src --name mm-knowledge --tags typescript,ai,blockchain,demo"

  echo -e "${GREEN}${BOLD}  Export complete! Check ./mm-knowledge.mmctx/${NC}\n"
}

scenario_import() {
  banner "Scenario: Context Engine - Import & Query"

  if [ ! -d "mm-knowledge.mmctx" ]; then
    echo -e "${RED}  No mm-knowledge.mmctx found. Run 'export' scenario first.${NC}"
    exit 1
  fi

  step "1. Import knowledge package"
  run_cmd "npm run mm -- import ./mm-knowledge.mmctx"

  step "2. Query: Architecture"
  run_cmd "npm run mm -- query \"How does the AI provider abstraction work?\""

  step "3. Query: Blockchain"
  run_cmd "npm run mm -- query \"How does the Nad.fun token creation work?\""

  step "4. Query: Marketplace"
  run_cmd "npm run mm -- query \"Explain the marketplace search functionality\""

  step "5. Query: Agent"
  run_cmd "npm run mm -- query \"How does the autonomous agent make decisions?\""

  echo -e "${GREEN}${BOLD}  Import & Query complete!${NC}\n"
}

scenario_marketplace() {
  banner "Scenario: Marketplace Flow"

  if [ ! -d "mm-knowledge.mmctx" ]; then
    echo -e "${RED}  No mm-knowledge.mmctx found. Run 'export' scenario first.${NC}"
    exit 1
  fi

  step "1. Sell knowledge on marketplace"
  run_cmd "npm run mm -- sell ./mm-knowledge.mmctx --price 0.5 --no-token"

  step "2. List marketplace"
  run_cmd "npm run mm -- list"

  step "3. Search: 'blockchain'"
  run_cmd "npm run mm -- search \"blockchain\""

  step "4. Search: 'AI agent'"
  run_cmd "npm run mm -- search \"AI agent\""

  # Get the package ID from metadata
  if [ -f "mm-knowledge.mmctx/metadata.json" ]; then
    PKG_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('mm-knowledge.mmctx/metadata.json','utf-8')).id)")

    step "5. Preview package"
    run_cmd "npm run mm -- preview \"$PKG_ID\" \"What is this project about?\""

    step "6. Buy package"
    run_cmd "npm run mm -- buy \"$PKG_ID\""

    step "7. Query purchased knowledge"
    run_cmd "npm run mm -- query \"What design patterns are used in this codebase?\""
  fi

  echo -e "${GREEN}${BOLD}  Marketplace flow complete!${NC}\n"
}

scenario_blockchain() {
  banner "Scenario: Blockchain Integration"

  step "1. Check wallet balance"
  run_cmd "npm run mm -- wallet balance"

  step "2. Request faucet (if needed)"
  info "This requests testnet MON from the Monad faucet"
  run_cmd "npm run mm -- wallet faucet" || true

  step "3. Check balance after faucet"
  run_cmd "npm run mm -- wallet balance"

  echo -e "${GREEN}${BOLD}  Blockchain demo complete!${NC}\n"
  echo -e "${DIM}  For token launch, run: npm run mm -- launch-token --name CodeKnowledge --symbol CKNOW${NC}"
  echo -e "${DIM}  (Requires ~10 MON)${NC}\n"
}

scenario_agent() {
  banner "Scenario: Autonomous Agent"

  step "1. Verify marketplace has packages"
  run_cmd "npm run mm -- list"

  step "2. Run autonomous agent"
  info "Agent will search marketplace, buy knowledge, and answer autonomously"
  run_cmd "npm run mm -- agent-run \"Explain the architecture and design patterns of Memory Markets\" --max-steps 8 --budget 2"

  echo -e "${GREEN}${BOLD}  Autonomous agent demo complete!${NC}\n"
}

scenario_api() {
  banner "Scenario: API Server"

  echo -e "  Starting API server on port 3001...\n"
  echo -e "  ${DIM}Test endpoints in another terminal:${NC}"
  echo -e "  ${CYAN}curl http://localhost:3001/packages${NC}"
  echo -e "  ${CYAN}curl -X POST http://localhost:3001/packages/search -H 'Content-Type: application/json' -d '{\"query\":\"blockchain\"}'${NC}"
  echo -e "  ${CYAN}curl -X POST http://localhost:3001/agent/task -H 'Content-Type: application/json' -d '{\"task\":\"What is Memory Markets?\"}'${NC}\n"

  run_cmd "npm run mm -- api --port 3001"
}

scenario_clean() {
  banner "Scenario: Clean Demo Data"

  step "1. Remove .mmctx packages"
  rm -rf *.mmctx
  echo "  Removed *.mmctx"

  step "2. Remove marketplace database"
  rm -f ~/.memory-markets/registry.db
  echo "  Removed registry.db"

  step "3. Remove search index"
  rm -f ~/.memory-markets/search-index.json
  echo "  Removed search-index.json"

  step "4. Remove active package"
  rm -f ~/.memory-markets/active-package.json
  echo "  Removed active-package.json"

  echo -e "\n${GREEN}${BOLD}  Clean complete! Ready for fresh demo.${NC}\n"
}

scenario_quick() {
  banner "Quick Demo (Export + Marketplace + Query)"

  info "This runs a condensed demo: export, sell, search, buy, query"
  echo ""

  # Export
  step "1. Export knowledge"
  npm run mm -- export ./src --name mm-knowledge --tags demo 2>&1

  # Sell
  step "2. Sell on marketplace"
  npm run mm -- sell ./mm-knowledge.mmctx --price 0.5 --no-token 2>&1

  # List
  step "3. Browse marketplace"
  npm run mm -- list 2>&1

  # Search
  step "4. Search marketplace"
  npm run mm -- search "blockchain" 2>&1

  # Import & Query
  step "5. Import & query"
  npm run mm -- import ./mm-knowledge.mmctx 2>&1
  npm run mm -- query "How does the AI provider abstraction work?" 2>&1

  echo -e "\n${GREEN}${BOLD}  Quick demo complete!${NC}\n"
}

scenario_all() {
  banner "Full Demo - All Scenarios"

  scenario_clean
  scenario_setup
  scenario_export
  scenario_import
  scenario_marketplace
  scenario_blockchain
  scenario_agent

  banner "All Demos Complete!"
}

scenario_help() {
  banner "Memory Markets - Demo Scenarios"

  echo "  Usage: bash scripts/demo-scenarios.sh [scenario]"
  echo ""
  echo "  Available scenarios:"
  echo ""
  echo -e "    ${CYAN}setup${NC}        - Verify environment & run tests"
  echo -e "    ${CYAN}export${NC}       - Export knowledge from ./src"
  echo -e "    ${CYAN}import${NC}       - Import & query knowledge (RAG)"
  echo -e "    ${CYAN}marketplace${NC}  - Sell, list, search, buy flow"
  echo -e "    ${CYAN}blockchain${NC}   - Wallet, balance, faucet"
  echo -e "    ${CYAN}agent${NC}        - Autonomous agent demo"
  echo -e "    ${CYAN}api${NC}          - Start REST API server"
  echo -e "    ${CYAN}clean${NC}        - Clean all demo data"
  echo -e "    ${CYAN}quick${NC}        - Quick demo (export + sell + query)"
  echo -e "    ${CYAN}all${NC}          - Run everything sequentially"
  echo ""
  echo "  Recommended order for presentation:"
  echo -e "    1. ${YELLOW}clean${NC}  → start fresh"
  echo -e "    2. ${YELLOW}export${NC} → show context engine"
  echo -e "    3. ${YELLOW}import${NC} → show RAG queries"
  echo -e "    4. ${YELLOW}marketplace${NC} → show token economy"
  echo -e "    5. ${YELLOW}agent${NC}  → wow factor"
  echo ""
  echo "  Or automated:"
  echo -e "    ${CYAN}npx tsx scripts/demo-full.ts${NC}  (TypeScript full demo)"
  echo -e "    ${CYAN}bash scripts/demo-scenarios.sh quick${NC}  (condensed demo)"
  echo ""
}

# ============================================================================
# Main
# ============================================================================

case "$SCENARIO" in
  setup)       scenario_setup ;;
  export)      scenario_export ;;
  import)      scenario_import ;;
  marketplace) scenario_marketplace ;;
  blockchain)  scenario_blockchain ;;
  agent)       scenario_agent ;;
  api)         scenario_api ;;
  clean)       scenario_clean ;;
  quick)       scenario_quick ;;
  all)         scenario_all ;;
  help|--help|-h|"") scenario_help ;;
  *)
    echo -e "${RED}Unknown scenario: $SCENARIO${NC}"
    scenario_help
    exit 1
    ;;
esac
