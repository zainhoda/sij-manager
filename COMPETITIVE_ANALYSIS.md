# SIJ Manager: Competitive Analysis & Business Model Proposal

## Executive Summary

SIJ Manager is a production scheduling and labor management system built for manufacturing environments, with deep Fishbowl Inventory integration. This analysis examines the competitive landscape and proposes a business model optimized for the new reality of AI-assisted software development.

---

## Product Overview

### What SIJ Manager Does
- **Production Scheduling**: 8-week horizon planning with worker skill matching
- **Labor Management**: Worker proficiency tracking (1-5 scale), automatic skill adjustments based on performance
- **Production Logging**: Real-time tracking of work completion with efficiency metrics
- **Fishbowl Integration**: Live connection to Fishbowl BOM and inventory data
- **Multi-interface**: Worker mobile app, supervisor dashboard, shop floor TV displays, admin portal
- **Worker Mobile App** (planned): Real-time assignments, work logging, and looping task instruction videos

### Target Market
- Small-to-medium manufacturers (10-200 employees)
- Companies already using Fishbowl Inventory
- Operations with manual production steps requiring skill-based worker assignment
- Particularly suited for: sewing/textile, custom manufacturing, assembly operations

---

## Competitive Landscape

### Tier 1: Direct Competitors (Production Scheduling + Labor)

