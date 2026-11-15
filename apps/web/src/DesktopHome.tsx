import SiteHeader from "./SiteHeader";
import "./desktop-home.css";

const workspaces = [
  { href: "/studio", index: "01", name: "Quantum Computing", detail: "Build, transpile and inspect executable circuits." },
  { href: "/1000-plus", index: "02", name: "1000+ Qubit Research", detail: "Bounded large-circuit simulation and scientific diagnostics." },
  { href: "/lab", index: "03", name: "Quantum Lab Twin", detail: "Explore models and guided lab exercises." },
  { href: "/sensing", index: "04", name: "Sensing & Metrology", detail: "Explore quantum sensing equations and plots." },
  { href: "/communication", index: "05", name: "Quantum Communication", detail: "Run BB84 and optical-link explorations." }
];

export default function DesktopHome() {
  return <div className="d25-desktop">
    <SiteHeader />
    <main className="d25-shell">
      <section className="d25-hero" aria-labelledby="d25-title">
        <div className="d25-eyebrow"><span className="d25-live-dot" /> DEVASHRI S INDUSTRIES / DESKTOP EDITION</div>
        <h1 id="d25-title">D25 <em>Quantum</em><br />Workspace</h1>
        <p className="d25-lead">A local-first scientific computing environment. Quantum simulation runs on your Windows PC; Firebase and Cloudflare are used only for sign-in and licensing.</p>
        <div className="d25-primary-actions"><a className="d25-open" href="/studio">Open Quantum Studio <span aria-hidden="true">↗</span></a><a className="d25-secondary" href="/1000-plus">Enter 1000+ Research</a></div>
        <div className="d25-facts"><span><b>₹500</b> per user / month</span><span><b>20</b> shared execution launches</span><span><b>5h</b> cooldown after exhaustion</span><span><b>LOCAL</b> simulation</span></div>
      </section>
      <section aria-labelledby="d25-workspaces" className="d25-workspaces">
        <div className="d25-section-label"><span>YOUR LABORATORY</span><h2 id="d25-workspaces">Open a workspace</h2></div>
        <div className="d25-grid">{workspaces.map(w=><a className="d25-workspace" href={w.href} key={w.href}><span className="d25-count">{w.index}</span><span className="d25-workspace-content"><strong>{w.name}</strong><small>{w.detail}</small></span><span className="d25-arrow" aria-hidden="true">↗</span></a>)}</div>
      </section>
      <footer className="d25-footer"><strong>D25 Quantum Workspace</strong><span>By Devashri S Industries · A division of MAH Quantum</span><span>© 2026 MAH Quantum. All rights reserved.</span></footer>
    </main>
  </div>;
}
