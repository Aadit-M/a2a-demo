# kyc_backend_servers.py
import base64
import hashlib
import hmac
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from rich.console import Console

app = FastAPI(title="KYC Architecture Demo")
console = Console()

ENTERPRISE_SIGNING_KEY = b"institutional-kyc-root-ca-2026"
CLIENT_ID = "CLT-88412"
KYC_PROFILE_ID = "KYC-99201"
REMEDIATION_DOC_ID = "DOC-AUDIT-2026-V9"
PROJECT_ROOT = Path(__file__).resolve().parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

DEMO_STAGES = [
    {
        "id": "intake",
        "title": "Collect the application",
        "eyebrow": "01 · INTAKE",
        "description": "Start with the company’s incorporation and director documents, then create its KYC profile.",
        "why": "Both designs can collect and organize the same onboarding information.",
    },
    {
        "id": "policy",
        "title": "Check policy requirements",
        "eyebrow": "02 · POLICY CHECK",
        "description": "FinCrime reviews the file and identifies a required certified vessel-charter audit document.",
        "why": "The review pauses until the missing document is supplied. In the A2A design, this is a resumable task.",
    },
    {
        "id": "outreach",
        "title": "Request the missing document",
        "eyebrow": "03 · CUSTOMER OUTREACH",
        "description": "The onboarding team requests the audit document, receives it, and updates the KYC profile.",
        "why": "The workflow remains understandable: policy check first, customer follow-up second.",
    },
    {
        "id": "screening",
        "title": "Complete the risk review",
        "eyebrow": "04 · FINCRIME REVIEW",
        "description": "FinCrime resumes its review, applies the supplied document, and returns a risk certificate.",
        "why": "The demo contrasts data returned to one shared agent context with a result exchanged between separate agents.",
    },
    {
        "id": "quality",
        "title": "Run an independent quality check",
        "eyebrow": "05 · FOUR-EYE CHECK",
        "description": "A separate QA agent checks the certificate signature and confirms the document and profile checks.",
        "why": "Independent review makes separation of duties visible instead of asking the same workflow to approve itself.",
    },
]

DEMO_STATE: Dict[str, Any] = {}


def new_demo_state() -> Dict[str, Any]:
    return {"current_stage": 0, "task_id": None, "results": {}}


DEMO_STATE = new_demo_state()


def get_demo_snapshot() -> Dict[str, Any]:
    current_stage = DEMO_STATE["current_stage"]
    stages = []
    for index, stage in enumerate(DEMO_STAGES):
        state = "complete" if index < current_stage else "current" if index == current_stage else "upcoming"
        if current_stage == len(DEMO_STAGES):
            state = "complete"
        stages.append({**stage, "state": state})
    return {
        "current_stage": current_stage,
        "stages": stages,
        "results": DEMO_STATE["results"],
    }


