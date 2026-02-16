# Tara Agent Workflow & Logic Documentation

## 1. Initialization & Context Injection
The agent ("Tara") is initialized in `src/services/vapiService.ts`.
Every time a call starts, the system generates a dynamic **System Prompt** (`getSystemPromptWithConfigs`).

**Data Injected into Prompt:**
- **Identity**: "Tara", AI HR Performance Review Assistant.
- **Participants**: Employee Name (`${emp}`) and Manager Name (`${mgr}`).
- **Review ID**: Extracted from the latest review data.
- **OKR Data**: A structured list of Objectives and Key Results (internal IDs included).

## 2. Conversation Flow (The "Protocol")
The agent is largely rule-based, enforced by the prompt in `vapiService.ts`. It follows a strict 4-phase linear process:

### Phase 1: Progress Update (Data Synchronization)
- **Actor**: Employee ONLY.
- **Goal**: Update actual values for all Key Results.
- **Trigger**: `update_key_result` tool.
- **Gate**: Must complete all KRs before moving to ratings.

### Phase 2: Performance Evaluation (The Rating Loop)
Standard strict batching applies:
1.  **Employee Batch**: Tara asks Employee for rating (1-5) & reason for *every* Objective and Key Result.
2.  **Manager Batch**: Only after Employee is 100% done, Tara switches to Manager and repeats the loop.
- **Trigger**: `update_okr_rating` (type: `objective` or `key_result`).

### Phase 3: Competency Review
Sequential loop through 5 competencies (Ownership, Professionalism, Customer Focus, Leadership, Collaboration).
- **Loop**: Ask Employee Rating -> Wait for Tool -> Ask Employee Reason -> Wait for Tool -> Ask Manager Rating -> Wait for Tool -> Ask Manager Reason -> Wait for Tool.
- **Trigger**: `update_okr_rating` (type: `competency`).

### Phase 4: Qualitative Feedback
1.  Employee: Key Accomplishments (`type: accomplishments`).
2.  Employee: Next Quarter Plan (`type: next_quarter_plan`).
3.  Manager: Overall Comments (`type: manager_comments`).

## 3. Tool Calling & Data Updates
The mechanism for "asking and updating" bridges `useVapi.ts` (Frontend Hooks) and `okrService.ts` (API Layer).

### Step 1: The Question
Tara asks a question based on the Protocol (e.g., "How would you rate yourself on [Objective]?").

### Step 2: The Response & Tool Trigger
The user speaks. The LLM (server-side via Vapi/Groq) analyzes the speech.
If it detects a rating/update, it triggers a **Tool Call** (function calling).
- **Tools**: `update_key_result`, `update_okr_rating`.

### Step 3: Client-Side Execution (`useVapi.ts`)
The React application receives the `tool-calls` event.
1.  **Immediate Feedback**: It sends a "success" message back to Vapi immediately so Tara says "Got it" without waiting for the DB.
2.  **Background Processing**:
    - Calls `updateKeyResultWithRating` or `submitEmployeeSelfAssessment`/`submitCompetencyReview`.
    - Arguments (id, rating, comment) are mapped to the backend payload.

### Step 4: UI & Database Sync (`okrService.ts`)
1.  **Optimistic Update**: `optimisticUpdateCache` immediately patches the local data to update the UI (Performance Report) so the user sees the change instantly.
2.  **API Request**:
    - `updateKeyResult`: PUT /api/keyresults/updatekeyResult
    - `submitEmployeeSelfAssessment`: PUT /api/reviewForm/updateReviewForm
3.  **Mutex**: A `updateMutex` lock prevents multiple updates from overwriting each other if they happen close together.

## 4. Anti-Repetition Logic
The system prompt contains an **ANTI-REPETITION** rule:
> "If you see a successful tool call confirmation for a specific ID/Type/Role in the history, NEVER ask that question again."

This ensures that once a tool fires successfully, the agent treats that item as "done" and moves to the next item in the list.
