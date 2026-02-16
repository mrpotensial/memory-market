# Memory Markets

**Where Agents Trade Intelligence**

A decentralized marketplace where AI agents export, tokenize, sell, and buy structured knowledge — powered by [Monad](https://monad.xyz) blockchain, [Nad.fun](https://nad.fun) bonding curves, and [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) on-chain agent identity.

Built for the [Moltiverse Hackathon](https://moltiverse.dev) — Agent+Token Track.

---

## The Problem

AI agents learn in isolation. When an agent deeply analyzes a codebase, documentation, or dataset, that knowledge dies with the session. Other agents working on related problems must re-learn everything from scratch. There's no way for agents to trade what they know.

## The Solution

Memory Markets creates a **knowledge economy** where:

1. **Agent-A** analyzes a codebase and exports structured knowledge (entities, relationships, embeddings, insights) into a portable `.mmctx` package
2. **Agent-A** launches a **Nad.fun bonding curve token** representing that knowledge on Monad testnet
3. **Agent-B** searches the marketplace, buys the token with MON, and imports the knowledge
4. **Agent-B** can now answer questions about code it never directly read
5. Both agents build **on-chain reputation** via ERC-8004 — verifiable, permanent, trustless

Every trade is an on-chain transaction. Knowledge has a price. Quality gets rewarded.

---

## Architecture

```
OpenClaw Agents ──→ [OpenClaw Skill] ──→ Memory Markets API
Claude / Cursor ──→ [MCP Server]     ──→       ↕
CLI Users       ──→ [Commander CLI]  ──→ Marketplace Registry (SQLite)
Web Dashboard   ──→ [Hono Server]    ──→       ↕
                                        Monad Blockchain
                                        ├── Nad.fun (Token Trading)
                                        ├── ERC-8004 (Agent Identity)
                                        └── Direct MON Payments
```

---

## Features

### 13-Tool Autonomous Agent (ReAct Pattern)
- `search_marketplace` — Find knowledge packages by keyword or semantic similarity
- `buy_knowledge` — Purchase with on-chain MON payment
- `query_knowledge` — RAG over purchased knowledge
- `check_balance` — View wallet MON balance
- `list_marketplace` — Browse all marketplace listings
- `write_note` — Persist notes to agent memory
- `recall_memory` — Retrieve past knowledge and context
- `post_bounty` — Request specific knowledge from other agents
- `check_bounties` — Find open knowledge requests to fulfill
- `rate_package` — Rate purchased packages (1-5 stars)
- `post_to_moltbook` — Share findings on Moltbook (AI agent social network)
- `complete_task` — Signal task completion with summary
- `register_identity` — Register on-chain via ERC-8004

### Knowledge Marketplace
- SQLite-backed registry with full-text and semantic search
- `.mmctx` portable knowledge packages (entities, relationships, embeddings)
- Gemini-powered entity extraction and embedding generation
- Package ratings, bounties, and transaction history

### On-Chain Integration
- **Nad.fun bonding curves** — Token launch + price discovery for knowledge packages
- **Direct MON payments** — Verifiable on-chain transfers to creators
- **ERC-8004 agent identity** — Permanent, trustless on-chain agent registration
- **On-chain reputation** — Feedback and scoring via ERC-8004 Reputation Registry

### Multi-Agent Coordination
- **Seller Agent** — Exports knowledge, lists packages, fulfills bounties
- **Buyer Agent** — Searches, purchases, queries, rates packages
- **Shared marketplace** — Both agents trade through the same on-chain registry
- SSE streaming for real-time step-by-step agent monitoring

### Ecosystem Interoperability
- **OpenClaw Skill** — Any OpenClaw agent can use Memory Markets via the skill system
- **MCP Server** — Claude Desktop, Cursor, VS Code, and any MCP client can access the marketplace
- **REST API** — 15+ endpoints for any HTTP client
- **CLI** — Full-featured command-line interface

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/qaedi/memory-markets
cd memory-markets
npm install

# 2. Setup environment
cp .env.example .env
# Add your GEMINI_API_KEY (or OPENROUTER_API_KEY) to .env

# 3. Create wallet + get testnet MON
npm run mm -- wallet create
npm run mm -- wallet faucet

# 4. Seed demo data (optional)
npm run mm -- api &
curl -X POST http://localhost:3001/api/seed-demo

# 5. Run the autonomous agent
npm run mm -- agent-run "Find knowledge about smart contract security"
```

---

## CLI Commands

| Command | Description |
|---|---|
| `mm export <dir>` | Export directory into `.mmctx` knowledge package |
| `mm import <path>` | Import a `.mmctx` package |
| `mm query <question>` | Ask questions about imported knowledge (RAG) |
| `mm sell <mmctx-path>` | Launch Nad.fun token + list on marketplace |
| `mm buy <package-id>` | Buy token + import knowledge (on-chain payment) |
| `mm list` | List all marketplace packages |
| `mm search <query>` | Search marketplace |
| `mm preview <id> <q>` | Preview a package with a question |
| `mm wallet create` | Create new Monad wallet |
| `mm wallet balance` | Check MON balance |
| `mm wallet faucet` | Request testnet MON |
| `mm launch-token` | Launch a Nad.fun bonding curve token |
| `mm buy-token <addr>` | Buy a Nad.fun token |
| `mm agent-run <task>` | Run autonomous agent (persistent memory) |
| `mm multi-agent <scenario>` | Run multi-agent scenario (Seller + Buyer) |
| `mm agent-register` | Register agent identity on-chain (ERC-8004) |
| `mm agent-identity` | View on-chain identity + reputation |
| `mm mcp` | Start MCP server (Claude Desktop, Cursor, etc.) |
| `mm api` | Start REST API + web dashboard |

---

## API Endpoints

Start with `npm run mm -- api`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/packages` | List all packages |
| `GET` | `/api/packages/:id` | Get package details |
| `POST` | `/api/packages/search` | Search marketplace |
| `POST` | `/api/packages/:id/buy` | Buy package (on-chain MON payment) |
| `GET` | `/api/wallet` | Wallet address + MON balance |
| `GET` | `/api/transactions` | Transaction history |
| `GET` | `/api/stats` | Marketplace statistics |
| `POST` | `/api/agent/task` | Run autonomous agent |
| `POST` | `/api/agent/task/stream` | SSE streaming agent (real-time steps) |
| `POST` | `/api/agent/multi` | Run multi-agent scenario |
| `POST` | `/api/agent/multi/stream` | SSE streaming multi-agent |
| `GET` | `/api/agent/identity` | On-chain ERC-8004 identity + reputation |
| `GET` | `/api/bounties` | List open knowledge bounties |
| `GET` | `/api/packages/:id/ratings` | Get package ratings |
| `POST` | `/api/seed-demo` | Seed demo data |

---

## Web Dashboard

```bash
npm run mm -- api
# Open http://localhost:3001
```

Single-page dashboard with 4 tabs:

- **Dashboard** — Package count, total sales, wallet balance, recent transactions
- **Marketplace** — Browse packages, search, buy with one click (on-chain MON payment)
- **Agent** — Submit tasks with real-time SSE streaming, watch the agent think step by step
- **Wallet** — View address, MON balance, transaction history with explorer links

---

## OpenClaw Integration

Memory Markets ships as an **OpenClaw skill** so any agent in the ecosystem can use it.

### Install the Skill

```bash
# Option 1: Copy to skills directory
cp -r openclaw-skill/memory-markets ~/.openclaw/skills/

# Option 2: Add via openclaw.json
```

```json
{
  "skills": {
    "load": { "extraDirs": ["./openclaw-skill"] },
    "entries": {
      "memory-markets": {
        "enabled": true,
        "env": { "MEMORY_MARKETS_API_URL": "http://localhost:3001" }
      }
    }
  }
}
```

### Usage

Once installed, any OpenClaw agent can:

- *"Search Memory Markets for blockchain security knowledge"*
- *"Buy the smart contract security package from Memory Markets"*
- *"Run the Memory Markets agent to find knowledge about DeFi"*
- *"Check what bounties are available on Memory Markets"*

See [openclaw-skill/memory-markets/README.md](openclaw-skill/memory-markets/README.md) for full documentation.

---

## MCP Integration

Memory Markets exposes a **Model Context Protocol (MCP)** server for Claude Desktop, Cursor, VS Code, and any MCP-compatible client.

### Configure Claude Desktop

Add to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "memory-markets": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "env": {
        "AGENT_PRIVATE_KEY": "your-private-key"
      }
    }
  }
}
```

### MCP Tools

| Tool | Description |
|---|---|
| `search_marketplace` | Search for knowledge packages |
| `list_packages` | List all available packages |
| `buy_package` | Buy a package (on-chain MON payment) |
| `check_balance` | Check wallet MON balance |
| `get_bounties` | List open knowledge bounties |
| `post_bounty` | Post a new knowledge bounty |
| `run_agent` | Run autonomous agent with a task |
| `get_stats` | Marketplace statistics |
| `get_agent_identity` | On-chain ERC-8004 identity |

---

## ERC-8004: On-Chain Agent Identity

Memory Markets uses the [ERC-8004 (Trustless Agents)](https://eips.ethereum.org/EIPS/eip-8004) standard for on-chain agent identity and reputation on Monad.

### What It Does

- **Identity Registry** — Agents register on-chain, receiving a unique ERC-721 token. Permanent, verifiable, ownerless.
- **Reputation Registry** — Other agents submit on-chain feedback (score, tags, context). Reputation is aggregated and queryable.
- **Agent URI** — Each agent stores a `data:` URI containing its name, description, and capabilities as on-chain metadata.

### Register Your Agent

```bash
# Register on-chain identity
npm run mm -- agent-register --name "MyKnowledgeAgent"

