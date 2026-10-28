# KYC Architecture Demo

This demo walks through one KYC case in five steps and compares a shared LangGraph + MCP workflow with separate agents exchanging work over A2A. It is an illustrative architecture demo, not a claim that either protocol is secure by itself.

## Run the demo

Install Python and Node.js/npm, then from the repository root create a virtual environment and install the backend dependencies:

```powershell
py -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

Install the frontend dependencies and build the React frontend:

```powershell
cd frontend
npm ci
npm run build
cd ..
```

Start the app:

```powershell
.\venv\Scripts\python.exe kyc_ui.py
```

Open [http://127.0.0.1:8002](http://127.0.0.1:8002). The FastAPI app serves the built React frontend and provides the demo API.

For frontend development, start the backend with `.\venv\Scripts\python.exe kyc_ui.py`, then in a second terminal run:

```powershell
cd frontend
npm run dev
```

Open the Vite URL it prints. API requests are proxied to FastAPI on port 8002.

## KYC journey

1. **Collect the application** — receive company/director documents and create the profile.
2. **Check policy requirements** — FinCrime identifies a missing supporting document and pauses its review.
3. **Request the missing document** — collect it and update the KYC profile.
4. **Complete the risk review** — FinCrime resumes and returns a signed certificate.
5. **Run an independent quality check** — a separate QA agent verifies the certificate and checks the file.

The comparison highlights the demo's design choices: shared tool output versus service boundaries, resumable task handoff, the amount of data returned to the calling workflow, and independent signature checking. The UI also explains how LangGraph can orchestrate work inside an agent, MCP can connect it to permitted tools, and A2A can carry work between agent services.

These are architectural options, not protocol guarantees. A2A does not by itself provide zero-trust isolation, encryption, framework compatibility, agent authentication, or signed artifacts. The demo's certificate uses a shared-secret HMAC for illustration, not production key management or agent identity. Production deployments must configure their own network security, authentication, authorization, key protection, signature verification, and compatible agent capabilities.
