# INDRA - Global Ontology Engine

**India's AI-Powered Strategic Intelligence System**

INDRA (Intelligence for National Decision-making and Risk Assessment) is an AI-powered global ontology engine that collects, analyzes, and visualizes geopolitical, economic, defense, and technological intelligence from multiple sources—all connected into a unified, constantly updating knowledge graph for strategic decision-making.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [How It Works](#how-it-works)
4. [Module Breakdown](#module-breakdown)
5. [API Endpoints](#api-endpoints)
6. [Frontend Components](#frontend-components)
7. [Features](#features)
8. [Running the Project](#running-the-project)
9. [Deployment](#deployment)

---

## Overview

### Purpose
INDRA collects and understands:
- **Structured data** (knowledge graph nodes & relationships)
- **Unstructured content** (RSS news feeds, articles)
- **Live real-time feeds** (geopolitics, economics, defense, technology, climate, society)

### Core Capabilities
1. **Knowledge Graph** - Dynamic graph of countries, technologies, resources, conflicts
2. **Real-time Intelligence** - RSS feeds from 8+ global sources
3. **NLP Analysis** - Auto-categorization, sentiment detection, entity extraction
4. **Risk Propagation** - Markov chain model for cascading risk calculation
5. **LLM Analysis** - Groq-powered AI analysis with RAG
6. **Climate/Market Data** - Free external APIs for real-time metrics

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                        │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│   │ Knowledge   │  │   Globe      │  │   Dashboard &       │  │
│   │ Graph (D3)  │  │   View       │  │   Intelligence      │  │
│   └──────┬──────┘  └──────┬───────┘  └──────────┬─────────┘  │
└──────────┼────────────────┼──────────────────────┼─────────────┘
           │                │                      │
           ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Express.js)                       │
│  ┌──────────────┐ ┌─────────────┐ ┌───────────────┐            │
│  │ RAG System   │ │ Intelligence│ │  Markov Risk  │            │
│  │ (Gemini V2)  │ │  (RSS/Raw)  │ │  Propagation  │            │
│  └──────────────┘ └─────────────┘ └───────────────┘            │
│         │              │                │                      │
└─────────┼──────────────┼────────────────┼──────────────────────┘
          │              │                │
          ▼              ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                   │
│  ┌──────────────┐ ┌─────────────┐ ┌───────────────┐            │
│  │   SQLite     │ │   Vector    │ │   External    │            │
│  │  Database    │ │   Store     │ │   APIs        │            │
│  └──────────────┘ └─────────────┘ └───────────────┘            │
│       Nodes, Relationships, Intelligence Articles, Sessions    │
└─────────────────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. Data Collection (intelligence.js)
```
RSS Feeds → Parser → Cache → Intelligence Store
```
- Fetches from 8+ RSS sources (Reuters, BBC, NDTV, Economic Times, etc.)
- Parses XML to extract title, description, link, source, date
- Caches results (5-minute TTL) to avoid rate limits

### 2. News Analysis (analyzer.js)
```
Raw Articles → Categorization → Sentiment → Alerts → Entities
```
- **Categorization**: Matches keywords (Defense→military, Economy→gdp, Tech→semiconductor)
- **Sentiment**: Positive/Negative for India specifically
- **Alert Levels**: CRITICAL, HIGH, MEDIUM based on keywords
- **Entity Extraction**: Countries, sectors from article text

### 3. Knowledge Graph (database.js)
```
Nodes + Relationships ← Auto-Enrichment
```
- Nodes: Countries (India, China, USA...), Technologies (Semiconductors, AI...), Resources (Oil, Rare Earth...)
- Relationships: Trade deficit, defense imports, energy dependency
- Auto-enrichment: Detects new countries/technologies from news

### 4. Risk Propagation (markov_model.js)
```
PageRank-style Algorithm: Risk scores based on graph connections
```
- Iterates through graph 50 times
- Spreads risk through connected nodes
- Returns sorted list: highest risk nodes first

### 5. LLM Analysis (server.js - /api/analyze)
```
User Query → RAG (Gemini) → Groq (Llama 3.3) → Response + Nodes
```
- Retrieves relevant context from vector store
- Builds dynamic prompt with live graph data + recent news
- Returns analysis + relevant nodes for graph highlighting

### 6. Frontend Visualization (INDRAEngine.jsx)
```
D3 Force Graph ← API Data ← Highlight on Query
```
- Shows globe initially (react-globe.gl)
- After query: switches to knowledge graph
- Highlights relevant nodes based on LLM response

---

## Module Breakdown

### Backend Modules

| Module | File | Purpose |
|--------|------|---------|
| **Server** | `server.js` | Express app with all API routes (1331 lines) |
| **Database** | `database.js` | SQLite operations, nodes, relationships, sessions |
| **Intelligence** | `intelligence.js` | RSS fetching, caching, multi-source aggregation |
| **Analyzer** | `analyzer.js` | News categorization, sentiment, alert detection |
| **Markov Model** | `markov_model.js` | Risk propagation algorithm (PageRank-style) |
| **RAG System** | `rag.js` | Vector store, similarity search (Gemini embeddings) |
| **KB Updater** | `kb_updater.js` | Knowledge base auto-update |
| **Climate** | `climate.js` | Climate data from Open-Meteo, GDELT |
| **Sentiment** | `sentiment_analysis.js` | Sentiment tracking over time |
| **Web Crawler** | `web_crawler.js` | Custom content crawling |
| **Cache** | `cache.js` | In-memory caching with TTL |
| **Auth** | `auth.js` | Role-based authentication |
| **Realtime** | `realtime.js` | WebSocket for alerts |
| **Scheduled Reports** | `scheduled_reports.js` | Auto-generate intelligence reports |

### Frontend Components

| Component | Purpose |
|-----------|---------|
| **INDRAEngine.jsx** | Main dashboard, D3 graph, globe, all panels |
| **NewsModal.jsx** | Country-specific news modal |
| **App.jsx** | Entry point with routing |

---

## API Endpoints

### Core Intelligence
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/intelligence` | GET | Fetch real-time intelligence by topic |
| `/api/intelligence/dashboard` | GET | Dashboard stats, categories, alerts |
| `/api/intelligence/search` | GET | Search intelligence articles |
| `/api/intelligence/stored` | GET | Get stored articles |

### Analysis
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze` | POST | LLM-powered analysis (Groq) |
| `/api/sentiment/analyze` | POST | Analyze sentiment of text |
| `/api/sentiment/trend` | GET | Get sentiment trend for entity |

### Knowledge Graph
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/graph` | GET | Full graph (nodes + links) |
| `/api/entities` | GET | All entities |
| `/api/graph/enrich` | GET | Auto-enrich graph from news |
| `/api/markov-risk` | GET | Risk propagation scores |

### Risk & Prediction
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/predict-risk` | GET | Strategic risk prediction |
| `/api/market/stress` | GET | Market stress from Yahoo Finance |
| `/api/climate/risk-score` | GET | Climate risk for country |

### Climate & Environment
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/climate/data` | GET | Climate data (Open-Meteo) |
| `/api/climate/events` | GET | Climate events (GDELT) |
| `/api/climate/agri-impact` | GET | Agricultural impact |

### Country Intelligence
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/country-intel/:country` | GET | 5 headlines + AI risk assessment |
| `/api/news/country/:country` | GET | Country-specific news |
| `/api/news/supported` | GET | List supported countries |

### Database & System
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health check |
| `/api/stats` | GET | Database statistics |
| `/api/cache/stats` | GET | Cache statistics |
| `/api/db/backups` | GET | List backups |

### Export
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/export/pdf` | GET | Generate PDF intelligence report |

---

## Features

### ✅ Phase 1: Knowledge Graph
- SQLite database with nodes (countries, tech, resources) and relationships
- Auto-detection of new entities from news
- Graph enrichment from intelligence

### ✅ Phase 2: Intelligence Gathering
- 8+ RSS feeds (Reuters, BBC, NDTV, Economic Times, etc.)
- Auto-categorization: Defense, Economy, Tech, Diplomacy, Energy, Resources, Health, Agriculture
- Sentiment analysis: Positive/Negative for India
- Priority alerts: CRITICAL, HIGH, MEDIUM

### ✅ Phase 3: Risk Propagation
- Markov chain algorithm (PageRank-style)
- Cascading risk calculation
- Risk scores displayed in dashboard

### ✅ Phase 4: Dashboard UI
- Interactive knowledge graph (D3.js)
- Globe view before query (react-globe.gl)
- Live headlines panel
- Critical alerts panel
- Dark/Light mode

### ✅ Phase 5: Scenario Analysis
- Pre-defined What-If scenarios
- LLM-powered analysis of scenarios

### ✅ Phase 6: Source Fusion
- Confidence scoring by source (Reuters=95%, BBC=90%, NDTV=75%)
- Source fusion display in dashboard

### ✅ Phase 7: Country Intelligence
- Click country → get 5 headlines + AI risk assessment
- Crisis detection (WAR, ECONOMIC, POLITICAL, etc.)

### ✅ Phase 8: Market Stress
- Real-time market data (Yahoo Finance - free)
- Stress score calculation
- NIFTY 50, S&P 500, Brent Crude, Gold tracking

### ✅ Phase 9: Climate Intelligence
- Open-Meteo API (free)
- GDELT climate events
- Agricultural impact assessment

---

## Running the Project

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Create .env file with your keys
# Required: GROQ_API_KEY (for LLM analysis)
# Optional: GEMINI_API_KEY (for embeddings)
```

### Development
```bash
# Terminal 1: Start backend
npm run server
# Runs on http://localhost:3001

# Terminal 2: Start frontend
npm run dev
# Runs on http://localhost:5173
```

### Environment Variables (.env)
```env
PORT=3001
GROQ_API_KEY=your_groq_key_here
GEMINI_API_KEY=your_gemini_key_here
CURRENTS_API_KEY=your_currents_key
DEBUG=false
```

---

## Deployment

### Option 1: Render (Recommended - Free)
1. Push code to GitHub
2. Create new Web Service on Render
3. Connect GitHub repo
4. Set:
   - Build Command: `npm install`
   - Start Command: `node server.js`
5. Add environment variables
6. Deploy

### Option 2: Railway
1. Connect GitHub to Railway
2. Set build/start commands
3. Add environment variables
4. Deploy

### Option 3: AWS (Free Tier)
- Use EC2 or Elastic Beanstalk
- Requires more setup than Render

---

## Database Schema

### nodes
```sql
id TEXT PRIMARY KEY      -- "India", "China", "Semiconductors"
type TEXT               -- "country", "tech", "resource", "sector"
description TEXT       -- Node description
color TEXT             -- UI color
size INTEGER           -- Node size
```

### relationships
```sql
source TEXT            -- From node
target TEXT            -- To node
label TEXT             -- "Trade Deficit $85B"
strength REAL          -- 0.0-1.0 connection strength
```

### intelligence
```sql
title TEXT
description TEXT
source TEXT            -- "Reuters", "BBC"
url TEXT
category TEXT          -- "DEFENSE", "ECONOMY"
topic TEXT             -- Country/topic
```

---

## Key Algorithms

### Markov Risk Propagation
```javascript
// Step 1: Initialize equal probability for all nodes
// Step 2: Spread risk through connections
// Step 3: Apply damping factor (0.85)
// Step 4: Normalize and repeat 50 times
// Step 5: Sort by risk score
```

### News Categorization
```javascript
// Match keywords against categories
// DEFENSE: military, army, weapon, troops, LAC
// ECONOMY: gdp, trade, export, inflation
// TECHNOLOGY: semiconductor, AI, 5G, cyber
// Returns category + color + priority
```

### Sentiment Analysis
```javascript
// POSITIVE keywords: signs, announces, partnership, growth
// NEGATIVE keywords: loses, warns, conflict, attack
// Calculate based on presence in text
```

---

## Technologies Used

| Layer | Technology |
|-------|------------|
| Backend | Express.js, Node.js |
| Database | SQLite (better-sqlite3) |
| AI/ML | Groq (Llama 3.3), Gemini Embeddings |
| Frontend | React 19, D3.js, Three.js |
| Globe | react-globe.gl |
| APIs | RSS, Yahoo Finance, Open-Meteo, GDELT |
| Export | PDFKit |

---

## Version History

- **v3.2** - Current: All phases implemented
- **v3.1** - Added market stress, climate data
- **v3.0** - Full dashboard with graph + globe

---

## License

MIT - For India Innovates 2026 Hackathon

---

## Credits

Built for **India Innovates 2026** - AI/ML Track
Strategic Intelligence System for National Decision-making