# View identity + reputation
npm run mm -- agent-identity
```

### Contracts (Monad Testnet)

| Contract | Address |
|---|---|
| ERC-8004 Identity | `0x230ce2878e025a807ba7a20a8e5094ad8fe3c669` |
| ERC-8004 Reputation | `0xfb7df6ee2ec5c27e620b8926611567bb48d13ee5` |

---

## On-Chain Payment

Every purchase is a real on-chain transaction on Monad testnet:

```
Buyer → sendTransaction(MON) → Creator Wallet
         ↓
    waitForReceipt → verify(status, to, value)
         ↓
    Record sale in registry + import knowledge
```

Three payment paths (automatic fallback):
1. **Nad.fun token** — Buy via bonding curve (when token exists)
2. **Direct MON transfer** — Send MON to creator address (verifiable on explorer)
3. **Local access** — Free access if no wallet configured (dev/demo mode)

---

## Tech Stack

| Component | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Blockchain | Monad Testnet (Chain ID: 10143) |
| Token Launch | Nad.fun Bonding Curves |
| Smart Contract | `ICore.createCurve()` + `buy()` + `sell()` |
| Agent Identity | ERC-8004 (Identity + Reputation Registries) |
| Blockchain Client | viem |
| AI / LLM | Gemini 2.0 Flash / OpenRouter (multi-provider) |
| Embeddings | Gemini text-embedding-004 (768d) |
| Vector Store | Local JSON + cosine similarity |
| Database | sql.js (pure JS SQLite) |
| API Server | Hono |
| MCP Server | @modelcontextprotocol/sdk |
| CLI | Commander + chalk + ora |
| Testing | Vitest (250 tests, 22 files) |

---

## Contract Addresses (Monad Testnet)

| Contract | Address |
|---|---|
| Nad.fun Core | `0x822EB1ADD41cf87C3F178100596cf24c9a6442f6` |
| Bonding Curve Factory | `0x60216FB3285595F4643f9f7cddAB842E799BD642` |
| Uniswap V2 Router | `0x619d07287e87C9c643C60882cA80d23C8ed44652` |
| Uniswap V2 Factory | `0x13eD0D5e1567684D964469cCbA8A977CDA580827` |
| WMON | `0x3bb9AFB94c82752E47706A10779EA525Cf95dc27` |
| ERC-8004 Identity | `0x230ce2878e025a807ba7a20a8e5094ad8fe3c669` |
| ERC-8004 Reputation | `0xfb7df6ee2ec5c27e620b8926611567bb48d13ee5` |

---

## Project Structure

```
src/
├── config.ts              # Zod-validated environment config
├── context/               # Knowledge packaging engine
│   ├── scanner.ts         # File system scanner
│   ├── extractor.ts       # Gemini entity extraction
│   ├── embedder.ts        # Gemini text embeddings
│   ├── vector-store.ts    # Local JSON vector store
│   ├── exporter.ts        # Dir → .mmctx pipeline
│   └── importer.ts        # .mmctx → RAG query engine
├── marketplace/           # Knowledge marketplace
│   ├── registry.ts        # SQLite CRUD registry
│   └── search.ts          # Keyword + semantic search
├── blockchain/            # Monad + Nad.fun + ERC-8004
│   ├── wallet.ts          # Wallet management
│   ├── monad.ts           # Monad testnet client
│   ├── nadfun.ts          # Nad.fun contract interaction
│   ├── payment.ts         # Direct MON payment + verification
│   ├── erc8004.ts         # ERC-8004 agent identity + reputation
│   └── abi/               # Contract ABIs (ICore, IERC8004*)
├── agent/                 # Autonomous agent
│   ├── brain.ts           # Gemini decision engine (13 tools)
│   ├── autonomous.ts      # Agent loop + tool handlers
│   ├── memory.ts          # Persistent memory + reputation
│   └── coordinator.ts     # Multi-agent coordination
├── mcp/
│   └── server.ts          # MCP server (9 tools)
├── api/
│   └── server.ts          # Hono REST API (15+ endpoints)
└── cli/
    └── index.ts           # Commander CLI (19 commands)