def get_client_row(client_id: str) -> sqlite3.Row:
    row = FINCRIME_DB.cursor().execute(
        "SELECT * FROM fincrime_watchlist WHERE client_id = ?",
        (client_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No KYC record was found for this client.")
    return row


# ============================================================================
# PRIVATE FINCRIME SQLITE DATABASE (Used by Stage 3 & Stage 5)
# ============================================================================
def init_fincrime_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE fincrime_watchlist (
            client_id TEXT PRIMARY KEY,
            client_name TEXT,
            related_party TEXT,
            adverse_news_raw TEXT,
            hit_mitigation_policy TEXT,
            required_doc_id TEXT,
            gcra_rubric_secret TEXT
        )
    """)
    cursor.execute("""
        INSERT INTO fincrime_watchlist VALUES (
            'CLT-88412',
            'Meridian Global Logistics Ltd',
            'Viktor K. (22% Related Party Director)',
            'CONFIDENTIAL FINCRIME HIT [DO NOT TIP OFF]: 2024 Limassol Maritime Inquiry into shadow vessel chartering.',
            'MITIGATION RULE: Hit can only be mitigated if client provides Certified Vessel Charter Audit (DOC-AUDIT-2026-V9).',
            'DOC-AUDIT-2026-V9',
            'SECRET GCRA FORMULA: Base(20) + MaritimeHit(+65) - AuditMitigation(-60) = Score 25 (LOW-MEDIUM RISK)'
        )
    """)
    conn.commit()
    return conn


FINCRIME_DB = init_fincrime_db()
A2A_TASK_STORE: Dict[str, Dict[str, Any]] = {}


def sign_jws(payload_dict: Dict[str, Any], key: bytes = ENTERPRISE_SIGNING_KEY) -> str:
    header = {"alg": "HS256", "typ": "JWS"}
    b64_h = base64.urlsafe_b64encode(json.dumps(header).encode()).rstrip(b"=").decode()
    canon = json.dumps(payload_dict, sort_keys=True, separators=(",", ":")).encode()
    b64_p = base64.urlsafe_b64encode(canon).rstrip(b"=").decode()
    signing_input = f"{b64_h}.{b64_p}"
    sig = hmac.new(key, signing_input.encode(), hashlib.sha256).digest()
    b64_s = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"{signing_input}.{b64_s}"


# ============================================================================
# ARCHITECTURE A ENDPOINTS: "RESTRICTED READ-ONLY MCP SERVER"
# Why this fails: MCP is a dumb data pipe (no LLM). Even if restricted to
# read-only SQL views, it MUST return the raw rows to the calling LangGraph
# agent so the LangGraph LLM can summarize Adverse News & compute GCRA!
# ============================================================================
def restricted_mcp_tool_call(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    row = get_client_row(args.get("client_id", CLIENT_ID))
    if tool_name == "mcp_check_policy_requirements":
        return {
            "mcp_protocol": "tools/call (Stateless Read-Only View)",
            "status": "ERROR_MISSING_DOC",
            "returned_to_langgraph_state": {
                "missing_doc": row["required_doc_id"],
                "policy_rule_exposed": row["hit_mitigation_policy"]
            }
        }

    if tool_name == "mcp_fetch_screening_data_for_gcra":
        return {
            "mcp_protocol": "tools/call (Read-Only FinCrime View)",
            "returned_to_langgraph_state": {
                "related_party": row["related_party"],
                "raw_adverse_news_leaked_into_prompt": row["adverse_news_raw"],
                "secret_gcra_formula_leaked_into_prompt": row["gcra_rubric_secret"],
                "mitigation_applied": args.get("remediation_doc_id") == row["required_doc_id"]
            }
        }
    raise HTTPException(status_code=400, detail=f"Unknown MCP tool: {tool_name}")


@app.post("/mcp-restricted/tools/call")
async def handle_restricted_mcp_call(request: Request):
    body = await request.json()
    return JSONResponse(restricted_mcp_tool_call(body.get("tool_name", ""), body.get("arguments", {})))


def process_fincrime_a2a(task_id: str | None, data: Dict[str, Any], rpc_id: Any = None) -> Dict[str, Any]:
    task_id = task_id or f"a2a-task-{uuid.uuid4().hex[:6]}"
    if task_id not in A2A_TASK_STORE:
        A2A_TASK_STORE[task_id] = {"id": task_id, "context": {}}
    A2A_TASK_STORE[task_id]["context"].update(data)
    ctx = A2A_TASK_STORE[task_id]["context"]
    row = get_client_row(ctx.get("client_id", CLIENT_ID))

    if not ctx.get("remediation_doc_id") or ctx["remediation_doc_id"] != row["required_doc_id"]:
        return {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {
                "id": task_id,
                "status": {
                    "state": "input-required",
                    "message": "FinCrime review is paused until the requested certified audit document is received.",
                    "required_fields": ["remediation_doc_id"]
                },
                "internal_mcp_used_privately": "FinCrime checked its private policy data; source rules remain inside the FinCrime boundary."
            }
        }

    gcra_artifact = {
        "certificate_id": f"GCRA-{uuid.uuid4().hex[:6].upper()}",
        "task_id": task_id,
        "client_id": row["client_id"],
        "remediation_doc_id": row["required_doc_id"],
        "stage_3_validation": "ACCEPTED_AS_PER_POLICY",
        "stage_5_hit_mitigation": "MITIGATED_INSIDE_FINCRIME_SILO",
        "stage_5_adverse_news_summary": "CLEAN_PASS (Raw intelligence redacted per Anti-Tipping-Off policy)",
        "final_gcra_rating": "LOW-MEDIUM (APPROVED)",
        "issued_by_agent": "Silo-2-FinCrime-Agent",
        "timestamp_utc": datetime.now(timezone.utc).isoformat()
    }
    gcra_artifact["fincrime_jws_signature"] = sign_jws(gcra_artifact)
    return {
        "jsonrpc": "2.0",
        "id": rpc_id,
        "result": {
            "id": task_id,
            "status": {"state": "completed"},
            "artifact": gcra_artifact,
            "internal_mcp_used_privately": (
                "FinCrime used its private screening data, applied the supplied audit document, "
                "and sent only a signed risk certificate across the A2A boundary."
            )
        }
    }


# ============================================================================
# ARCHITECTURE B ENDPOINTS: A2A PROTOCOL + PRIVATE INTERNAL MCP
# Why this succeeds: Silo 2 (FinCrime Agent) runs its OWN internal MCP + LLM
# behind a firewall. Front-Office LangGraph NEVER sees raw FinCrime rows.
# ============================================================================
@app.get("/a2a/fincrime/.well-known/agent-card.json")
async def get_fincrime_card():
    card = {
        "protocolVersion": "1.0.0",
        "name": "FinCrime & Policy Validation Agent (Silo 2)",
        "url": "http://localhost:8002/a2a/fincrime",
        "skills": [{"id": "kyc_policy_and_gcra", "name": "Stage 3 Policy & Stage 5 GCRA Screening"}]
    }
    card["jwsSignature"] = sign_jws(card)
    return JSONResponse(content=card, media_type="application/a2a+json")


@app.post("/a2a/fincrime")
async def handle_fincrime_a2a(request: Request):
    body = await request.json()
    params = body.get("params", {})
    msg = params.get("message", {})
    data = msg.get("parts", [{}])[0].get("data", {})
    return JSONResponse(process_fincrime_a2a(msg.get("taskId"), data, body.get("id")))


def create_qa_certificate(gcra_artifact: Dict[str, Any], profile_id: str) -> Dict[str, Any]:
    unsigned_artifact = dict(gcra_artifact)
    signature = unsigned_artifact.pop("fincrime_jws_signature", "")
    valid_fincrime_signature = bool(signature) and hmac.compare_digest(signature, sign_jws(unsigned_artifact))
    document_verified = unsigned_artifact.get("remediation_doc_id") == REMEDIATION_DOC_ID
    system_verified = unsigned_artifact.get("client_id") == CLIENT_ID and profile_id == KYC_PROFILE_ID
    verdict = "PASSED" if valid_fincrime_signature and document_verified and system_verified else "FAILED"
    qa_cert = {
        "qa_certificate_id": f"4EYE-{uuid.uuid4().hex[:6].upper()}",
        "document_check": "VERIFIED" if document_verified else "FAILED",
        "system_check": "VERIFIED" if system_verified else "FAILED",
        "independent_agent_signatures_verified": valid_fincrime_signature,
        "four_eye_audit_verdict": f"{verdict} (Independent document, profile, and signature checks)",
        "issued_by_agent": "Silo-3-Independent-QA-Agent"
    }
    qa_cert["qa_jws_signature"] = sign_jws(qa_cert)
    return qa_cert


@app.post("/a2a/qa-four-eye")
async def handle_qa_a2a(request: Request):
    body = await request.json()
    data = body.get("params", {}).get("data", {})
    qa_cert = create_qa_certificate(data.get("gcra_artifact", {}), data.get("profile_id", ""))
    return JSONResponse({"jsonrpc": "2.0", "result": {"status": "completed", "artifact": qa_cert}})


@app.get("/api/demo")
async def get_demo():
    return get_demo_snapshot()


@app.post("/api/demo/reset")
async def reset_demo():
    global DEMO_STATE
    DEMO_STATE = new_demo_state()
    A2A_TASK_STORE.clear()
    return get_demo_snapshot()


@app.post("/api/demo/stages/{stage_id}")
async def run_demo_stage(stage_id: str):
    current_stage = DEMO_STATE["current_stage"]
    if current_stage >= len(DEMO_STAGES):
        raise HTTPException(status_code=409, detail="The demo is complete. Reset it to run again.")
    stage = DEMO_STAGES[current_stage]
    if stage_id != stage["id"]:
        raise HTTPException(status_code=409, detail="Complete the current KYC step before moving on.")

    if stage_id == "intake":
        baseline_result = {
            "status": "Application received",
            "summary": "Incorporation and director documents are in the shared LangGraph workflow; profile KYC-99201 is created.",
            "detail": "The demo starts with the same base application in both designs."
        }
        a2a_result = {
            "status": "Application received",
            "summary": "The onboarding agent has the application documents and creates profile KYC-99201.",
            "detail": "The FinCrime agent has not received the underlying onboarding file."
        }
    elif stage_id == "policy":
        mcp_response = restricted_mcp_tool_call(
            "mcp_check_policy_requirements",
            {"client_id": CLIENT_ID},
        )
        a2a_response = process_fincrime_a2a(None, {"client_id": CLIENT_ID})
        a2a_result_data = a2a_response["result"]
        DEMO_STATE["task_id"] = a2a_result_data["id"]
        baseline_result = {
            "status": "More information needed",
            "summary": f"The shared workflow receives the required document ID: {mcp_response['returned_to_langgraph_state']['missing_doc']}.",
            "detail": f"The policy rule is returned to the calling agent's shared context: {mcp_response['returned_to_langgraph_state']['policy_rule_exposed']}"
        }
        a2a_result = {
            "status": "Review paused",
            "summary": "The FinCrime agent asks for a certified vessel-charter audit and pauses the task.",
            "detail": "A2A carries the task state and request; the underlying policy rule stays inside the FinCrime service.",
            "task_id": a2a_result_data["id"]
        }
    elif stage_id == "outreach":
        baseline_result = {
            "status": "Document collected",
            "summary": f"{REMEDIATION_DOC_ID} is added to the shared workflow and the KYC profile is updated.",
            "detail": "The shared agent manages this follow-up in its local workflow state."
        }
        a2a_result = {
            "status": "Document collected",
            "summary": f"{REMEDIATION_DOC_ID} is added to profile KYC-99201.",
            "detail": "The FinCrime task remains paused and can be resumed with the requested document.",
            "task_id": DEMO_STATE["task_id"]
        }
    elif stage_id == "screening":
        mcp_response = restricted_mcp_tool_call(
            "mcp_fetch_screening_data_for_gcra",
            {"client_id": CLIENT_ID, "remediation_doc_id": REMEDIATION_DOC_ID},
        )
        baseline_payload = mcp_response["returned_to_langgraph_state"]
        a2a_response = process_fincrime_a2a(
            DEMO_STATE["task_id"],
            {"remediation_doc_id": REMEDIATION_DOC_ID},
        )
        a2a_result_data = a2a_response["result"]
        if a2a_result_data["status"]["state"] != "completed":
            raise HTTPException(status_code=409, detail="FinCrime could not complete its review with the supplied document.")
        DEMO_STATE["gcra_artifact"] = a2a_result_data["artifact"]
        baseline_result = {
            "status": "Risk review completed",
            "summary": "The single-agent workflow receives the raw adverse-news text and the scoring formula in its shared context.",
            "detail": baseline_payload["raw_adverse_news_leaked_into_prompt"],
            "exposure": baseline_payload["secret_gcra_formula_leaked_into_prompt"]
        }
        a2a_result = {
            "status": a2a_result_data["artifact"]["final_gcra_rating"],
            "summary": "FinCrime completes the review inside its boundary and returns a signed risk certificate.",
            "detail": a2a_result_data["artifact"]["stage_5_adverse_news_summary"],
            "artifact": a2a_result_data["artifact"],
            "task_id": a2a_result_data["id"]
        }
    else:
        baseline_result = {
            "status": "Self-review limitation",
            "summary": "The same shared workflow is asked to audit work it performed itself.",
            "detail": "This demo treats the check as lacking independent separation of duties."
        }
        qa_certificate = create_qa_certificate(DEMO_STATE.get("gcra_artifact", {}), KYC_PROFILE_ID)
        DEMO_STATE["qa_artifact"] = qa_certificate
        a2a_result = {
            "status": qa_certificate["four_eye_audit_verdict"],
            "summary": "A separate QA agent verifies the FinCrime certificate signature and records its checks.",
            "detail": "A2A carries the signed result between agents; the independent service verifies it before reporting a pass.",
            "artifact": qa_certificate
        }

    DEMO_STATE["results"][stage_id] = {
        "baseline": baseline_result,
        "a2a": a2a_result,
    }
    DEMO_STATE["current_stage"] += 1
    return get_demo_snapshot()


if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="frontend-assets")


@app.get("/", include_in_schema=False)
async def frontend():
    index_file = FRONTEND_DIST / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)
    return HTMLResponse(
        "<h1>KYC demo frontend is not built yet</h1>"
        "<p>Run <code>cd frontend; npm install; npm run build</code>, "
        "or run <code>npm run dev</code> in the frontend folder.</p>"
    )


if __name__ == "__main__":
    console.rule("[bold green]Comparative KYC Backend Running on http://localhost:8002")
    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="warning")