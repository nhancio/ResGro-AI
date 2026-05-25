# ResGro AI Application How-To Guide

This guide explains how to use the ResGro AI web application as implemented in
this repository. It covers account access, subscription activation, the current
chat workspace, available agents, their required inputs and outputs, billing,
and troubleshooting.

## 1. What ResGro AI Does

ResGro AI is a workspace for restaurant operators working with delivery
platform data, especially DoorDash. It provides:

- General AI chat for restaurant operations and marketing questions.
- Data ingestion or DoorDash report pulling.
- Performance analysis and downloadable reports.
- Marketing recommendation generation.
- DoorDash campaign creation workflows.
- Campaign performance review.
- Monthly KPI reporting.
- A full-pipeline workflow that coordinates several agents.

The application's primary signed-in experience is the **Chat workspace**. An
older dashboard-style portal remains available at `#/old-portal`, but ordinary
app navigation opens the chat workspace.

## 2. Before You Start

For normal use, prepare:

- A ResGro account and an active or trialing subscription.
- DoorDash Merchant Portal credentials only if you will pull portal data or
  execute campaigns.
- Your exported data files when running manual analysis agents.

Typical manual input files include:

- DoorDash export ZIP files.
- DoorDash financial or marketing CSV files.
- `slot_aov_table.csv` and `slot_profitability_table.csv` produced by
  DeepDive.
- Monthly reporting CSV files such as `dd-data.csv`, `ue-data.csv`, and
  optional `MARKETING_*.csv` files.

Important:

- Select an agent before attaching files. Files added to an ordinary chat
  message are listed in the conversation but are not analyzed as an agent run.
- Campaign Setup and the Boss Agent may create or update campaigns in the
  DoorDash Merchant Portal. Use an approved campaign plan and confirm the
  target account before running them.
- Keep the browser tab open while uploads and agents are running.

## 3. Account Creation, Payment, and Login

### Create a New Account

1. Open the ResGro app entry page and choose **Sign up**.
2. Enter:
   - Email address.
   - Password of at least 8 characters.
   - Business name.
   - Number of restaurants, at least 1.
   - Date of birth.
3. Accept the Terms and Conditions and Privacy Policy.
4. Select **Continue to payment**.
5. On the pricing page, choose a plan and complete Stripe checkout.
6. Wait for payment verification and select **Continue to dashboard**.

The pricing screen describes two plans:

| Plan | Price shown in app | Intended access |
| --- | ---: | --- |
| Self Serve | AUD 100/month | Manual agent modes |
| Autonomous | AUD 250/month | Manual and automated agent modes |

Both plans are displayed with a 30-day trial. The app permits workspace access
when the stored subscription status is `trialing`, `active`, or `past_due`.

### Sign In

1. Choose **Sign in** on the Get Started page.
2. Enter the email address and password used for your ResGro account.
3. Select **Continue**.

If the account has active workspace access, the app opens the Chat workspace.
If payment is required, it sends you to the pricing page.

### Reset a Password

1. From **Sign in**, select **Forgot password?**
2. Enter the account email and choose **Send reset code**.
3. Retrieve the reset code from email.
4. Select **I have the code - continue**.
5. Enter the code and a new password of at least 8 characters.
6. Return to sign in with the new password.

If reset email delivery is not configured or fails, the screen tells you to
contact an administrator or support.

### Log Out

Choose **Logout** in the lower-left navigation of the Chat workspace. Your
workspace session is removed from the browser and the sign-in screen is shown.

## 4. Chat Workspace Navigation

After login, the app opens the ResGro AI Chat workspace.

| Area | How to use it |
| --- | --- |
| **New Chat** | Starts a blank conversation and clears any currently selected agent. |
| **Chats** tab | Opens previous conversations stored in this browser; use the trash icon to delete one. |
| **Agents** tab | Lists the runnable workflow agents and their slash commands. |
| Message box | Ask a normal AI question or type `/` to choose an agent. |
| Paperclip icon | Attach files for a selected agent. Drag and drop is also supported. |
| Layers icon | Opens the agent command selector. |
| **Profile** | Shows account, business, restaurant count, plan, and user ID. |
| **Billing** | Shows current plan, status, invoices, and **Manage Subscription**. |
| **Help** | Shows in-app workflow hints and the support email. |
| **Admin** | Shown only for configured administrator email accounts. |

Conversation history is stored in the browser's local storage. It is not a
shared team conversation log and may not follow you to another browser or
device.

## 5. Use General AI Chat

Use ordinary chat when you want guidance rather than an analysis run, for
example:

