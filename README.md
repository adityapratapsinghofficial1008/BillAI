# BillAI Gateway & Cost Dashboard (v0 Pilot)

BillAI is a lightweight, metadata-only API gateway sitting between application services and AI providers (starting with Groq). It authenticates incoming team requests via an `X-BillAI-Key` header, proxies LLM calls while passing through the client's original provider credentials (`Authorization`), calculates token usage costs fail-open, and records latency and usage metrics in PostgreSQL.

---

## 🛠️ Requirements & Tech Stack
- **Node.js**: v18+ (with native `fetch` support)
- **Database**: PostgreSQL
- **Backend**: Express.js
- **Frontend**: React (Vite) + Recharts

---

## 1. Database Setup (PostgreSQL)

### A. Create PostgreSQL Database
Make sure PostgreSQL is running locally, then create the `billai` database:

```sql
CREATE DATABASE billai;
```

### B. Environment Configuration
Create a `.env` file in the root directory (or copy `.env.example`):

```env
PORT=3001
PGHOST=localhost
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=billai
PGPORT=5432
```
*(Alternatively, you can provide `DATABASE_URL=postgres://postgres:postgres@localhost:5432/billai`)*

---

## 2. Run Database Migration

Install backend dependencies and run the migration script to create tables (`teams`, `pricing`, `usage_logs`) and seed Groq pricing for `llama3-8b-8192`:

```bash
# Install root dependencies
npm install

# Execute SQL migration & seed data
npm run migrate
```

---

## 3. Add a Test Team

Insert a test team into the `teams` table to generate a `billai_key` for testing:

```sql
INSERT INTO teams (name, billai_key) 
VALUES ('Acme AI Team', 'billai_test_key_12345');
```

---

## 4. How to Add New Model Pricing Later

Groq's catalog and pricing change over time. When a new model is introduced or price updates, insert or update a row in the `pricing` table:

```sql
INSERT INTO pricing (provider, model, input_price_per_1k, output_price_per_1k)
VALUES ('groq', 'llama-3.3-70b-versatile', 0.00059, 0.00079)
ON CONFLICT (provider, model) DO UPDATE 
SET input_price_per_1k = EXCLUDED.input_price_per_1k,
    output_price_per_1k = EXCLUDED.output_price_per_1k,
    updated_at = NOW();
```

> 💡 **Fail-Open Note**: If a call is made using an unlisted model, BillAI will log a server-side warning (`console.warn`), save the log row with `cost_usd` as `NULL`, and still deliver Groq's response to the client without throwing an error.

---

## 5. Starting Backend & Dashboard Frontend

### A. Start Gateway Backend Server
```bash
# Starts Express server on http://localhost:3001
npm start
```
*(Or `npm run dev` for watch mode)*

### B. Start Dashboard Frontend
In a separate terminal window:

```bash
# Navigate to client directory
cd client

# Install frontend dependencies
npm install

# Start Vite dev server on http://localhost:5173
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to view the live dashboard.

---

## 6. End-to-End Test via `curl`

Send a test chat completion request to the proxy gateway route `POST /v1/groq/chat/completions`:

```bash
curl -X POST http://localhost:3001/v1/groq/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-BillAI-Key: billai_test_key_12345" \
  -H "Authorization: Bearer YOUR_GROQ_API_KEY" \
  -d '{
    "model": "llama3-8b-8192",
    "messages": [
      {
        "role": "user",
        "content": "Explain API gateways in one sentence."
      }
    ]
  }'
```

### Verification Checklist:
1. **HTTP 200 Response**: You will receive Groq's unmodified response payload.
2. **PostgreSQL Verification**: Query `usage_logs` to confirm metadata was recorded:
   ```sql
   SELECT * FROM usage_logs ORDER BY created_at DESC LIMIT 1;
   ```
3. **Dashboard Update**: Open [http://localhost:5173](http://localhost:5173) to see total spend, request count, spend bar chart, and usage logs table update automatically.