public/
└── index.html             # Web dashboard (TailwindCSS)
openclaw-skill/
└── memory-markets/        # OpenClaw skill package
    ├── SKILL.md           # Skill definition
    ├── scripts/mm-api.sh  # API helper script
    ├── references/        # API reference docs
    └── README.md          # Installation guide
```

---

## Testing

```bash
npm test              # Run all 250 tests
npm run test:watch    # Watch mode
npm run lint          # TypeScript strict check (zero errors)
```

22 test files covering: context engine, marketplace, blockchain, agent, API, MCP server, ERC-8004.

---

## Demo

```bash
# Full automated demo
npm run demo

# Quick demo (skip export + blockchain)
npm run demo:quick

# Start API + seed data + open dashboard
npm run mm -- api &
curl -X POST http://localhost:3001/api/seed-demo
# Open http://localhost:3001
```

---

## How Knowledge Tokenization Works

```
1. EXPORT:   Scan code → Extract entities (Gemini) → Generate embeddings → Save as .mmctx
2. TOKENIZE: Call ICore.createCurve() on Nad.fun → Token + bonding curve created
3. PRICE:    Bonding curve sets price. Early buyers pay less. Price rises with demand.
4. TRADE:    Buyers call ICore.buy() → MON goes to curve → Buyer gets tokens
5. ACCESS:   Token holders import and query the knowledge package
6. RATE:     Buyers rate packages → builds on-chain reputation via ERC-8004
```

---

## License

MIT
