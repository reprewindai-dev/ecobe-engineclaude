'use client'

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { useHallOGridSnapshot, useHallOGridFrame } from "@/lib/hooks/control-surface";
import type { HallOGridFrame, WorldRegionState, WorldRoutingFlow } from "@/types/control-surface";

/*
 * HOLOGRID CONTROL PLANE v6 — MASTER BUILD (LIVE-WIRED)
 * Zero-Shift Architecture | Off-Thread SVG Engine | Gold Standard
 */

const C = {
  allow: "#00d65f",
  deny: "#e60023",
  reroute: "#f5a623",
  gold: "#FFD700",
  bg0: "#020305",
  bg1: "#07090f",
  glass: "rgba(10, 12, 18, 0.65)",
  glassActive: "rgba(15, 18, 26, 0.85)",
  border: "rgba(255,255,255,0.08)",
  t0: "#ffffff",
  t1: "#c4c9d4",
  t2: "#757c91",
  t3: "#41485c",
  accent: "#0ea5e9",
  g: (c: string, o = 0.3) => {
    if (!c) return `rgba(255,255,255,${o})`;
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${o})`;
  },
};

const ac = (a: string) => C[a.toLowerCase() as keyof typeof C] || C.accent;
const sc = (s: number) => (s >= 85 ? C.allow : s >= 68 ? C.reroute : C.deny);

const ACTION_LABEL: Record<HallOGridFrame["action"], string> = {
  run_now: "ALLOW",
  reroute: "REROUTE",
  delay: "DEFER",
  throttle: "DEFER",
  deny: "DENY",
};

type RegionNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  status: "live" | "guarded" | "blocked" | "fatal";
  pressure?: boolean;
};

type RouteEdge = { from: string; to: string; mode: "active" | "blocked" };

type FrameItem = {
  id: string;
  wType: string;
  region: RegionNode;
  action: string;
  lat: number;
  saiq: { score: number; grade: string; conf: number };
  gov: { met: boolean; rules: Array<{ id: string; name: string; threshold: string; scope: string }> };
  trace: { eid: string; hash: string; sealed: boolean; replay: boolean };
  raw: HallOGridFrame;
};

function mapRegionStatus(node: WorldRegionState): RegionNode["status"] {
  if (node.state === "active") return "live";
  if (node.state === "marginal") return "guarded";
  if (node.state === "blocked" && (node.freshnessState === "stale" || node.confidenceTier === "low")) {
    return "fatal";
  }
  return "blocked";
}

function mapRegionNode(node: WorldRegionState): RegionNode {
  const x = 40 + (node.x / 100) * 320;
  const y = 40 + (node.y / 100) * 320;

  return {
    id: node.region,
    name: node.label,
    x,
    y,
    status: mapRegionStatus(node),
    pressure: node.pressureLevel === "high",
  };
}

function mapRoutes(flows: WorldRoutingFlow[]): RouteEdge[] {
  return flows.map((flow) => ({
    from: flow.fromRegion,
    to: flow.toRegion,
    mode: flow.mode === "blocked" ? "blocked" : "active",
  }));
}

function mapFrames(frames: HallOGridFrame[], regionById: Map<string, RegionNode>): FrameItem[] {
  return frames.map((frame) => {
    const region = regionById.get(frame.region) ?? {
      id: frame.region,
      name: frame.region,
      x: 200,
      y: 200,
      status: "blocked" as const,
    };

    const confidence = frame.metrics.signalConfidence ?? 0;
    const score = Math.round(confidence * 1000) / 10;
    const grade = score >= 88 ? "A" : score >= 74 ? "B" : score >= 62 ? "C" : "D";

    return {
      id: frame.id,
      wType: frame.workloadClass,
      region,
      action: ACTION_LABEL[frame.action],
      lat: frame.metrics.totalLatencyMs ?? 0,
      saiq: { score, grade, conf: Math.round(confidence * 100) },
      gov: {
        met: frame.action !== "deny",
        rules: [
          {
            id: frame.reasonCode || "GOV-000",
            name: frame.reasonLabel || "Policy constraint",
            threshold: frame.explanation?.dominantConstraint || "",
            scope: "all",
          },
        ],
      },
      trace: {
        eid: frame.id,
        hash: frame.reasonCode || "unavailable",
        sealed: frame.proofState === "available",
        replay: frame.replayState === "verified",
      },
      raw: frame,
    };
  });
}

const LivingGlobe = React.memo(({ regions, routes }: { regions: RegionNode[]; routes: RouteEdge[] }) => {
  return (
    <div style={{ position: "absolute", right: "-10%", top: "10%", zIndex: 0, opacity: 0.8, pointerEvents: "none", perspective: "1000px" }}>
      <div style={{ width: 800, height: 800, transformStyle: "preserve-3d", animation: "slowSpin 120s linear infinite" }}>
        <svg viewBox="0 0 400 400" style={{ width: "100%", height: "100%", filter: `drop-shadow(0 0 80px ${C.g(C.accent, 0.15)})` }}>
          <defs>
            <radialGradient id="globeGrad" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor={C.g(C.accent, 0.08)} />
              <stop offset="100%" stopColor={C.bg0} />
            </radialGradient>
          </defs>
          <circle cx="200" cy="200" r="180" fill="url(#globeGrad)" stroke={C.g(C.accent, 0.2)} strokeWidth="1" />

          {routes.map((route, i) => {
            const ra = regions.find(r => r.id === route.from);
            const rb = regions.find(r => r.id === route.to);
            if (!ra || !rb) return null;

            const mx = (ra.x + rb.x) / 2, my = (ra.y + rb.y) / 2 - 40;
            const pathD = `M${ra.x},${ra.y} Q${mx},${my} ${rb.x},${rb.y}`;

            if (route.mode === "blocked") {
              return <path key={`r${i}`} d={pathD} fill="none" stroke={C.deny} strokeWidth="1.5" strokeDasharray="4 6" opacity={0.6} />;
            }
            return (
              <g key={`r${i}`}>
                <path d={pathD} fill="none" stroke={C.g(C.accent, 0.15)} strokeWidth="2" />
                <path
                  d={pathD}
                  fill="none"
                  stroke={C.accent}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="15 300"
                  style={{ animation: "flowComet 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}
                />
              </g>
            );
          })}

          {regions.map(r => {
            const isFatal = r.status === "fatal";
            const col = isFatal ? C.deny : r.status === "live" ? C.allow : r.status === "guarded" ? C.reroute : C.deny;
            const pulseClass = isFatal ? "svgFlicker" : r.status === "live" ? "svgPulseFast" : "svgPulseSlow";

            return (
              <g key={r.id}>
                {r.pressure && (
                  <circle
                    cx={r.x} cy={r.y} r={18} fill="none" stroke={C.accent} strokeWidth={1} strokeDasharray="2 4"
                    style={{ transformOrigin: `${r.x}px ${r.y}px`, animation: "dashSpin 4s linear infinite" }}
                  />
                )}
                <circle cx={r.x} cy={r.y} r={6} fill={col} style={{ animation: `${pulseClass} 2s infinite` }} />
                <circle cx={r.x} cy={r.y} r={4} fill={col} stroke={C.bg0} strokeWidth={1.5} />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
});

function Plate({ title, children, delay }: { title: string, children: React.ReactNode, delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 50, z: -150 }}
      animate={{ opacity: 1, x: 0, z: 0 }}
      exit={{ opacity: 0, x: 30, z: -80 }}
      transition={{ type: "spring", stiffness: 350, damping: 28, delay }}
      style={{
        background: `linear-gradient(180deg, ${C.glassActive} 0%, ${C.glass} 100%)`,
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        border: `1px solid ${C.border}`,
        borderTop: `1px solid ${C.g("#ffffff", 0.12)}`,
        borderRadius: 14,
        padding: "18px 22px",
        marginBottom: 16,
        boxShadow: `0 24px 48px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.8), inset 0 1px 0 ${C.g("#fff", 0.05)}`,
        transformStyle: "preserve-3d"
      }}
    >
      <div style={{ fontFamily: "var(--m)", fontSize: 9, color: C.t2, letterSpacing: "0.15em", marginBottom: 14, textTransform: "uppercase" }}>{title}</div>
      {children}
    </motion.div>
  );
}

function Row({ label, value, color, highlight }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.g("#fff", 0.03)}` }}>
      <span style={{ fontSize: 10, color: C.t3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
      <span style={{ fontSize: highlight ? 14 : 11, color: color || C.t1, fontFamily: "var(--m)", fontWeight: highlight ? 700 : 500, textShadow: highlight && color ? `0 0 16px ${C.g(color, 0.6)}` : "none" }}>{value}</span>
    </div>
  );
}

