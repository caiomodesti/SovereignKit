import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CircleDot,
  Database,
  FlaskConical,
  GitBranch,
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
      <h1>Carregando evidências</h1>
      <p>Validando o dataset local e sua proveniência.</p>
    </main>
  );
}

function ErrorState({ message, retry }: { readonly message: string; readonly retry: () => void }) {
  return (
    <main className="state-page" role="alert">
      <AlertTriangle aria-hidden="true" size={32} />
      <h1>Evidência indisponível</h1>
      <p>{message}</p>
      <button className="button" type="button" onClick={retry}><RefreshCw aria-hidden="true" size={16} />Tentar novamente</button>
    </main>
  );
}

export function App({ loader = loadDashboardData, now = new Date() }: AppProps) {
  const [data, setData] = useState<DashboardDataset>();
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const [scenarioId, setScenarioId] = useState<Scenario["id"]>("asymmetric");

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

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="SovereignKit Observatory">
          <span className="brand__mark"><ShieldCheck aria-hidden="true" size={19} /></span>
          <span><strong>SovereignKit</strong><small>Evidence console</small></span>
        </a>
        <nav aria-label="Seções do dashboard">
          <a href="#overview"><Activity aria-hidden="true" size={17} />Overview</a>
          <a href="#routes"><Route aria-hidden="true" size={17} />Routes & classes</a>
          <a href="#incidents"><AlertTriangle aria-hidden="true" size={17} />Incidents</a>
          <a href="#failover"><GitBranch aria-hidden="true" size={17} />Failover</a>
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
            <p className="eyebrow">Observatory / Sprint 8</p>
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
            <span className="source-time">Generated {new Date(data.evidenceGeneratedAt).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</span>
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
                <caption className="sr-only">Classificação e taxa de sucesso por rota</caption>
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
              <div><dt>Generated</dt><dd>{new Date(data.feed.generatedAt).toLocaleString("pt-BR")}</dd></div>
              <div><dt>Expired</dt><dd>{new Date(data.feed.expiresAt).toLocaleString("pt-BR")}</dd></div>
              <div><dt>Route/class entries</dt><dd>{data.feed.routeIntelligence.length}</dd></div>
              <div><dt>SDK disposition</dt><dd><code>{data.feed.dispositionAfterOneSnapshot}</code></dd></div>
            </dl>
            <div className="notice notice--neutral"><ShieldCheck aria-hidden="true" size={18} /><p>Stale or unavailable intelligence fails open to the local primary/fallback policy.</p></div>
          </div>
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