- "How can I improve delivery profitability during late-night slots?"
- "Explain ROAS and cost per order for a restaurant campaign."
- "Suggest ways to improve DoorDash sponsored listing conversion."

Steps:

1. Start a new chat or select an existing chat.
2. Type a question without selecting an agent.
3. Press **Enter** or choose the send button.
4. Read the streamed response in the conversation.

Use **Shift+Enter** to add a new line without sending.

General chat uses recent conversation messages for context. For analysis of
your actual exported data, run one of the agents below instead.

## 6. Run an Agent

There are three ways to select an agent:

1. Select a suggested action on the welcome screen.
2. Open the **Agents** sidebar tab and choose an agent.
3. Type `/` in the message box and select a command.

For file-based agents:

1. Select the agent.
2. Read its upload requirements card.
3. Use **Click to upload**, the paperclip icon, or drag files into the app.
4. Optionally type a note describing the run.
5. Select **Send**.
6. Watch the processing steps in the conversation.
7. Review the summary, tables, and download buttons in the result.

For credential-based agents, selecting the agent opens a form instead of a
regular upload card. Fill in the requested DoorDash information and run it
from that form.

### Upload Behavior

- Direct uploads accept common workflow formats including `.csv`, `.zip`, and
  `.xlsx`; individual agent requirements below take precedence.
- In production, uploads over approximately 30 MB are automatically routed
  through configured cloud storage.
- Very large upload or agent runs can take several minutes. The interface
  allows long-running agent requests, but it should remain open until the run
  finishes.

## 7. Agent Input and Output Reference

| Agent command | Main input in Chat workspace | Main output |
| --- | --- | --- |
| `/data` | DoorDash portal email, password, and date range | Session ID and validated dataset list |
| `/deepdive` | DoorDash export ZIP or recognized CSV data | HTML analysis report, summary, AOV and profitability CSV tables |
| `/marketingreco` | DeepDive AOV and profitability CSV tables | Campaign plan and ads table CSV downloads |
| `/campaigns` | Approved campaign plan plus DoorDash credentials | Offer and sponsored listing setup statuses |
| `/review` | Marketing performance exports and comparison data | Channel, campaign, and pre/post review tables |
| `/monthlyreport` | DoorDash/UberEats/marketing CSV files | KPI preview tables and Excel downloads |
| `/boss` | DoorDash data export plus DoorDash credentials | Full-pipeline step statuses and summaries |

### Data Agent: `/data`

**Purpose:** Pull DoorDash reports through an automated portal session and
create a data session for analysis.

**Input in the current Chat workspace:**

- DoorDash Merchant Portal email.
- DoorDash Merchant Portal password.
- Start date and end date.

The date form initially suggests roughly the previous three complete months.

**Processing shown:**

1. Logging in to DoorDash Portal.
2. Navigating to reports.
3. Downloading financial reports.
4. Validating datasets.

**Output:**

- A data `Session ID`.
- Names of datasets found and validated.
- A confirmation that data is ready for analysis.

**How to use it:**

1. Select **Pull my data** or type `/data`.
2. Enter DoorDash login details and the reporting dates.
3. Select **Pull Reports**.
4. Wait 5 to 15 minutes as indicated in the interface.
5. Retain the session ID shown in the result.

Note: the underlying application supports shared data sessions. In the
current Chat workflow, an agent that displays an upload card still expects its
required files to be uploaded when you run that agent.

### DeepDive Analysis: `/deepdive`

**Purpose:** Analyze performance data, revenue, orders, promotions, ads, and
anomalies.

**Required input:**

- Available DoorDash export ZIP files, especially the financial export.
- Financial, sponsored listing, and promotion data improve report coverage.

The upload card displays `.csv`, `.zip`, and `.xlsx` as accepted formats. A
DoorDash export ZIP or recognized CSV data is the practical input for a useful
analysis.

**Processing shown:**

1. Uploading files.
2. Parsing CSV data.
3. Running DeepDive analysis.
4. Generating report.
5. Creating AI summary.

**Output:**

- AI summary of the analysis.
- Full HTML performance report view and HTML report download.
- Store/slot AOV table when available.
- Store/slot profitability table when available.
- Downloadable `slot_aov_table.csv` and
  `slot_profitability_table.csv` when those tables are produced.
- Run ID.

**Next recommended workflow:** Download the two slot CSV files and provide
them to Marketing Recommendations.

### Marketing Recommendations: `/marketingreco`

**Purpose:** Turn DeepDive slot-level performance results into proposed
promotions and advertising actions.

**Required input:**