export default function HoloGridControlPlane() {
  const snapshotQuery = useHallOGridSnapshot();
  const snapshot = snapshotQuery.data;

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isPrimary = Boolean(snapshot?.selectedFrameId && selectedId === snapshot?.selectedFrameId);
  const detailQuery = useHallOGridFrame(selectedId, { enabled: Boolean(selectedId) && !isPrimary, refetchInterval: false });
  const detail = isPrimary ? snapshot?.selectedFrame ?? null : detailQuery.data ?? null;

  const regions = useMemo(() => {
    if (!snapshot) return [] as RegionNode[];
    return snapshot.world.nodes.map(mapRegionNode);
  }, [snapshot]);

  const regionById = useMemo(() => new Map(regions.map(r => [r.id, r])), [regions]);
  const routes = useMemo(() => (snapshot ? mapRoutes(snapshot.world.flows) : []), [snapshot]);
  const frames = useMemo(() => (snapshot ? mapFrames(snapshot.frames, regionById) : []), [snapshot, regionById]);

  const activeFrame = useMemo(() => frames.find(f => f.id === selectedId) ?? null, [frames, selectedId]);

  if (snapshotQuery.isLoading) {
    return <div style={{ background: C.bg0, color: C.t1, height: "100vh", padding: 24, fontFamily: "'DM Sans', sans-serif" }}>Loading HallOGrid…</div>;
  }

  if (snapshotQuery.error || !snapshot) {
    const msg = snapshotQuery.error instanceof Error ? snapshotQuery.error.message : "Failed to load HallOGrid.";
    return <div style={{ background: C.bg0, color: C.deny, height: "100vh", padding: 24, fontFamily: "'DM Sans', sans-serif" }}>{msg}</div>;
  }

  const proofHash = detail?.evidence.proof.hash ?? "";
  const traceHash = detail?.evidence.trace.hash ?? "";
  const replayStatus = detail?.evidence.replay.deterministicMatch;

  return (
    <div style={{ background: C.bg0, color: C.t1, height: "100vh", width: "100vw", overflow: "hidden", fontFamily: "'DM Sans', sans-serif", position: "relative", perspective: "1400px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        :root{--m:'JetBrains Mono',monospace}
        ::-webkit-scrollbar{width:2px}::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}

        @keyframes slowSpin { to { transform: rotateZ(-360deg); } }
        @keyframes svgPulseFast { 0%, 100% { r: 5px; opacity: 0.6; } 50% { r: 9px; opacity: 1; } }
        @keyframes svgPulseSlow { 0%, 100% { r: 4px; opacity: 0.3; } 50% { r: 7px; opacity: 0.7; } }
        @keyframes svgFlicker { 0%, 100% { opacity: 1; } 15%, 45%, 75% { opacity: 0.1; } 30%, 60% { opacity: 0.9; } }
        @keyframes flowComet { to { stroke-dashoffset: -315; } }
        @keyframes dashSpin { to { transform: rotate(360deg); } }
        @keyframes goldShimmer { 0%, 100% { opacity: 0.8; box-shadow: 0 0 16px rgba(255, 215, 0, 0.15); } 50% { opacity: 1; box-shadow: 0 0 24px rgba(255, 215, 0, 0.4); } }
      `}</style>

      <div style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: `linear-gradient(to right, ${C.g("#fff", 0.015)} 1px, transparent 1px), linear-gradient(to bottom, ${C.g("#fff", 0.015)} 1px, transparent 1px)`, backgroundSize: "50px 50px", maskImage: "radial-gradient(ellipse at center, black 10%, transparent 80%)" }} />

      <LivingGlobe regions={regions} routes={routes} />

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 100, padding: "16px 32px", display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(180deg, ${C.bg1}f0 0%, transparent 100%)`, backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.allow, boxShadow: `0 0 16px ${C.allow}` }} />
          <span style={{ fontFamily: "var(--m)", fontSize: 13, fontWeight: 700, color: C.t0, letterSpacing: "0.2em" }}>CO2 ROUTER</span>
        </div>
        <div style={{ fontFamily: "var(--m)", fontSize: 10, color: C.t2, letterSpacing: "0.15em" }}>SPATIAL CONTROL PLANE v6</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 420px) minmax(600px, 1fr)", height: "100vh", paddingTop: 60, position: "relative", zIndex: 10, overflowX: "auto" }}>
        <div style={{ overflowY: "auto", padding: "24px 32px", borderRight: `1px solid ${C.border}`, background: C.g(C.bg0, 0.5), backdropFilter: "blur(16px)" }}>
          <div style={{ fontFamily: "var(--m)", fontSize: 10, color: C.t3, letterSpacing: "0.15em", paddingBottom: 16 }}>LIVE DECISION STREAM</div>
          
          {frames.map((f) => {
            const isSel = selectedId === f.id;
            const c = ac(f.action);
            return (
              <motion.button
                key={f.id}
                onClick={() => setSelectedId(isSel ? null : f.id)}
                animate={{ x: isSel ? 12 : 0, scale: isSel ? 1.02 : 1, opacity: selectedId && !isSel ? 0.35 : 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{
                  display: "block", width: "100%", textAlign: "left", cursor: "pointer", outline: "none",
                  background: isSel ? `linear-gradient(135deg, ${C.g(c, 0.12)} 0%, ${C.glass} 100%)` : C.glass,
                  border: `1px solid ${isSel ? c : C.border}`,
                  borderLeft: `4px solid ${c}`,
                  borderRadius: 14, padding: "16px 20px", marginBottom: 14,
                  boxShadow: isSel ? `0 12px 32px ${C.g(c, 0.2)}` : "0 4px 12px rgba(0,0,0,0.5)",
                  transformStyle: "preserve-3d"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--m)", fontSize: 10, color: C.t2 }}>{f.id}</span>
                  <span style={{ fontFamily: "var(--m)", fontSize: 10, color: c, fontWeight: 700, letterSpacing: "0.15em", textShadow: isSel ? `0 0 12px ${C.g(c, 0.6)}` : "none" }}>{f.action}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.t0, letterSpacing: "-0.01em" }}>{f.wType}</div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{f.region.name} · {f.lat}ms</div>
              </motion.button>
            );
          })}
        </div>

        <div style={{ position: "relative", padding: "40px 60px", transformStyle: "preserve-3d", overflowY: "auto" }}>
          <AnimatePresence mode="wait">
            {selectedId && activeFrame ? (
              <motion.div key={activeFrame.id} style={{ maxWidth: 540 }}>
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginBottom: 36 }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: C.t0, letterSpacing: "-0.02em", textShadow: `0 0 40px ${C.g(C.t0, 0.2)}` }}>{activeFrame.wType}</div>
                  <div style={{ fontFamily: "var(--m)", fontSize: 12, color: ac(activeFrame.action), marginTop: 8, letterSpacing: "0.15em", textShadow: `0 0 12px ${C.g(ac(activeFrame.action), 0.5)}` }}>
                    ROUTED TO {activeFrame.region.id.toUpperCase()}
                  </div>
                </motion.div>

                <Plate title="Decision Core & SAIQ" delay={0.05}>
                  <Row label="Action Taken" value={activeFrame.action} color={ac(activeFrame.action)} highlight />
                  <Row label="SAIQ Score" value={`${activeFrame.saiq.score} (Grade ${activeFrame.saiq.grade})`} color={sc(activeFrame.saiq.score)} highlight />
                  <Row label="Confidence" value={`${activeFrame.saiq.conf}%`} />
                </Plate>

                <Plate title="Governance Constraints" delay={0.1}>
                  <Row label="Policy Status" value={activeFrame.gov.met ? "ENVELOPE PASSED" : "ENVELOPE FAILED"} color={activeFrame.gov.met ? C.allow : C.deny} highlight />
                  {activeFrame.gov.rules.map(r => (
                    <div key={r.id} style={{ marginTop: 14, padding: "10px 14px", background: C.g(C.bg0, 0.6), border: `1px solid ${C.g("#fff", 0.05)}`, borderRadius: 8 }}>
                      <span style={{ fontFamily: "var(--m)", fontSize: 10, color: C.t2 }}>{r.id}: {r.name} ({r.threshold})</span>
                    </div>
                  ))}
                </Plate>

                <Plate title="Cryptographic Provenance" delay={0.15}>
                  <Row label="Trace Envelope" value={detail?.frame.id ?? activeFrame.id} color={C.t2} />
                  <Row label="State Hash" value={traceHash || "unavailable"} color={C.accent} />
                  <Row label="Proof Hash" value={proofHash || "unavailable"} color={C.gold} />
                  <Row label="Replay Match" value={replayStatus == null ? "Unknown" : replayStatus ? "YES" : "NO"} color={replayStatus ? C.allow : C.deny} />

                  <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
                    <div style={{ flex: 1, padding: "12px", textAlign: "center", background: C.g(C.gold, 0.08), border: `1px solid ${C.g(C.gold, 0.3)}`, borderRadius: 8, animation: "goldShimmer 3s ease-in-out infinite" }}>
                      <div style={{ fontFamily: "var(--m)", fontSize: 10, color: C.gold, letterSpacing: "0.1em", fontWeight: 700, textShadow: `0 0 10px ${C.g(C.gold, 0.5)}` }}>d4ab SEALED LEDGER</div>
                    </div>

                    <div style={{ flex: 1, padding: "12px", textAlign: "center", background: C.g(C.allow, 0.08), border: `1px solid ${C.g(C.allow, 0.2)}`, borderRadius: 8 }}>
                      <div style={{ fontFamily: "var(--m)", fontSize: 10, color: C.allow, letterSpacing: "0.1em" }}>REPLAY VERIFIED</div>
                    </div>
                  </div>
                </Plate>

              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontFamily: "var(--m)", fontSize: 12, color: C.t3, letterSpacing: "0.25em" }}>AWAITING SPATIAL FOCUS</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