| Product | Pricing | Key Features | Gaps vs SIJ Manager |
|---------|---------|--------------|---------------------|
| **[Katana](https://katanamrp.com)** | $179-$1,799/mo (unlimited users) | Inventory, MRP, shop floor app | No worker proficiency tracking, no automatic skill updates |
| **[MRPeasy](https://www.mrpeasy.com)** | $49+/user/mo | Full MRP, production planning | Generic - no Fishbowl integration, limited labor intelligence |
| **[JITbase](https://www.jitbase.com)** | Custom pricing | Labor management, workforce planning | Less production scheduling depth |
| **[Cetec ERP](https://www.cetecerp.com)** | $40/user/mo | Full SMB ERP, scheduling, shop floor | Too broad - complexity overkill for targeted use case |

### Tier 2: Enterprise Solutions

| Product | Pricing | Notes |
|---------|---------|-------|
| **[DELMIAWorks](https://www.solidworks.com/product/delmiaworks)** | $50K-$100K+ implementation | Enterprise MES, overkill for SMB |
| **[ShopVue](https://www.shopvue.com)** | $45K-$180K/year | Full MES, requires IT infrastructure |
| **[Global Shop Solutions](https://www.globalshopsolutions.com)** | ~$1,500/mo | Comprehensive but complex |

### Tier 3: Adjacent Solutions

| Product | Relationship to SIJ Manager |
|---------|----------------------------|
| **[Fishbowl Inventory](https://www.fishbowlinventory.com)** | Complementary - SIJ extends Fishbowl's limited scheduling |
| **[Access Orchestrate](https://www.theaccessgroup.com)** | Similar philosophy but enterprise-focused |

### Competitive Gaps Exploited by SIJ Manager

1. **Fishbowl-Native Integration**: No competitor offers deep, real-time Fishbowl integration. This is a moat for the 40,000+ Fishbowl customers.

2. **Worker Intelligence**: Automatic proficiency tracking and skill-based assignment is rare in this price tier.

3. **Simplicity**: Enterprise MES systems are too complex. Generic MRP tools lack production floor intelligence.

4. **Mobile-First Workers**: Cross-platform worker app (iOS/Android/web) is a differentiator vs. legacy desktop tools.

5. **Video Work Instructions**: Looping task videos on worker devices - a major differentiator (see below).

---

## The Video Instructions Advantage

### The Feature
Each worker sees a looping video of exactly how to perform their current assigned task, directly on their mobile device. This is integrated with real-time assignment push and production logging.

### Why This Is a Game-Changer

**1. Solves a Real Pain Point**
- Training new workers is expensive and time-consuming
- Consistency issues when workers learn from different trainers
- Language barriers in diverse workforces (video transcends language)
- Tribal knowledge loss when experienced workers leave

**2. Creates Massive Switching Costs**
Once a manufacturer has recorded 50-200 task videos:
- That content library is valuable and non-portable
- Re-recording for a new system is weeks of work
- The investment compounds over time as more tasks are documented

**3. Hard to Replicate Quickly**
Unlike code features that AI can help build in days:
- Requires video hosting/streaming infrastructure
- Needs content management for organizing videos by task
- Mobile app optimization for offline/low-bandwidth playback
- Integration with the scheduling system is the key

**4. Enables Premium Pricing**
| Component | Value Justification |
|-----------|---------------------|
| Video storage | Ongoing infrastructure cost = recurring revenue |
| Training content creation | Professional services opportunity |
| Reduced training time | Quantifiable ROI for customers |
| Quality consistency | Fewer defects = real savings |

### Competitive Moat Analysis

| Competitor | Video Instructions | Notes |
|------------|-------------------|-------|
| Katana | No | Has shop floor app but no video |
| MRPeasy | No | Text-based work instructions only |
| DELMIAWorks | Limited | Enterprise-level, complex setup |
| Poka | Yes | Dedicated work instruction platform, $$$$ |
| SwipeGuide | Yes | Work instructions only, no scheduling |

**Strategic insight**: Competitors either have scheduling OR video instructions, rarely both integrated. The combination is the moat.

### Monetization Options for Video Feature

**Option 1: Included in Higher Tiers**
```
Starter ($99/mo): No video
Growth ($249/mo): Video instructions included, 50GB storage
Scale ($449/mo): 200GB storage + analytics on video views
Enterprise ($799/mo): Unlimited storage + video creation services
```

**Option 2: Standalone Add-On**
```
Base platform: $99/mo + $10/worker
Video add-on: $99/mo + $0.50/GB storage
```

**Option 3: Usage-Based Storage**
```
Base platform: $99/mo + $10/worker
Video storage: First 10GB free, then $5/GB/mo
```

### Implementation Considerations

| Component | Build vs Buy | Notes |
|-----------|-------------|-------|
| Video hosting | Buy (Mux, Cloudflare Stream) | ~$0.01-0.05/min watched |
| Video upload/encoding | Buy | Same providers |
| Offline playback | Build | Critical for shop floor (spotty wifi) |
| Task-video linking | Build | Core product integration |
| Analytics (views, completion) | Build | Valuable data for proficiency tracking |

### ROI Story for Sales

"A new worker costs $2,000-5,000 to train. With SIJ Manager's video instructions:
- Training time reduced 40-60%
- Consistency improved (everyone learns from the best worker's technique)
- Experienced worker time freed up (not training, producing)
- Knowledge preserved when workers leave

**Payback**: If you save 1 week of training time per new hire at $20/hr, that's $800. The video feature pays for itself with 1-2 new hires per year."

---

## Market Sizing

### Fishbowl Customer Base
- ~40,000 companies use Fishbowl
- Estimated 30% have manufacturing (vs. pure distribution): ~12,000 prospects
- Conservative 5% conversion at $200/mo = $1.2M ARR potential from Fishbowl base alone

### Broader SMB Manufacturing
- ~250,000 SMB manufacturers in North America
- Target: shops with 10-200 employees, manual production steps
- Serviceable Addressable Market: ~50,000 companies

---

## The AI Coding Agent Reality

### What's Changed

Traditional software development economics:
- Average senior developer: $150K-$200K/year fully loaded
- 3-5 developers minimum for a competitive SaaS = $500K-$1M/year engineering cost
- Needed to sustain development, bug fixes, feature parity

**New reality with AI coding agents (Claude Code, Cursor, etc.):**
- 1-2 developers can now do the work of 5-10
- Code velocity is 3-10x faster for many tasks
- Complex features that took weeks now take days
- Bug fixes that took hours now take minutes

### Strategic Implications

| Old Model | New Model |
|-----------|-----------|
| High fixed costs require high prices | Can compete on price while maintaining margins |
| Features = competitive moat | Features are easily replicated |
| Raise VC, build team, scale | Bootstrap viable, stay lean |
| Winner-take-all dynamics | Fragmented market sustainable |
| Land-and-expand enterprise | SMB can be profitable at low price points |

### Risks
- **Lower barriers to entry**: Competitors can build faster too
- **Commoditization**: Features become table stakes quickly
- **Differentiation challenge**: Code is no longer the moat - domain expertise and customer relationships are

---

## Proposed Business Model

### Option A: Fishbowl-First Vertical SaaS (Recommended)

**Strategy**: Position as THE production scheduling add-on for Fishbowl users.

**Pricing**:
| Tier | Monthly Price | Workers | Features |
|------|--------------|---------|----------|
| Starter | $99/mo | Up to 10 | Core scheduling, production logging |
| Growth | $199/mo | Up to 25 | + Worker proficiency, equipment tracking |
| Scale | $399/mo | Up to 50 | + 8-week planning, scenarios, analytics |
| Enterprise | $799/mo | Unlimited | + API, custom integrations, priority support |

**Rationale**:
- Undercuts Katana ($179+ but no Fishbowl) and MRPeasy ($49/user scales fast)
- AI-enabled low development costs allow healthy margins at these prices
- Fishbowl integration is a sustainable moat (requires ongoing maintenance)
- Vertical focus = lower sales & marketing costs (17% of ARR vs 21% for horizontal)

**Go-to-Market**:
1. Fishbowl Marketplace listing
2. Fishbowl consultant/VAR partner program
3. SEO for "Fishbowl production scheduling"
4. Content marketing for manufacturing ops professionals

### Option B: Open Core + Services

**Strategy**: Open source the core platform, monetize through:
- Hosted/managed version
- Premium features (analytics, AI-powered suggestions)
- Implementation services
- Custom development

**Rationale for open source in AI era**:
- Code has less moat value anyway (AI can replicate features)
- Builds trust and community
- Reduces sales friction
- Positions for consulting revenue

**Pricing**:
- Self-hosted: Free (open source)
- Cloud hosted: $149/mo base + $5/worker/mo
- Premium features: $99/mo add-on
- Implementation: $2,500-$10,000 one-time

### Option C: Per-Worker Usage-Based

**Strategy**: Align pricing with customer value creation.

**Pricing**: $15-25/active worker/month (only pay for workers who log production)

**Rationale**:
- Low barrier to start (try with 2-3 workers)
- Scales with customer success
- Natural expansion revenue
- AI-enabled support means low marginal cost per user

---

## Recommended Strategy: Hybrid Model

Combine elements of Options A and C, with video as a key differentiator:

### Pricing Structure
```
Base Platform:        $99/mo (includes 5 workers, scheduling + logging)
Additional Workers:   $10/worker/mo
Video Instructions:   +$99/mo (includes 25GB, then $3/GB/mo)
Enterprise:           $699/mo flat (unlimited workers + 100GB video)
```

### Examples
- 10 workers, no video: $99 + (5 × $10) = $149/mo
- 10 workers + video: $149 + $99 = $248/mo
- 25 workers + video (50GB): $99 + (20 × $10) + $99 + (25 × $3) = $473/mo
- 40 workers + video: $699/mo (enterprise makes sense)

### Why This Works
1. **Low entry barrier**: $99/mo is impulse-buy territory for manufacturing ops
2. **Video as upsell**: Clear value-add that customers can adopt when ready
3. **Storage revenue**: Ongoing video storage creates sticky recurring revenue
4. **Enterprise ceiling**: Predictable pricing for larger shops
5. **Healthy margins**: AI-enabled development keeps costs under $20K/mo
6. **Video creates lock-in**: The more videos uploaded, the harder to leave

---

## Unit Economics Projection

### Assumptions (Year 1)
- 50 customers at avg $200/mo = $120K ARR
- 2 person-equivalents of development (leveraged by AI)
- Minimal infrastructure (Turso/libSQL is cheap)

### Cost Structure (Monthly)
| Item | Cost |
|------|------|
| Infrastructure (Turso, hosting) | $200 |
| Video hosting (Mux/Cloudflare Stream) | $500-2,000 (scales with usage) |
| Development (AI-augmented, 1 FTE equivalent) | $5,000-$10,000 |
| Support (AI-assisted) | $1,000 |
| Marketing | $2,000 |
| **Total** | **$8,700-$15,200/mo** |

### Video Hosting Unit Economics
- Mux: ~$0.025/min encoded + $0.007/min delivered
- 100 task videos × 2 min each × 50 views/day = ~$350/mo per customer
- Charging $99/mo + $3/GB keeps healthy margin

### Break-Even
- 50-70 customers at $250/mo average (with video adoption)
- Very achievable for Fishbowl niche

### Path to $1M ARR
- 300 customers at $275/mo average (realistic with video), or
- 150 customers at $550/mo average (larger shops with heavy video use)

---

## Defensibility in the AI Era

Since code is no longer a moat, focus on:

### 1. Video Content Library (Strongest Moat)
- Customer-created task videos are non-portable
- Library value compounds over time (more tasks documented)
- Re-recording for a competitor is weeks/months of effort
- Combines content lock-in with workflow lock-in

### 2. Fishbowl Integration Depth
- Stay current with Fishbowl API changes
- Deep product knowledge that's hard to replicate
- Relationship with Fishbowl team

### 3. Domain Expertise
- Manufacturing workflow knowledge embedded in UX
- Industry-specific defaults and templates
- Content marketing establishing thought leadership

### 4. Data Network Effects
- Aggregate anonymized benchmarks ("your efficiency is above average for textile shops")
- Industry-specific production time estimates
- Best practice templates
- Video view analytics tied to worker proficiency

### 5. Customer Success
- White-glove onboarding
- Manufacturing-savvy support
- Customer community/forum
- Video creation best practices consulting

### 6. Switching Costs
- Historical production data in the system
- Trained workers familiar with the interface
- Integrated workflows and habits
- **Video library is the killer switching cost**

---

## Recommendations Summary

1. **Lead with video instructions**: This is your strongest differentiator. No competitor has scheduling + integrated video. Build this first.

2. **Price aggressively on base, premium on video**: $99 base + $10/worker + $99/mo video add-on. The video creates the lock-in.

3. **Own the Fishbowl niche**: Become the default answer to "I use Fishbowl and need better scheduling + training."

4. **Stay lean**: 1-2 FTEs + AI tools. No need for large engineering team.

5. **Video creates the moat code cannot**: In the AI era, your video content library is what competitors can't replicate. Every customer video uploaded deepens the moat.

6. **Offer video creation services**: Professional services to help customers create their first 20-50 task videos. $2,500-10,000 one-time, builds relationship + content lock-in.

7. **Build for offline-first**: Shop floors have spotty wifi. Workers need videos cached locally. This is a UX differentiator.

8. **Track video → proficiency correlation**: Analytics showing "workers who watch videos are 23% more efficient" sells the feature.

---

## Strategic Option: Replace Fishbowl Entirely

### The Opportunity

You have full read access to Fishbowl's database schema. The data is manageable in size:

| Table | Rows | Complexity |
|-------|------|------------|
| Parts | 939 | Low - simple CRUD |
| Products | 648 | Low |
| BOMs | 213 | Medium - hierarchical |
| Sales Orders | 1,550 | Medium - workflow states |
| Purchase Orders | 729 | Medium |
| Customers | 78 | Low |
| Vendors | 187 | Low |
| Inventory Log | 243K | High volume but simple structure |

### What Fishbowl Actually Does

1. **Inventory Management**: Track parts, quantities, locations, costs
2. **Sales Orders**: Create, fulfill, ship orders
3. **Purchase Orders**: Order from vendors, receive inventory
4. **Manufacturing/Work Orders**: Track production
5. **BOM Management**: Define product recipes
6. **QuickBooks Sync**: ← **This is the hard part**

### Build Assessment

| Component | Difficulty | Time (AI-assisted) | Notes |
|-----------|------------|-------------------|-------|
| Parts/Products CRUD | Easy | 1 week | You already cache this |
| BOM Management | Easy | 1 week | You already have bom_steps |
| Inventory Tracking | Medium | 2-3 weeks | Location, qty, cost layers |
| Sales Orders | Medium | 2-3 weeks | Workflow, fulfillment |
| Purchase Orders | Medium | 2 weeks | Similar to SO |
| Shipping/Receiving | Medium | 2 weeks | Carrier integration |
| **QuickBooks Integration** | **Hard** | **4-8 weeks** | **The real complexity** |
| Barcode Scanning | Easy | 1 week | Mobile camera API |

**Total estimate: 3-5 months** to reach feature parity on core functions.

### The QuickBooks Question

Fishbowl's moat is QuickBooks integration. Options:

**Option A: Skip QuickBooks initially**
- Target manufacturers who use other accounting (Xero, standalone)
- Or those willing to do manual journal entries
- Faster to market, smaller TAM

**Option B: Build QuickBooks integration**
- QuickBooks Online has a REST API (easier)
- QuickBooks Desktop requires SDK/Web Connector (harder)
- Intuit's review process takes 2-4 months
- Ongoing maintenance as APIs change

**Option C: Partner with accounting middleware**
- Use Rutter, Codat, or similar for multi-accounting integration
- $200-500/mo + per-transaction fees
- Faster but adds dependency and cost

### Strategic Comparison

| Strategy | Pros | Cons |
|----------|------|------|
| **Stay Fishbowl Add-On** | Fast to market, clear niche, low risk | Limited TAM (Fishbowl users only), dependent on Fishbowl |
| **Replace Fishbowl** | Larger TAM, full control, higher price point | 3-5 months delay, QuickBooks is hard, ERP competition |
| **Hybrid: Optional Fishbowl** | Best of both, gradual migration | Two codepaths to maintain |

### Recommendation: Phased Approach

**Phase 1 (Now → 6 months): Fishbowl Add-On**
- Ship scheduling + video instructions
- Prove product-market fit
- Build customer base and revenue

**Phase 2 (6-12 months): Standalone Mode**
- Add native inventory/SO/PO for non-Fishbowl users
- Use Fishbowl data as reference implementation
- Target Xero users or manual accounting shops

**Phase 3 (12-18 months): QuickBooks Integration**
- Only if Phase 2 shows demand
- Consider acquiring a small QB integration tool
- Or partner with accounting middleware

### Why This Sequence

1. **De-risks the business**: Prove demand before building ERP
2. **Revenue funds development**: Fishbowl customers pay for Phase 2
3. **Learn from usage**: Real customers reveal what inventory features matter
4. **Optionality**: Can stay as add-on if that's working well
5. **AI advantage compounds**: Your dev velocity only increases over time

### If You Do Build It: The Ontology-First Architecture

Rather than building a monolithic backend, consider a **single ontology + pluggable backends** approach using [ont-run](https://ont-run.com/docs/):

```
┌─────────────────────────────────────────────────────────┐
│                    SINGLE FRONTEND                       │
│         (React Native mobile + web admin)                │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│                   ONTOLOGY LAYER                         │
│  Entities: Worker, Task, BOM, Order, Part, Location     │
│  Functions: assignWorker, logProduction, getSchedule    │
│  Access: supervisor.canAssign, worker.canLog            │
└─────────────────────────┬───────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   FISHBOWL    │ │   NETSUITE    │ │  STANDALONE   │
│   ADAPTER     │ │   ADAPTER     │ │   (SQLite)    │
│               │ │               │ │               │
│ MySQL queries │ │ REST API      │ │ Native tables │
│ to FB schema  │ │ to NS         │ │ you control   │
└───────────────┘ └───────────────┘ └───────────────┘
```

### Why This Works in the AI Era

**Traditional problem**: Maintaining N backend adapters is expensive. Each system has quirks, APIs change, bugs are system-specific. You'd need a team per integration.

**AI-era solution**: Generating adapters is cheap.

| Task | Traditional | With AI Agents |
|------|-------------|----------------|
| New Fishbowl adapter | 2-4 weeks | 2-3 days |
| New NetSuite adapter | 3-6 weeks | 3-5 days |
| New Katana adapter | 2-4 weeks | 2-3 days |
| Bug fix in adapter | Hours-days | Minutes-hours |
| API version update | Days | Hours |

The ontology is the contract. AI agents implement against the contract for each system.

### The Ontology as Product

```typescript
// Your ontology becomes the product definition
const sijOntology = {
  entities: {
    Worker: { id, name, skills: Skill[], proficiency: Map<Step, 1-5> },
    Task: { id, bomStep, assignedWorker, status, videoUrl },
    BOMStep: { id, bom, sequence, estimatedMinutes, instructions },
    ProductionLog: { task, worker, startTime, endTime, unitsCompleted },
  },

  functions: {
    getWorkerAssignments: { input: { workerId }, output: Task[] },
    logProduction: { input: { taskId, units, endTime }, output: void },
    getTaskVideo: { input: { taskId }, output: { url, duration } },
    calculateEfficiency: { input: { workerId, dateRange }, output: number },
  },

  access: {
    worker: ['getWorkerAssignments', 'logProduction', 'getTaskVideo'],
    supervisor: ['*', 'reassignTask', 'overrideSchedule'],
    admin: ['*'],
  }
}
```

### Customer Deployment Model

| Customer | Backend | Notes |
|----------|---------|-------|
| SI Jacobson | Fishbowl adapter | Current customer |
| New Customer A | NetSuite adapter | Generate on onboarding |
| New Customer B | Standalone | No existing ERP |
| New Customer C | Fishbowl adapter | Reuse existing |
| New Customer D | Katana adapter | Generate on demand |

**Onboarding flow**:
1. Customer signs up, selects their ERP (or "none")
2. AI agent generates adapter against ontology
3. Human reviews adapter code
4. Deploy customer-specific backend
5. Frontend just works (same ontology)

### Pros of This Architecture

1. **Frontend is system-agnostic**: Write once, works for all ERPs
2. **Adapters are disposable**: AI can regenerate if needed
3. **Testing is ontology-level**: Test the contract, not N implementations
4. **Customer lock-in via content, not integration**: Video library is the moat, not the Fishbowl adapter
5. **Expand TAM without expanding code**: Support NetSuite users without building "NetSuite version"
6. **Customization without forking**: Customer-specific logic lives in their adapter

### Cons / Risks

1. **Lowest common denominator**: Ontology must work for all systems
   - *Mitigation*: Optional entities/functions, graceful degradation

2. **System-specific features lost**: Fishbowl has features NetSuite doesn't
   - *Mitigation*: Ontology defines minimum viable; adapters can expose extras

3. **Deployment complexity**: Managing N backend instances
   - *Mitigation*: Containerized, customer-specific deployments (Fly.io, Railway)

4. **Debugging across adapters**: Bug might be in adapter vs. frontend
   - *Mitigation*: Strong ontology typing, adapter test suites

### Implementation Strategy

**Phase 1: Extract Ontology from Current Code**
- Define entities and functions based on current SIJ Manager
- Current Fishbowl integration becomes "Fishbowl Adapter v1"
- Frontend refactored to consume ontology, not direct DB

**Phase 2: Build Standalone Adapter**
- Implement same ontology against local SQLite/Turso
- This becomes the "no ERP" option
- Proves the abstraction works

**Phase 3: AI-Generated Adapters**
- Document adapter interface clearly
- Use Claude Code to generate NetSuite adapter from ontology + API docs
- Human review before deployment

**Phase 4: Adapter Marketplace (Long-term)**
- Community/partners build adapters
- You certify and host
- Revenue share on customer deployments

### Pricing Implications

This architecture enables per-customer pricing flexibility:

```
Base Platform:     $99/mo (standalone backend included)
Fishbowl Adapter:  +$49/mo (we maintain the integration)
NetSuite Adapter:  +$99/mo (more complex API)
Custom Adapter:    $2,500 one-time + $49/mo maintenance
```

Or simpler:
```
Self-Hosted (any adapter): $199/mo flat
Managed (we run your backend): $299/mo + $10/worker
```

### Verdict

**This is the right architecture for the AI era.** The traditional objection—"too expensive to maintain N integrations"—is obsolete when AI can generate and maintain adapters.

Your moat becomes:
1. The ontology design (domain expertise)
2. The frontend UX (mobile worker experience)
3. The video content library (customer lock-in)
4. NOT the backend code (AI-generated, replaceable)

---

## Go-To-Market Strategy

### Buyer Personas

| Persona | Title | Pain Points | Buying Trigger |
|---------|-------|-------------|----------------|
| **Operations Manager** | Ops Manager, Production Manager | Scheduling chaos, no visibility into worker efficiency, training new hires | Missed deadlines, quality issues, high turnover |
| **Plant Owner** | Owner, GM | Can't scale, too dependent on tribal knowledge, key person risk | Growth stall, losing experienced workers |
| **ERP Admin** | IT Manager, Systems Admin | Fishbowl/ERP doesn't do production scheduling well | Asked to "make it work" by ops |

**Primary buyer**: Operations Manager (has the pain daily)
**Economic buyer**: Owner/GM (writes the check)
**Influencer**: ERP Admin (can block or champion)

### Positioning

**Against Katana/MRPeasy** (horizontal MRP):
> "They do inventory. We do production intelligence—worker skills, video training, and scheduling that actually works on the floor."

**Against enterprise MES** (DELMIAWorks, ShopVue):
> "MES for shops with 10-200 workers, not 2,000. Set up in days, not months. Price in hundreds, not tens of thousands."

**Against doing nothing** (spreadsheets, whiteboards):
> "Your best worker's knowledge shouldn't walk out the door when they retire. Capture it in video, track it in data."

### One-Liner Options

- "Production scheduling with built-in training videos"
- "Know who can do what, and show them how"
- "The shop floor app that makes every worker your best worker"
- "Scheduling + training for manufacturers who've outgrown spreadsheets"

### Channel Strategy

#### Channel 1: ERP Marketplaces (Fishbowl First)

**Fishbowl Marketplace**
- List as "Production Scheduling Add-On"
- Fishbowl has ~40K customers, ~12K with manufacturing
- Low CAC—they're already looking for solutions

**How to get listed:**
1. Apply to Fishbowl Partner Program
2. Build certified integration
3. Get listed in their marketplace
4. Co-marketing opportunities (webinars, case studies)

**Expand to:**
- NetSuite SuiteApp Marketplace
- QuickBooks App Store (if standalone inventory mode)
- Xero Marketplace

#### Channel 2: ERP Consultants / VARs

Fishbowl is sold through ~200 VARs (Value Added Resellers). These consultants:
- Implement Fishbowl for customers
- Get asked "how do I do production scheduling?"
- Need a good answer that isn't "build it yourself"

**VAR Program:**
```
Referral fee:     20% of Year 1 revenue
Co-sell fee:      30% of Year 1 (they handle sales)
Implementation:   VAR keeps 100% of services revenue
```

**Target VARs:**
- Fishbowl Gold/Platinum partners
- Manufacturing-focused consultants
- Geographic focus initially (where SI Jacobson is)

#### Channel 3: Content Marketing (SEO)

**High-intent keywords:**

| Keyword | Monthly Volume | Difficulty | Intent |
|---------|---------------|------------|--------|
| "fishbowl production scheduling" | Low | Low | Perfect fit |
| "manufacturing scheduling software small business" | Medium | Medium | Good fit |
| "shop floor management software" | Medium | Medium | Good fit |
| "worker training video software manufacturing" | Low | Low | Unique angle |
| "how to schedule production workers" | Low | Low | Educational |

**Content strategy:**
1. **Bottom-funnel**: "Fishbowl Production Scheduling: What's Missing and How to Fix It"
2. **Mid-funnel**: "5 Signs You've Outgrown Spreadsheet Scheduling"
3. **Top-funnel**: "How to Train New Manufacturing Workers Faster"

**AI-enabled content velocity:**
- Generate 2-3 articles/week with AI assistance
- Create industry-specific variants (textile, assembly, food manufacturing)
- Build comparison pages (vs. Katana, vs. MRPeasy, vs. spreadsheets)

#### Channel 4: Vertical Communities

**Online communities:**
- r/manufacturing, r/smallbusiness (Reddit)
- Manufacturing & Supply Chain groups (LinkedIn)
- Fishbowl User Forums
- Industry-specific forums (sewn products, custom manufacturing)

**Approach:**
- Be helpful first, not salesy
- Answer questions about production scheduling
- Share content when relevant
- Build reputation over 3-6 months

**Trade associations:**
- NTMA (National Tooling and Machining Association)
- AME (Association for Manufacturing Excellence)
- SMA (Sewn Products Manufacturers Association)—relevant to SI Jacobson's industry

#### Channel 5: Outbound (Targeted)

**Build prospect list:**
1. Scrape Fishbowl case studies / testimonials for company names
2. Find ops managers on LinkedIn
3. Personalized outreach (AI-assisted)

**Outbound sequence:**
```
Email 1: "Saw you use Fishbowl—here's what most shops do for scheduling"
Email 2: "Quick video: how [similar company] reduced training time 40%"
Email 3: "Free production scheduling assessment"
```

**Volume:**
- 50-100 personalized emails/week (AI-written, human-reviewed)
- Target 2-3% reply rate
- 10-15 demos/month from outbound

### Sales Motion

#### Self-Serve vs. Sales-Led

| Price Point | Motion | Why |
|-------------|--------|-----|
| < $200/mo | Self-serve | Low enough to expense, ops manager can buy |
| $200-500/mo | Sales-assisted | Demo helps, but quick close |
| > $500/mo | Sales-led | Need to talk to owner/GM |

**Recommended: Product-Led Growth with Sales Assist**

```
Free Trial (14 days)
    ↓
Self-serve onboard (< 10 workers)
    ↓
Usage triggers sales touch (hits 10 workers, or stalls)
    ↓
Sales helps close / expand
```

#### Trial Experience

**Critical first-run experience:**
1. Connect to Fishbowl (or create demo data)
2. See their actual BOMs pulled in
3. Add 2-3 workers
4. Create first schedule
5. **Aha moment**: Worker opens mobile app, sees assignment + video placeholder

**Time to value target**: < 30 minutes to see a schedule

#### Sales Collateral Needed

| Asset | Purpose | Priority |
|-------|---------|----------|
| Product demo video (3 min) | Website, outbound | P0 |
| ROI calculator | Justify purchase | P0 |
| Case study: SI Jacobson | Social proof | P1 |
| Comparison sheets (vs. Katana, etc.) | Handle objections | P1 |
| Implementation guide | Reduce perceived risk | P2 |

### Pricing Page Presentation

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRICING                                  │
├─────────────────┬─────────────────┬─────────────────────────────┤
│     STARTER     │     GROWTH      │         SCALE               │
│    $149/mo      │    $299/mo      │       $599/mo               │
│                 │                 │                             │
│  10 workers     │  25 workers     │  Unlimited workers          │
│  Scheduling     │  Everything in  │  Everything in Growth       │
│  Production log │  Starter, plus: │  plus:                      │
│  Mobile app     │                 │                             │
│                 │  Video instruct │  Priority support           │
│                 │  Proficiency    │  Custom integrations        │
│                 │  50GB storage   │  200GB storage              │
│                 │                 │  Dedicated success mgr      │
│                 │                 │                             │
│  [Start Trial]  │  [Start Trial]  │  [Contact Sales]            │
└─────────────────┴─────────────────┴─────────────────────────────┘

              All plans include: Fishbowl integration
           Need a different ERP? We support NetSuite, Katana,
                    or standalone mode. Talk to us.
```

### Launch Sequence

#### Pre-Launch (4-6 weeks before)

- [ ] Landing page with email capture
- [ ] "Early access" waitlist
- [ ] Reach out to 10-20 Fishbowl users for beta
- [ ] SI Jacobson case study written
- [ ] Demo video recorded

#### Launch Week

- [ ] Product Hunt launch (if applicable)
- [ ] Fishbowl Marketplace listing live
- [ ] LinkedIn announcement
- [ ] Email waitlist
- [ ] Post in manufacturing communities
- [ ] Outbound campaign starts

#### Post-Launch (Weeks 2-8)

- [ ] Weekly content publishing begins
- [ ] VAR outreach starts
- [ ] First customer testimonials collected
- [ ] Iterate based on trial feedback
- [ ] Second case study from beta customer

### Metrics to Track

| Metric | Target (Month 1) | Target (Month 6) |
|--------|------------------|------------------|
| Website visitors | 500 | 5,000 |
| Trial signups | 20 | 100 |
| Trial → Paid conversion | 15% | 25% |
| Paying customers | 3 | 25 |
| MRR | $500 | $5,000 |
| CAC | < $500 | < $300 |
| Payback period | < 3 months | < 2 months |

### Marketing Budget (Bootstrapped)

| Item | Monthly Cost | Notes |
|------|--------------|-------|
| Domain + hosting | $50 | Already have |
| SEO tools (Ahrefs/Semrush) | $100 | Essential for content |
| Email (Resend/Postmark) | $20 | Transactional + marketing |
| LinkedIn Sales Navigator | $100 | For outbound |
| Content (AI-assisted) | $0 | Your time + Claude |
| Paid ads (later) | $0 initially | Add at $5K MRR |
| **Total** | **~$270/mo** | |

### What Changes With the Ontology Architecture

The multi-backend approach affects GTM:

**Positioning shift:**
- From: "Fishbowl add-on"
- To: "Production scheduling for any ERP (or none)"

**Expanded TAM messaging:**
```
"Works with Fishbowl, NetSuite, Katana, or standalone.
Same powerful scheduling, whatever you use for inventory."
```

**Landing page structure:**
```
/               → Main product page
/fishbowl       → Fishbowl-specific landing page
/netsuite       → NetSuite-specific landing page
/standalone     → "No ERP? No problem" page
```

**SEO multiplier:**
Each integration = new keyword opportunities:
- "netsuite production scheduling"
- "katana manufacturing scheduling"
- etc.

### AI-Enabled Marketing Advantages

Just as AI changes development economics, it changes marketing:

| Traditional | AI-Enabled |
|-------------|------------|
| 1 blog post/week | 3-5 posts/week |
| Generic outbound | Personalized at scale |
| One landing page | Variant per industry/ERP |
| Manual competitor monitoring | Automated tracking |
| Slow content localization | Same-day translation |

**Specific tactics:**
1. Generate industry-specific case study templates (textile, assembly, food)
2. Personalize outbound emails using company research
3. Create comparison content for every competitor
4. Monitor competitor changes and update positioning

---

## Sources

- [Production Scheduling Software Overview - ProjectManager.com](https://www.projectmanager.com/blog/best-production-scheduling-software)
- [Katana vs MRPeasy Comparison - Craftybase](https://craftybase.com/compare/katana-vs-mrpeasy)
- [Fishbowl Inventory Alternatives - G2](https://www.g2.com/products/fishbowl-inventory/competitors/alternatives)
- [Shop Floor Management Software - SoftwareConnect](https://softwareconnect.com/roundups/best-shop-floor-management-software/)
- [Vertical vs Horizontal SaaS - FLG Partners](https://flgpartners.com/saas-industry-centric-business-models-horizontal-vertical/)
- [Vertical SaaS Strategy - SingleGrain](https://www.singlegrain.com/saas/vertical-saas/)
- [SMB Manufacturing ERP - Top10ERP](https://www.top10erp.org/blog/the-best-manufacturing-software-for-your-small-business)
