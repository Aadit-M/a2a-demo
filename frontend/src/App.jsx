import { useEffect, useMemo, useState } from "react";

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || `Request failed (${response.status})`);
  }
  return data;
}

function Mark({ children, tone = "neutral" }) {
  return <span className={`mark mark-${tone}`}>{children}</span>;
}

function StepCard({ stage, index, active }) {
  return (
    <div className={`step-card ${stage.state} ${active ? "step-active" : ""}`}>
      <div className="step-marker">
        {stage.state === "complete" ? <span aria-label="complete">✓</span> : index + 1}
      </div>
      <div className="step-copy">
        <span className="step-eyebrow">{stage.eyebrow}</span>
        <span className="step-title">{stage.title}</span>
      </div>
    </div>
  );
}

function ArchitectureCard({ kind, title, subtitle, result }) {
  const isA2A = kind === "a2a";
  return (
    <article className={`architecture-card ${isA2A ? "architecture-a2a" : "architecture-shared"}`}>
      <div className="architecture-heading">
        <div className="architecture-icon">{isA2A ? "A" : "L"}</div>
        <div>
          <div className="architecture-kicker">{isA2A ? "SEPARATE AGENTS" : "SHARED WORKFLOW"}</div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <Mark tone={isA2A ? "green" : "slate"}>{isA2A ? "A2A + MCP" : "LangGraph + MCP"}</Mark>
      </div>

      <div className="architecture-body">
        {result ? (
          <>
            <div className="result-status">{result.status}</div>
            <p className="result-summary">{result.summary}</p>
            {result.detail && (
              <div className={`evidence ${result.exposure ? "evidence-alert" : ""}`}>
                <span className="evidence-label">
                  {result.exposure ? "SHARED CONTEXT" : isA2A ? "WHAT CROSSED THE BOUNDARY" : "WORKFLOW NOTE"}
                </span>
                <p>{result.detail}</p>
              </div>
            )}
            {result.exposure && (
              <div className="evidence evidence-alert">
                <span className="evidence-label">SCORING DETAIL ALSO RETURNED</span>
                <p>{result.exposure}</p>
              </div>
            )}
            {result.task_id && (
              <div className="task-id">
                <span>Resumable task</span>
                <code>{result.task_id}</code>
              </div>
            )}
            {result.artifact && (
              <details className="artifact">
                <summary>View signed result</summary>
                <pre>{JSON.stringify(result.artifact, null, 2)}</pre>
              </details>
            )}
          </>
        ) : (
          <div className="waiting">
            <span className="waiting-dot" />
            <div>
              <strong>Waiting for this step</strong>
              <p>Run the current step to see what each design shares and keeps private.</p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

const comparisonFlow = [
  { title: "Collect file", owner: "Onboarding", tool: "Local MCP", silo: "onboarding" },
  { title: "Check policy", owner: "FinCrime", tool: "Private MCP", silo: "fincrime" },
  { title: "Request document", owner: "Onboarding", tool: "Local MCP", silo: "onboarding" },
  { title: "Screen & certify", owner: "FinCrime", tool: "Private MCP", silo: "fincrime" },
  { title: "Verify result", owner: "Independent QA", tool: "Signature check", silo: "qa" },
];

const serviceBoundaries = [
  {
    id: "onboarding",
    title: "Onboarding",
    agent: "Onboarding agent",
    tools: "CRM & document MCP",
    stageIndexes: [0, 2],
    note: "Customer file and profile stay here",
  },
  {
    id: "fincrime",
    title: "FinCrime",
    agent: "FinCrime agent",
    tools: "Private watchlist MCP",
    stageIndexes: [1, 3],
    note: "Screening data and policy stay here",
  },
  {
    id: "qa",
    title: "Independent QA",
    agent: "QA agent",
    tools: "Certificate verification",
    stageIndexes: [4],
    note: "Checks the result independently",
  },
];

function FlowStep({ step, index, state }) {
  return (
    <div className={`service-stage ${state}`}>
      <span className="service-stage-number">{state === "complete" ? "✓" : index + 1}</span>
      <span className="service-stage-copy">
        <strong>{step.title}</strong>
        <small>{state === "active" ? "CURRENT STEP" : step.tool}</small>
      </span>
      <span className="service-stage-state">{state === "complete" ? "DONE" : state === "active" ? "NOW" : ""}</span>
    </div>
  );
}

function FlowTrack({ completedCount, a2a = false }) {
  const activeIndex = Math.min(completedCount, comparisonFlow.length - 1);
  if (a2a) {
    return (
      <div className="service-map">
        <div className="service-boundary-grid">
          {serviceBoundaries.map((service) => (
            <article className={`service-boundary service-${service.id}`} key={service.id}>
              <div className="service-boundary-label"><span /> SERVICE BOUNDARY</div>
              <div className="service-title">
                <span className={`service-logo logo-${service.id}`}>{service.id === "onboarding" ? "O" : service.id === "fincrime" ? "F" : "Q"}</span>
                <div><h4>{service.title}</h4><small>{service.agent}</small></div>
              </div>
              <div className="service-tools"><span className="service-tool-icon">⌘</span>{service.tools}</div>
              <div className="service-stages">
                {service.stageIndexes.map((index) => {
                  const step = comparisonFlow[index];
                  const state = index < completedCount ? "complete" : index === activeIndex ? "active" : "upcoming";
                  return <FlowStep key={step.title} step={step} index={index} state={state} />;
                })}
              </div>
              <div className="service-private-note"><span className="lock-symbol">●</span>{service.note}</div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flow-track flow-track-shared">
      {comparisonFlow.map((step, index) => {
        const state = index < completedCount ? "complete" : index === activeIndex ? "active" : "upcoming";
        return (
          <div className="flow-segment" key={step.title}>
            <div className={`flow-step ${state}`}>
              <span className="flow-number">{state === "complete" ? "✓" : index + 1}</span>
              <strong>{step.title}</strong>
              <span className="flow-tool">Workflow step</span>
            </div>
            {index < comparisonFlow.length - 1 && (
              <div className="flow-connector">
                <span />
                <i aria-hidden="true">→</i>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ComparisonDiagram({ completedCount }) {
  return (
    <section className="comparison-diagram" aria-label="Visual comparison of the two KYC architectures">
      <div className="diagram-heading">
        <div>
          <div className="eyebrow">THE SAME KYC JOURNEY</div>
          <h3>Follow the work—and where it travels</h3>
        </div>
        <div className="diagram-legend">
          <span><i className="legend-active" /> Current step</span>
          <span><i className="legend-boundary" /> Service boundary</span>
          <span><i className="legend-arrow">→</i> A2A handoff</span>
        </div>
      </div>

      <div className="diagram-lane lane-shared">
        <div className="lane-heading">
          <span className="lane-icon lane-icon-shared">L</span>
          <div><strong>Shared workflow</strong><small>One orchestrator carries the workflow state</small></div>
          <Mark tone="slate">LangGraph + MCP</Mark>
        </div>
        <div className="shared-boundary">
          <div className="boundary-caption">ONE SHARED ORCHESTRATION BOUNDARY</div>
          <FlowTrack completedCount={completedCount} />
          <div className="mcp-caption"><span>MCP tools & data</span> Tool results can be returned into this workflow’s state.</div>
        </div>
      </div>

      <div className="diagram-lane lane-a2a">
        <div className="lane-heading">
          <span className="lane-icon lane-icon-a2a">A</span>
          <div><strong>Separate agent services</strong><small>Three independently owned services, each with its own agent and tools</small></div>
          <Mark tone="green">A2A + local MCP</Mark>
        </div>
        <FlowTrack completedCount={completedCount} a2a />
      </div>
      <p className="diagram-note">The highlight follows the walkthrough. This illustrates the architecture pattern; the demo itself runs in one local backend.</p>
    </section>
  );
}

const architectureBenefits = [
  {
    number: "01",
    title: "Keep team data in its own boundary",
    tag: "DATA BOUNDARIES",
    body: "A shared LangGraph can make shared state and orchestration convenient, but that also means the orchestrator may handle information from multiple steps. Separate agent services create a clearer place to enforce departmental access boundaries.",
    example: "In this demo, FinCrime returns a risk result rather than sending its raw screening notes to the onboarding workflow.",
    caveat: "A2A does not automatically create zero trust or encrypt messages. Service isolation, least-privilege access, authenticated connections, and careful payload design still matter.",
  },
  {
    number: "02",
    title: "Let teams choose their agent stack",
    tag: "INTEROPERABILITY",
    body: "LangGraph is useful inside an agent service. A2A gives independently operated agents a common way to describe and exchange work, so departments do not have to share one orchestration graph or framework.",
    example: "The onboarding team can keep its own workflow while a separate FinCrime service accepts a review task and returns a result.",
    caveat: "A standard makes integration easier, not automatic: teams still need compatible capabilities, message formats, versions, and operational agreements.",
  },
  {
    number: "03",
    title: "Make handoffs easier to verify",
    tag: "IDENTITY & AUDIT",
    body: "A task ID and a clearly scoped result make it easier to follow who handled a review. Agent descriptions and signed results can add useful evidence when connected to real identity and key-management systems.",
    example: "The final KYC step asks a separate QA service to verify the FinCrime result before marking its review complete.",
    caveat: "A2A does not automatically authenticate every agent or sign every artifact. This demo uses a shared-secret HMAC for illustration; production needs protected keys, trusted identity, authorization, and independent verification.",
  },
];

function ArchitecturePrimer() {
  return (
    <section className="primer">
      <div className="primer-heading">
        <div>
          <div className="eyebrow">THE IDEAS BEHIND THE DEMO</div>
          <h2>Why separate agents can help</h2>
        </div>
        <p>These are architectural options and trade-offs, not security guarantees supplied by a protocol.</p>
      </div>

      <div className="benefit-grid">
        {architectureBenefits.map((benefit) => (
          <article className="benefit-card" key={benefit.number}>
            <div className="benefit-top">
              <span className="benefit-number">{benefit.number}</span>
              <span className="benefit-tag">{benefit.tag}</span>
            </div>
            <h3>{benefit.title}</h3>
            <p>{benefit.body}</p>
            <div className="benefit-example">
              <span>IN THIS KYC FLOW</span>
              <p>{benefit.example}</p>
            </div>
            <div className="benefit-caveat">
              <span>IMPORTANT</span>
              <p>{benefit.caveat}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="stack-guide">
        <div className="stack-guide-heading">
          <div className="eyebrow">THEY WORK AT DIFFERENT LAYERS</div>
          <h2>Use the right tool for each job</h2>
          <p>You do not have to choose one and discard the others.</p>
        </div>
        <div className="stack-flow">
          <article className="stack-item">
            <div className="stack-icon stack-brain">LG</div>
            <div>
              <span className="stack-role">THE BRAIN</span>
              <h3>LangGraph</h3>
              <p>Coordinates reasoning and multi-step work <strong>inside one agent service</strong>.</p>
            </div>
          </article>
          <div className="stack-arrow" aria-hidden="true">+</div>
          <article className="stack-item">
            <div className="stack-icon stack-hands">M</div>
            <div>
              <span className="stack-role">THE HANDS</span>
              <h3>MCP</h3>
              <p>Connects an agent to tools and data it is permitted to use <strong>within its environment</strong>.</p>
            </div>
          </article>
          <div className="stack-arrow" aria-hidden="true">+</div>
          <article className="stack-item">
            <div className="stack-icon stack-phone">A</div>
            <div>
              <span className="stack-role">THE HANDOFF</span>
              <h3>A2A</h3>
              <p>Lets one agent request work from <strong>another agent service</strong> and receive its response.</p>
            </div>
          </article>
        </div>
        <div className="stack-caption">
          <span>ONE DEPARTMENT</span>
          <span>ITS OWN TOOLS & DATA</span>
          <span>BETWEEN DEPARTMENTS</span>
        </div>
        <div className="demo-limit">
          <strong>Demo scope:</strong> The separate agent roles are illustrated by this local backend; they are not deployed as isolated services. The example signature uses a shared demo secret.
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [demo, setDemo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState("demo");

  useEffect(() => {
    request("/api/demo")
      .then(setDemo)
      .catch((cause) => setError(`Could not connect to the demo backend: ${cause.message}`));
  }, []);

  const currentStage = demo?.stages[demo.current_stage] ?? null;
  const visibleStage = demo
    ? demo.stages[Math.max(0, Math.min(demo.current_stage - 1, demo.stages.length - 1))]
    : null;
  const currentResult = useMemo(
    () => (visibleStage ? demo?.results[visibleStage.id] : null),
    [visibleStage, demo],
  );
  const completedCount = demo?.current_stage ?? 0;
  const progress = demo ? (completedCount / demo.stages.length) * 100 : 0;

  async function runCurrentStep() {
    if (!currentStage) return;
    setBusy(true);
    setError("");
    try {
      setDemo(await request(`/api/demo/stages/${currentStage.id}`, { method: "POST" }));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetDemo() {
    setBusy(true);
    setError("");
    try {
      setDemo(await request("/api/demo/reset", { method: "POST" }));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (!demo && !error) {
    return (
      <main className="loading-screen">
        <span className="loading-spinner" />
        <p>Connecting to the KYC demo…</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="KYC Workflow Lab home">
          <span className="brand-mark">K</span>
          <span>KYC WORKFLOW LAB</span>
        </a>
        <nav className="top-nav" aria-label="Main navigation">
          <button
            className={`top-nav-link ${activePage === "demo" ? "active" : ""}`}
            type="button"
            aria-current={activePage === "demo" ? "page" : undefined}
            onClick={() => setActivePage("demo")}
          >
            KYC Demo
          </button>
          <button
            className={`top-nav-link ${activePage === "guide" ? "active" : ""}`}
            type="button"
            aria-current={activePage === "guide" ? "page" : undefined}
            onClick={() => setActivePage("guide")}
          >
            Architecture Guide
          </button>
        </nav>
        <div className="topbar-right">
          <span className="demo-label"><span /> INTERACTIVE DEMO</span>
          {activePage === "demo" && (
            <button className="reset-button" type="button" onClick={resetDemo} disabled={busy || !demo}>
              <span aria-hidden="true">↻</span> Start over
            </button>
          )}
        </div>
      </header>

      <main className="page-content">
        {activePage === "demo" ? (
          <>
            <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> A GUIDED ARCHITECTURE WALKTHROUGH</div>
            <h1>One KYC file.<br /><span>Two ways to work.</span></h1>
            <p className="hero-description">
              Follow a customer file from intake to independent review. See how a shared agent workflow
              compares with separate agents exchanging tasks and signed results.
            </p>
          </div>
          <aside className="client-card">
            <div className="client-card-top"><span>DEMO CUSTOMER</span><Mark tone="blue">IN REVIEW</Mark></div>
            <h2>Meridian Global Logistics</h2>
            <div className="client-meta">
              <span><small>CASE</small><strong>KYC-99201</strong></span>
              <span><small>CLIENT ID</small><strong>CLT-88412</strong></span>
            </div>
            <div className="client-file"><span className="file-icon">▤</span><span>Company & director documents</span><Mark tone="green">READY</Mark></div>
          </aside>
            </section>

        <section className="walkthrough">
          <div className="section-heading">
            <div>
              <div className="eyebrow">THE KYC JOURNEY</div>
              <h2>Five clear steps, in order</h2>
            </div>
            <div className="progress-copy">{completedCount} <span>of {demo.stages.length} steps complete</span></div>
          </div>

          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="step-list">
            {demo.stages.map((stage, index) => (
              <StepCard key={stage.id} stage={stage} index={index} active={stage.state === "current"} />
            ))}
          </div>

          {error && <div className="error-banner" role="alert"><strong>Something went wrong.</strong> {error}</div>}

          {currentStage ? (
            <div className="current-step-panel">
              <div className="current-step-copy">
                <div className="eyebrow">{currentStage.eyebrow}</div>
                <h3>{currentStage.title}</h3>
                <p>{currentStage.description}</p>
                <div className="why-note"><span>WHY THIS STEP MATTERS</span>{currentStage.why}</div>
              </div>
              <button className="run-button" type="button" onClick={runCurrentStep} disabled={busy}>
                {busy ? "Running step…" : <>Run this step <span aria-hidden="true">→</span></>}
              </button>
            </div>
          ) : (
            <div className="complete-banner">
              <span className="complete-icon">✓</span>
              <div><strong>Walkthrough complete</strong><p>The same KYC case has reached an independent review in both designs.</p></div>
              <button className="text-button" type="button" onClick={resetDemo} disabled={busy}>Run it again</button>
            </div>
          )}
            </section>

        <section className="comparison">
          <div className="comparison-heading">
            <div>
              <div className="eyebrow">WHAT EACH DESIGN DOES</div>
              <h2>Same work. Different boundaries.</h2>
            </div>
            <p>Run each step to reveal what that design shares, returns, or keeps inside its own service.</p>
          </div>
          {visibleStage && currentResult && (
            <div className="latest-stage-label">LATEST RESULT <span>{visibleStage.title}</span></div>
          )}
          <ComparisonDiagram completedCount={completedCount} />
          <div className="architecture-grid">
            <ArchitectureCard
              kind="shared"
              title="Shared agent workflow"
              subtitle="LangGraph orchestrates steps; MCP provides tools and data."
              result={currentResult?.baseline}
            />
            <ArchitectureCard
              kind="a2a"
              title="Agents working together"
              subtitle="Separate agent services can keep MCP tools and sensitive data within their own boundaries."
              result={currentResult?.a2a}
            />
          </div>
          <div className="takeaway">
            <div className="takeaway-icon">↗</div>
            <div><strong>What to take away</strong><p>A2A can make agent-to-agent handoffs and resumable tasks explicit. The security benefit comes from how teams configure boundaries, access, and verification—not from a protocol alone. LangGraph and MCP can also be used securely with the right controls.</p></div>
          </div>
            </section>
          </>
        ) : (
          <>
            <section className="guide-hero">
              <div className="eyebrow"><span className="eyebrow-line" /> A SHORT GUIDE TO THE ARCHITECTURE</div>
              <h1>One system doesn’t<br /><span>have to do it all.</span></h1>
              <p>
                Keep each team’s agent and tools in its own service. Use A2A to request work across
                boundaries, and return only the information the other team needs.
              </p>
            </section>
            <ArchitecturePrimer />
          </>
        )}

        <footer className="footer">
          <span>{activePage === "demo" ? "Architecture demo · Illustrative workflow and sample data" : "Architecture guide · Illustrative design patterns"}</span>
          <span>Controls and trust boundaries matter in either design.</span>
        </footer>
      </main>
    </div>
  );
}
