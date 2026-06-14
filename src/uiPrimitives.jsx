import { useState, useRef } from "react";
import { ZMETA, r2 } from './calcCore.js';
import typicalLoadingImg    from './diagrams/typicalLoading.png';
import normalToRidgeImg     from './diagrams/normalToRidge.png';
import parallelToRidgeImg   from './diagrams/parallelToRidge.png';
import lrLoadCases705Img    from './diagrams/lrLoadCases705.png';
import lrLoadCases710to722Img from './diagrams/lrLoadCases710to722.png';

/* ── UI primitives ── */
export function Psf({ v }) {
  if (v == null) return (<span className="text-slate-600">—</span>);
  const color = v < 0 ? "text-sky-400" : v > 0 ? "text-amber-300" : "text-slate-400";
  return (<span className={"font-mono tabular-nums " + color}>{Number(v).toFixed(1)}</span>);
}

export function Field({ label, unit, error, hint, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1">
        {label}{unit ? <span className="text-slate-500 font-normal normal-case"> ({unit})</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-slate-500 mt-0.5">{hint}</p> : null}
      {error ? <p className="text-xs text-red-400 mt-0.5 font-medium">{error}</p> : null}
    </div>
  );
}

export function NInput({ value, onChange, min, max, step, error }) {
  return (
    <input type="number" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      onWheel={(e) => e.target.blur()}
      min={min} max={max} step={step || "any"}
      className={"w-full bg-slate-800 border rounded px-3 py-1.5 text-sm text-slate-100 font-mono tabular-nums focus:outline-none focus:border-sky-500/70 focus:ring-1 focus:ring-sky-500/30 transition-colors " + (error ? "border-red-500/60" : "border-slate-600/50")} />
  );
}

export function Sel({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-800 border border-slate-600/50 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500/70 transition-colors">
      {options.map((o) => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
    </select>
  );
}

export function Divider({ label }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-3">
      <div className="h-px flex-1 bg-slate-700" />
      <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">{label}</span>
      <div className="h-px flex-1 bg-slate-700" />
    </div>
  );
}

export function Chip({ label, value }) {
  return (
    <div className="bg-slate-800/80 border border-slate-700/60 rounded px-2.5 py-1 text-center min-w-[68px]">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</div>
      <div className="text-sm font-mono text-slate-200 tabular-nums">{value}</div>
    </div>
  );
}

export function Acc({ title, open: initOpen, badge, children }) {
  const [open, setOpen] = useState(!!initOpen);
  return (
    <div className="border border-slate-700/50 rounded overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/60 hover:bg-slate-800 transition-colors text-left">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">{title}</span>
        <div className="flex items-center gap-2">
          {badge}
          <svg className={"w-3.5 h-3.5 text-slate-500 transition-transform " + (open ? "rotate-180" : "")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open ? <div className="px-3 py-2.5 bg-slate-900/40">{children}</div> : null}
    </div>
  );
}

export function STabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-0.5 mb-3">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={"px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm transition-colors " + (active === t.id ? "bg-sky-900/50 text-sky-400 border border-sky-700/50" : "text-slate-500 hover:text-slate-300 border border-transparent")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function TRow({ cells, alt }) {
  return (
    <tr className={"border-b border-slate-700/50 " + (alt ? "bg-slate-900/20" : "")}>
      {cells.map((c, i) => (
        <td key={i} className={"px-2 py-1 text-xs font-mono tabular-nums whitespace-nowrap " + (i > 0 ? "text-right" : "")}>{c}</td>
      ))}
    </tr>
  );
}

export function THead({ cols }) {
  return (
    <thead>
      <tr className="border-b-2 border-slate-700">
        {cols.map((c, i) => (
          <th key={i} className={"px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap " + (i === 0 ? "text-left" : "text-right")}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

/* ── Revised C&C Matrix — shows all zones with correct areas ── */
export function CCMatrix({ pressures, title, areas, userAreas, onUserAreaChange, labelOverrides = {} }) {
  const zones = [...new Set(pressures.map((p) => p.zone))];

  function interpUserPressure(zd, userArea, sign) {
    const pts = zd.map(p => ({ a: p.area, v: sign === "neg" ? p.pnN : p.ppP }))
                  .sort((x,y) => x.a - y.a);
    if (pts.length === 0) return null;
    const ua = Math.max(userArea, 1);
    if (ua <= pts[0].a) return pts[0].v;
    if (ua >= pts[pts.length-1].a) return pts[pts.length-1].v;
    for (let i = 0; i < pts.length - 1; i++) {
      const lo = pts[i], hi = pts[i+1];
      if (ua >= lo.a && ua <= hi.a) {
        const t = (Math.log10(ua) - Math.log10(lo.a)) / (Math.log10(hi.a) - Math.log10(lo.a));
        return lo.v + t * (hi.v - lo.v);
      }
    }
    return pts[pts.length-1].v;
  }

  const hasUser = userAreas && userAreas.length > 0 && onUserAreaChange;

  return (
    <div className="overflow-x-auto">
      {title ? <p className="text-xs text-slate-400 mb-1.5 font-semibold">{title}</p> : null}
      <table className="w-auto min-w-full text-xs font-mono tabular-nums border-collapse">
        <thead>
          <tr className="border-b border-slate-700/50">
            <th className="px-1 py-0.5 text-left w-20"></th>
            <th className="px-1 py-0.5 text-center text-[10px] font-bold text-slate-400 uppercase" colSpan={areas.length}>Eff. Wind Area (sf)</th>
            {hasUser && <th className="text-center py-0.5 text-[10px] text-amber-400 font-bold border-b border-amber-500/40 border-l border-slate-700/60" colSpan={userAreas.length}>User Input</th>}
          </tr>
          <tr className="border-b border-slate-700">
            <th className="px-1 py-1 text-left text-[10px] font-bold text-slate-400 uppercase w-20">Zone</th>
            {areas.map((a) => <th key={a} className="px-0.5 py-1 text-center text-[10px] font-bold text-sky-500/70 w-[52px]">{a}</th>)}
            {hasUser && userAreas.map((ua, i) => (
              <th key={"u"+i} className={"py-1 text-center text-[10px] text-amber-400 font-bold w-[52px] " + (i===0 ? "border-l border-slate-700/60 pl-1" : "")}>
                <input
                  type="number" min="1" value={ua}
                  onChange={e => onUserAreaChange(i, parseFloat(e.target.value)||1)}
                  onWheel={e => e.target.blur()}
                  className="w-12 text-center bg-transparent border-b border-amber-500/60 text-amber-300 text-[10px] font-bold outline-none"
                /> sf
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zones.map((zone, zi) => {
            const m  = labelOverrides[zone] || ZMETA[zone] || { label: zone, desc: "" };
            const zd = pressures.filter((p) => p.zone === zone);
            const isOh = zd[0]?.isOverhang;
            return (
              <tr key={zone} className={"border-b border-slate-700/50 " + (zi % 2 === 0 ? "bg-slate-900/25" : "") + (isOh ? " opacity-80" : "")}>
                <td className="px-1 py-1">
                  <div className="text-slate-200 font-bold text-[11px]">{m.label}</div>
                  <div className="text-[9px] text-slate-500">{m.desc}{isOh ? " (GCpi=0)" : ""}</div>
                </td>
                {areas.map((a) => {
                  const c = zd.find((p) => p.area === a);
                  if (!c) return (<td key={a} className="text-center text-slate-600">—</td>);
                  return (
                    <td key={a} className="px-0.5 py-1 text-center">
                      {!isOh && <div className="text-amber-300/90 leading-tight">{c.ppP.toFixed(1)}</div>}
                      <div className="text-sky-400/90 leading-tight">{c.pnN.toFixed(1)}</div>
                    </td>
                  );
                })}
                {hasUser && userAreas.map((ua, i) => {
                  const pn = interpUserPressure(zd, ua, "neg");
                  const pp = interpUserPressure(zd, ua, "pos");
                  return (
                    <td key={"u"+i} className={"px-0.5 py-1 text-center " + (i===0 ? "border-l border-slate-700/60" : "")}>
                      {pp != null && !isOh && <div className="text-amber-300 font-bold leading-tight">{pp.toFixed(1)}</div>}
                      {pn != null && <div className="text-sky-400 font-bold leading-tight">{pn.toFixed(1)}</div>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex gap-4 mt-1.5 text-[9px] text-slate-600">
        {pressures.some(p => !p.isOverhang) && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-300/50" />Positive (+GCpi)</span>}
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-400/50" />{pressures.every(p => p.isOverhang) ? "Uplift (GCpi=0, upward)" : "Suction (−GCpi)"}</span>
        <span>psf per cell: +max / −max</span>
      </div>
    </div>
  );
}


/* ── Wall Profile — rows state lifted to parent (WindCalculator) to survive tab switches ── */
export function WallProfile({ d, isNormal, rows, addRow, removeRow, updateRow, lockRow }) {

  const combN = isNormal ? "combN_normal"   : "combN_parallel";
  const combP = isNormal ? "combP_normal"   : "combP_parallel";
  const lwPrs = isNormal ? d.lwPrs?.normal  : d.lwPrs?.parallel;
  const lwPn  = lwPrs?.pN ?? 0;
  const lwPp  = lwPrs?.pP ?? 0;

  function calcExtra(z_ft) {
    // Use actual terrain constants from exposure — Ch.27 Dir always uses zm=15
    const exp = d.exposure || "C";
    const tcB = { a: 7,   zg: 1200, zm: 15 };
    const tcC = { a: 9.5, zg: 900,  zm: 15 };
    const tcD = { a: 11.5,zg: 700,  zm: 7  };
    const tc  = exp === "B" ? tcB : exp === "D" ? tcD : tcC;
    const kz = 2.01 * Math.pow(Math.max(z_ft, tc.zm) / tc.zg, 2 / tc.a);
    const kd  = d.kd  || 0.85;
    const iw  = d.iw  || 1.0;   // importance factor (1.15 for 7-05, 1.0 for 7-10+)
    const qzRaw = 0.00256 * kz * kd * iw * (d.V||120) * (d.V||120);
    // For 7-05 & 7-10: Kd applied at pressure level, not in qz — remove it from qzRaw
    const isKdAtPressureExtra = d.code_version === "7-05" || d.code_version === "7-10";
    const qzForPress = isKdAtPressureExtra ? qzRaw / kd : qzRaw;
    const G = d.G || 0.85;
    const gcpi = d.gcpi || 0.18;
    const qhRef = d.qhD ?? d.qh;   // qhD for 7-05 (no Kd), qh for all others
    const qzGCp = Math.round(qzForPress * G * 0.8 * 10) / 10;
    const pN = Math.round((qzGCp - qhRef * gcpi) * 10) / 10;
    const pP = Math.round((qzGCp + qhRef * gcpi) * 10) / 10;
    // Combined WW+LW: GCpi cancels — use bare pLW_n/p (no GCpi), not lwPrs.pN
    const lwBare = (isNormal ? d.pLW_n : d.pLW_p) ?? (lwPn + qhRef * gcpi);
    const combined = Math.round((qzGCp - lwBare) * 10) / 10;
    return { kz, kzt: 1.0, qzGCp, pN, pP, combined };
  }

  /* Base profile rows from apiDir */
  const baseEntries = (d.profile || []).map((r) => ({
    key: "b-" + r.z_ft,
    z_ft: r.z_ft, kz: r.kz, kzt: r.kzt ?? 1.0,
    qzGCp: r.pN != null ? r2(r.pN + (d.qhD ?? d.qh) * (d.gcpi||0.18)) : null,  // q·G·Cp = pN + qhD·GCpi
    pN: r.pN,   // w/+GCpi (suction case)
    pP: r.pP,   // w/−GCpi (pressure case)
    combined: r[combN],
    isBase: true,
  }));

  /* Extra rows: locked ones sort into the table; unlocked ones stay at bottom */
  const lockedExtras = rows
    .filter((r) => r.locked && !isNaN(parseFloat(r.val)) && parseFloat(r.val) > 0)
    .map((r) => {
      const z    = parseFloat(r.val);
      const calc = calcExtra(z);
      return { key: "e-" + r.id, id: r.id, val: r.val, z_ft: z, kz: calc.kz, kzt: calc.kzt, qzGCp: calc.qzGCp, pN: calc.pN, pP: calc.pP, combined: calc.combined, isBase: false, locked: true };
    });

  const sortedRows = [...baseEntries, ...lockedExtras].sort((a, b) => a.z_ft - b.z_ft);

  /* Unlocked rows always stay at the bottom — no jumping */
  const unlockedRows = rows
    .filter((r) => !r.locked)
    .map((r) => {
      const z     = parseFloat(r.val);
      const valid = !isNaN(z) && z > 0;
      const calc  = valid ? calcExtra(z) : null;
      return { key: "u-" + r.id, id: r.id, val: r.val, valid, calc };
    });

  return (
    <div className="border border-slate-700/50 rounded overflow-hidden">
      <div className="px-3 py-2 bg-slate-800/60 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Wall Profile — Combined WW + LW (psf)</span>
        <button
          onClick={addRow}
          className="text-[10px] px-2.5 py-0.5 bg-sky-900/40 border border-sky-700/50 rounded text-sky-400 hover:bg-sky-800/60 transition-colors font-semibold tracking-wide">
          + Add Height (Z)
        </button>
      </div>

      <div className="px-3 py-2.5 bg-slate-900/40 space-y-2">
        {lwPrs ? (
          <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-[10px] font-mono text-slate-500 pb-1.5 border-b border-slate-700/60">
            <span>LW Cp = {isNormal ? (d.cLW_n||0).toFixed(3) : (d.cLW_p||0).toFixed(3)}</span>
            <span>LW w/+GCpi: <span className="text-slate-400">{lwPn.toFixed(1)} psf</span></span>
            <span>LW w/−GCpi: <span className="text-slate-400">{lwPp.toFixed(1)} psf</span></span>
            <span className="text-slate-600">Combined = |WW| + |LW| = WW − LW</span>
          </div>
        ) : null}

        <table className="w-full text-xs font-mono tabular-nums">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="px-2 py-1 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider" rowSpan={2}>z (ft)</th>
              <th className="px-2 py-1 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider" rowSpan={2}>Kz</th>
              <th className="px-2 py-1 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider" rowSpan={2}>Kzt</th>
              <th className="px-1 py-1 text-center text-[10px] font-bold text-sky-500/70 uppercase tracking-wider border-l border-slate-700/50" colSpan={3}>Windward Wall (psf)</th>
              <th className="px-2 py-1 text-right text-[10px] font-bold text-amber-500/70 uppercase tracking-wider border-l border-slate-700/50" rowSpan={2}>Combined WW+LW</th>
              <th className="w-5" rowSpan={2}/>
            </tr>
            <tr className="border-b-2 border-slate-700">
              <th className="px-2 py-1 text-right text-[10px] font-bold text-sky-500/70 border-l border-slate-700/50">q·G·Cp</th>
              <th className="px-2 py-1 text-right text-[10px] font-bold text-sky-500/70">w/+GCpi</th>
              <th className="px-2 py-1 text-right text-[10px] font-bold text-sky-500/70">w/−GCpi</th>
            </tr>
          </thead>
          <tbody>
            {/* Sorted base + locked extra rows */}
            {sortedRows.map((r, i) => (
              <tr key={r.key}
                className={"border-b border-slate-700/50 " + (i%2===1 ? "bg-slate-900/20" : "") + (!r.isBase ? " bg-sky-950/20" : "")}>
                <td className="px-2 py-1 whitespace-nowrap">
                  {r.isBase ? (
                    <span className="text-slate-300">{r.z_ft.toFixed(1)}</span>
                  ) : (
                    <input
                      type="number" min="1" step="1"
                      value={r.val}
                      onChange={(e) => updateRow(r.id, e.target.value)}
                      onBlur={() => lockRow(r.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") { lockRow(r.id); e.target.blur(); } }}
                      className="w-16 bg-transparent border-b border-sky-600/40 text-sky-300 font-mono text-xs focus:outline-none focus:border-sky-400 tabular-nums" />
                  )}
                </td>
                <td className="px-2 py-1 text-right text-slate-400">{r.kz != null ? r.kz.toFixed(2) : "—"}</td>
                <td className="px-2 py-1 text-right text-slate-400">{r.kzt != null ? r.kzt.toFixed(2) : "—"}</td>
                <td className="px-2 py-1 text-right border-l border-slate-700/50 text-slate-400">{r.qzGCp != null ? r.qzGCp.toFixed(1) : "—"}</td>
                <td className="px-2 py-1 text-right text-sky-400/80">{r.pN != null ? r.pN.toFixed(1) : "—"}</td>
                <td className="px-2 py-1 text-right text-sky-400/80">{r.pP != null ? r.pP.toFixed(1) : "—"}</td>
                <td className="px-2 py-1 text-right border-l border-slate-700/50">{r.combined != null ? <Psf v={r.combined} /> : <span className="text-slate-600">—</span>}</td>
                <td className="px-1 py-1 text-center w-5">
                  {!r.isBase ? (
                    <button onClick={() => removeRow(r.id)} className="text-red-500/50 hover:text-red-400 text-[11px]">✕</button>
                  ) : null}
                </td>
              </tr>
            ))}

            {/* Unlocked (being typed) rows — pinned at bottom, never jump */}
            {unlockedRows.map((r) => (
              <tr key={r.key} className="border-b border-slate-700/30 bg-sky-950/10">
                <td className="px-2 py-1">
                  <input
                    type="number" min="1" step="1"
                    value={r.val}
                    onChange={(e) => updateRow(r.id, e.target.value)}
                    onBlur={() => lockRow(r.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") { lockRow(r.id); e.target.blur(); } }}
                    autoFocus
                    placeholder="z ft"
                    className="w-16 bg-transparent border-b border-sky-500/60 text-sky-300 font-mono text-xs focus:outline-none focus:border-sky-300 tabular-nums" />
                </td>
                <td className="px-2 py-1 text-right text-slate-500">{r.valid ? r.calc.kz.toFixed(2) : "—"}</td>
                <td className="px-2 py-1 text-right text-slate-500">{r.valid ? r.calc.kzt.toFixed(2) : "—"}</td>
                <td className="px-2 py-1 text-right border-l border-slate-700/50 text-slate-500">{r.valid ? r.calc.qzGCp?.toFixed(1) : "—"}</td>
                <td className="px-2 py-1 text-right text-slate-500">{r.valid ? r.calc.pN?.toFixed(1) : "—"}</td>
                <td className="px-2 py-1 text-right text-slate-500">{r.valid ? r.calc.pP?.toFixed(1) : "—"}</td>
                <td className="px-2 py-1 text-right border-l border-slate-700/50">{r.valid ? <span className="opacity-60"><Psf v={r.calc.combined} /></span> : <span className="text-slate-600">—</span>}</td>
                <td className="px-1 py-1 text-center w-5">
                  <button onClick={() => removeRow(r.id)} className="text-red-500/50 hover:text-red-400 text-[11px]">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-[10px] text-slate-600 pt-0.5">
          Combined = p_WW(z) − p_LW = |WW|+|LW|. At z = h GCpi cancels. GCpi = ±{d.gcpi}.
          <span className="text-slate-500/70 ml-2">Type height then press Enter or click away to sort into table.</span>
        </p>
      </div>
    </div>
  );
}

/* ── MWFRS Directional tab ── */
export function DirTab({ d, elev, geo, ug, sub, setSub, rows, addRow, removeRow, updateRow, lockRow }) {
  const isNormal   = sub === "normal";
  const cpLw      = d && (isNormal ? d.cLW_n : d.cLW_p);
  const lwRatio   = d && (isNormal ? d.ratioLW_n : d.ratioLW_p);
  const roofRatio = d && (isNormal ? d.ratioRoof_n : d.ratioRoof_p);
  const rz        = d && (isNormal ? d.roofNormal : d.roofParallel);
  const lwP       = d && (isNormal ? d.lwP_n : d.lwP_p);
  const lwN       = d && (isNormal ? d.lwN_n : d.lwN_p);
  const dirLabel  = isNormal ? "Normal to Ridge" : "Parallel to Ridge";
  const ratioLabel = isNormal ? "B/L" : "L/B";
  const roofLabel  = isNormal ? "h/B" : "h/L";

  const tabs = [
    { id:"normal",   label:"Normal to Ridge" },
    { id:"parallel", label:"Parallel to Ridge" },
  ];
  if (elev !== null) tabs.push({ id:"elevated", label:"Elevated Bldg §27.1.5" });

  // Geometry check row helper
  const GeoRow = ({ label, pass, detail }) => (
    <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded border border-slate-700/40 bg-slate-900/30">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        {detail ? <span className="text-slate-500 font-mono text-[10px]">{detail}</span> : null}
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${pass ? "bg-emerald-900/40 border border-emerald-700/40 text-emerald-400" : "bg-red-900/40 border border-red-700/40 text-red-400"}`}>
          {pass ? "OK" : "FAIL"}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {d ? (
        <>
          <h2 className="text-sm font-bold text-slate-300">
            MWFRS Directional — Ch. 27 | L = {d.L} ft | B = {d.B} ft | h = {d.h} ft
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-slate-400">
            <span>{d.code_version === "7-22" ? "Kd·qh" : "qh"} = {d.qh.toFixed(1)} psf</span>
            <span>G = <span className="text-sky-400 font-bold">{d.G.toFixed(4)}</span></span>
            {d.kztH && d.kztH !== 1.0 ? <span className="text-amber-400/80">Kzt = {d.kztH.toFixed(4)}</span> : null}
            <span className="text-slate-600 text-[9px]">{d.gRes?.note}</span>
          </div>
        </>
      ) : elev?.ok ? (
        <h2 className="text-sm font-bold text-slate-300">MWFRS — Elevated Building §27.1.5</h2>
      ) : null}
      {(sub === "normal" || sub === "parallel") && d ? (
        <>
          <div className="px-3 py-1.5 bg-slate-800/40 border border-slate-700/30 rounded text-[10px] text-slate-400 flex flex-wrap gap-x-4 gap-y-0.5 font-mono">
            <span>{dirLabel}</span>
            <span>LW ratio ({ratioLabel}) = {lwRatio}</span>
            <span>Roof ratio ({roofLabel}) = {roofRatio}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[{ l:"Windward", cp:d.cWW }, { l:"Leeward", cp:cpLw }, { l:"Side", cp:d.cSW }].map((w) => (
              <div key={w.l} className="bg-slate-800/60 border border-slate-700/50 rounded p-2.5">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">{w.l}</div>
                <div className="text-base font-bold text-slate-200 font-mono">{w.cp.toFixed(2)} <span className="text-[10px] text-slate-600">Cp</span></div>
              </div>
            ))}
          </div>

          <Acc title={"Surface Pressures — " + dirLabel + " (psf)"} open={true}>
            <table className="w-full text-xs font-mono tabular-nums">
              <THead cols={["Surface", "Cp", "qGCp", "w/ +GCpi", "w/ −GCpi"]} />
              <tbody>
                <TRow cells={["Windward","0.80",(d.qh*d.G*0.8).toFixed(1),<Psf v={d.qh*d.G*0.8 - d.qh*d.gcpi} />,<Psf v={d.qh*d.G*0.8 + d.qh*d.gcpi} />]} />
                <TRow cells={["Leeward",cpLw.toFixed(4),(d.qh*d.G*cpLw).toFixed(1),<Psf v={lwP} />,<Psf v={lwN} />]} alt />
                <TRow cells={["Side","−0.70",(d.qh*d.G*-0.7).toFixed(1),<Psf v={d.swP} />,<Psf v={d.swN} />]} />
              </tbody>
            </table>
          </Acc>

          {rz ? (
            <Acc title={"Roof Zones — " + dirLabel + " (" + roofLabel + " = " + roofRatio + ")"} open={true}>
              <table className="w-full text-xs font-mono tabular-nums">
                <THead cols={["Zone","Cp","qhGCp","w/ +GCpi","w/ −GCpi"]} />
                <tbody>
                  {rz.map((r, i) => {
                    const q = d.qh * d.G * r.cp;
                    return (<TRow key={i} alt={i%2===1} cells={[r.zone, r.cp.toFixed(2), q.toFixed(1), <Psf v={q - d.qh*d.gcpi} />, <Psf v={q + d.qh*d.gcpi} />]} />);
                  })}
                </tbody>
              </table>
            </Acc>
          ) : null}

          <WallProfile d={d} isNormal={isNormal} rows={rows} addRow={addRow} removeRow={removeRow} updateRow={updateRow} lockRow={lockRow} />

          {/* ── Parapet §27.3.4 ── */}
          {d.parZ > 0 ? (
            <div className="border border-slate-700/50 rounded overflow-hidden">
              <div className="px-3 py-2 bg-slate-800/60">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Parapet Pressures — §27.3.4</span>
              </div>
              <div className="px-3 py-2.5 bg-slate-900/40 space-y-2">
                <table className="w-full text-xs font-mono tabular-nums">
                  <THead cols={["z (ft)", "Kz", "Kzt", "qp (psf)"]} />
                  <tbody>
                    <TRow cells={[d.parZ.toFixed(1), d.parKz?.toFixed(4) ?? "—", d.parKzt?.toFixed(4) ?? "—", d.parQp?.toFixed(1) ?? "—"]} />
                  </tbody>
                </table>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Windward Parapet</div>
                    <div className="text-base font-bold font-mono"><span className="text-amber-300">{d.parWW?.toFixed(1)} psf</span></div>
                    <div className="text-[9px] text-slate-600 mt-0.5">GCpn = +{d.code_version === "7-02" ? "1.8" : "1.5"} × qp</div>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Leeward Parapet</div>
                    <div className="text-base font-bold font-mono"><span className="text-sky-400">{d.parLW?.toFixed(1)} psf</span></div>
                    <div className="text-[9px] text-slate-600 mt-0.5">GCpn = {d.code_version === "7-02" ? "-1.1" : "-1.0"} × qp</div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-600">qp evaluated at z = {d.parZ.toFixed(1)} ft (top of parapet above ground) per §27.3.4.</p>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* ── Elevated Building §27.1.5 ─────────────────────────────── */}
      {sub === "elevated" && elev !== null ? (
        <div className="space-y-4">
          {/* ── Inputs ── */}
          <div className="border border-slate-700/50 rounded overflow-hidden">
            <div className="px-3 py-2 bg-slate-800/60 text-xs font-bold text-slate-300 uppercase tracking-wide">
              Elevated Building Inputs — ASCE 7-22 §27.1.5
            </div>
            <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div className="col-span-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Building</div>
              <Field label="hb — ht to bottom of structure" unit="ft" hint="Height above grade to underside of elevated floor">
                <NInput value={geo.hb_ft} onChange={(v) => ug("hb_ft", v)} min={0} step={1} />
              </Field>
              <div className="col-span-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wide pt-1">Sub-structure cross-sectional areas</div>
              <Field label="Column cross-section area" unit="sf">
                <NInput value={geo.elev_cols_area_sf} onChange={(v) => ug("elev_cols_area_sf", v)} min={0} />
              </Field>
              <Field label="Enclosed area below bldg" unit="sf">
                <NInput value={geo.elev_enc_area_sf} onChange={(v) => ug("elev_enc_area_sf", v)} min={0} />
              </Field>
              <div className="col-span-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wide pt-1">Projected widths facing each wind direction</div>
              <Field label="Col. proj. width — Dir 1 (normal to ridge)" unit="ft">
                <NInput value={geo.elev_col_width_d1_ft} onChange={(v) => ug("elev_col_width_d1_ft", v)} min={0} />
              </Field>
              <Field label="Enc. proj. width — Dir 1 (normal to ridge)" unit="ft">
                <NInput value={geo.elev_enc_width_d1_ft} onChange={(v) => ug("elev_enc_width_d1_ft", v)} min={0} />
              </Field>
              <Field label="Col. proj. width — Dir 2 (parallel to ridge)" unit="ft">
                <NInput value={geo.elev_col_width_d2_ft} onChange={(v) => ug("elev_col_width_d2_ft", v)} min={0} />
              </Field>
              <Field label="Enc. proj. width — Dir 2 (parallel to ridge)" unit="ft">
                <NInput value={geo.elev_enc_width_d2_ft} onChange={(v) => ug("elev_enc_width_d2_ft", v)} min={0} />
              </Field>
            </div>
          </div>

          {!elev.ok ? (
            <div className="px-3 py-3 rounded border border-slate-700/40 bg-slate-800/30 text-xs text-slate-400">
              {elev.reason}
            </div>
          ) : (<>
          <div className="px-3 py-2 rounded border border-slate-700/40 bg-slate-800/30 text-[10px] font-mono text-slate-400 flex flex-wrap gap-x-4 gap-y-0.5">
            <span>hb = <span className="text-white font-bold">{elev.hb} ft</span></span>
            <span>GCpi = ±{elev.gcpi}</span>
            <span className={elev.anyElev ? "text-emerald-400" : "text-red-400 font-bold"}>
              {elev.anyElev
                ? (elev.elev_d1 && elev.elev_d2 ? "Both directions eligible" : elev.elev_d1 ? "Dir 1 eligible only" : "Dir 2 eligible only")
                : "Neither direction eligible — treat as continuous to grade"}
            </span>
          </div>

          {/* Geometry checks */}
          <div className="border border-slate-700/50 rounded overflow-hidden">
            <div className="px-3 py-2 bg-slate-800/60 text-xs font-bold text-slate-300 uppercase tracking-wide">
              Geometry Eligibility Checks
            </div>
            <div className="p-3 space-y-4">
              {/* Limitation 1 */}
              <div>
                <p className="text-[10px] text-slate-500 mb-2 font-semibold">
                  Limitation 1 — Area ratio: (cols + enclosed) / footprint ≤ max (L/B-dependent)
                </p>
                <div className="text-[10px] font-mono text-slate-500 mb-2 px-1">
                  Footprint = {elev.footprint.toFixed(0)} sf &nbsp;|&nbsp;
                  Below area = {elev.total_below.toFixed(0)} sf &nbsp;|&nbsp;
                  Ratio = {(elev.area_ratio * 100).toFixed(1)}%
                </div>
                <div className="space-y-1.5">
                  <GeoRow label={`Dir 1 (Normal to Ridge) — L/B = ${(elev.elev_d1 || !elev.lim1_d1 ? (1/1).toFixed(0) : "")}B/L, max ratio = ${(elev.maxR_d1 * 100).toFixed(0)}%`}
                    pass={elev.lim1_d1}
                    detail={`ratio ${(elev.area_ratio*100).toFixed(1)}% vs max ${(elev.maxR_d1*100).toFixed(0)}%`} />
                  <GeoRow label={`Dir 2 (Parallel to Ridge) — L/B, max ratio = ${(elev.maxR_d2 * 100).toFixed(0)}%`}
                    pass={elev.lim1_d2}
                    detail={`ratio ${(elev.area_ratio*100).toFixed(1)}% vs max ${(elev.maxR_d2*100).toFixed(0)}%`} />
                </div>
              </div>
              {/* Limitation 2 */}
              <div>
                <p className="text-[10px] text-slate-500 mb-2 font-semibold">
                  Limitation 2 — Projected width ratio ≤ 75% of building dimension
                </p>
                <div className="space-y-1.5">
                  <GeoRow label={`Dir 1 — proj. width ${elev.projW_d1} ft / B = ${(elev.projRatio_d1*100).toFixed(0)}%`}
                    pass={elev.lim2_d1}
                    detail={`≤ 75%?`} />
                  <GeoRow label={`Dir 2 — proj. width ${elev.projW_d2} ft / L = ${(elev.projRatio_d2*100).toFixed(0)}%`}
                    pass={elev.lim2_d2}
                    detail={`≤ 75%?`} />
                </div>
              </div>
              {/* Combined result */}
              <div className="space-y-1.5">
                <GeoRow label="Direction 1 (Normal to Ridge) — design as elevated?" pass={elev.elev_d1} />
                <GeoRow label="Direction 2 (Parallel to Ridge) — design as elevated?" pass={elev.elev_d2} />
              </div>
            </div>
          </div>

          {/* Horizontal pressure */}
          <div className="border border-slate-700/50 rounded overflow-hidden">
            <div className="px-3 py-2 bg-slate-800/60 text-xs font-bold text-slate-300 uppercase tracking-wide">
              Horizontal Pressure on Sub-structure (0 to hb) — Cp = 1.3
            </div>
            <div className="p-3 space-y-3">
              <table className="w-full text-xs font-mono tabular-nums">
                <THead cols={["z (ft)", "Kz", "Kzt", "qz (psf)", "qzG·Cp (psf)"]} />
                <tbody>
                  <TRow cells={[
                    elev.z_eval.toFixed(1),
                    elev.kzEval.toFixed(4),
                    elev.kztZ.toFixed(4),
                    elev.qzEval.toFixed(1),
                    <span className="text-amber-300 font-bold">{elev.p_horiz.toFixed(1)}</span>
                  ]} />
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500">z evaluated at max(hb, 15) = {elev.z_eval} ft per §27.1.5. Applied to all objects below hb.</p>
              {(elev.force_d1 !== null || elev.force_d2 !== null) ? (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {elev.force_d1 !== null ? (
                    <div className="bg-slate-800/60 border border-slate-700/50 rounded p-2.5">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Dir 1 Total Force</div>
                      <div className="text-base font-bold font-mono text-amber-300">{elev.force_d1.toFixed(1)} k</div>
                      <div className="text-[9px] text-slate-600 mt-0.5">p × proj_width_d1 × hb / 2</div>
                    </div>
                  ) : null}
                  {elev.force_d2 !== null ? (
                    <div className="bg-slate-800/60 border border-slate-700/50 rounded p-2.5">
                      <div className="text-[10px] text-slate-500 uppercase font-semibold">Dir 2 Total Force</div>
                      <div className="text-base font-bold font-mono text-amber-300">{elev.force_d2.toFixed(1)} k</div>
                      <div className="text-[9px] text-slate-600 mt-0.5">p × proj_width_d2 × hb / 2</div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-[10px] text-slate-600">Enter projected widths to compute total forces.</p>
              )}
            </div>
          </div>

          {/* Vertical pressure — bottom surface */}
          <div className="border border-slate-700/50 rounded overflow-hidden">
            <div className="px-3 py-2 bg-slate-800/60 text-xs font-bold text-slate-300 uppercase tracking-wide">
              Vertical Pressure — Bottom Surface of Elevated Structure
            </div>
            <div className="p-3 space-y-4">
              <p className="text-[10px] text-slate-500">* Horizontal distance from windward edge. Negative = upward (suction). w/+GCpi = more critical uplift.</p>
              {[
                { label: "Wind Normal to Ridge", zones: elev.vert_normal,   hbL: elev.hbL_n, rf: elev.rf_n },
                { label: "Wind Parallel to Ridge", zones: elev.vert_parallel, hbL: elev.hbL_p, rf: elev.rf_p },
              ].map(({ label, zones, hbL, rf }) => (
                <div key={label}>
                  <div className="text-[10px] font-semibold text-slate-400 mb-1.5">
                    {label} &nbsp;<span className="font-mono text-slate-600">hb/L = {hbL.toFixed(3)} | RF = {rf.toFixed(4)}</span>
                  </div>
                  <table className="w-full text-xs font-mono tabular-nums">
                    <THead cols={["Zone", "Cp", "q·GCp (psf)", "w/+GCpi (psf)", "w/−GCpi (psf)"]} />
                    <tbody>
                      {zones.map((z) => (
                        <tr key={z.label} className={`border-t border-slate-700/30${z.isMin ? " bg-slate-800/40" : ""}`}>
                          <td className={`px-2 py-1 ${z.isMin ? "text-slate-400 italic" : "text-slate-400"}`}>{z.label}</td>
                          <td className="px-2 py-1 text-slate-300">{z.cp.toFixed(3)}</td>
                          <td className="px-2 py-1 text-slate-400">{z.qhGCp.toFixed(1)}</td>
                          <td className="px-2 py-1"><Psf v={z.pPos} /></td>
                          <td className="px-2 py-1"><Psf v={z.pNeg} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
          </>)}
        </div>
      ) : null}

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/*  MWFRS DIR — DIAGRAM PANE                                         */
/* ══════════════════════════════════════════════════════════════════ */

/*
 * Oblique projection helper.
 * All three diagrams use the same coordinate transform:
 *   screen_x = x + depth * cos45  (depth goes up-right)
 *   screen_y = y - depth * sin25
 * We define a lightweight pt() helper and polygon/line builders.
 */

// Oblique projection: world (x, y, z) → SVG (sx, sy)
// x = rightward, y = upward, z = depth (into screen, up-right)
function ob(x, y, z) {
  const DX = 0.60, DY = 0.32; // oblique angle components per unit depth
  return [x + z * DX, y - z * DY];
}
function pts(arr) { return arr.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" "); }

// Arrowhead at (x2,y2) pointing from (x1,y1)
function mkArrow(x1, y1, x2, y2, color, sw = 1.5, hs = 5) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx*dx + dy*dy);
  if (len < 0.001) return null;
  const ux = dx/len, uy = dy/len;
  const bx = x2 - ux*hs*1.6, by2 = y2 - uy*hs*1.6;
  const px = -uy*hs*0.5, py2 = ux*hs*0.5;
  return (
    <g>
      <line x1={x1} y1={y1} x2={bx} y2={by2} stroke={color} strokeWidth={sw} strokeLinecap="round"/>
      <polygon points={`${x2.toFixed(1)},${y2.toFixed(1)} ${(bx+px).toFixed(1)},${(by2+py2).toFixed(1)} ${(bx-px).toFixed(1)},${(by2-py2).toFixed(1)}`} fill={color}/>
    </g>
  );
}

// Diagonal hatch fill inside a polygon (clip-path approach via pattern)
function HatchPattern({ id, color, angle = -45, spacing = 6 }) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width={spacing} height={spacing} patternTransform={`rotate(${angle})`}>
        <line x1="0" y1="0" x2="0" y2={spacing} stroke={color} strokeWidth="0.8" opacity="0.55"/>
      </pattern>
    </defs>
  );
}

// Label with small background pill for legibility on dark isometric faces
function IsoLabel({ x, y, text, color = "#1F2933", size = 9, anchor = "middle" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={color}
      fontFamily="'JetBrains Mono',monospace" fontWeight="700" paintOrder="stroke"
      stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round">
      {text}
    </text>
  );
}

/* ─────────────────────────────────────────────────────────────────
   DIAGRAM 1 — Wind Normal to Ridge
   Rendered from embedded reference image (src/diagrams/normalToRidge.png).
   Import handled by Vite asset pipeline (see top of file).
───────────────────────────────────────────────────────────────── */
function DiagNormalToRidge() {
  return (
    <div style={{ background: "#fff", padding: "8px" }}>
      <img
        src={normalToRidgeImg}
        alt="Wind Normal to Ridge — WW/LW/SW walls, WR/LR roof slopes labeled"
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   DIAGRAM 2 — Wind Parallel to Ridge
   Same building, wind comes from the right side face.
   WW = right face, LW = left face, SW = front & back, WR both slopes
───────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────
   DIAGRAM 2 — Wind Parallel to Ridge
   Rendered from embedded reference image (src/diagrams/parallelToRidge.png).
   Import handled by Vite asset pipeline (see top of file).
───────────────────────────────────────────────────────────────── */
function DiagParallelToRidge() {
  return (
    <div style={{ background: "#fff", padding: "8px" }}>
      <img
        src={parallelToRidgeImg}
        alt="Wind Parallel to Ridge — WW/LW/SW walls, WR roof slopes labeled"
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   DIAGRAM 3 — Typical Wind Loading
   Rendered from embedded reference image (src/diagrams/typicalLoading.png).
   Import handled by Vite asset pipeline (see top of file).
───────────────────────────────────────────────────────────────── */
function DiagTypicalLoading() {
  return (
    <div style={{ background: "#fff", padding: "8px" }}>
      <img
        src={typicalLoadingImg}
        alt="Typical Wind Loading diagram — WW pressure, LW/SW/WR suction"
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   DIAGRAM PANE — exported, receives tab + dirSub
───────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────
   DIAGRAM — MWFRS Low-Rise Load Cases
   Edition-conditional: 7-05 gets its own figure; 7-10 through 7-22
   share the updated figure. Includes code-specific torsion notes.
───────────────────────────────────────────────────────────────── */
function DiagLRLoadCases({ codeVer }) {
  const is705 = codeVer === "7-05";
  const img   = is705 ? lrLoadCases705Img : lrLoadCases710to722Img;
  const alt   = is705
    ? "MWFRS Low-Rise basic load cases — ASCE 7-05 (Zones 1–4, torsion at 25%)"
    : "MWFRS Low-Rise basic load cases — ASCE 7-10 to 7-22 (Zones 1–6, torsion at 25%)";

  const note705 = "Torsional loading shall be taken as 25% of Zones 1 through 4. See the code loading above for reference.\n\nException: The torsional load case does not apply to one-story buildings with h ≤ 30 ft, or to one- and two-story buildings utilizing light-frame construction or flexible diaphragms.";
  const note722 = "Apply torsional loads equal to 25% of Zones 1 through 6.\n\nException: Buildings not exceeding one story with h ≤ 30 ft, as well as one- and two-story structures with light-frame construction or flexible diaphragms, are exempt from the torsional load case requirement.";
  const note = is705 ? note705 : note722;

  const SCALES = [1, 2, 3];
  const [scaleIdx, setScaleIdx] = useState(0);
  const [origin, setOrigin]     = useState({ x: 50, y: 50 }); // percent
  const [pan, setPan]           = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos  = useRef({ x: 0, y: 0 });
  const scale    = SCALES[scaleIdx];

  // Reset pan when zooming out to 1×
  const handleClick = (e) => {
    if (dragging.current) return; // swallow if we just dragged
    const rect = e.currentTarget.getBoundingClientRect();
    const ox = ((e.clientX - rect.left) / rect.width)  * 100;
    const oy = ((e.clientY - rect.top)  / rect.height) * 100;
    const next = (scaleIdx + 1) % SCALES.length;
    if (next === 0) {
      setPan({ x: 0, y: 0 });
      setOrigin({ x: 50, y: 50 });
    } else {
      setOrigin({ x: ox, y: oy });
    }
    setScaleIdx(next);
  };

  const onMouseDown = (e) => {
    if (scale === 1) return;
    dragging.current = false;
    lastPos.current = { x: e.clientX, y: e.clientY };
    const onMove = (mv) => {
      const dx = mv.clientX - lastPos.current.x;
      const dy = mv.clientY - lastPos.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragging.current = true;
      lastPos.current = { x: mv.clientX, y: mv.clientY };
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const cursorStyle = scale === 1 ? "zoom-in" : scaleIdx < SCALES.length - 1 ? "zoom-in" : "zoom-out";

  return (
    <>
      {/* Image container — overflow hidden keeps zoom inside panel */}
      <div
        style={{ position: "relative", background: "#fff", overflow: "hidden",
          cursor: cursorStyle, userSelect: "none" }}
        onClick={handleClick}
        onMouseDown={onMouseDown}
      >
        <img
          src={img} alt={alt}
          draggable={false}
          style={{
            width: "100%", height: "auto", display: "block",
            transformOrigin: `${origin.x}% ${origin.y}%`,
            transform: `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`,
            transition: scale === 1 ? "transform 0.25s ease" : "none",
            pointerEvents: "none",
          }}
        />
        {/* Zoom badge */}
        {scale > 1 && (
          <div style={{
            position: "absolute", bottom: 6, right: 6,
            background: "rgba(15,23,42,0.75)", color: "#23557A",
            fontSize: 9, fontFamily: "monospace", fontWeight: 700,
            padding: "2px 6px", borderRadius: 4, pointerEvents: "none",
            letterSpacing: "0.05em",
          }}>
            {scale}×
          </div>
        )}
        {/* Hint on first zoom-in */}
        {scale === 1 && (
          <div style={{
            position: "absolute", bottom: 6, right: 6,
            background: "rgba(15,23,42,0.65)", color: "#5E6A73",
            fontSize: 9, fontFamily: "monospace",
            padding: "2px 6px", borderRadius: 4, pointerEvents: "none",
          }}>
            click to zoom
          </div>
        )}
      </div>

      {/* Note */}
      <div style={{ padding: "10px 12px", background: "#F8F5EF", borderTop: "1px solid #D8D2C7" }}>
        {note.split("\n\n").map((para, i) => (
          <p key={i} style={{
            fontSize: 10, lineHeight: 1.6, color: i === 0 ? "#4C5862" : "#5E6A73",
            fontFamily: "'IBM Plex Sans', sans-serif",
            marginBottom: i < note.split("\n\n").length - 1 ? 8 : 0,
          }}>{para}</p>
        ))}
      </div>
    </>
  );
}

export function DiagramPane({ tab, dirSub, codeVer }) {
  if (tab !== "dir" && tab !== "lr") return null;

  /* ── LR pane ── */
  if (tab === "lr") {
    return (
      <div style={{
        flex: "0 0 60%",
        minWidth: "360px",
        maxWidth: "780px",
        borderLeft: "1px solid #D8D2C7",
        overflowY: "auto",
        background: "#F8F5EF",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}>
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          padding: "7px 12px",
          background: "#F0ECE4",
          borderBottom: "1px solid #D8D2C7",
          fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
          color: "#5E6A73", fontFamily: "'IBM Plex Sans', sans-serif",
          textTransform: "uppercase",
        }}>
          Load Cases Diagram
        </div>
        <div style={{ padding: "12px 10px" }}>
          <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #D8D2C7" }}>
            <div style={{ padding: "5px 10px", background: "#F0ECE4", borderBottom: "1px solid #D8D2C7",
              fontSize: 12, fontWeight: 700, color: "#5E6A73",
              letterSpacing: "0.08em", fontFamily: "monospace", textTransform: "uppercase" }}>
              Basic Load Cases — {codeVer === "7-05" ? "ASCE 7-05" : "ASCE 7-10 to 7-22"}
            </div>
            <DiagLRLoadCases codeVer={codeVer} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Dir pane (unchanged) ── */
  return (
    <div style={{
      flex: "0 0 40%",
      minWidth: "260px",
      maxWidth: "520px",
      borderLeft: "1px solid #D8D2C7",
      overflowY: "auto",
      background: "#F8F5EF",
      display: "flex",
      flexDirection: "column",
      gap: 0,
    }}>
      {/* Pane header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        padding: "7px 12px",
        background: "#F0ECE4",
        borderBottom: "1px solid #D8D2C7",
        fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
        color: "#5E6A73", fontFamily: "'IBM Plex Sans', sans-serif",
        textTransform: "uppercase",
      }}>
        Reference Diagrams — MWFRS Ch. 27
      </div>

      {/* Diagrams stack */}
      <div style={{ padding: "12px 10px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Card 1: Normal to Ridge */}
        <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #D8D2C7" }}>
          <div style={{ padding: "5px 10px", background: "#F0ECE4", borderBottom: "1px solid #D8D2C7",
            fontSize: 12, fontWeight: 700, color: dirSub === "normal" ? "#23557A" : "#5E6A73",
            letterSpacing: "0.08em", fontFamily: "monospace", textTransform: "uppercase" }}>
            {dirSub === "normal" ? "▶ " : ""}Wind Normal to Ridge
          </div>
          <DiagNormalToRidge/>
        </div>

        {/* Card 2: Parallel to Ridge */}
        <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #D8D2C7" }}>
          <div style={{ padding: "5px 10px", background: "#F0ECE4", borderBottom: "1px solid #D8D2C7",
            fontSize: 12, fontWeight: 700, color: dirSub === "parallel" ? "#23557A" : "#5E6A73",
            letterSpacing: "0.08em", fontFamily: "monospace", textTransform: "uppercase" }}>
            {dirSub === "parallel" ? "▶ " : ""}Wind Parallel to Ridge
          </div>
          <DiagParallelToRidge/>
        </div>

        {/* Card 3: Typical Loading */}
        <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #D8D2C7" }}>
          <div style={{ padding: "5px 10px", background: "#F0ECE4", borderBottom: "1px solid #D8D2C7",
            fontSize: 12, fontWeight: 700, color: "#5E6A73",
            letterSpacing: "0.08em", fontFamily: "monospace", textTransform: "uppercase" }}>
            Typical Wind Loading
          </div>
          <DiagTypicalLoading/>
        </div>

      </div>
    </div>
  );
}
