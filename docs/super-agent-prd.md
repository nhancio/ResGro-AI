# Super Agent PRD

## Overview

The Super Agent is the top-level orchestrator for end-to-end marketing automation for food delivery platforms such as DoorDash and Uber Eats.

It coordinates the full lifecycle:

1. Data extraction
2. Analysis
3. Strategy generation
4. Campaign execution
5. Performance monitoring
6. Reporting

In this repo, the current implementation spans `agents/`, `orchestrator/`, browser automation flows, and the operator-facing UI catalog in `agents/resgroAgentsCatalog.ts`.

## Modes

### Auto Mode

User provides platform credentials only. The system fetches data, generates outputs, and executes the workflow with minimal operator input.

### Manual Mode

User provides exported files and optional date ranges. The system processes only the supplied data and does not depend on live platform access.

## Agent Architecture

### A. Super Agent (Orchestrator)

- Mode: Auto
- Repo mapping: `agents/boss_agent/agent.py`

Responsibilities:

- Coordinate downstream agents in sequence
- Enforce step ordering and handoffs
- Track step status and artifacts through a shared `session_id`
- Deliver a single pipeline result for downstream consumption

Current pipeline in code:

1. Data
2. DeepDive analysis
3. Marketing recommendations
4. Offers execution
5. Ads execution
6. Campaign review
7. Monthly reporting

Primary output:

- Session-scoped pipeline status
- Step-level artifacts and summaries

### 1. Data Agent

- Mode: Manual + Auto
- Repo mapping: `agents/data_agent/agent.py`

Inputs:

- Auto: DoorDash credentials today, with room to extend for Uber Eats
- Manual: ZIP exports, CSV uploads, optional date range

Responsibilities:

- Create a shared data session
- Download or ingest platform exports
- Normalize datasets for downstream use

Data handling rules:

- Auto mode defaults to a 3-month window
- If the ideal window is unavailable, downstream logic should use the latest available data
- Partial datasets are accepted and stored when full export coverage is not available

Outputs:

- `session_id`
- Validated datasets
- Dataset summary and stored raw artifacts

Note:

- Your PRD marks this agent as auto only, but the current repo already supports both manual and autopilot flows. Keeping both is the stronger product shape because it unlocks partial-manual and recovery workflows.

### 2. Analysis Agent

- Mode: Manual + Auto
- Repo mapping: `agents/deepdive/agent.py`
- UI/catalog name: `deepdive`

Inputs:

- Auto: data session produced by the Data Agent
- Manual: uploaded datasets and optional date range

Responsibilities:

- Perform financial analysis
- Perform marketing and campaign analysis
- Detect anomalies, gaps, and opportunities
- Validate whether the uploaded data is usable for strategy generation

Expected output:

- Structured insights report
- Trends
- Risks
- Opportunities
- Performance gaps

Failure behavior:

- If data quality is poor or incomplete, generate limited analysis and mark the result as unsuitable for high-confidence strategy generation

### 3. Recommendation Agent

- Mode: Manual in target PRD
- Current repo status: Manual + orchestrated auto handoff
- Repo mapping: `agents/marketingreco/agent.py`
- UI/catalog name: `marketingreco`

Inputs:

- Analysis output

Responsibilities:

- Convert analysis into a marketing plan
- Propose growth levers
- Allocate budgets
- Suggest audience and campaign targets

Outputs:

- Structured marketing plan

Important implementation note:

- The current repo allows this step to run automatically after analysis inside the boss-agent pipeline. If product wants strict manual approval here, add a human-approval gate rather than removing the automation path.

### 4. Marketing Ads and Offers Agent

- Mode: Manual in target PRD
- Current repo status: Triggerable from orchestrated pipeline, but should remain approval-gated
- Repo mapping:
  - `agents/campaign_setup/offers_flow.ts`
  - `agents/campaign_setup/ads_flow.ts`
- UI/catalog names:
  - `resgro-offers`
  - `resgro-ads`

Inputs:

- Approved marketing plan
- Platform/store credentials

Responsibilities:

- Create discount campaigns
- Create ad campaigns
- Create offer and bundle setups
- Execute campaign setup through browser automation

Outputs:

- Live or scheduled campaigns
- Setup artifacts
- Expected target metrics such as ROI, reach, and conversion goals

Recommended control:

- Require approval before campaign execution in production, even when the upstream strategy is generated automatically

### 5. Campaign Monitoring Agent

- Mode: Auto
- Repo mapping: `agents/campaign_review/agent.py`
- UI/catalog name: `review`

Inputs:

- Active campaign artifacts
- Post-campaign or weekly performance exports
- Pre-campaign baseline metrics

Responsibilities:

- Monitor active campaign outcomes
- Compare spend against return
- Track conversion and customer behavior changes
- Recommend next actions

Outputs:

- Review artifact with decisions:
  - Keep
  - Kill
  - Update
  - Add

Note:

- The current repo models this mainly as a post-campaign review step. A weekly scheduler can be layered on top of the same agent behavior to satisfy the PRD without changing the core review contract.

### 6. Monthly Reporting Agent

- Mode: Manual
- Repo mapping: `agents/monthly_reporter/agent.py`
- UI/catalog name: `monthly-reporter`

Inputs:

- Manual data uploads or existing exported datasets
- Optional comparison windows

Responsibilities:

- Generate customer-facing monthly reports
- Summarize performance, campaign impact, growth, and next actions

Outputs:

- Monthly report artifacts
- Downloadable files
- Presentation-ready reporting inputs

Target enhancement:

- The PRD calls for PPT output. The current repo already produces reporting artifacts and previews; PPT generation should be treated as a presentation/export layer on top.

## Supported Input Variations

### Case 1: Full Automation

- Input: platform credentials
- Flow: Data Agent -> Analysis Agent -> Recommendation Agent -> Ads/Offers Agent -> Monitoring -> Reporting

### Case 2: Partial Manual

- Input: uploaded files plus date range
- Flow: start from Data Agent manual ingest or directly from analysis-compatible files

### Case 3: Custom Analysis

- Input: arbitrary or incomplete dataset
- Flow: limited analysis with restricted recommendation confidence

## Output Channels

Target channels:

- Slack
- Microsoft Teams
- WhatsApp
- Downloadable CSV and PPT artifacts

Current repo status:

- Shared artifacts and downloadable files are present
- Slack-oriented architecture exists in older planning/docs
- Teams and WhatsApp delivery are product requirements, not yet first-class repo integrations

## System Constraints

Target product rules from this PRD:

- Super Agent: auto only
- Analysis Agent: manual + auto
- Monitoring Agent: auto only
- Recommendation Agent: manual only unless approved for auto handoff
- Ads/Offers Agent: manual only unless approved for execution
- Monthly Reporting Agent: manual only

## Recommended Product Rules

To align the PRD with the current implementation without losing safety:

1. Keep data ingestion dual-mode: manual + auto
2. Allow analysis to run automatically once a session is ready
3. Allow recommendation generation automatically, but gate execution approval
4. Keep campaign execution approval-gated in production
5. Reuse campaign review for weekly monitoring through scheduling
6. Add PPT export and outbound delivery adapters as separate integration layers

## Repo Mapping Summary

| PRD role | Current repo name | Primary file |
|---|---|---|
| Super Agent | Boss agent | `agents/boss_agent/agent.py` |
| Data Agent | Data agent | `agents/data_agent/agent.py` |
| Analysis Agent | DeepDive | `agents/deepdive/agent.py` |
| Recommendation Agent | MarketingReco | `agents/marketingreco/agent.py` |
| Ads Agent | Resgro ads | `agents/campaign_setup/ads_flow.ts` |
| Offers Agent | Resgro offers | `agents/campaign_setup/offers_flow.ts` |
| Monitoring Agent | Campaign review | `agents/campaign_review/agent.py` |
| Monthly Reporting Agent | Monthly reporter | `agents/monthly_reporter/agent.py` |

## MVP Scope Recommendation

The fastest SaaS MVP from the current repo is:

1. Manual + autopilot Data Agent
2. Auto DeepDive analysis
3. Auto MarketingReco plan generation
4. Human approval before Ads/Offers execution
5. Scheduled campaign review
6. Monthly report export

That keeps the product aligned with your PRD while matching what the codebase already supports.