- `slot_aov_table.csv` downloaded from DeepDive.
- `slot_profitability_table.csv` downloaded from DeepDive.

Use the two CSV files even though the upload selector can display additional
formats.

**Processing shown:**

1. Uploading files.
2. Loading analysis data.
3. Building campaign plan.
4. Generating ads table.
5. Creating AI summary.

**Output:**

- Campaign Plan table.
- Ads Table for qualifying profitable slots.
- Downloadable `campaign_plan.csv`.
- Downloadable `ads_table.csv`.
- AI summary and run ID.

**Before execution:** Review budgets, stores, day parts, and campaign names.
Use an approved plan as input to Campaign Setup.

### Campaign Setup: `/campaigns`

**Purpose:** Create promotional offers and sponsored listing campaigns in the
DoorDash Merchant Portal through browser automation.

**Required input form:**

- DoorDash Merchant Portal email.
- DoorDash Merchant Portal password.
- Approved campaign plan file in CSV or Excel format. The form also accepts a
  ZIP when needed as part of an input upload.

**Processing shown:**

1. Uploading campaign input files.
2. Creating data session.
3. Running campaign setup.
4. Creating promotional offers.
5. Setting up sponsored listings.
6. Creating AI summary.

**Output:**

- Status for promotional offers.
- Status for sponsored listing ads.
- AI summary and run ID.

**Operational warning:** This workflow is an execution workflow, not only a
preview. It can create campaigns in the Merchant Portal for the credentials
provided.

### Campaign Review: `/review`

**Purpose:** Evaluate campaign performance and compare pre-campaign and
post-campaign metrics.

**Required input:**

- Post-campaign performance data, typically a 7-day DoorDash export.
- Pre-campaign baseline data.
- Active campaign list or marketing export data.

For the implemented session run, provide exported files whose extracted CSV
names identify marketing data, such as `MARKETING_PROMOTION*` or
`MARKETING_SPONSORED_LISTING*`.

**Processing shown:**

1. Uploading marketing data.
2. Loading campaign data.
3. Comparing pre/post metrics.
4. Generating recommendations.
5. Creating AI summary.

**Output:**

- AI summary and review notes.
- Channel Summary table for promotions, sponsored listings, and combined
  results when available.
- Per-campaign performance table.
- Campaign pre/post comparison table.
- Run ID.

### Monthly Report: `/monthlyreport`

**Purpose:** Generate consolidated monthly KPI reporting across delivery
platform and marketing data.

**Required input:**

- DoorDash financial CSV, commonly named `dd-data.csv`.
- UberEats CSV, commonly named `ue-data.csv`, when available.
- Optional marketing CSV files, preferably named with `MARKETING` in the
  filename.

**Do not upload ZIP files** for this agent. The current Chat workflow requires
CSV files for monthly reporting and will reject ZIP archives.

File identification is based partly on filenames:

| File naming hint | Treated as |
| --- | --- |
| Includes `FINANCIAL`, `DD-DATA`, `DOORDASH`, or starts `DD_` | DoorDash data |
| Includes `UBER`, `UNITED_STATES`, `UE-`, `UE_`, or starts `UE` | UberEats data |
| Includes `MARKETING` | Marketing data |

The Chat workflow automatically compares the two most recently completed
calendar months.

**Processing shown:**

1. Uploading report files.
2. Merging platform data.
3. Calculating KPIs.
4. Generating Excel report.
5. Creating AI summary.

**Output:**

- Summary narrative.
- Preview tables shown in tabs within the chat result.
- Downloadable full Excel report.
- Optional date-level Excel export.
- Run ID.

### Boss Agent, Full Pipeline: `/boss`

**Purpose:** Run a coordinated workflow from uploaded data through analysis,
recommendations, campaign execution, campaign review, and monthly reporting.

**Required input form:**

- DoorDash Merchant Portal email and password.
- DoorDash data export in CSV or ZIP format.
- Optional additional compatible data files.

**Processing shown:**

1. Upload data.
2. DeepDive Analysis.
3. Marketing Recommendations.
4. Campaign Setup.
5. Campaign Review.
6. Monthly Report.

**Output:**

- Pipeline completion or partial-completion status.
- Step-level success, failure, or skipped statuses.
- Summary for each returned pipeline step.
- AI summary and run ID when available.

**Operational warning:** The pipeline includes Campaign Setup and therefore may
create DoorDash promotions or sponsored listings. Only run it when automated
campaign execution is intended and approved.

## 8. Recommended Operating Workflows

### Manual Analysis and Recommendations

