import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CircleDot,
  Database,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Play,
  RefreshCw,
  Route,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { evaluateFeedHealth, loadDashboardData } from "./data";
import type { Classification, DashboardDataset, Scenario } from "./types";

interface AppProps {
  readonly loader?: () => Promise<DashboardDataset>;
  readonly now?: Date;
}

const scenarioLabels: Record<Scenario["id"], string> = {
  healthy: "Healthy",
  degraded: "General degradation",
  asymmetric: "Asymmetric",
  insufficient_data: "Insufficient data",
};

const replayScenarioIds = ["healthy", "degraded", "asymmetric"] as const;

const replayCopy: Record<(typeof replayScenarioIds)[number], { readonly title: string; readonly question: string; readonly finding: string }> = {
  healthy: {
    title: "Establish the baseline",
    question: "Can matched classes land through every logical route?",
    finding: "All routes remain HEALTHY; the two declared classes move together.",
  },
  degraded: {
    title: "Introduce broad degradation",
    question: "Can the policy avoid mistaking a general route failure for asymmetry?",
    finding: "Both classes degrade together on route-a, producing DEGRADED—not ASYMMETRIC.",
  },
  asymmetric: {
    title: "Introduce selective rejection",
    question: "Can matched probes reveal a reproducible class-selective difference?",
    finding: "route-a keeps the control while PROGRAM_X falls away, producing ASYMMETRIC.",
  },
};