1. Run **DeepDive Analysis** with DoorDash export data.
2. Review the HTML report and AI summary.
3. Download `slot_aov_table.csv` and `slot_profitability_table.csv`.
4. Run **Marketing Recommendations** with those two CSV files.
5. Review and download the campaign plan and ads table.
6. Obtain approval before proceeding to campaign execution.

### Approved Campaign Execution and Review

1. Prepare or approve a campaign plan.
2. Run **Campaign Setup** using the approved plan and the correct DoorDash
   portal credentials.
3. After sufficient campaign activity has accumulated, export post-campaign
   marketing performance files.
4. Run **Campaign Review** with baseline and post-campaign files.
5. Apply keep, update, or stop decisions based on the review.

### Automated End-to-End Run

1. Select **Boss Agent**.
2. Confirm the data files and DoorDash account belong to the intended
   restaurant workspace.
3. Confirm campaign automation has been approved.
4. Upload data, enter credentials, and start the run.
5. Keep the tab open while processing completes.
6. Inspect each returned step status, especially Campaign Setup.

## 9. Profile, Billing, Support, and Legacy Modules

### Profile

Select **Profile** in the Chat sidebar to view:

- Email.
- Business name.
- Number of restaurant locations.
- Region when present.
- Membership date.
- Plan label and user ID.

### Billing

Select **Billing** in the Chat sidebar to:

- See the current plan and subscription status.
- Review the price and displayed next billing date.
- View invoice history when Stripe invoices exist.
- Select **Manage Subscription** to open the Stripe billing portal.

### Help and Support

Select **Help** for quick usage tips. For support, email
`contact@resgro.ai`.

### Legacy Dashboard Portal

The route `#/old-portal` exposes an earlier dashboard layout. It includes:

- **Dashboard:** account summary and module shortcuts.
- **Agents:** a form-based operator agents panel.
- **Billing:** plan details and invoice history.
- **Profile:** workspace and restaurant account information.
- **Users:** local browser-stored user management, shown only to users with
  management permission.
- **Feedback:** prepares an email-based product, billing, or support feedback
  request.

Use the primary Chat workspace for current day-to-day agent operation unless
you specifically need a legacy dashboard function.

## 10. Common Issues

| Problem | What to do |
| --- | --- |
| App redirects to pricing after login | The account does not have an active, trialing, or accepted billing status. Complete checkout or manage the subscription. |
| No account found | Choose **Sign up** or confirm the email address used at account creation. |
| Incorrect password | Use **Forgot password?** to request a reset code. |
| Agent asks for files after a normal chat upload | Select the required agent first, then attach and send its required input files. |
| DeepDive returns incomplete metrics | Include a financial export containing recognized financial detailed transactions, plus relevant marketing exports. |
| Marketing Recommendations has no useful plan | Run DeepDive first and upload both generated slot table CSV files. |
| Monthly Report rejects an upload | Upload extracted CSV files, not ZIP archives, and use recognizable DD, UE, or MARKETING filenames. |
| Campaign Setup fails | Check DoorDash credentials and ensure the approved campaign plan contains usable campaign or ads data. |
| AI chat is unavailable or rate-limited | Wait and retry general chat; reporting agents may still run independently of the chat summarizer. |
| Large upload cannot start | Cloud large-file upload must be configured by the app administrator. |

## 11. Local Development Use

This section is for developers or testers running the repository locally.

### Prerequisites

- Node.js 18 or later.
- Python 3.11 or later.
- npm.

### Start the Full App

From the repository root:

```bash
./run.sh install
./run.sh
```

Open:

```text
http://localhost:8888/#/get-started
```

The full startup script launches these services:

| Service | Local URL |
| --- | --- |
| Web app and local routing proxy | `http://localhost:8888` |
| ResGro Agents API | `http://localhost:8001/api/health` |
| Django accounts/admin API | `http://localhost:8002/admin/` |
| HTTP auth/billing adapter | `http://localhost:8080` |
| Autonomy API | `http://localhost:8000` |

### Minimum Environment Configuration

Copy `.env.example` to `.env` and fill in the services required for the
features you are testing:

- Stripe keys and price IDs for checkout and billing.
- `DJANGO_SECRET_KEY` for accounts.
- `GEMINI_API_KEY` for ordinary AI chat and AI summaries.
- `VITE_API_BASE_URL` and `VITE_AGENTS_API_URL` when overriding local routing.
- `GCS_UPLOAD_BUCKET` and signing configuration for production-scale large
  uploads.

When running agents that automate DoorDash, use a test or explicitly approved
merchant account and confirm whether the action is read-only or creates
campaigns before starting the run.