function StatusBadge({ value }: { readonly value: Classification | "FRESH" | "STALE" | "INVALID" | "CONFIRMED" }) {
  return <span className={`status status--${value.toLowerCase()}`}><CircleDot aria-hidden="true" size={14} />{value.replaceAll("_", " ")}</span>;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function LoadingState() {
  return (
    <main className="state-page" aria-live="polite" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      <h1>Loading evidence</h1>
      <p>Validating the local dataset and its provenance.</p>
    </main>
  );
}

function ErrorState({ message, retry }: { readonly message: string; readonly retry: () => void }) {
  return (
    <main className="state-page" role="alert">
      <AlertTriangle aria-hidden="true" size={32} />
      <h1>Evidence unavailable</h1>
      <p>{message}</p>
      <button className="button" type="button" onClick={retry}><RefreshCw aria-hidden="true" size={16} />Try again</button>
    </main>
  );
}

export function App({ loader = loadDashboardData, now = new Date() }: AppProps) {
  const [data, setData] = useState<DashboardDataset>();
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const [scenarioId, setScenarioId] = useState<Scenario["id"]>("healthy");
  const [replayIndex, setReplayIndex] = useState(0);

  useEffect(() => {
    let active = true;
    setError(undefined);
    setData(undefined);
    void loader().then(value => { if (active) setData(value); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "unknown evidence error");
    });
    return () => { active = false; };
  }, [loader, reloadKey]);

  const scenario = useMemo(() => data?.scenarios.find(value => value.id === scenarioId), [data, scenarioId]);
  if (error !== undefined) return <ErrorState message={error} retry={() => setReloadKey(value => value + 1)} />;
  if (data === undefined || scenario === undefined) return <LoadingState />;

  const feedHealth = evaluateFeedHealth(data.feed, now);
  const incidents = scenario.classifications
    .filter(item => item.classification !== "HEALTHY")
    .map(item => ({ scenario, classification: item }));
  const replayScenarioId = replayScenarioIds[replayIndex] ?? "healthy";
  const replayScenario = data.scenarios.find(value => value.id === replayScenarioId);
  if (replayScenario === undefined) return <ErrorState message="guided replay evidence is unavailable" retry={() => setReloadKey(value => value + 1)} />;
  const replayRoute = replayScenario.classifications.find(value => value.routeId === "route-a");
  if (replayRoute === undefined) return <ErrorState message="guided replay route evidence is unavailable" retry={() => setReloadKey(value => value + 1)} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="SovereignKit Observatory">
          <span className="brand__mark"><ShieldCheck aria-hidden="true" size={19} /></span>
          <span><strong>SovereignKit</strong><small>Evidence console</small></span>
        </a>
        <nav aria-label="Dashboard sections">
          <a href="#overview"><Activity aria-hidden="true" size={17} />Overview</a>
          <a href="#replay"><Play aria-hidden="true" size={17} />Guided replay</a>
          <a href="#routes"><Route aria-hidden="true" size={17} />Routes & classes</a>
          <a href="#incidents"><AlertTriangle aria-hidden="true" size={17} />Incidents</a>
          <a href="#failover"><GitBranch aria-hidden="true" size={17} />Failover</a>
          <a href="#devnet"><ExternalLink aria-hidden="true" size={17} />Devnet proof</a>
          <a href="#methodology"><BookOpen aria-hidden="true" size={17} />Methodology</a>
        </nav>
        <div className="sidebar__foot">
          <span>Controlled local evidence</span>
          <code>Agave {data.agaveVersion}</code>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Observatory / accepted v0.1 evidence</p>
            <h1>Transaction accessibility evidence</h1>
          </div>
          <div className="feed-indicator" title={`Snapshot expires at ${data.feed.expiresAt}`}>
            <span>Intelligence feed</span>
            <StatusBadge value={feedHealth} />
          </div>
        </header>

        <section id="overview" aria-labelledby="overview-title">
          <div className="section-heading">
            <div><p className="eyebrow">Accepted controlled run</p><h2 id="overview-title">Evidence overview</h2></div>
            <span className="source-time">Generated {new Date(data.evidenceGeneratedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
          <div className="metric-grid">
            <Metric icon={<FlaskConical />} label="Scenarios" value={data.overview.scenarioCount.toString()} detail="all required outcomes" />
            <Metric icon={<Route />} label="Logical routes" value={data.overview.routeCount.toString()} detail="not physical paths" />
            <Metric icon={<Users />} label="Allowlisted observers" value={data.overview.observerCount.toString()} detail="one authenticated observer" />
            <Metric icon={<Database />} label="Signed results" value={data.overview.signedResultCount.toLocaleString("pt-BR")} detail="retained statistical units" />
          </div>
          <div className="notice notice--warning">
            <AlertTriangle aria-hidden="true" size={19} />
            <div><strong>Logical redundancy, not infrastructure independence</strong><p>{data.observationLimitation}.</p></div>
          </div>
          <div className="observer-strip" aria-label="Observer authentication">
            <div className="observer-strip__icon"><Users aria-hidden="true" size={18} /></div>
            <div><span>Authenticated observer</span><strong>{data.observers[0]?.observerId ?? "Unavailable"}</strong></div>
            <div><span>Key identifier</span><code>{data.observers[0]?.keyId ?? "Unavailable"}</code></div>
            <div><span>Collector policy</span><strong>ALLOWLISTED</strong></div>
          </div>
        </section>

        <section id="replay" aria-labelledby="replay-title">
          <div className="section-heading">
            <div><p className="eyebrow">Three-step incident replay</p><h2 id="replay-title">See the distinction the experiment was built to prove</h2></div>
            <span className="count-pill">Step {replayIndex + 1} / {replayScenarioIds.length}</span>
          </div>
          <div className="replay-shell">
            <div className="replay-tabs" role="tablist" aria-label="Incident replay steps">
              {replayScenarioIds.map((id, index) => (
                <button
                  aria-controls="replay-panel"
                  aria-selected={replayIndex === index}
                  className={replayIndex === index ? "replay-tab replay-tab--active" : "replay-tab"}
                  key={id}
                  onClick={() => { setReplayIndex(index); setScenarioId(id); }}
                  role="tab"
                  type="button"
                >
                  <span>{index + 1}</span><strong>{id.toUpperCase()}</strong>
                </button>
              ))}
            </div>
            <article className="replay-panel" id="replay-panel" role="tabpanel">
              <div className="replay-panel__copy">
                <p className="eyebrow">{replayCopy[replayScenarioId].title}</p>
                <h3>{replayCopy[replayScenarioId].question}</h3>
                <p>{replayCopy[replayScenarioId].finding}</p>
                <div className="replay-result"><StatusBadge value={replayRoute.classification} /><span>{replayRoute.evidenceStrength} evidence</span></div>
              </div>
              <div className="replay-comparison" aria-label="route-a class comparison">
                <div><span>Matched control</span><strong>{formatPercent(replayRoute.controlSuccessRate)}</strong></div>
                <ArrowRight aria-hidden="true" size={20} />
                <div><span>Program X</span><strong>{formatPercent(replayRoute.testSuccessRate)}</strong></div>
                <div className="replay-gap"><span>Absolute class gap</span><strong>{formatPercent(replayRoute.absoluteClassGap)}</strong></div>
              </div>
            </article>
            <div className="replay-actions">
              <button className="button button--secondary" disabled={replayIndex === 0} onClick={() => { const next = Math.max(0, replayIndex - 1); setReplayIndex(next); setScenarioId(replayScenarioIds[next] ?? "healthy"); }} type="button">Previous</button>
              <button className="button" disabled={replayIndex === replayScenarioIds.length - 1} onClick={() => { const next = Math.min(replayScenarioIds.length - 1, replayIndex + 1); setReplayIndex(next); setScenarioId(replayScenarioIds[next] ?? "asymmetric"); }} type="button">Next finding<ArrowRight aria-hidden="true" size={16} /></button>
            </div>
          </div>
        </section>

        <section id="routes" aria-labelledby="routes-title">
          <div className="section-heading section-heading--control">
            <div><p className="eyebrow">Measured windows</p><h2 id="routes-title">Routes & transaction classes</h2></div>
            <label className="select-label">Scenario
              <select value={scenarioId} onChange={event => setScenarioId(event.target.value as Scenario["id"])}>
                {data.scenarios.map(value => <option key={value.id} value={value.id}>{scenarioLabels[value.id]}</option>)}
              </select>
            </label>
          </div>

          <div className="scenario-summary">
            <div><span>Selected outcome</span><StatusBadge value={scenario.label} /></div>
            <div><span>Signed results</span><strong>{scenario.signedResultCount}</strong></div>
            <div><span>RPC acknowledged</span><strong>{scenario.acknowledgedCount}</strong></div>
            <div><span>RPC rejected</span><strong>{scenario.rejectedCount}</strong></div>
          </div>

          <div className="table-card">
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Classification and success rate by route</caption>
                <thead><tr><th>Route</th><th>Classification</th><th>Matched control</th><th>Program X</th><th>Class gap</th><th>Evidence</th></tr></thead>
                <tbody>{scenario.classifications.map(item => (
                  <tr key={item.routeId}>
                    <td><code>{item.routeId}</code></td>
                    <td><StatusBadge value={item.classification} /></td>
                    <td>{formatPercent(item.controlSuccessRate)}</td>
                    <td>{formatPercent(item.testSuccessRate)}</td>
                    <td>{formatPercent(item.absoluteClassGap)}</td>
                    <td><span className="evidence-strength">{item.evidenceStrength}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="provenance"><span>Policy <code>{scenario.classifications.length > 0 ? "ClassificationPolicyV0Experimental" : "—"}</code></span><span>Input <code title={scenario.inputHash}>{shortHash(scenario.inputHash)}</code></span></div>
          </div>
        </section>

        <section id="incidents" aria-labelledby="incidents-title">
          <div className="section-heading"><div><p className="eyebrow">Controlled findings</p><h2 id="incidents-title">Incident ledger</h2></div><span className="count-pill">{incidents.length} findings</span></div>
          {incidents.length === 0 ? (
            <div className="empty-state"><Check aria-hidden="true" size={23} /><div><strong>No controlled findings</strong><p>The selected window contains only HEALTHY route classifications.</p></div></div>
          ) : <div className="incident-list">{incidents.map(({ scenario: source, classification }) => (
            <article className="incident" key={`${source.id}-${classification.routeId}`}>
              <div className="incident__rail" />
              <div className="incident__main">
                <div className="incident__title"><code>{classification.routeId}</code><StatusBadge value={classification.classification} /></div>
                <p>{classification.reasons.join("; ")}.</p>
                <span>Window <code>{source.definition.windowId}</code></span>
              </div>
              <div className="incident__rates"><span>Control<strong>{formatPercent(classification.controlSuccessRate)}</strong></span><ArrowRight aria-hidden="true" size={16} /><span>Program X<strong>{formatPercent(classification.testSuccessRate)}</strong></span></div>
            </article>
          ))}</div>}
        </section>

        <section id="failover" aria-labelledby="failover-title" className="split-grid">
          <div>
            <div className="section-heading"><div><p className="eyebrow">Reactive router proof</p><h2 id="failover-title">Confirmed failover</h2></div><StatusBadge value="CONFIRMED" /></div>
            <div className="flow-card">
              {data.failover.attempts.map((attempt, index) => (
                <div className="flow-step" key={attempt.routeId}>
                  <span className="flow-step__number">{attempt.attemptNumber}</span>
                  <div><code>{attempt.routeId}</code><strong>{attempt.submissionOutcome.replace("RPC_", "RPC ")}</strong>{attempt.observationState !== undefined && <small>Quorum: {attempt.observationState}</small>}</div>
                  {index < data.failover.attempts.length - 1 && <ArrowRight aria-hidden="true" className="flow-arrow" />}
                </div>
              ))}
            </div>
            <p className="fine-print">RPC acknowledgement is not landing evidence. Final confirmation was observed after <code>{data.failover.confirmationObservedAfterRouteId}</code>.</p>
          </div>

          <div className="feed-card">
            <div className="section-heading"><div><p className="eyebrow">Polling snapshot v{data.feed.version}</p><h2>Feed state</h2></div><StatusBadge value={feedHealth} /></div>
            <dl>
              <div><dt>Generated</dt><dd>{new Date(data.feed.generatedAt).toLocaleString("en-US")}</dd></div>
              <div><dt>Expired</dt><dd>{new Date(data.feed.expiresAt).toLocaleString("en-US")}</dd></div>
              <div><dt>Route/class entries</dt><dd>{data.feed.routeIntelligence.length}</dd></div>
              <div><dt>SDK disposition</dt><dd><code>{data.feed.dispositionAfterOneSnapshot}</code></dd></div>
            </dl>
            <div className="notice notice--neutral"><ShieldCheck aria-hidden="true" size={18} /><p>Stale or unavailable intelligence fails open to the local primary/fallback policy.</p></div>
          </div>
        </section>

        <section id="devnet" aria-labelledby="devnet-title">
          <div className="section-heading"><div><p className="eyebrow">Separate integration validation</p><h2 id="devnet-title">Real finalized Devnet transaction</h2></div><StatusBadge value="CONFIRMED" /></div>
          <div className="devnet-proof">
            <div>
              <span>Transaction signature</span>
              <code title={data.devnetProof.transactionSignature}>{shortHash(data.devnetProof.transactionSignature)}</code>
            </div>
            <div><span>Observed lifecycle</span><strong>{data.devnetProof.lifecycle.length} derived states</strong></div>
            <div><span>Observation quorum</span><strong>{data.devnetProof.quorum.required} / {data.devnetProof.quorum.logicalReaderCount}</strong></div>
            <a className="button" href={data.devnetProof.explorerUrl} rel="noreferrer" target="_blank">Open in Solana Explorer<ExternalLink aria-hidden="true" size={15} /></a>
          </div>
          <p className="fine-print">{data.devnetProof.scope}. Reader endpoints in this run did not establish operational independence.</p>
        </section>

        <section id="methodology" aria-labelledby="method-title">
          <div className="section-heading"><div><p className="eyebrow">Scope before claims</p><h2 id="method-title">Methodology & limits</h2></div></div>
          <div className="method-grid">
            <Method title="What is measured" items={["Logical JSON-RPC responses", "2/3 reader observation quorum", "Matched class success inside explicit windows"]} />
            <Method title="What is inferred" items={["Classification under an experimental policy", "Behavior consistent with controlled degradation", "Confirmed restoration for one failover transaction"]} />
            <Method title="What is not proven" items={["Provider intent or censorship", "Physical route or backend identity", "Transferability to Devnet or Mainnet"]} />
          </div>
          <details className="provenance-details"><summary>Dataset provenance ({data.sourceFiles.length} files)</summary><ul>{data.sourceFiles.map(file => <li key={file}><code>{file}</code></li>)}</ul></details>
        </section>

        <footer><span>SovereignKit v0.1 · controlled local evidence only</span><span>Program <code title={data.programAddress}>{shortHash(data.programAddress)}</code></span></footer>
      </main>
    </div>
  );
}

function Metric({ icon, label, value, detail }: { readonly icon: React.ReactNode; readonly label: string; readonly value: string; readonly detail: string }) {
  return <article className="metric"><span className="metric__icon" aria-hidden="true">{icon}</span><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Method({ title, items }: { readonly title: string; readonly items: readonly string[] }) {
  return <article className="method"><h3>{title}</h3><ul>{items.map(item => <li key={item}><Check aria-hidden="true" size={15} />{item}</li>)}</ul></article>;
}
