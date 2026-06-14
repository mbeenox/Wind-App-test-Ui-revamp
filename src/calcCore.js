/* ── constants ── */
// Roof C&C areas per ASCE 7 Table 30.3 (h≤60)
export const CC_AREAS_ROOF = [10, 50, 100, 500];
export const CC_AREAS_WALL = [10, 50, 100, 500];

export const ZMETA = {
  "1":  { label: "Zone 1",  desc: "Roof Field" },
  "1p": { label: "Zone 1’", desc: "Roof Field (interior)" },
  "2":  { label: "Zone 2",  desc: "Roof Edge" },
  "3":  { label: "Zone 3",  desc: "Roof Corner" },
  "oh1": { label: "Overhang Zone 1&1’", desc: "Overhang - Field" },
  "oh2": { label: "Overhang Zone 2",    desc: "Overhang - Edge" },
  "oh3": { label: "Overhang Zone 3",    desc: "Overhang - Corner" },
  "4":  { label: "Zone 4",  desc: "Wall Field" },
  "5":  { label: "Zone 5",  desc: "Wall Corner" },
};

export const CODE_VERS = [
  { value: "7-22", label: "ASCE 7-22" },
  { value: "7-16", label: "ASCE 7-16" },
  { value: "7-10", label: "ASCE 7-10" },
  { value: "7-05", label: "ASCE 7-05" },
];
/* Topographic feature types for Kzt (ASCE 7 §26.8) */
export const TOPO_TYPES = [
  { value: "flat",       label: "Flat (Kzt = 1.0)" },
  { value: "2d_ridge",   label: "2D Ridge" },
  { value: "2d_escarp",  label: "2D Escarpment" },
  { value: "3d_hill",    label: "3D Axisym. Hill" },
];

/* Gust effect factor modes (ASCE 7 §26.11) */
export const GUST_MODES = [
  { value: "rigid_fixed", label: "Rigid — Fixed G = 0.85" },
  { value: "rigid_calc",  label: "Rigid — Calculated Gf" },
  { value: "flexible",    label: "Flexible / Resonant Gf" },
];

export const EXPOSURES = [
  { value: "B", label: "Exp B" },
  { value: "C", label: "Exp C" },
  { value: "D", label: "Exp D" },
];
export const ENCLOSURES = [
  { value: "enclosed", label: "Enclosed" },
  { value: "partially_enclosed", label: "Part. Enclosed" },
  { value: "open", label: "Open" },
];
export const ROOFS = [
  { value: "gable",     label: "Gable",     mn: 0, mx: 45 },
  { value: "hip",       label: "Hip",       mn: 7, mx: 27 },
  { value: "monoslope", label: "Monoslope", mn: 0, mx: 30 },
];
export const TABS = [
  { id: "qz",  label: "qz Profile" },
  { id: "dir", label: "MWFRS Dir." },
  { id: "lr",  label: "MWFRS LR" },
  { id: "cc",  label: "C&C" },
  { id: "ob",  label: "Open Bldg" },
  { id: "rw",  label: "Roof W" },
  { id: "ow",  label: "Other W" },
];

/* ── helpers ── */
export const r2 = (v) => Math.round(v * 10) / 10;
export const r4 = (v) => Math.round(v * 1e4) / 1e4;
export const r6 = (v) => Math.round(v * 1e6) / 1e6;
export const gcpiOf = (enc) => ({ enclosed: 0.18, partially_enclosed: 0.55, open: 0, partially_open: 0.18 }[enc] || 0.18);
export const keOf  = (cv, el) => (cv >= "7-16" ? Math.exp(-0.0000362 * el) : 1);
// ASCE 7-05 and earlier use Importance Factor I applied to velocity pressure
// 7-10 and later bake risk category into the wind speed map instead
export const importanceFactorOf = (cv, rc) => {
  if (cv !== "7-05") return 1.0;  // 7-10+ uses risk-category wind speed maps, I=1
  const map = { "I": 0.87, "II": 1.00, "III": 1.15, "IV": 1.15 };
  return map[rc] || 1.0;
};

export function tcOf(cv, exp) {
  const db = {
    // Table 26.10-1 power-law constants: Exp B a=7.0, zg=1200 for all editions.
    // zm=15 for Ch.27 Dir and Ch.30 C&C (all codes). zm=30 for Ch.28 LR Exp B only (Table 26.10-1 footnote).
    B: { a: 7, zg: 1200, zm: 15 },
    C: { a: 9.5, zg: 900, zm: 15 },
    D: { a: 11.5, zg: 700, zm: 7 },
  };
  return db[exp] || db.C;
}

export function defZ(h) {
  const pts = [15,20,25,30,40,50,60,70,80,90,100,120,140,160,200,300].filter((z) => z <= h);
  if (!pts.length || pts[pts.length - 1] < h) pts.push(h);
  return pts;
}

export function compQz(V, exp, z, kd, ke, cv, kzt = 1.0, iw = 1.0, zmOverride = null) {
  const tc = tcOf(cv, exp);
  const zm = zmOverride != null ? zmOverride : tc.zm;
  const zE = Math.max(z, zm);
  const kz  = 2.01 * Math.pow(zE / tc.zg, 2 / tc.a);
  // qz = 0.00256 * Ke * Kz * Kzt * Kd * Iw * V^2
  // For 7-05: Iw = Importance Factor (0.87/1.0/1.15), Kd included as normal.
  // apiCC divides by kd for 7-05 before multiplying by GCp_net (which has Kd baked in).
  const qz  = 0.00256 * ke * kz * kzt * kd * iw * V * V;
  return { z, zE, kz: r6(kz), qz: r4(qz), alpha: tc.a, zg: tc.zg, zm: tc.zm };
}

export function cpLW(ratio) {
  if (ratio <= 1) return -0.5;
  if (ratio < 2)  return -0.5 + (ratio - 1) * 0.2;
  if (ratio < 4)  return -0.3 + (ratio - 2) * 0.05;
  return -0.2;
}

export function logInterp(x, a0, a1, y0, y1) {
  if (a0 === a1) return y0;
  const t = (Math.log10(x) - Math.log10(a0)) / (Math.log10(a1) - Math.log10(a0));
  return y0 + (y1 - y0) * Math.max(0, Math.min(1, t));
}

export const minPsf = (v) => (Math.abs(v) < 16 ? Math.sign(v || 1) * 16 : v);

/* ── Topographic Factor Kzt (ASCE 7-22 §26.8, Table 26.8-1) ──────────
   Inputs from the spreadsheet's Kzt section:
     topoType : "flat" | "2d_ridge" | "2d_escarp" | "3d_hill"
     H        : Hill / escarpment height (ft)
     Lh       : Half-length of hill / escarpment (ft) upwind of crest
     x        : Distance from crest to site (ft), upwind = negative
     z        : Height above ground (ft)
     upwind   : true = upwind side, false = downwind
   Returns { kzt, k1, k2, k3, hLh, xLh, zLh }
─────────────────────────────────────────────────────────────────── */
export function calcKzt(topoType, H, Lh, x, z, upwind) {
  if (topoType === "flat" || !H || !Lh) return { kzt: 1.0, k1: 0, k2: 1, k3: 1, hLh: 0, xLh: 0, zLh: 0, note: "Flat — Kzt = 1.0" };

  // H/Lh ratio (clamped to 0.5 per ASCE 7 §26.8.2 note)
  const hLh_raw = H / Lh;
  const hLh = Math.min(hLh_raw, 0.5);          // per ASCE 7 §26.8.2

  // Modified Lh: if H/Lh > 0.5, use Lh_mod = 2H
  const LhMod = hLh_raw > 0.5 ? 2 * H : Lh;

  // K1 — Table 26.8-1 (linear interp on H/Lh for each feature)
  // Values at H/Lh = 0.2, 0.3, 0.4, 0.5
  const K1_table = {
    "2d_ridge":  { gamma: 1.30 },
    "2d_escarp": { gamma: 0.75 },
    "3d_hill":   { gamma: 0.95 },
  };
  const gamma = K1_table[topoType]?.gamma ?? 0.95;
  const k1 = r4(gamma * hLh);

  // K2 — rate of decay with horizontal distance from crest
  const mu = {
    "2d_ridge":  { up: 1.5, dn: 1.5 },
    "2d_escarp": { up: 2.5, dn: 1.5 },
    "3d_hill":   { up: 1.5, dn: 1.5 },
  }[topoType] ?? { up: 1.5, dn: 1.5 };

  const absX = Math.abs(x);
  const xLhMod = absX / LhMod;
  const muVal = upwind ? mu.up : mu.dn;
  const k2 = r4(Math.max(0, 1 - xLhMod / muVal));

  // K3 — rate of decay with height above ground
  const nu = { "2d_ridge": 3, "2d_escarp": 2.5, "3d_hill": 4 }[topoType] ?? 3;
  const zLh = z / LhMod;
  const k3 = r4(Math.exp(-nu * zLh));

  const kzt = r4(Math.pow(1 + k1 * k2 * k3, 2));
  return { kzt, k1, k2, k3, hLh: r4(hLh), xLh: r4(xLhMod), zLh: r4(zLh), LhMod: r2(LhMod) };
}

/* ── Gust Effect Factor G (ASCE 7-22 §26.11) ────────────────────────
   mode: "rigid_fixed" → G = 0.85
         "rigid_calc"  → calculated G for rigid buildings
         "flexible"    → Gf for flexible / resonant buildings
   Inputs: exposure, h_ft (mean roof height), n1 (nat. freq Hz),
           beta (damping ratio), V_mph, code_version
─────────────────────────────────────────────────────────────────── */
export function calcG(mode, exposure, h_ft, n1, beta, V_mph) {
  if (mode === "rigid_fixed") return { G: 0.85, mode, note: "Fixed G = 0.85 per §26.11.1" };

  // Terrain constants (Table 26.11-1)
  const tc = {
    B: { Iz_ref_z: 0.45, Lz_c: 320, Lz_eps: 1/3, bg: 0.84, alpha_bar: 1/7, b_bar: 0.84, cg: 0.45, lz_c: 0.30, eps_bar: 1/3, zmin: 30 },
    C: { Iz_ref_z: 0.65, Lz_c: 500, Lz_eps: 1/5, bg: 0.93, alpha_bar: 1/9.5, b_bar: 1.0, cg: 0.65, lz_c: 0.20, eps_bar: 1/5, zmin: 15 },
    D: { Iz_ref_z: 0.80, Lz_c: 650, Lz_eps: 1/8, bg: 0.95, alpha_bar: 1/11.5, b_bar: 1.07, cg: 0.80, lz_c: 0.15, eps_bar: 1/8, zmin: 7 },
  }[exposure] || { Iz_ref_z: 0.65, Lz_c: 500, Lz_eps: 1/5, bg: 0.93, alpha_bar: 1/9.5, b_bar: 1.0, cg: 0.65, lz_c: 0.20, eps_bar: 1/5, zmin: 15 };

  const z_bar = Math.max(0.6 * h_ft, tc.zmin);  // §26.11.1
  const Iz    = tc.cg * Math.pow(33 / z_bar, tc.eps_bar);  // turbulence intensity §26.11.1
  const Lz    = tc.Lz_c * Math.pow(z_bar / 33, tc.Lz_eps); // integral length scale

  const Q_sq  = 1 / (1 + 0.63 * Math.pow((3 + h_ft) / Lz, 0.63)); // background response
  const Q     = Math.sqrt(Q_sq);

  const gQ = 3.4, gv = 3.4;

  if (mode === "rigid_calc") {
    const G = r4(0.925 * (1 + 1.7 * Iz * gQ * Q) / (1 + 1.7 * gv * Iz));
    return { G, mode, Iz: r4(Iz), Lz: r2(Lz), Q: r4(Q), z_bar: r2(z_bar), note: "Rigid G calculated §26.11.1" };
  }

  // Flexible / resonant Gf
  const V_bar_z = tc.b_bar * Math.pow(z_bar / 33, tc.alpha_bar) * V_mph;  // mean hourly speed
  const N1 = n1 * Lz / V_bar_z;  // reduced frequency

  // Rn, Rh, RB, RL (resonant response factors)
  const Rn = 7.47 * N1 / Math.pow(1 + 10.3 * N1, 5/3);
  const fnR = (nu) => nu <= 0 ? 1 : (1/(2*nu) - 1/(2*nu*nu)*(1 - Math.exp(-2*nu)));
  const eta_h = 4.6 * n1 * h_ft / V_bar_z;
  const eta_B = 4.6 * n1 * 3 / V_bar_z;   // using B = 3 placeholder; caller should pass B
  const eta_L = 15.4 * n1 * h_ft / V_bar_z;
  const Rh = fnR(eta_h), RB = fnR(eta_B), RL = fnR(eta_L);
  const R_sq = (1 / beta) * Rn * Rh * RB * (0.53 + 0.47 * RL);
  const R = Math.sqrt(R_sq);

  const gR = Math.sqrt(2 * Math.log(600 * n1)) + 0.5772 / Math.sqrt(2 * Math.log(600 * n1));
  const Gf = r4(0.925 * (1 + 1.7 * Iz * Math.sqrt(gQ*gQ*Q*Q + gR*gR*R*R)) / (1 + 1.7 * gv * Iz));

  return { G: Gf, mode, Iz: r4(Iz), Lz: r2(Lz), Q: r4(Q), R: r4(R), gR: r4(gR), z_bar: r2(z_bar), note: "Flexible Gf §26.11.2" };
}

/* ────────────────────────────────────────────────────────────
   C&C GCp functions  (ASCE 7-22 Fig 30.3-2A, h ≤ 60 ft)

   Uses EXACT log-linear formulas extracted from spreadsheet cells
   C&C!DD68–DW155 — not piecewise breakpoints.

   Formula pattern: m * LOG10(area) + b, capped at area=100 for most
   negative roof zones (value flattens beyond 100 sf).

   Parapet conditional: Zone 3 negative = Zone 2 negative when
     min_parapet_ht >= 3 ft  (ASCE 7-22 Fig 30.3-2A Note 6)
   Same rule applies to Overhang Zone 3 when min_parapet_ht >= 3 ft.

   Zone 1' (interior field) uses separate breakpoints for both roof types.

   GCpi is NOT included — added externally in apiCC().
   Overhangs use GCpi = 0 per ASCE 7 §30.6 (enforced in apiCC).
──────────────────────────────────────────────────────────── */

// Continuous log-linear GCp — matches spreadsheet exactly
// All functions return NET pressure coefficients: (GCp - GCpi) for neg, (GCp + GCpi) for pos
// so apiCC can multiply directly by qh without a separate gcpi term.
// GCpi = 0.18 (enclosed) is baked into every coefficient.
// Overhangs use GCpi = 0 per ASCE 7 §30.6 (raw GCp only).

function _gcpLogLinear(area, m, b, capArea) {
  const a = capArea ? Math.min(area, capArea) : area;
  return m * Math.log10(a) + b;
}

export function gcpRoof_hle60(area, roofType, theta, zone, sign, min_parapet_ht, codeVer) {
  const par = (min_parapet_ht == null) ? 0 : min_parapet_ht;
  const a = Math.max(area, 10);
  const isOld = codeVer === "7-10" || codeVer === "7-05";

  // ── ASCE 7-10 / 7-05 ────────────────────────────────────────────────────
  // Two sub-tables: theta<=10 uses reduced GCp (10% reduction per ASCE 7-05 §6.5.12.2.1)
  // theta>10 uses unreduced GCp. No Zone 1' in either table.
  if (isOld) {
    const lowSlope = theta <= 10;
    if (sign === "neg") {
      if (zone === "1" || zone === "1p") {
        if (lowSlope) return a <= 100 ? _gcpLogLinear(a, 0.1, -1.28, null) : -1.08;
        return _gcpLogLinear(a, 0.294296, -1.694296, 500);
      }
      if (zone === "2" || zone === "3") {  // Z3=Z2 always in 7-10
        if (lowSlope) return a <= 100 ? _gcpLogLinear(a, 0.7, -2.68, null) : -1.28;
        return _gcpLogLinear(a, 0.412014, -2.712014, 500);
      }
      if (zone === "oh1" || zone === "oh2") {
        if (lowSlope) {
          if (a <= 100) return _gcpLogLinear(a, 0.1, -1.8, null);
          return Math.min(-1.1, _gcpLogLinear(a, 0.715338, -3.030677, 500));
        }
        if (a <= 100) return _gcpLogLinear(a, 0.394, -2.694, null);
        return _gcpLogLinear(a, 0.437787, -2.781574, 500);
      }
      if (zone === "oh3") {
        // 7-10 OH Zone 3 = OH Zone 2 (same table)
        if (lowSlope) {
          if (a <= 100) return _gcpLogLinear(a, 0.1, -1.8, null);
          return Math.min(-1.1, _gcpLogLinear(a, 0.715338, -3.030677, 500));
        }
        if (a <= 100) return _gcpLogLinear(a, 0.394, -2.694, null);
        return _gcpLogLinear(a, 0.437787, -2.781574, 500);
      }
    } else {
      if (zone === "1" || zone === "1p") {
        if (lowSlope) return a <= 100 ? _gcpLogLinear(a, -0.1, 0.58, null) : 0.38;
        return a <= 100 ? _gcpLogLinear(a, -0.1, 0.58, null) : 0.38;
      }
      if (zone === "2" || zone === "3") {
        if (lowSlope) return Math.max(0.81, _gcpLogLinear(a, -0.15892, 1.23892, 500));
        return Math.max(0.81, _gcpLogLinear(a, -0.15892, 1.23892, 500));
      }
      return 0.0;
    }
    return sign === "neg" ? -1.08 : 0.38;
  }

  // ── MONOSLOPE theta <= 3 deg  (Fig 30.3-2A) ─────────────────────────────
  if (roofType === "monoslope" && theta <= 3) {
    if (sign === "neg") {
      if (zone === "1")  return _gcpLogLinear(a, 0.412014, -2.292014, 500);
      if (zone === "1p") {
        if (a <= 100) return -1.08;
        return _gcpLogLinear(a, 0.5, -2.08, 1000);
      }
      if (zone === "2")  return _gcpLogLinear(a, 0.529733, -3.009733, 500);
      if (zone === "3")  return par >= 3
        ? gcpRoof_hle60(area, roofType, theta, "2", sign, par, codeVer)
        : (a <= 100 ? _gcpLogLinear(a, 1.4297, -4.8097, null) : _gcpLogLinear(a, 0.529733, -3.009733, 500));
      if (zone === "oh1") {
        if (a <= 100) return _gcpLogLinear(a, 0.1, -1.8, null);
        return _gcpLogLinear(a, 0.858406, -3.316812, 500);
      }
      if (zone === "oh2") {
        return _gcpLogLinear(a, 0.705886, -3.006686, 500);
      }
      if (zone === "oh3") return par >= 3
        ? gcpRoof_hle60(area, roofType, theta, "oh2", sign, par, codeVer)
        : _gcpLogLinear(a, 0.705886, -3.006686, 500);
    } else {
      if (zone === "1" || zone === "1p") return a <= 100 ? _gcpLogLinear(a, -0.1, 0.58, null) : 0.38;
      if (zone === "2" || zone === "3")  return _gcpLogLinear(a, -0.15892, 1.23892, 500);
      return 0.0;
    }
  }

  // ── MONOSLOPE 3 < theta <= 10 deg  (Fig 30.3-2A) ────────────────────────
  if (roofType === "monoslope" && theta > 3 && theta <= 10) {
    if (sign === "neg") {
      if (zone === "1")  return -1.28;  // raw -1.1 - 0.18 = -1.28, flat all areas
      if (zone === "1p") {
        if (a <= 100) return -1.08;
        return _gcpLogLinear(a, 0.5, -2.08, 1000);
      }
      if (zone === "2")  return _gcpLogLinear(a, 0.529733, -3.009733, 500);
      if (zone === "3")  return par >= 3
        ? gcpRoof_hle60(area, roofType, theta, "2", sign, par, codeVer)
        : _gcpLogLinear(a, 0.529733, -3.009733, 500);
      if (zone === "oh1") {
        if (a <= 100) return _gcpLogLinear(a, 0.1, -1.8, null);
        return _gcpLogLinear(a, 0.858406, -3.316812, 500);
      }
      if (zone === "oh2") {
        return _gcpLogLinear(a, 0.705886, -3.006686, 500);
      }
      if (zone === "oh3") return par >= 3
        ? gcpRoof_hle60(area, roofType, theta, "oh2", sign, par, codeVer)
        : _gcpLogLinear(a, 0.705886, -3.006686, 500);
    } else {
      if (zone === "1" || zone === "1p") return a <= 100 ? _gcpLogLinear(a, -0.1, 0.58, null) : 0.38;
      if (zone === "2" || zone === "3")  return _gcpLogLinear(a, -0.15892, 1.23892, 500);
      return 0.0;
    }
  }

  // ── GABLE / HIP theta <= 7 deg  (Fig 30.3-1) ────────────────────────────
  if ((roofType === "gable" || roofType === "hip") && theta <= 7) {
    if (sign === "neg") {
      if (zone === "1")  return _gcpLogLinear(a, 0.412014, -2.292014, 500);
      if (zone === "1p") {
        if (a <= 100) return -1.08;
        return _gcpLogLinear(a, 0.5, -2.08, 1000);
      }
      if (zone === "2")  return _gcpLogLinear(a, 0.529733, -3.009733, 500);
      if (zone === "3")  return par >= 3
        ? gcpRoof_hle60(area, roofType, theta, "2", sign, par, codeVer)
        : (a <= 100 ? _gcpLogLinear(a, 1.4297, -4.8097, null) : _gcpLogLinear(a, 0.529733, -3.009733, 500));
      if (zone === "oh1") {
        if (a <= 100) return _gcpLogLinear(a, 0.1, -1.8, null);
        return _gcpLogLinear(a, 0.858406, -3.316812, 500);
      }
      if (zone === "oh2") {
        return _gcpLogLinear(a, 0.705886, -3.006686, 500);
      }
      if (zone === "oh3") return par >= 3
        ? gcpRoof_hle60(area, roofType, theta, "oh2", sign, par, codeVer)
        : _gcpLogLinear(a, 0.705886, -3.006686, 500);
    } else {
      if (zone === "1" || zone === "1p") return a <= 100 ? _gcpLogLinear(a, -0.2, 0.68, null) : 0.48;
      if (zone === "2" || zone === "3")  return _gcpLogLinear(a, -0.15892, 1.23892, 500);
      return 0.0;
    }
  }

  // ── GABLE 7 < theta <= 27 deg  (Fig 30.3-1) ─────────────────────────────
  // Raw: Z1 -1.7@10/-0.9@500; Z2 -2.6@10/-1.3@500; Z3 -3.2@10/-1.3@500
  if (roofType === "gable" && theta > 7 && theta <= 27) {
    if (sign === "neg") {
      if (zone === "1")  return _gcpLogLinear(a, 0.470436, -2.350436, 500);
      if (zone === "1p") {
        if (a <= 100) return -1.08;
        return _gcpLogLinear(a, 0.5, -2.08, 1000);
      }
      if (zone === "2")  return _gcpLogLinear(a, 0.76782, -3.59782, 500);
      if (zone === "3")  return par >= 3
        ? gcpRoof_hle60(area, roofType, theta, "2", sign, par, codeVer)
        : _gcpLogLinear(a, 1.064468, -4.714468, 500);
      if (zone === "oh1") {
        if (a <= 100) return _gcpLogLinear(a, 0.1, -1.8, null);
        return _gcpLogLinear(a, 0.858406, -3.316812, 500);
      }
      if (zone === "oh2") {
        return _gcpLogLinear(a, 0.705886, -3.006686, 500);
      }
      if (zone === "oh3") return par >= 3
        ? gcpRoof_hle60(area, roofType, theta, "oh2", sign, par, codeVer)
        : _gcpLogLinear(a, 0.705886, -3.006686, 500);
    } else {
      if (zone === "1" || zone === "1p") return a <= 100 ? _gcpLogLinear(a, -0.1, 0.58, null) : 0.38;
      if (zone === "2" || zone === "3")  return _gcpLogLinear(a, -0.15892, 1.23892, 500);
      return 0.0;
    }
  }

  // ── GABLE 27 < theta <= 45 deg  (Fig 30.3-1) ────────────────────────────
  // Raw: Z1/2/3 neg -1.6@10/-1.1@500 (relatively flat); pos Z2/3 +1.7@10/+1.1@500
  if (roofType === "gable" && theta > 27 && theta <= 45) {
    if (sign === "neg") {
      if (zone === "1")  return _gcpLogLinear(a, 0.294118, -2.174118, 500);
      if (zone === "1p") {
        if (a <= 100) return -1.08;
        return _gcpLogLinear(a, 0.5, -2.08, 1000);
      }
      if (zone === "2")  return _gcpLogLinear(a, 0.294118, -2.174118, 500);
      if (zone === "3")  return _gcpLogLinear(a, 0.294118, -2.174118, 500);
      if (zone === "oh1") {
        if (a <= 100) return _gcpLogLinear(a, 0.1, -1.8, null);
        return _gcpLogLinear(a, 0.858406, -3.316812, 500);
      }
      if (zone === "oh2") {
        return _gcpLogLinear(a, 0.705886, -3.006686, 500);
      }
      if (zone === "oh3") return par >= 3
        ? gcpRoof_hle60(area, roofType, theta, "oh2", sign, par, codeVer)
        : _gcpLogLinear(a, 0.705886, -3.006686, 500);
    } else {
      if (zone === "1" || zone === "1p") return a <= 100 ? _gcpLogLinear(a, -0.1, 0.58, null) : 0.38;
      if (zone === "2" || zone === "3")  return _gcpLogLinear(a, -0.294118, 2.174118, 500);
      return 0.0;
    }
  }

  // ── HIP 7 < theta <= 45 deg  (Fig 30.3-1) ───────────────────────────────
  // Hip: similar to gable but with zone 3 = zone 2 pattern
  if (roofType === "hip" && theta > 7 && theta <= 45) {
    if (sign === "neg") {
      if (zone === "1")  return _gcpLogLinear(a, 0.412014, -2.292014, 500);
      if (zone === "1p") {
        if (a <= 100) return -1.08;
        return _gcpLogLinear(a, 0.5, -2.08, 1000);
      }
      if (zone === "2")  return _gcpLogLinear(a, 0.529733, -3.009733, 500);
      if (zone === "3")  return gcpRoof_hle60(area, roofType, theta, "2", sign, par, codeVer);
      if (zone === "oh1") {
        if (a <= 100) return _gcpLogLinear(a, 0.1, -1.8, null);
        return _gcpLogLinear(a, 0.858406, -3.316812, 500);
      }
      if (zone === "oh2") {
        return _gcpLogLinear(a, 0.705886, -3.006686, 500);
      }
      if (zone === "oh3") return gcpRoof_hle60(area, roofType, theta, "oh2", sign, par, codeVer);
    } else {
      if (zone === "1" || zone === "1p") return a <= 100 ? _gcpLogLinear(a, -0.1, 0.58, null) : 0.38;
      if (zone === "2" || zone === "3")  return _gcpLogLinear(a, -0.15892, 1.23892, 500);
      return 0.0;
    }
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  if (sign === "neg") {
    if (zone === "1" || zone === "1p") return _gcpLogLinear(a, 0.412014, -2.292014, 500);
    if (zone.startsWith("oh")) {
      if (a <= 100) return _gcpLogLinear(a, 0.1, -1.8, null);
      return _gcpLogLinear(a, 0.858406, -3.316812, 500);
    }
    return _gcpLogLinear(a, 0.529733, -3.009733, 500);
  }
  return a <= 100 ? _gcpLogLinear(a, -0.1, 0.58, null) : 0.38;
}

export function gcpWall_hle60(area, zone, sign, codeVer) {
  // Net (GCp +/- GCpi) wall coefficients — ASCE 7 Fig 30.3-1, h<=60
  // Wall GCp values are the SAME for all code versions (7-05 through 7-22).
  // The code-version difference for 7-05 walls is handled via qhCC in apiCC.
  const a = Math.min(Math.max(area, 10), 500);
  if (sign === "neg") {
    if (zone === "4") return 0.15892 * Math.log10(a) - 1.32892;   // -1.17@10, -0.9@500
    if (zone === "5") return 0.31784 * Math.log10(a) - 1.75784;   // -1.44@10, -0.9@500
  } else {
    if (zone === "4" || zone === "5") return -0.15892 * Math.log10(a) + 1.23892; // +1.08@10, +0.81@500
  }
  return sign === "neg" ? -1.08 : 0.81;
}

// ── h > 60 ft C&C  — Ch.30 Part 3 (Fig 30.4-1) ────────────────────────────
// Standard procedure: external GCp only; GCpi applied separately in apiCC.
// Areas: [10, 50, 100, 500] sf.  Zone 3 = Zone 2 when parapet>=3ft & theta<=10.
// Verified against Struware spreadsheet (h=65, qh=36.22, GCpi=0.18).
export function gcpRoof_hgt60(area, zone, sign) {
  const a = Math.max(area, 10);
  if (sign === "neg") {
    if (zone === "1") {
      // -1.40@10 -> -0.90@500, cap at 500
      return 0.2943 * Math.log10(Math.min(a, 500)) - 1.6943;
    }
    if (zone === "1p") {
      // flat -0.9 up to 100sf, log-linear to -0.58@1000 (ASCE 7-22 Fig 30.4-1)
      if (a <= 100) return -0.9;
      return Math.max(-0.58, 0.5 * Math.log10(Math.min(a, 500)) - 1.9);
    }
    if (zone === "2") {
      // -2.30@10 -> -1.60@500, cap at 500
      return 0.4120 * Math.log10(Math.min(a, 500)) - 2.7120;
    }
    if (zone === "3") {
      // Same as Zone 2 when parapet>=3ft & theta<=10 (enforced in apiCC via zone3eq2).
      // Standalone curve: -2.30@10 -> -1.60@500
      return 0.4120 * Math.log10(Math.min(a, 500)) - 2.7120;
    }
  } else {
    // Positive GCp — ASCE 7 Fig 30.4-1 (and 7-05 Fig 6-17):
    // Zones 1, 2, 3 are suction-only — NO positive GCp curve exists in the figure.
    // Returning 0 means ppP = minPsfCC(qhCC * GCpi) which clamps to minimum (10 or 16 psf).
    // Zone 1p (flat roof low-slope) DOES have a positive GCp curve per Fig 30.4-1.
    if (zone === "1p") {
      if (a <= 100) return Math.max(0.2, -0.1 * Math.log10(a) + 0.4);
      return 0.2;
    }
    return 0; // Zones 1, 2, 3 — suction-only, no positive GCp in Fig 30.4-1
  }
  return sign === "neg" ? -1.0 : 0;
}

// ── Alternate C&C for 60 ft < h < 90 ft  — Ch.30 Alternate Procedure ───────
// Uses h<=60 GCp curve shapes extended to 1000 sf (net GCp, GCpi already baked).
// Base pressure = Kd*qh.  Areas: [10, 100, 500, 1000] sf.
// Verified against Struware spreadsheet alternate section (rows 19-27).
export function gcpRoof_alt(area, zone, sign, roof, theta, minPar, codeVer) {
  // Alternate procedure: 60 ft < h < 90 ft.
  // Returns EXTERNAL GCp for 7-10 (GCpi applied separately in apiCC).
  // Returns NET GCp (GCpi baked in) for 7-16/7-22 (apiCC multiplies directly by qh).
  // All curves verified against Struware spreadsheet.
  const a = Math.max(area, 10);
  const is710 = codeVer === "7-10" || codeVer === "7-05";

  if (is710) {
    // ── ASCE 7-10 / 7-05 Alternate ─────────────────────────────────────────
    // External GCp only. Areas [10,50,100,500]. Two-segment, breakpoint at 100sf.
    // All zones flat (slope=0) beyond 100sf except Oh1&2 and Z2+/Z3+.
    // Zone 1' does not exist. Oh3 = Oh1&2.
    if (sign === "neg") {
      if (zone === "1") {
        // -1.0@10 -> -0.9@100, flat -0.9 beyond
        if (a <= 100) return 0.1000 * Math.log10(a) - 1.1000;
        return -0.9000;
      }
      if (zone === "2" || zone === "3") {
        // -1.8@10 -> -1.1@100, flat -1.1 beyond
        if (a <= 100) return 0.7000 * Math.log10(a) - 2.5000;
        return -1.1000;
      }
      if (zone === "oh1" || zone === "oh2" || zone === "oh3") {
        // Oh1&2&3 identical: -1.70@10 -> -1.60@100, then -1.60->-1.10@500
        if (a <= 100) return 0.0999 * Math.log10(a) - 1.7999;
        return 0.7153 * Math.log10(Math.min(a, 500)) - 3.0308;
      }
    } else {
      if (zone === "1" || zone === "1p") {
        // +0.30@10 -> +0.20@100, flat beyond
        if (a <= 100) return -0.1000 * Math.log10(a) + 0.4000;
        return 0.2000;
      }
      if (zone === "2" || zone === "3") {
        // +0.90@10 -> +0.63@500, single log-linear
        return -0.1589 * Math.log10(Math.min(a, 500)) + 1.0589;
      }
      return 0.2;
    }
    return sign === "neg" ? -1.0 : 0.2;
  }

  // ── ASCE 7-16 / 7-22 Alternate ───────────────────────────────────────────
  // NET GCp (GCpi baked in). Areas [10,100,500,1000].
  // h<=60 curve shapes extended to 1000sf.
  // Verified against Struware spreadsheet (7-22, h=65ft, Kd*qh=35.97psf).
  if (sign === "neg") {
    if (zone === "1") {
      if (a <= 100) return 0.4120 * Math.log10(a) - 2.2920;
      return 0.2880 * Math.log10(Math.min(a, 1000)) - 2.0440;
    }
    if (zone === "1p") {
      // flat -1.08 to 100sf, then log-linear to -0.58@1000
      if (a <= 100) return -1.08;
      return Math.max(-0.58, 0.5 * Math.log10(Math.min(a, 1000)) - 2.08);
    }
    if (zone === "2" || zone === "3") {
      if (a <= 100) return 0.5297 * Math.log10(a) - 3.0097;
      return 0.3703 * Math.log10(Math.min(a, 1000)) - 2.6909;
    }
    if (zone === "oh1") {
      if (a <= 100) return 0.1 * Math.log10(a) - 1.8;
      return 0.6 * Math.log10(Math.min(a, 1000)) - 2.8;
    }
    if (zone === "oh2" || zone === "oh3") {
      if (a <= 100) return 0.7063 * Math.log10(a) - 3.0063;
      return 0.4937 * Math.log10(Math.min(a, 1000)) - 2.5811;
    }
  } else {
    if (zone === "1" || zone === "1p") {
      if (a <= 100) return Math.max(0.38, -0.1 * Math.log10(a) + 0.58);
      return 0.38;
    }
    if (zone === "2" || zone === "3") {
      if (a <= 100) return Math.max(0.81, -0.1589 * Math.log10(a) + 1.2389);
      return Math.max(0.81, -0.1111 * Math.log10(Math.min(a, 1000)) + 1.1432);
    }
    return 0.2;
  }
  return sign === "neg" ? -1.0 : 0.2;
}

export function gcpWall_hgt60(area, zone, sign) {
  // Wall zones 4' and 5' for h>60 — ASCE 7 Fig 30.4-1
  // Areas: [20, 100, 200, 500] sf  (min eff. wind area = 20sf for h>60 walls)
  // GCp is external only — GCpi applied separately in apiCC.
  // Verified from Struware spreadsheet (h=65ft, 7-22, qh=26.62, GCpi=0.18).
  //   Z4 neg: slope=+0.1431, int=-1.0861  → -0.90@20sf, -0.70@500sf
  //   Z5 neg: slope=+0.5723, int=-2.5445  → -1.80@20sf, -1.00@500sf
  //   Pos(4&5): slope=-0.2146, int=+1.1792 → +0.90@20sf, +0.60@500sf
  const a = Math.min(Math.max(area, 20), 500);
  if (sign === "neg") {
    if (zone === "4p") return  0.143068 * Math.log10(a) - 1.086135;
    if (zone === "5p") return  0.572271 * Math.log10(a) - 2.544541;
  } else {
    // Positive same for both zones
    return -0.214601 * Math.log10(a) + 1.179203;
  }
  return sign === "neg" ? -0.70 : 0.60;
}

export function interpGCp(area, table) {
  // table: [[area, GCp], ...]
  if (area <= table[0][0]) return table[0][1];
  if (area >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [a0, g0] = table[i];
    const [a1, g1] = table[i + 1];
    if (area >= a0 && area <= a1) return logInterp(area, a0, a1, g0, g1);
  }
  return table[table.length - 1][1];
}

/* ── mock API ── */
export async function apiQz(P) {
  const { project: p, geometry: g, kd, kztInputs } = P;
  const ke  = keOf(p.code_version, 0);
  const iw = importanceFactorOf(p.code_version, p.risk_category);
  // Compute Kzt at each height
  const rows = defZ(g.h_ft).map((z) => {
    const kztR = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft,
                         kztInputs.x_ft, z, kztInputs.upwind);
    const c = compQz(p.V_mph, p.exposure, z, kd, ke, p.code_version, kztR.kzt, iw);
    return { z_ft: z, kz: c.kz, kzt: kztR.kzt, qz_psf: c.qz, alpha: c.alpha, zg_ft: c.zg, ke: r6(ke), kd };
  });
  // Kzt at mean roof height (for header chip)
  const kztH = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft,
                       kztInputs.x_ft, g.h_ft, kztInputs.upwind);
  return { code_version: p.code_version, V_mph: p.V_mph, exposure: p.exposure, pressures: rows, kztH: kztH.kzt };
}

export async function apiDir(P) {
  const { project: p, geometry: g, kd, kztInputs, gustInputs } = P;
  const ke = keOf(p.code_version, 0);
  const iw = importanceFactorOf(p.code_version, p.risk_category);
  const kztH = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft,
                       kztInputs.x_ft, g.h_ft, kztInputs.upwind).kzt;
  const gRes = calcG(gustInputs.mode, p.exposure, g.h_ft, gustInputs.n1, gustInputs.beta, p.V_mph);
  const G    = gRes.G;
  const gcpi = gcpiOf(p.enclosure);
  const qhC  = compQz(p.V_mph, p.exposure, g.h_ft, kd, ke, p.code_version, kztH, iw);
  const qh   = qhC.qz;
  const isKdAtPressure = p.code_version === "7-05" || p.code_version === "7-10";
  const qhD  = isKdAtPressure ? qh / kd : qh; // 7-05 & 7-10: Kd applied at pressure level, not in qz

  const bl = g.B_ft / g.L_ft;
  const lb = g.L_ft / g.B_ft;
  const hb = g.h_ft / g.B_ft;
  const hl = g.h_ft / g.L_ft;

  const cLW_normal   = r4(cpLW(bl));
  const cLW_parallel = r4(cpLW(lb));

  const interpRoof = (ratio, cp05, cp10) => {
    if (ratio <= 0.5) return cp05;
    if (ratio >= 1.0) return cp10;
    return cp05 + (cp10 - cp05) * (ratio - 0.5) / 0.5;
  };
  const roofNormal = [
    { zone: "0 to h/2",   cp: interpRoof(hb, -0.9, -1.04) },
    { zone: "h/2 to h",   cp: interpRoof(hb, -0.9, -0.7) },
    { zone: "h to 2h",    cp: interpRoof(hb, -0.5, -0.7) },
    { zone: "> 2h",       cp: interpRoof(hb, -0.3, -0.7) },
    { zone: "WW pos/min", cp: -0.18 },
  ];
  const roofParallel = [
    { zone: "0 to h/2",   cp: interpRoof(hl, -0.9, -1.04) },
    { zone: "h/2 to h",   cp: interpRoof(hl, -0.9, -0.7) },
    { zone: "h to 2h",    cp: interpRoof(hl, -0.5, -0.7) },
    { zone: "> 2h",       cp: interpRoof(hl, -0.3, -0.7) },
    { zone: "WW pos/min", cp: -0.18 },
  ];

  // LW pressures (constant at all heights) for both directions
  const lwPrs = {
    normal:   { pN: r2(qhD*G*cLW_normal   - qhD*gcpi), pP: r2(qhD*G*cLW_normal   + qhD*gcpi) },
    parallel: { pN: r2(qhD*G*cLW_parallel  - qhD*gcpi), pP: r2(qhD*G*cLW_parallel  + qhD*gcpi) },
  };

  // Merge standard + user-added heights
  const allHeights = [...new Set([...defZ(g.h_ft), ...(g.extraHeights||[])])].sort((a,b)=>a-b);

  const profile = allHeights.map((z) => {
    const kztZ = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft,
                         kztInputs.x_ft, z, kztInputs.upwind).kzt;
    const c      = compQz(p.V_mph, p.exposure, z, kd, ke, p.code_version, kztZ, iw);
    const qzForPress = isKdAtPressure ? c.qz / kd : c.qz;
    const qzGCp  = qzForPress * G * 0.8;
    const pN_ww  = r2(qzGCp - qhD * gcpi);
    const pP_ww  = r2(qzGCp + qhD * gcpi);
    return {
      z_ft: z, kz: c.kz, kzt: kztZ,
      pN: pN_ww, pP: pP_ww,
      combN_normal:   r2(pN_ww - lwPrs.normal.pN),
      combP_normal:   r2(pP_ww - lwPrs.normal.pP),
      combN_parallel: r2(pN_ww - lwPrs.parallel.pN),
      combP_parallel: r2(pP_ww - lwPrs.parallel.pP),
    };
  });

  const gcpn = p.code_version === "7-02" ? [1.8, -1.1] : [1.5, -1.0];
  // qp for MWFRS parapet per §27.3.4: velocity pressure at top of parapet
  // parapet_height_ft = height above GROUND (Code!F38), not above roof
  const zParapet = g.parapet_height_ft || 0;  // absolute height above ground
  const kztPar   = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft, kztInputs.x_ft, zParapet, kztInputs.upwind).kzt;
  const qp_par_raw = compQz(p.V_mph, p.exposure, zParapet, kd, ke, p.code_version, kztPar, iw).qz;
  const qp_par = isKdAtPressure ? qp_par_raw / kd : qp_par_raw;
  const pLW_n = qhD * G * cLW_normal;
  const pSW   = qhD * G * -0.7;
  const pWW   = qhD * G * 0.8;
  const pR_n  = qhD * G * roofNormal[0].cp;
  const pLW_p = qhD * G * cLW_parallel;

  return {
    qh: r2(qhD), G, gcpi, kd, V: p.V_mph, L: g.L_ft, B: g.B_ft, h: g.h_ft,
    cWW: 0.8, cSW: -0.7,
    cLW_n: cLW_normal, ratioLW_n: r4(bl), ratioRoof_n: r4(hb), roofNormal,
    lwP_n: r2(pLW_n - qhD*gcpi), lwN_n: r2(pLW_n + qhD*gcpi),
    cLW_p: cLW_parallel, ratioLW_p: r4(lb), ratioRoof_p: r4(hl), roofParallel,
    lwP_p: r2(pLW_p - qhD*gcpi), lwN_p: r2(pLW_p + qhD*gcpi),
    swP: r2(pSW - qhD*gcpi), swN: r2(pSW + qhD*gcpi),
    profile, parWW: r2(qp_par*gcpn[0]), parLW: r2(qp_par*gcpn[1]),
    parZ: zParapet, parKz: r4(compQz(p.V_mph, p.exposure, zParapet, kd, ke, p.code_version, kztPar, iw).kz), parKzt: r4(kztPar), parQp: r2(qp_par),
    oh: r2(qhD * G * 0.8), G, gRes, kztH, lwPrs, qhD: r2(qhD),
    iw, code_version: p.code_version, exposure: p.exposure,
    pLW_n: r2(pLW_n),   // bare qhD·G·Cp_LW_normal   without GCpi — used by calcExtra combined
    pLW_p: r2(pLW_p),   // bare qhD·G·Cp_LW_parallel without GCpi — used by calcExtra combined
  };
}

export async function apiLR(P) {
  const { project: p, geometry: g, kd } = P;
  const gcpi = gcpiOf(p.enclosure);
  if (g.h_ft > 60) return { ok:false, reason:"h > 60 ft", qh:0, gcpi, ez:0, cA:[], cB:[], pww:0, plw:0, sd:null };
  if (g.h_ft > g.B_ft) return { ok:false, reason:"h > B",   qh:0, gcpi, ez:0, cA:[], cB:[], pww:0, plw:0, sd:null };
  const ke   = keOf(p.code_version, 0);
  const iw = importanceFactorOf(p.code_version, p.risk_category);
  const kztH = calcKzt(P.kztInputs.topo_type, P.kztInputs.H_ft, P.kztInputs.Lh_ft,
                       P.kztInputs.x_ft, g.h_ft, P.kztInputs.upwind).kzt;
  // Ch.28 (Envelope/LR): Table 26.10-1 asterisk footnote — Exposure B zm=30 ft for Ch.28 only
  const zmLR = p.exposure === "B" ? 30 : null;
  const qh   = compQz(p.V_mph, p.exposure, g.h_ft, kd, ke, p.code_version, kztH, iw, zmLR).qz;
  const isKdAtPressureLR = p.code_version === "7-05" || p.code_version === "7-10";
  const qhL = isKdAtPressureLR ? qh / kd : qh;
  const a    = Math.max(Math.min(0.1*Math.min(g.L_ft,g.B_ft), 0.4*g.h_ft), 3);
  const A  = { "1":0.4,"2":-0.69,"3":-0.37,"4":-0.29,"1E":0.61,"2E":-1.07,"3E":-0.53,"4E":-0.43 };
  const B  = { "1":-0.45,"2":-0.69,"3":-0.37,"4":-0.45,"5":0.4,"6":-0.29,"1E":-0.48,"2E":-1.07,"3E":-0.53,"4E":-0.48,"5E":0.61,"6E":-0.43 };
  const mk = (s) => Object.entries(s).map(([z,v]) => ({ zone:z, gcpf:v, pN:r2(qhL*(v+gcpi)), pP:r2(qhL*(v-gcpi)) }));
  const gcpn = p.code_version === "7-02" ? [1.8,-1.1] : [1.5,-1.0];
  // Horizontal MWFRS Simple Diaphragm (§28.4) — zones 5/6 for walls, 2/3 for roof
  const edgeA = r2(a), end2a = r2(2*a);
  const sd_tw_int = r2(qhL*(B["5"]-B["6"]));
  const sd_tw_end = r2(qhL*(B["5E"]-B["6E"]));
  const sd_tr_int = r2(qhL*(A["2"]-A["3"]));
  const sd_tr_end = r2(qhL*(A["2E"]-A["3E"]));
  // §27.1.5 min 16 psf is a total force check on the whole wall, not a per-zone floor.
  // Apply actual computed pressures; the 16 psf check is shown separately in the UI.
  const sd = {
    a: edgeA, endZone2a: end2a,
    transverse:  { intWall:r2(sd_tw_int), endWall:r2(sd_tw_end), intRoof:sd_tr_int, endRoof:sd_tr_end },
    longitudinal:{ intWall:r2(sd_tw_int), endWall:r2(sd_tw_end) },
  };

  // ── Longitudinal Directional Force §28.4.4 (open/partially enclosed, transverse frames) ──
  const theta_rad = (g.roof_angle_deg || 0) * Math.PI / 180;
  const eave_ht   = g.h_ft;
  const ridge_ht  = g.roof_angle_deg <= 10
    ? eave_ht + Math.tan(theta_rad) * g.B_ft / 2
    : eave_ht + Math.tan(theta_rad) * g.B_ft / 4;
  const Ae_auto   = (ridge_ht + eave_ht) * g.B_ft / 2;
  const Ae        = Ae_auto;
  // As: user-supplied solid end wall area (incl. fascia). 0 means open frame.
  const As_raw    = g.lng_As_sf || 0;
  const As        = As_raw > 0 ? As_raw : 0;
  const n_raw     = g.lng_n_frames >= 1 ? g.lng_n_frames : 1;
  const n_eff     = Math.max(n_raw, 3);
  const phi       = Ae > 0 ? As / Ae : 0;
  const KB        = g.B_ft >= 100 ? 0.8 : 1.8 - 0.01 * g.B_ft;
  const KS        = 0.6 + 0.073 * (n_eff - 3) + 1.25 * Math.pow(phi, 1.8);
  // Zone 5E&6E area = a × eave_ht + (tan θ × B/4) × a/2
  const area5E6E  = a * eave_ht + (Math.tan(theta_rad) * g.B_ft / 4) * a / 2;
  const area56    = Ae - area5E6E;
  // GCpf values from Case B table: zone5=B["5"], zone6=B["6"], zone5E=B["5E"], zone6E=B["6E"]
  const gcpf_diff = Ae > 0
    ? ((B["5"] - B["6"]) * area56 + (B["5E"] - B["6E"]) * area5E6E) / Ae
    : 0;
  const p_lng  = r2(qhL * gcpf_diff * KB * KS);   // qh already includes Kd
  const F_lng  = r2(Ae * p_lng / 1000);   // kips
  const lng = { ridge_ht:r2(ridge_ht), eave_ht:r2(eave_ht), Ae:r2(Ae), As, phi:r4(phi),
                n_eff, KB:r2(KB), KS:r4(KS), area56:r2(area56), area5E6E:r2(area5E6E),
                gcpf_diff:r4(gcpf_diff), p_lng, F_lng };

  // Windward roof overhang — LR method:
  // 7-05: GCpf does NOT embed G → use qhL × G × 0.8  (same as Dir formula)
  // 7-10+: GCpf already embeds G → use qhL × 0.70  (≈ zone2 upward on soffit)
  const G_lr = 0.85;
  const oh_lr = r2(p.code_version === "7-05" ? qhL * G_lr * 0.8 : qhL * 0.70);
  return { ok:true, reason:"", qh:r2(qhL), gcpi, ez:r2(2*a), cA:mk(A), cB:mk(B), pww:r2(qhL*gcpn[0]), plw:r2(qhL*gcpn[1]), oh:oh_lr, sd, lng, code_version: p.code_version };
}

/* ─────────────────────────────────────────────────────────────────────
   ELEVATED BUILDING  —  ASCE 7-22 §27.1.5
───────────────────────────────────────────────────────────────────── */
export async function apiElevated(P) {
  const { project: p, geometry: g, kd, kztInputs } = P;
  const hb = g.hb_ft || 0;
  if (hb <= 0) return { ok: false, reason: "hb = 0 — building is not elevated" };
  if (p.code_version !== "7-22") return { ok: false, reason: "Elevated building procedure is ASCE 7-22 only" };

  const ke = keOf(p.code_version, 0);
  const iw = importanceFactorOf(p.code_version, p.risk_category);
  const G  = 0.85;
  const gcpi = gcpiOf(p.enclosure);
  const L = g.L_ft, B = g.B_ft;

  // ── Geometry Limitation 1 — area ratio ─────────────────────────────
  const cols_area   = g.elev_cols_area_sf  || 0;
  const enc_area    = g.elev_enc_area_sf   || 0;
  const total_below = cols_area + enc_area;
  const footprint   = L * B;
  const area_ratio  = footprint > 0 ? total_below / footprint : 0;

  const LB_PTS = [[2.5,0.50],[3.0,0.45],[3.5,0.40],[4.0,0.36],[4.5,0.33],[5.0,0.30]];
  function maxRatio(lb) {
    if (lb <= LB_PTS[0][0]) return LB_PTS[0][1];
    for (let i = 0; i < LB_PTS.length - 1; i++) {
      const [a0,y0] = LB_PTS[i], [a1,y1] = LB_PTS[i+1];
      if (lb <= a1) return y0 + (lb - a0) / (a1 - a0) * (y1 - y0);
    }
    return 0.30;
  }
  const lb_d1 = B / L, lb_d2 = L / B;
  const maxR_d1 = maxRatio(lb_d1), maxR_d2 = maxRatio(lb_d2);
  const lim1_d1 = maxR_d1 > area_ratio;
  const lim1_d2 = maxR_d2 > area_ratio;

  // ── Geometry Limitation 2 — projected width ≤ 75% ──────────────────
  const colW_d1 = g.elev_col_width_d1_ft || 0;
  const encW_d1 = g.elev_enc_width_d1_ft || 0;
  const colW_d2 = g.elev_col_width_d2_ft || 0;
  const encW_d2 = g.elev_enc_width_d2_ft || 0;
  const projW_d1 = colW_d1 + encW_d1;
  const projW_d2 = colW_d2 + encW_d2;
  const projRatio_d1 = B > 0 ? projW_d1 / B : 0;
  const projRatio_d2 = L > 0 ? projW_d2 / L : 0;
  const lim2_d1 = projRatio_d1 <= 0.75;
  const lim2_d2 = projRatio_d2 <= 0.75;
  const elev_d1 = lim1_d1 && lim2_d1;
  const elev_d2 = lim1_d2 && lim2_d2;
  const anyElev = elev_d1 || elev_d2;

  // ── Horizontal pressure on objects 0 to hb ─────────────────────────
  const z_eval = Math.max(hb, 15);
  const qzRes  = compQz(p.V_mph, p.exposure, z_eval, kd, ke, p.code_version,
                        calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft,
                                kztInputs.x_ft, z_eval, kztInputs.upwind).kzt);
  const qzEval = qzRes.qz, kzEval = qzRes.kz;
  const kztZ   = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft,
                          kztInputs.x_ft, z_eval, kztInputs.upwind).kzt;
  const p_horiz = r2(qzEval * G * 1.3);
  const force_d1 = projW_d1 > 0 ? r2(p_horiz * projW_d1 * hb / 2000) : null;
  const force_d2 = projW_d2 > 0 ? r2(p_horiz * projW_d2 * hb / 2000) : null;

  // ── Vertical pressure on bottom surface ────────────────────────────
  function areaReduction(area) {
    if (area <= 100) return 1.0;
    if (area < 200)  return 1.0 - (area - 100) * 0.1 / 100;
    if (area < 1000) return 0.9 - (area - 200) * 0.1 / 800;
    return 0.8;
  }
  const rf_n = areaReduction((g.h_ft / 2) * L);
  const rf_p = areaReduction((g.h_ft / 2) * B);
  const hbL_n = L > 0 ? hb / L : 0;
  const hbL_p = B > 0 ? hb / B : 0;

  function cpVert(zone, hbL, rf) {
    const left  = { 1: -0.90, 2: -0.90, 3: -0.50, 4: -0.30 };
    const right = { 1: -1.30 * rf, 2: -0.70, 3: -0.70, 4: -0.70 };
    if (hbL <= 0.5) return left[zone];
    if (hbL >= 1.0) return right[zone];
    const t = (hbL - 0.5) / 0.5;
    return left[zone] + t * (right[zone] - left[zone]);
  }

  function vertZones(hbL, rf) {
    const zones = [
      { label: "0 to hb/2*",  zone: 1 },
      { label: "hb/2 to hb*", zone: 2 },
      { label: "hb to 2hb*",  zone: 3 },
    ];
    if (hbL < 0.5) zones.push({ label: "> 2hb*", zone: 4 });
    const rows = zones.map(({ label, zone }) => {
      const cp    = r4(cpVert(zone, hbL, rf));
      const qhGCp = r2(qzEval * G * cp);
      const pPos  = r2(qzEval * G * cp - qzEval * gcpi);  // w/+GCpi
      const pNeg  = r2(qzEval * G * cp + qzEval * gcpi);  // w/-GCpi
      return { label, cp, qhGCp, pPos, pNeg };
    });
    // §27.1.5 minimum upward net pressure row (Cp = -GCpi)
    const cpMin  = -gcpi;
    rows.push({
      label:  "Upward or min wind pressure",
      cp:     r4(cpMin),
      qhGCp:  r2(qzEval * G * cpMin),
      pPos:   r2(qzEval * G * cpMin - qzEval * gcpi),
      pNeg:   r2(qzEval * G * cpMin + qzEval * gcpi),
      isMin:  true,
    });
    return rows;
  }

  return {
    ok: true, hb, anyElev, elev_d1, elev_d2,
    area_ratio: r4(area_ratio), footprint, total_below,
    lim1_d1, lim1_d2, maxR_d1: r4(maxR_d1), maxR_d2: r4(maxR_d2),
    projRatio_d1: r4(projRatio_d1), projRatio_d2: r4(projRatio_d2),
    lim2_d1, lim2_d2, projW_d1, projW_d2,
    z_eval, kzEval: r4(kzEval), kztZ: r4(kztZ), qzEval: r2(qzEval),
    p_horiz, force_d1, force_d2,
    hbL_n: r4(hbL_n), hbL_p: r4(hbL_p), rf_n: r4(rf_n), rf_p: r4(rf_p),
    vert_normal: vertZones(hbL_n, rf_n),
    vert_parallel: vertZones(hbL_p, rf_p),
    gcpi,
  };
}

/* ─────────────────────────────────────────────────────────────────────
   ROOF W  — Rooftop Structures, Canopies, Solar Panels
   §27.3.3 (rooftop equip), Ch.30 (canopy), §29.4.4 (solar parallel),
   §29.4.5 (solar not-parallel)
───────────────────────────────────────────────────────────────────── */
export async function apiRW(P) {
  const { project: p, geometry: g, kd, kztInputs } = P;
  const ke   = keOf(p.code_version, 0);
  const iw = importanceFactorOf(p.code_version, p.risk_category);
  const kztH = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft,
                       kztInputs.x_ft, g.h_ft, kztInputs.upwind).kzt;
  const qh   = compQz(p.V_mph, p.exposure, g.h_ft, kd, ke, p.code_version, kztH, iw).qz; // Kd·qh

  const is705    = p.code_version === "7-05";
  const isKdAtPressureRW = p.code_version === "7-05" || p.code_version === "7-10";
  // Equipment §29.4.1: same Kd=0.85 as the building for all codes
  const qhEquip  = r2(qh);
  // Solar/canopy uses Kd=0.85 (C&C). For 7-05 & 7-10: remove Kd; others: qh as-is
  const qhSolar  = r2(isKdAtPressureRW ? qh / kd : qh);
  // Minimum solar panel pressure: 10 psf (ASD, 7-05 §6.1.4.1) vs 16 psf (LRFD, 7-10+ §29.4)
  const minSolar = is705 ? 10 : 16;
  // 7-16/7-22: GCr method — F = Kd·qh × GCr × A
  //   GCr = 1.5 vertical, 1.9 horizontal; Ar = plan area; Af = face area
  // 7-05 (§6.5.15.2): Cf method — F = qz_c × G × Cf × adj × Af
  //   qz_c at equipment centroid height; G=0.85; Cf from h/b table; adj from h_eq/h_bldg

  function interpCf7_05(hb) {
    // Cf table: breakpoints h/b = [1, 7, 25], Cf = [1.3, 1.4, 2.0]
    if (hb <= 1)  return 1.3;
    if (hb <= 7)  return 1.3 + (1.4 - 1.3) / 6 * (hb - 1);
    if (hb <= 25) return 1.4 + (2.0 - 1.4) / 18 * (hb - 7);
    return 2.0;
  }

  function adjFactor7_05(hEq, H) {
    // ASCE 7-05 §6.5.15: horizontal force amplification factor = 1.9
    // Consistent with GCr_h = 1.9 from §29.4.1 (applied on top of Cf from Table 6-8)
    return 1.9;
  }

  function calcEquip(lL, lB, hEq) {
    const Ar   = lL * lB;
    const Af_B = lB * hEq;
    const Af_L = lL * hEq;

    if (is705) {
      // 7-05: Cf/Af method at centroid height
      const G705 = 0.85;
      const Kd705 = 0.9;  // ASCE 7-05 Table 6-4 for rooftop structures
      const z_c = g.h_ft + hEq / 2;  // height to equipment centroid above ground
      const kztC = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft,
                            kztInputs.x_ft, Math.max(z_c, 15), kztInputs.upwind).kzt;
      // 7-05 §6.5.15.2: qz evaluated at mean roof height z=h, NO Kd in velocity pressure
      // Kd=0.9 for rooftop structures applied at force level via adj factor
      const qzC = compQz(p.V_mph, p.exposure, Math.max(g.h_ft, 15), 1.0, ke,
                          p.code_version, kztC, iw).qz;
      const adj = adjFactor7_05(hEq, g.h_ft);
      const Cf_B = interpCf7_05(hEq / lB);
      const Cf_L = interpCf7_05(hEq / lL);
      const unit_B = r2(qzC * G705 * adj);   // psf (unit pressure without Cf or Af)
      const unit_L = r2(qzC * G705 * adj);
      return {
        Ar: r2(Ar), Af_B: r2(Af_B), Af_L: r2(Af_L),
        method: "Cf", G: G705, qzC: r2(qzC), adj: r4(adj),
        Cf_B: r4(Cf_B), Cf_L: r4(Cf_L),
        unit_B, unit_L,
        Fh_B: r4(Af_B * unit_B * Cf_B / 1000),
        Fh_L: r4(Af_L * unit_L * Cf_L / 1000),
        Fv: 0,  // 7-05 §6.5.15 horizontal forces only from Cf method
      };
    }

    // 7-10/7-16/7-22: GCr method. For 7-10: Kd removed from qh (same as solar/C&C convention)
    const qhGCr = isKdAtPressureRW ? qhSolar : qhEquip;
    const GCr_v = 1.5, GCr_h = 1.9;
    const unit_v  = r2(qhGCr * GCr_v);
    const unit_hB = r2(qhGCr * GCr_h);
    const unit_hL = r2(qhGCr * GCr_h);
    return {
      Ar: r2(Ar), Af_B: r2(Af_B), Af_L: r2(Af_L),
      method: "GCr", GCr_v, GCr_h,
      unit_v, unit_hB, unit_hL,
      Fv:   r4(Ar   * unit_v  / 1000),
      Fh_B: r4(Af_B * unit_hB / 1000),
      Fh_L: r4(Af_L * unit_hL / 1000),
    };
  }
  // Compute forces for all equipment items in the dynamic array
  const equipList = (g.rw_equip && g.rw_equip.length) ? g.rw_equip : [{ lL:10, lB:5, h:5 }];
  const equip = equipList.map(e => calcEquip(e.lL||5, e.lB||5, e.h||5));
  // Keep legacy eq1/eq2 for backward compat with any other references
  const eq1 = equip[0] ?? null;
  const eq2 = equip[1] ?? null;

  // ── Attached Canopies h ≤ 60 ft ──────────────────────────────────────
  // GCp coefficients from ASCE 7 Fig. 30.9-1, log-interpolated over area
  // hc/he bracket: <0.5 → coeff=-0.6/-0.5; 0.5–0.9 → -0.9/-0.65; ≥0.9 → -1.4/etc.
  // Upper neg: -1.15 at ≤10sf, -0.75 at >100sf, interp: -1.55+0.4*ln(A)/ln(10) (approx)
  // Spreadsheet uses: upper neg = (-1.55 + 0.4*LOG(A))*qh, lower neg = (-0.95+0.15*LOG(A))*qh etc.
  // Combined net = hc_he_factor × qh (from table), pos = 0.9*qh at ≤10sf, 0.65*qh at >100sf
  function canopyGCp(area, hc_he) {
    const q = qhSolar; // Canopy §30.11 uses Kd=0.85 (C&C), not 0.9 (rooftop equip)
    const gcNet = hc_he >= 0.9 ? -1.4 : hc_he > 0.5 ? -0.9 : -0.6;
    // Upper neg: -1.15 at ≤10, -0.75 at >100, log-interp between
    const upperNeg = area <= 10 ? -1.15*q : area >= 100 ? -0.75*q
      : (-1.55 + 0.4*Math.log10(area))*q;
    // Lower neg: -0.80 at ≤10, -0.65 at >100, log-interp
    const lowerNeg = area <= 10 ? -0.80*q : area >= 100 ? -0.65*q
      : (-0.95 + 0.15*Math.log10(area))*q;
    // Pos (upper or lower): 0.8 at ≤10, 0.6 at >100
    const pos = area <= 10 ? 0.80*q : area >= 100 ? 0.60*q
      : (1.0 - 0.087*Math.log(area))*q;  // natural log
    // Combined net neg: gcNet * qh, pos: 0.9 at ≤10, 0.65 at >100
    const combNeg = gcNet * q;
    const combPos = area <= 10 ? 0.9*q : area >= 100 ? 0.65*q
      : (1.15 - 0.1086*Math.log(area))*q;  // natural log
    return {
      upperNeg:r2(upperNeg), lowerNeg:r2(lowerNeg), pos:r2(pos),
      combNeg:r2(combNeg), combPos:r2(combPos),
    };
  }
  let canopy = null;
  if (g.rw_can_en) {
    const he = g.rw_can_he || 60, hc = g.rw_can_hc || 45;
    const hc_he = he > 0 ? hc / he : 0;
    const areas = [10, 20, 50, 100];
    canopy = {
      he: r2(he), hc: r2(hc), hc_he: r4(hc_he),
      areas,
      rows: areas.map(a => ({ area:a, ...canopyGCp(a, hc_he) })),
    };
  }

  // ── Solar Panels — Parallel to Roof (w ≤ 2°) §29.4.4 ────────────────
  // ga formula (ASCE 7-22) from spreadsheet:
  //   ga_base  = A≤10→0.6, A≥100→0.4, else 0.7978−0.086·ln(A)
  //   ga_solid = A≤10→0.8, A≥100→0.4, else 1.201−0.174·ln(A)
  //   gap_f1   = gap_in<0.25→1, >0.75→0, else 1−(gap−0.25)/0.5
  //   gap_f2   = h2_in<5→0, >10→1, else 1−(10−h2_in)/5
  //   AO97     = (gap_f1+gap_f2)/2
  //   ga       = ga_base + (ga_solid−ga_base)·AO97
  const gap_in = g.rw_sol_np_gap || 0.25;
  const h2_in  = (g.rw_sol_np_h2 || 0.8) * 12;
  const d1_par = g.rw_sol_np_d1  || 18.4;
  const d2_par = g.rw_sol_np_d2  || 1;
  const h2_par = g.rw_sol_np_h2  || 0.8;
  const gap_f1 = gap_in < 0.25 ? 1 : gap_in > 0.75 ? 0 : 1 - (gap_in - 0.25) / 0.5;
  const gap_f2 = h2_in  < 5    ? 0 : h2_in  > 10   ? 1 : 1 - (10 - h2_in) / 5;
  const AO97   = (gap_f1 + gap_f2) / 2;

  function solarParGaAt(A) {
    const base   = A <= 10 ? 0.6  : A >= 100 ? 0.4 : 0.7978 - 0.086 * Math.log(A);
    const solid  = A <= 10 ? 0.8  : A >= 100 ? 0.4 : 1.201  - 0.174 * Math.log(A);
    return r4(base + (solid - base) * AO97);
  }

  // Exposure check for parallel solar (same criteria as not-parallel)
  const par_exposed = d1_par > 0.5 * g.h_ft && (d1_par > Math.max(4*h2_par, 4) || d2_par > Math.max(4*h2_par, 4));

  let solarPar = null;
  // Always compute (toggle controls UI only)
  {
    const userArea = g.rw_sol_par_area || 34;
    const ga_user  = solarParGaAt(userArea);
    const areas_std = [10, 20, 50, 100];
    solarPar = {
      userArea, ga_user,
      AO97: r4(AO97), gap_f1: r4(gap_f1), gap_f2: r4(gap_f2),
      exposed: par_exposed,
      table: areas_std.map(a => {
        const ga = solarParGaAt(a);
        return { area:a, ga, exp_up:r4(1.5*ga), nonexp_up:r4(1.0*ga), down:r4(1.0*ga) };
      }),
      user_row: { area:userArea, ga:ga_user, exp_up:r4(1.5*ga_user), nonexp_up:r4(1.0*ga_user), down:r4(1.0*ga_user) },
    };
  }

  // ── Solar Panels — Not Parallel to Roof §29.4.5 ─────────────────────
  // GCrn = gp × gc × gE × GCrn_nom
  // gp = 0.9 + hpt/h, capped at 1.2
  // gc = max(0.6+0.06*Lp, 0.8), capped — spreadsheet: IF(0.6+0.06*Lp<0.8,0.8,0.6+0.06*Lp)
  // GCrn_nom: log10-interp table vs An (normalized area = A×1000/Lb²)
  // Lb = min(0.4*(h*WL)^0.5, h, Ws)  where WL=L, Ws=B
  // An breakpoints: 0, 10, 100, 500, 1000, 5000
  // Two tables: w=0-5° (rows 110-112) and w=15-35° (rows 116-118), interp between for 5-15°
  // Panel angle w≤2° treated same as parallel; procedure applies for w>2° per note

  // GCrn_nom table (log10 formulas from spreadsheet)
  // GCrn_nom piecewise log10 formulas directly from spreadsheet cells
  // Exposed (w<=5 deg): formula1 covers 0<An<=500, formula2 covers 500<An<=5000
  // Non-exposed (w>=15 deg): separate formula coefficients
  const GCRNNOM_w5 = {
    z1: { f1:[1.5,      0.426088], f2:[1.02474, 0.25],     floor:0.1  },
    z2: { f1:[2.0,      0.574293], f2:[1.25969, 0.3],      floor:0.15 },
    z3: { f1:[2.3,      0.666921], f2:[1.445,   0.3501],   floor:0.15 },
  };
  const GCRNNOM_w15 = {
    z1: { f1:[2.0,      0.533537], f2:[1.2608,  0.2595],   floor:0.3  },
    z2: { f1:[2.88,     0.82624],  f2:[1.325,   0.25008],  floor:0.4  },
    z3: { f1:[3.5,      1.000382], f2:[1.61,    0.3],      floor:0.5  },
  };

  function gcrnNomAt(An, coeff) {
    if (An <= 0)    return coeff.f1[0];
    if (An <= 500)  return coeff.f1[0] - coeff.f1[1]*Math.log10(An);
    if (An <= 5000) return coeff.f2[0] - coeff.f2[1]*Math.log10(An);
    return coeff.floor;
  }

  function getGCrnNom(w, An) {
    const nom5  = { z1:gcrnNomAt(An,GCRNNOM_w5.z1),  z2:gcrnNomAt(An,GCRNNOM_w5.z2),  z3:gcrnNomAt(An,GCRNNOM_w5.z3)  };
    const nom15 = { z1:gcrnNomAt(An,GCRNNOM_w15.z1), z2:gcrnNomAt(An,GCRNNOM_w15.z2), z3:gcrnNomAt(An,GCRNNOM_w15.z3) };
    if (w <= 5)  return nom5;
    if (w >= 15) return nom15;
    const t = (w - 5) / 10;
    return {
      z1: nom5.z1 + t*(nom15.z1 - nom5.z1),
      z2: nom5.z2 + t*(nom15.z2 - nom5.z2),
      z3: nom5.z3 + t*(nom15.z3 - nom5.z3),
    };
  }

  let solarNP = null;
  // Always compute base geometry for the shared input panel (Lb, exposure thresholds)
  {
    const w    = g.rw_sol_np_w   || 0;
    const h1   = g.rw_sol_np_h1  || 0.8;
    const h2   = g.rw_sol_np_h2  || 0.8;
    const Lp   = g.rw_sol_np_Lp  || 6;
    const hpt  = g.rw_sol_np_hpt || 0;
    const d1   = g.rw_sol_np_d1  || 18.4;
    const d2   = g.rw_sol_np_d2  || 1;
    const WL   = g.L_ft, Ws = g.B_ft, hh = g.h_ft;
    const gp   = Math.min(1.2, 0.9 + hpt / hh);
    const gc   = Math.max(0.8, 0.6 + 0.06*Lp);
    const Lb   = Math.min(0.4*Math.sqrt(hh*WL), hh, Ws);
    const half_h = 0.5 * hh;
    const thresh4 = Math.max(4*h2, 4);
    const exposed = d1 > half_h && (d1 > thresh4 || d2 > thresh4);
    const gE_exp = 1.5, gE_nexp = 1.0;
    const std_areas = [0, 10, 100, 500, 1000, 5000];
    const area1 = g.rw_sol_np_area1 || 10;
    const area2 = g.rw_sol_np_area2 || 1000;
    const An1   = r2(area1 * 1000 / (Math.max(Lb, 15) ** 2));
    const An2   = r2(area2 * 1000 / (Math.max(Lb, 15) ** 2));
    function userCol(A, An_val) {
      const n = getGCrnNom(w, An_val);
      return {
        A, An: An_val,
        exp:  r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_exp*n.z1),minSolar)),  exp_z2:  r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_exp*n.z2),minSolar)),  exp_z3:  r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_exp*n.z3),minSolar)),
        nexp: r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_nexp*n.z1),minSolar)), nexp_z2: r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_nexp*n.z2),minSolar)), nexp_z3: r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_nexp*n.z3),minSolar)),
        down: r2(Math.max(qhSolar*gp*gc*gE_nexp*n.z1,minSolar)),            down_z2: r2(Math.max(qhSolar*gp*gc*gE_nexp*n.z2,minSolar)),            down_z3: r2(Math.max(qhSolar*gp*gc*gE_nexp*n.z3,minSolar)),
      };
    }
    if (true) {  // always compute full object; toggle controls UI only
      solarNP = {
        gp: r4(gp), gc: r4(gc), Lb: r2(Lb),
        exposed, half_h: r2(half_h), thresh4: r2(thresh4),
        std_areas,
        user1: userCol(area1, An1),
        user2: userCol(area2, An2),
        tbl_exp:  std_areas.map(An => { const n=getGCrnNom(w,An); return { z1:r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_exp*n.z1),minSolar)), z2:r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_exp*n.z2),minSolar)), z3:r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_exp*n.z3),minSolar)) }; }),
        tbl_nexp: std_areas.map(An => { const n=getGCrnNom(w,An); return { z1:r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_nexp*n.z1),minSolar)), z2:r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_nexp*n.z2),minSolar)), z3:r2(-Math.max(Math.abs(qhSolar*gp*gc*gE_nexp*n.z3),minSolar)) }; }),
        tbl_down: std_areas.map(An => { const n=getGCrnNom(w,An); return { z1:r2(Math.max(qhSolar*gp*gc*gE_nexp*n.z1,minSolar)), z2:r2(Math.max(qhSolar*gp*gc*gE_nexp*n.z2,minSolar)), z3:r2(Math.max(qhSolar*gp*gc*gE_nexp*n.z3,minSolar)) }; }),
      };
    }
  }

  const qhGCr = isKdAtPressureRW ? qhSolar : qhEquip;
  return { ok:true, qh: r2(qhSolar), qhEquip, qhSolar, qhGCr, equip, eq1, eq2, canopy, solarPar, solarNP };
}

/* ─────────────────────────────────────────────────────────────────────
   OPEN BUILDINGS  —  ASCE 7 Ch.27 §27.4.1 / Ch.30 §30.8
───────────────────────────────────────────────────────────────────── */
export async function apiOB(P) {
  const { project: p, geometry: g, kd, kztInputs } = P;
  const ke    = keOf(p.code_version, 0);
  const iw = importanceFactorOf(p.code_version, p.risk_category);
  const kztH  = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft,
                        kztInputs.x_ft, g.h_ft, kztInputs.upwind).kzt;
  const qh    = compQz(p.V_mph, p.exposure, g.h_ft, kd, ke, p.code_version, kztH, iw).qz;
  const qhOB = (p.code_version === "7-05" || p.code_version === "7-10") ? qh / kd : qh;
  const G     = 0.85;
  const theta = g.roof_angle_deg || 0;
  const h     = g.h_ft;
  const clear = (g.ob_wind_flow || "clear") === "clear";
  const roofType = g.ob_roof_type || "monoslope";

  if (theta > 45) return { ok:false, reason:"Roof angle > 45° — procedure not applicable" };

  function interp1(x, xArr, yArr) {
    if (x <= xArr[0]) return yArr[0];
    for (let i = 0; i < xArr.length - 1; i++) {
      if (x <= xArr[i+1]) return yArr[i] + (x - xArr[i]) / (xArr[i+1] - xArr[i]) * (yArr[i+1] - yArr[i]);
    }
    return yArr[yArr.length - 1];
  }

  // ── MWFRS Normal to Ridge ─────────────────────────────────────────────
  // Case A and Case B have SEPARATE 7-row angle tables (breakpoints 0,7.5,15,22.5,30,37.5,45°)
  // Each table: [CnwA, CnlA] for Case A, [CnwB, CnlB] for Case B
  // Monoslope also has γ=180° columns [CnwA_180, CnlA_180] appended to Case A table
  // Spreadsheet logic: angle<7.5 -> use row0 constant; 7.5-15 -> interp row0-row1, etc.
  // Breakpoints start at 7.5 so interp1's "x <= xArr[0]" catches anything below 7.5
  const ANG = [7.5, 15, 22.5, 30, 37.5, 45];

  // Monoslope Clear — Case A (rows 24-30 cols V-W + Z-AA for γ=180)
  //   [CnwA_γ0, CnlA_γ0, CnwA_γ180, CnlA_γ180]
  const MONO_A_CLR = [
    [ 1.2, 0.3, 1.2, 0.3],
    [-0.6,-1.0, 0.9, 1.5],
    [-0.9,-1.3, 1.3, 1.6],
    [-1.5,-1.6, 1.7, 1.8],
    [-1.8,-1.8, 2.1, 2.1],
    [-1.8,-1.8, 2.1, 2.2],
    [-1.6,-1.8, 2.2, 2.5],
  ];
  // Monoslope Clear — Case B (rows 40-46 cols V-W)  [CnwB, CnlB]
  const MONO_B_CLR = [
    [-1.1,-0.1],
    [-1.4, 0.0],
    [-1.9, 0.0],
    [-2.4,-0.3],
    [-2.5,-0.5],
    [-2.4,-0.6],
    [-2.3,-0.7],
  ];
  // Monoslope Obstructed — Case A (rows 24-30 cols AB-AC + AF-AG)
  //   [CnwA_γ0, CnlA_γ0, CnwA_γ180, CnlA_γ180]
  const MONO_A_OBS = [
    [-0.5,-1.2, 1.2, 0.3],
    [-0.2,-1.2, 1.1,-0.3],
    [ 0.4,-1.1, 1.1,-0.4],
    [ 0.5,-1.0, 1.1, 0.1],
    [ 0.6,-1.0, 1.3, 0.3],
    [ 0.7,-0.9, 1.3, 0.6],
    [ 0.8,-0.9, 1.1, 0.9],
  ];
  // Monoslope Obstructed — Case B (rows 40-46 cols AB-AC)  [CnwB, CnlB]
  const MONO_B_OBS = [
    [-1.1,-0.6],
    [ 0.8,-0.3],
    [ 1.2,-0.3],
    [ 1.3, 0.0],
    [ 1.6, 0.1],
    [ 1.9, 0.3],
    [ 2.1, 0.4],
  ];

  // Gable/Hip Clear — Case A (rows 24-30 cols AF-AG)  [CnwA, CnlA]
  const GABLE_A_CLR = [
    [ 1.2, 0.3],
    [ 1.1,-0.3],
    [ 1.1,-0.4],
    [ 1.1, 0.1],
    [ 1.3, 0.3],
    [ 1.3, 0.6],
    [ 1.1, 0.9],
  ];
  // Gable/Hip Clear — Case B (rows 40-46 cols AF-AG)  [CnwB, CnlB]
  const GABLE_B_CLR = [
    [-1.1,-0.1],
    [ 0.2,-1.2],
    [ 0.1,-1.1],
    [-0.1,-0.8],
    [-0.1,-0.9],
    [-0.2,-0.6],
    [-0.3,-0.5],
  ];
  // Gable/Hip Obstructed — Case A (rows 24-30 cols AH-AI)  [CnwA, CnlA]
  const GABLE_A_OBS = [
    [-0.5,-1.2],
    [-1.6,-1.0],
    [-1.2,-1.0],
    [-1.2,-1.2],
    [-0.7,-0.7],
    [-0.6,-0.6],
    [-0.5,-0.5],
  ];
  // Gable/Hip Obstructed — Case B (rows 40-46 cols AH-AI)  [CnwB, CnlB]
  const GABLE_B_OBS = [
    [-1.1,-0.6],
    [-0.9,-1.7],
    [-0.6,-1.6],
    [-0.8,-1.7],
    [-0.2,-1.1],
    [-0.3,-0.9],
    [-0.3,-0.7],
  ];

  // Troughed Clear — Case A (rows 24-30 cols AL-AM)  [CnwA, CnlA]
  const TROUG_A_CLR = [
    [ 1.2, 0.3],
    [-1.1, 0.3],
    [-1.1, 0.4],
    [-1.1,-0.1],
    [-1.3,-0.3],
    [-1.3,-0.6],
    [-1.1,-0.9],
  ];
  // Troughed Clear — Case B (rows 40-46 cols AL-AM)  [CnwB, CnlB]
  const TROUG_B_CLR = [
    [-1.1,-0.1],
    [-0.2, 1.2],
    [ 0.1, 1.1],
    [-0.1, 0.8],
    [-0.1, 0.9],
    [ 0.2, 0.6],
    [ 0.3, 0.5],
  ];
  // Troughed obstructed = same as clear per spreadsheet (no separate obstructed table)
  const TROUG_A_OBS = TROUG_A_CLR;
  const TROUG_B_OBS = TROUG_B_CLR;

  let mwfrs_normal;
  if (roofType === "monoslope") {
    const tblA = clear ? MONO_A_CLR : MONO_A_OBS;
    const tblB = clear ? MONO_B_CLR : MONO_B_OBS;
    const CnwA   = r4(interp1(theta, ANG, tblA.map(r => r[0])));
    const CnlA   = r4(interp1(theta, ANG, tblA.map(r => r[1])));
    const CnwA180 = r4(interp1(theta, ANG, tblA.map(r => r[2])));
    const CnlA180 = r4(interp1(theta, ANG, tblA.map(r => r[3])));
    const CnwB   = r4(interp1(theta, ANG, tblB.map(r => r[0])));
    const CnlB   = r4(interp1(theta, ANG, tblB.map(r => r[1])));
    mwfrs_normal = { cases: [
      { label:"A (γ=0°)",   Cnw:CnwA,    Cnl:CnlA,    pw:r2(qhOB*G*CnwA),    pl:r2(qhOB*G*CnlA)    },
      { label:"B (γ=0°)",   Cnw:CnwB,    Cnl:CnlB,    pw:r2(qhOB*G*CnwB),    pl:r2(qhOB*G*CnlB)    },
      { label:"A (γ=180°)", Cnw:CnwA180, Cnl:CnlA180, pw:r2(qhOB*G*CnwA180), pl:r2(qhOB*G*CnlA180) },
    ], monoGamma180: true };
  } else {
    const tblA = roofType === "gable" ? (clear ? GABLE_A_CLR : GABLE_A_OBS)
                                      : (clear ? TROUG_A_CLR : TROUG_A_OBS);
    const tblB = roofType === "gable" ? (clear ? GABLE_B_CLR : GABLE_B_OBS)
                                      : (clear ? TROUG_B_CLR : TROUG_B_OBS);
    const CnwA=r4(interp1(theta,ANG,tblA.map(r=>r[0]))), CnlA=r4(interp1(theta,ANG,tblA.map(r=>r[1])));
    const CnwB=r4(interp1(theta,ANG,tblB.map(r=>r[0]))), CnlB=r4(interp1(theta,ANG,tblB.map(r=>r[1])));
    mwfrs_normal = { cases: [
      { label:"A", Cnw:CnwA, Cnl:CnlA, pw:r2(qhOB*G*CnwA), pl:r2(qhOB*G*CnlA) },
      { label:"B", Cnw:CnwB, Cnl:CnlB, pw:r2(qhOB*G*CnwB), pl:r2(qhOB*G*CnlB) },
    ], monoGamma180: false };
  }

  // ── MWFRS Parallel to Ridge (γ=90°) — angle-independent ──────────────
  const PAR_CN = clear
    ? { A:[-0.8,-0.6,-0.3], B:[0.8,0.5,0.3] }
    : { A:[-1.2,-0.9,-0.6], B:[0.5,0.5,0.3] };
  const mwfrs_parallel = {
    h_val:r2(h), h2_val:r2(2*h),
    caseA_Cn:PAR_CN.A, caseB_Cn:PAR_CN.B,
    caseA_p: PAR_CN.A.map(cn => r2(qhOB*G*cn)),
    caseB_p: PAR_CN.B.map(cn => r2(qhOB*G*cn)),
  };

  // ── Fascia panels (θ ≤ 5° only) ──────────────────────────────────────
  const fascia_ok = theta <= 5;
  const fascia = fascia_ok ? { qp:r2(qhOB), ww:r2(qhOB*1.5), lw:r2(qhOB*-1.0) } : null;

  // ── C&C Zones 1/2/3 (§30.8) ──────────────────────────────────────────
  const a_cc = Math.max(Math.min(0.1*Math.min(g.L_ft,g.B_ft), 0.4*h), 3);
  const a2   = r2(a_cc*a_cc), a4a2 = r2(4*a_cc*a_cc);
  const ANG_CC = [0, 7.5, 15, 30, 45];
  // Tables: 3 area brackets, each 5 angle rows, 6 CN cols [z3+, z3-, z2+, z2-, z1+, z1-]
  const MONO_CC_CLR = {
    b1:[[2.4,-3.3,1.8,-1.7,1.2,-1.1],[3.2,-4.2,2.4,-2.1,1.6,-1.4],[3.6,-3.8,2.7,-2.9,1.8,-1.9],[5.2,-5.0,3.9,-3.8,2.6,-2.5],[5.2,-4.6,3.9,-3.5,2.6,-2.3]],
    b2:[[1.8,-1.7,1.8,-1.7,1.2,-1.1],[2.4,-2.1,2.4,-2.1,1.6,-1.4],[2.7,-2.9,2.7,-2.9,1.8,-1.9],[3.9,-3.8,3.9,-3.8,2.6,-2.5],[3.9,-3.5,3.9,-3.5,2.6,-2.3]],
    b3:[[1.2,-1.1,1.2,-1.1,1.2,-1.1],[1.6,-1.4,1.6,-1.4,1.6,-1.4],[1.8,-1.9,1.8,-1.9,1.8,-1.9],[2.6,-2.5,2.6,-2.5,2.6,-2.5],[2.6,-2.3,2.6,-2.3,2.6,-2.3]],
  };
  const MONO_CC_OBS = {
    b1:[[1.0,-3.6,0.8,-1.8,0.5,-1.2],[1.6,-5.1,1.2,-2.6,0.8,-1.7],[2.4,-4.2,1.8,-3.2,1.2,-2.1],[3.2,-4.6,2.4,-3.5,1.6,-2.3],[4.2,-3.8,3.2,-2.9,2.1,-1.9]],
    b2:[[0.8,-1.8,0.8,-1.8,0.5,-1.2],[1.2,-2.6,1.2,-2.6,0.8,-1.7],[1.8,-3.2,1.8,-3.2,1.2,-2.1],[2.4,-3.5,2.4,-3.5,1.6,-2.3],[3.2,-2.9,3.2,-2.9,2.1,-1.9]],
    b3:[[0.5,-1.2,0.5,-1.2,0.5,-1.2],[0.8,-1.7,0.8,-1.7,0.8,-1.7],[1.2,-2.1,1.2,-2.1,1.2,-2.1],[1.6,-2.3,1.6,-2.3,1.6,-2.3],[2.1,-1.9,2.1,-1.9,2.1,-1.9]],
  };
  const GABLE_CC_CLR = {
    b1:[[2.4,-3.3,1.8,-1.7,1.2,-1.1],[2.2,-3.6,1.7,-1.8,1.1,-1.2],[2.2,-2.2,1.7,-1.7,1.1,-1.1],[2.6,-1.8,2.0,-1.4,1.3,-0.9],[2.2,-1.6,1.7,-1.2,1.1,-0.8]],
    b2:[[1.8,-1.7,1.8,-1.7,1.2,-1.1],[1.7,-1.8,1.7,-1.8,1.1,-1.2],[1.7,-1.7,1.7,-1.7,1.1,-1.1],[2.0,-1.4,2.0,-1.4,1.3,-0.9],[1.7,-1.2,1.7,-1.2,1.1,-0.8]],
    b3:[[1.2,-1.1,1.2,-1.1,1.2,-1.1],[1.1,-1.2,1.1,-1.2,1.1,-1.2],[1.1,-1.1,1.1,-1.1,1.1,-1.1],[1.3,-0.9,1.3,-0.9,1.3,-0.9],[1.1,-0.8,1.1,-0.8,1.1,-0.8]],
  };
  const TROUG_CC_CLR = {
    b1:[[2.4,-3.3,1.8,-1.7,1.2,-1.1],[2.4,-3.3,1.8,-1.7,1.2,-1.1],[2.2,-2.2,1.7,-1.7,1.1,-1.1],[1.8,-2.6,1.4,-2.0,0.9,-1.3],[1.6,-2.2,1.2,-1.7,0.8,-1.1]],
    b2:[[1.8,-1.7,1.8,-1.7,1.2,-1.1],[1.8,-1.7,1.8,-1.7,1.2,-1.1],[1.7,-1.7,1.7,-1.7,1.1,-1.1],[1.4,-2.0,1.4,-2.0,0.9,-1.3],[1.2,-1.7,1.2,-1.7,0.8,-1.1]],
    b3:[[1.2,-1.1,1.2,-1.1,1.2,-1.1],[1.2,-1.1,1.2,-1.1,1.2,-1.1],[1.1,-1.1,1.1,-1.1,1.1,-1.1],[0.9,-1.3,0.9,-1.3,0.9,-1.3],[0.8,-1.1,0.8,-1.1,0.8,-1.1]],
  };

  const ccTbl = roofType === "monoslope" ? (clear ? MONO_CC_CLR : MONO_CC_OBS)
              : roofType === "gable"     ? GABLE_CC_CLR
              :                           TROUG_CC_CLR;

  function getCcCN(brk, col) {
    return interp1(theta, ANG_CC, ccTbl[brk].map(r => r[col]));
  }

  const cc_brackets = [
    { label:"≤ " + a2 + " sf (≤ a²)",           key:"b1" },
    { label:"> " + a2 + ", ≤ " + a4a2 + " sf",   key:"b2" },
    { label:"> " + a4a2 + " sf (> 4a²)",          key:"b3" },
  ];
  const cc_zones = cc_brackets.map(({ label, key }) => {
    const [z3p,z3n,z2p,z2n,z1p,z1n] = [0,1,2,3,4,5].map(c => r4(getCcCN(key,c)));
    const minOB = (p.code_version === "7-05") ? 10 : 16;
    const ap = v => v < 0 && Math.abs(v) < minOB ? -minOB : v;
    return { area_label:label,
      CN:  { z3p, z3n, z2p, z2n, z1p, z1n },
      psf: {
        z3p:r2(qhOB*G*z3p), z3n:r2(ap(qhOB*G*z3n)),
        z2p:r2(qhOB*G*z2p), z2n:r2(ap(qhOB*G*z2n)),
        z1p:r2(qhOB*G*z1p), z1n:r2(ap(qhOB*G*z1n)),
      },
    };
  });

  return {
    ok:true, qh:r2(qhOB), G, theta, a_cc:r2(a_cc), a2, a4a2,
    roofType, clear,
    mwfrs_normal, mwfrs_parallel,
    fascia, fascia_ok,
    cc_zones, minP: (p.code_version === "7-05") ? 10 : 16,
    code_version: p.code_version,
  };
}

/* ─────────────────────────────────────────────────────────────────
   OTHER STRUCTURES — §29.3 / §29.4 / §29.5 / Table 29.3-1/2
   A. Solid Freestanding Walls & Solid Signs (§29.3)
   B. Open Signs & Single-Plane Open Frames (§29.4)
   C. Chimneys, Tanks & Similar Structures (§29.5)
   D. Trussed Towers (§29.6)
─────────────────────────────────────────────────────────────────── */
export async function apiOtherW(P) {
  const { project: p, geometry: g, kd, kztInputs } = P;
  const ke  = keOf(p.code_version, 0);
  const iw  = importanceFactorOf(p.code_version, p.risk_category);
  const G   = 0.85;
  const isKdAtP = p.code_version === "7-05" || p.code_version === "7-10";

  function qzAt(z, kd_local, kzt_local) {
    return compQz(p.V_mph, p.exposure, z, kd_local, ke, p.code_version, kzt_local, iw).qz;
  }
  function kzAt(z) {
    return compQz(p.V_mph, p.exposure, z, kd, ke, p.code_version, 1.0, iw).kz;
  }

  // ── A. Solid Freestanding Walls & Solid Signs ──────────────────
  // §29.3.1 / Table 29.3-1  F = qz·G·Cf·As  (7-22)
  // Cf from Table 29.3-1: rows=s/h (0.16–1.0), cols=B/s (s/h from sheet)
  const SH_ROWS  = [1, 0.9, 0.7, 0.5, 0.3, 0.2, 0.16];
  const BS_COLS  = [0.05, 0.1, 0.2, 0.5, 1, 2, 4, 5, 10, 20, 30, 45];
  const CF_AB = [
    [1.80,1.70,1.65,1.55,1.45,1.40,1.35,1.35,1.30,1.30,1.30,1.30],
    [1.85,1.75,1.70,1.60,1.55,1.50,1.45,1.45,1.40,1.40,1.40,1.40],
    [1.90,1.85,1.75,1.70,1.65,1.60,1.60,1.55,1.55,1.55,1.55,1.55],
    [1.95,1.85,1.80,1.75,1.75,1.70,1.70,1.70,1.70,1.70,1.70,1.75],
    [1.95,1.90,1.85,1.80,1.80,1.80,1.80,1.80,1.80,1.85,1.85,1.85],
    [1.95,1.90,1.85,1.80,1.80,1.80,1.80,1.80,1.85,1.90,1.90,1.95],
    [1.95,1.90,1.85,1.85,1.80,1.80,1.85,1.85,1.85,1.90,1.90,1.95],
  ];
  // Case C Cf (horizontal distribution from windward edge, B/s cols 2-10)
  const CC_BS_COLS = [2,3,4,5,6,7,8,9,10,13];
  const CC_ZONES   = ["0 to s","s to 2s","2s to 3s","3s to 10s"];
  const CF_CC = [
    [2.25,2.60,2.90,3.10,3.30,3.40,3.55,3.65,3.75,4.00],
    [1.50,1.70,1.90,2.00,2.15,2.25,2.30,2.35,2.45,2.60],
    [0.00,1.15,1.30,1.45,1.55,1.65,1.70,1.75,1.85,2.00],
    [0.00,0.00,1.10,1.05,1.05,1.05,1.05,1.00,0.95,0.90],
  ];

  function interpLinear(x, xs, ys) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length-1]) return ys[xs.length-1];
    for (let i=0;i<xs.length-1;i++) {
      if (x >= xs[i] && x <= xs[i+1]) {
        const t = (x-xs[i])/(xs[i+1]-xs[i]);
        return ys[i] + t*(ys[i+1]-ys[i]);
      }
    }
    return ys[ys.length-1];
  }
  function cfSolidAB(sh, bs) {
    // Bilinear interpolation in Table 29.3-1
    // clamp
    const shC = Math.min(Math.max(sh, 0.16), 1.0);
    const bsC = Math.min(Math.max(bs, 0.05), 45);
    // find bracket rows (SH_ROWS is descending)
    let r0=0, r1=0;
    for (let i=0;i<SH_ROWS.length-1;i++) {
      if (shC <= SH_ROWS[i] && shC >= SH_ROWS[i+1]) { r0=i; r1=i+1; break; }
      if (i===SH_ROWS.length-2) { r0=i; r1=i+1; }
    }
    const tSH = SH_ROWS[r0]===SH_ROWS[r1] ? 0 : (SH_ROWS[r0]-shC)/(SH_ROWS[r0]-SH_ROWS[r1]);
    // interpolate each row across BS_COLS
    const vr0 = interpLinear(bsC, BS_COLS, CF_AB[r0]);
    const vr1 = interpLinear(bsC, BS_COLS, CF_AB[r1]);
    return vr0 + tSH*(vr1-vr0);
  }
  function cfCaseC(bs, zoneIdx) {
    // CF_CC zeros indicate a zone doesn't start until a higher B/s threshold.
    // Rule: zone is DISPLAYED when bs >= CC_BS_COLS[firstValidIdx-1] (prev col),
    // i.e. when bs enters the bracket containing the first non-zero value.
    // Cf is computed by clamping bs to [firstValidCol, 13] so we never interpolate
    // through the leading zeros — we use the first-valid-col value for lower B/s.
    if (bs < CC_BS_COLS[0]) return 0;  // Case C requires B/s >= 2
    const row = CF_CC[zoneIdx];
    const firstValidIdx = row.findIndex(v => v > 0);
    if (firstValidIdx < 0) return 0;
    // Zone activates when bs has entered the bracket of the first non-zero col.
    // Bracket entry = bs >= CC_BS_COLS[firstValidIdx - 1] (or >=2 if firstValidIdx=0).
    const activationBs = firstValidIdx > 0 ? CC_BS_COLS[firstValidIdx - 1] : CC_BS_COLS[0];
    if (bs < activationBs) return 0;
    const bsC = Math.min(Math.max(bs, CC_BS_COLS[firstValidIdx]), 13);
    const validBs = CC_BS_COLS.slice(firstValidIdx);
    const validCf = row.slice(firstValidIdx);
    return interpLinear(bsC, validBs, validCf);
  }
  // Wall return factor (Lr/s): 0→1.0, ≤0.3→0.9, ≤1→0.75, ≤≥1→0.6
  function wallReturnFactor(lr, s) {
    if (!s || s===0) return 1.0;
    const ratio = lr/s;
    if (ratio === 0) return 1.0;
    if (ratio <= 0.3) return 0.9;
    if (ratio <= 1.0) return 0.75;
    return 0.6;
  }
  // s/h > 0.8 reduction: (1.8 - s/h) per note
  function shReduction(sh) { return sh > 0.8 ? Math.max(0, 1.8 - sh) : 1.0; }

  // ow fields come from geo flat keys (ow_ss_*, ow_os_*, etc)
  const ss = { h_top: g.ow_ss_h_top, s: g.ow_ss_s, B: g.ow_ss_B, Lr: g.ow_ss_Lr, pctOpen: g.ow_ss_pctOpen };
  let solidSign = null;
  {
    const h_top = ss.h_top || 20;   // dist from ground to top
    const s     = ss.s     || 10;   // height of sign/wall
    const B     = ss.B     || 25;   // width
    const Lr    = ss.Lr    || 0;    // wall return length
    const pctOpen = ss.pctOpen || 0;
    const kztZ  = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft, kztInputs.x_ft, h_top, kztInputs.upwind).kzt;
    const qzRaw = qzAt(h_top, kd, kztZ);
    const qzBase = isKdAtP ? qzRaw/kd : qzRaw;  // strip Kd for display if needed
    const kdqz  = isKdAtP ? qzRaw/kd*kd : qzRaw; // = qzRaw always
    const kz    = kzAt(h_top);
    const sh    = Math.min(Math.max(s/h_top, 0.16), 1.0);
    const bs    = B/s;
    const openFactor = 1 - (pctOpen/100);  // open-area reduction
    const wrf   = wallReturnFactor(Lr, s);
    const shr   = shReduction(sh);
    const cfAB  = r4(cfSolidAB(sh, bs) * wrf * shr * openFactor);
    const F_per_sf = r2(qzRaw * G * cfAB); // psf per unit area
    // Case C: horizontal zones
    const caseCRows = CC_ZONES.map((zone, zi) => ({
      zone,
      cf: r4(cfCaseC(bs, zi) * wrf * shr * openFactor),
      f_psf: r2(qzRaw * G * cfCaseC(bs, zi) * wrf * shr * openFactor),
    }));
    solidSign = { h_top, s, B, Lr, pctOpen, kz:r4(kz), kztZ:r4(kztZ), qzRaw:r2(qzRaw), kdqz:r2(qzRaw), sh:r4(sh), bs:r4(bs), cfAB, F_per_sf, caseCRows, wrf:r4(wrf), shr:r4(shr) };
  }

  // ── B. Open Signs & Single-Plane Open Frames ──────────────────
  // §29.4  F = Kd·qz·G·Cf·Af  (epsilon = solid/gross ratio)
  // Cf from Table 29.4-1: rows=epsilon, cols=member shape vs D√qz
  const OPEN_EPS_ROWS   = [0.1, 0.2, 0.3, 0.65]; // epsilon breakpoints (≤0.1, .1-.29, .3-.7, >=0.65)
  const CF_OPEN_FLAT    = [2.0, 1.8, 1.6, 1.6];
  const CF_OPEN_LE25    = [1.2, 1.3, 1.5, 1.5];
  const CF_OPEN_GT25    = [0.8, 0.9, 1.1, 1.1];
  function cfOpen(eps, dSqrtQz, isRound) {
    const epsC = Math.min(Math.max(eps, 0.1), 0.65);
    // Find row
    let idx = 0;
    if (epsC <= 0.1) idx=0;
    else if (epsC < 0.3) idx=1;
    else idx=2; // .3-.7 and >=0.65 same Cf
    if (isRound) {
      return dSqrtQz <= 2.5 ? CF_OPEN_LE25[idx] : CF_OPEN_GT25[idx];
    }
    return CF_OPEN_FLAT[idx];
  }

  const os = { z: g.ow_os_z, w: g.ow_os_w, d: g.ow_os_d, pct: g.ow_os_pct, Af: g.ow_os_Af };
  let openSign = null;
  {
    const z      = os.z   || 15;
    const width  = os.w   || 0;   // 0=flat/rect
    const diam   = os.d   || 2;   // diameter if round
    const pctOpen= os.pct || 35;
    const Af     = os.Af  || 10;
    const kztZ   = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft, kztInputs.x_ft, z, kztInputs.upwind).kzt;
    const qzRaw  = qzAt(z, kd, kztZ);
    const kz     = kzAt(z);
    const kdqz   = isKdAtP ? qzRaw/kd*kd : qzRaw;
    const eps    = (100-pctOpen)/100; // solid ratio
    const isRound= diam > 0 && width === 0;
    const D      = isRound ? diam : 0;
    const dSqQz  = r4(D * Math.sqrt(qzRaw));
    const cf     = r4(cfOpen(eps, dSqQz, isRound));
    const F_per_sf = r2(qzRaw * G * cf);
    openSign = { z, width, diam, pctOpen, Af, kz:r4(kz), kztZ:r4(kztZ), qzRaw:r2(qzRaw), kdqz:r2(qzRaw), eps:r4(eps), isRound, dSqQz, cf, F_per_sf };
  }

  // ── C. Chimneys, Tanks & Similar Structures ───────────────────
  // §29.5  F = qz·G·Cf·Af  (no Kd in Cf — included in qz for 7-22)
  // Cf from Table 29.5-1: cross-section × h/D bracket
  const CHIM_HD_COLS  = [1, 7, 25];   // h/D breakpoints per Table 29.5-1
  const CHIM_CF_TABLE = {
    "square_normal": [1.3, 1.4, 2.0],
    "square_diag":   [1.0, 1.1, 1.5],
    "hexagonal":     [1.0, 1.2, 1.4],
    "round_smooth":  [0.5, 0.6, 0.7],
    "round_rough":   [0.7, 0.8, 0.9],
    "round_vrough":  [0.8, 1.0, 1.2],
  };
  function cfChimney(section, hd) {
    const row = CHIM_CF_TABLE[section] || CHIM_CF_TABLE["square_normal"];
    return interpLinear(hd, CHIM_HD_COLS, row);
  }

  const ch = { z: g.ow_ch_z, h: g.ow_ch_h, D: g.ow_ch_D, sec: g.ow_ch_sec };
  let chimney = null;
  {
    const z       = ch.z   || 15;
    const h       = ch.h   || 15;
    const D       = ch.D   || 1;
    const section = ch.sec || "square";
    // ASCE 7-22 Table 26.6-1: Kd for chimneys, tanks & similar structures
    // Square = 0.90; Hexagonal/Octagonal & Round (all surface types) = 0.95
    const KD_CHIMNEY = (section === "square") ? 0.90 : 0.95;
    const kztZ    = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft, kztInputs.x_ft, z, kztInputs.upwind).kzt;
    const qzRaw   = qzAt(z, KD_CHIMNEY, kztZ);   // uses Kd=0.90
    const kz      = kzAt(z);
    const hd      = r4(h/D);
    const isSquare = section === "square";
    // Square always produces two outputs: wind normal to face + wind along diagonal
    const cfNormal = isSquare ? r4(cfChimney("square_normal", hd)) : null;
    const cfDiag   = isSquare ? r4(cfChimney("square_diag",   hd)) : null;
    const cf       = isSquare ? null : r4(cfChimney(section, hd));
    const F_normal  = isSquare ? r2(qzRaw * G * cfNormal) : null;
    const F_diag    = isSquare ? r2(qzRaw * G * cfDiag)   : null;
    const F_per_sf  = isSquare ? null : r2(qzRaw * G * cf);
    chimney = { z, h, D, section, isSquare, kz:r4(kz), kztZ:r4(kztZ), qzRaw:r2(qzRaw), hd,
                cf, F_per_sf, cfNormal, cfDiag, F_normal, F_diag, kdUsed: KD_CHIMNEY };
  }

  // ── D. Trussed Towers ─────────────────────────────────────────
  // §29.6 / Table 29.6-1  F = Kd·qz·G·Cf·Af
  // Cf depends on: tower cross-section, member shape, phi (solidity)
  // Normal: Cf = 4phi^2 - 5.9phi + 4.0  (square, flat members, wind normal)
  // Diag:   Cf_diag = Cf_normal × 1.2 (square diagonal) or use formula
  // Triangle: Cf = 3.4phi^2 - 4.7phi + 3.4
  function cfTowerNormal(phi, section) {
    if (section === "triangle") return 3.4*phi*phi - 4.7*phi + 3.4;
    return 4.0*phi*phi - 5.9*phi + 4.0; // square
  }
  function cfTowerDiag(phi) { return 3.4*phi*phi - 4.7*phi + 3.4; } // same as triangle wind on square diagonal
  function roundMemberFactor(memberShape, phi) {
    // ASCE 7-22 §29.6 Note 2: for round members, Cf multiplied by (0.51φ² + 0.57)
    return memberShape === "round" ? 0.51 * phi * phi + 0.57 : 1.0;
  }

  const tt = { z: g.ow_tt_z, phi: g.ow_tt_phi, sec: g.ow_tt_sec, mem: g.ow_tt_mem, dir: g.ow_tt_dir };
  let tower = null;
  {
    const z         = tt.z    || 15;
    const phi       = Math.min(Math.max(tt.phi || 0.27, 0.1), 0.9);
    const section   = tt.sec  || "square";  // square | triangle
    const memberShape = tt.mem || "flat";   // flat | round
    const windDir   = tt.dir  || "normal";  // normal | diagonal
    // ASCE 7-22 Table 26.6-1: Kd for trussed towers
    // Triangular, square, rectangular = 0.85; all other cross sections = 0.95
    const KD_TOWER = (section === "square" || section === "triangle") ? 0.85 : 0.95;
    const kztZ      = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft, kztInputs.x_ft, z, kztInputs.upwind).kzt;
    const qzRaw     = qzAt(z, KD_TOWER, kztZ);
    const kz        = kzAt(z);
    const rmf       = roundMemberFactor(memberShape, phi);
    const isSquareTower = section === "square";
    // Square tower: always show both normal + diagonal (diagonal = normal × 1.2 per §29.6)
    // Triangle tower: single output only (normal to face)
    const cfNormal  = r4(cfTowerNormal(phi, section) * rmf);
    const cfDiag    = isSquareTower ? r4(cfNormal * 1.2) : null;  // §29.6: diagonal = normal × 1.2
    const F_normal  = r2(qzRaw * G * cfNormal);
    const F_diag    = isSquareTower ? r2(qzRaw * G * cfDiag) : null;
    tower = { z, phi:r4(phi), section, memberShape, isSquareTower,
              kz:r4(kz), kztZ:r4(kztZ), qzRaw:r2(qzRaw), rmf:r4(rmf),
              cfNormal, cfDiag, F_normal, F_diag, kdUsed: KD_TOWER };
  }

  return { ok:true, solidSign, openSign, chimney, tower };
}


export async function apiCC(P) {
  const { project: p, geometry: g, kd, kztInputs } = P;
  const ke   = keOf(p.code_version, 0);
  const iw = importanceFactorOf(p.code_version, p.risk_category);
  const kztH = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft,
                       kztInputs.x_ft, g.h_ft, kztInputs.upwind).kzt;
  // Ch.30 (C&C): Table 26.10-1 — zm=15 ft (asterisk footnote zm=30 applies to Ch.28 LR only)
  // Ch.30 C&C zm for Exposure B:
  //   7-05/7-10: zm=30 per Table 30.3-1 Note 1 ("z shall not be taken less than 30 ft in Exposure B")
  //   7-16/7-22: zm=15 per Table 26.10-1 (asterisk footnote zm=30 applies to Ch.28 LR only)
  //   7-05: assumed same as 7-10 pending Table 6-3 footnote verification
  const zmCC = (p.code_version === "7-05" || p.code_version === "7-10") && p.exposure === "B" ? 30 : null;
  const qh   = compQz(p.V_mph, p.exposure, g.h_ft, kd, ke, p.code_version, kztH, iw, zmCC).qz;
  // ASCE 7-05: GCp net values have Kd baked in, so use qz (no Kd) for C&C pressure
  // All other codes: GCp net values also have Kd baked in via compQz (Kd inside qh)
  // For 7-05: qh = Kd*qz*I, so qz_no_kd = qh/kd -- this is what multiplies GCp_net
  const isKdAtPressureCC = p.code_version === "7-05" || p.code_version === "7-10";
  const qhCC = isKdAtPressureCC ? qh / kd : qh;
  // Minimum C&C pressure: 10 psf (ASD, 7-05 §6.1.4.1) vs 16 psf (LRFD, 7-10+ §30.2.2)
  const minCC = (p.code_version === "7-05") ? 10 : 16;
  const minPsfCC = (v) => (Math.abs(v) < minCC ? Math.sign(v || 1) * minCC : v);
  const gcpi = gcpiOf(p.enclosure);
  const a    = r2(Math.max(Math.min(0.1*Math.min(g.L_ft,g.B_ft), 0.4*g.h_ft), 3));
  const roof  = g.roof_type;
  const theta = g.roof_angle_deg;
  const hle60 = g.h_ft <= 60;
  // Alternate procedure: permitted when 60 < h < 90 (Ch.30 Alternate)
  // Uses h<=60 GCp curve shapes extended to 1000sf; base = Kd*qh (net GCp)
  const altEligible = g.h_ft > 60 && g.h_ft < 90;
  const useAlt = altEligible && (P.useAltCC === true);

  // Roof zones to compute
  const roofZones = ["1","1p","2","3","oh1","oh2","oh3"];
  const minPar = g.min_parapet_ht_ft || 0;  // parapet ht above roof for Zone 3 conditional
  const zone3eq2 = minPar >= 3 && theta <= 10; // flag for UI note

  const prs = [];

  if (hle60) {
    const areas = CC_AREAS_ROOF; // [10, 50, 100, 500]
    for (const zone of roofZones) {
      const isOverhang = zone.startsWith("oh");
      for (const ar of areas) {
        const gn = r4(gcpRoof_hle60(ar, roof, theta, zone, "neg", minPar, p.code_version));
        const gp = r4(gcpRoof_hle60(ar, roof, theta, zone, "pos", minPar, p.code_version));
        prs.push({
          zone, area: ar, gn, gp, isOverhang,
          pnN: r2(minPsfCC(qhCC * gn)),
          ppP: r2(minPsfCC(qhCC * gp)),
        });
      }
    }
    // Wall zones 4 & 5
    const wallAreas = CC_AREAS_WALL;
    for (const zone of ["4","5"]) {
      for (const ar of wallAreas) {
        const gn = r4(gcpWall_hle60(ar, zone, "neg", p.code_version));
        const gp = r4(gcpWall_hle60(ar, zone, "pos", p.code_version));
        prs.push({
          zone, area: ar, gn, gp, isOverhang: false,
          pnN: r2(minPsfCC(qhCC * gn)),
          ppP: r2(minPsfCC(qhCC * gp)),
        });
      }
    }
  }

  if (!hle60 && useAlt) {
    // Ch.30 Alternate Procedure — 60 ft < h < 90 ft
    // 7-16/7-22: net GCp (GCpi baked in), areas [10,100,500,1000], Zone 1' exists
    // 7-10/7-05: external GCp, GCpi applied separately, areas [10,50,100,500], no Zone 1', Oh3=Oh1&2
    const is710alt = isKdAtPressureCC; // 7-05 or 7-10
    const areas    = is710alt ? [10, 50, 100, 500] : [10, 100, 500, 1000];
    const altZones = is710alt ? ["1","2","3","oh1","oh2","oh3"] : ["1","1p","2","3","oh1","oh2","oh3"];
    for (const zone of altZones) {
      const isOverhang = zone.startsWith("oh");
      for (const ar of areas) {
        const gn = r4(gcpRoof_alt(ar, zone, "neg", roof, theta, minPar, p.code_version));
        const gp = r4(gcpRoof_alt(ar, zone, "pos", roof, theta, minPar, p.code_version));
        let pnN, ppP;
        if (is710alt) {
          // External GCp — apply GCpi separately; overhangs GCpi=0
          const gcpiEff = isOverhang ? 0 : gcpi;
          pnN = r2(minPsfCC(qhCC * (gn - gcpiEff)));
          ppP = r2(minPsfCC(qhCC * (gp + gcpiEff)));
        } else {
          // Net GCp — GCpi already baked in
          pnN = r2(minPsfCC(qhCC * gn));
          ppP = r2(minPsfCC(qhCC * gp));
        }
        prs.push({ zone, area: ar, gn, gp, isOverhang, pnN, ppP });
      }
    }
    // Wall zones 4 & 5 — alternate procedure uses h<=60 wall C&C curves (net GCp, GCpi baked in)
    // Same figures as h<=60 procedure; areas [10,100,200,500] sf.
    // Net GCp curves (verified from Struware spreadsheet, 7-10, theta<=10, 10% reduction applied):
    //   Z4 neg: slope=+0.1589, int=-1.3289  → -1.17@10sf, -0.90@500sf
    //   Z5 neg: slope=+0.3178, int=-1.7578  → -1.44@10sf, -0.90@500sf
    //   Pos(4&5): slope=-0.1589, int=+1.2389 → +1.08@10sf, +0.81@500sf
    // For 7-16/7-22 alternate, same curve structure applies (different GCp values per edition).
    // Delegate to gcpWall_hle60 which already handles edition and theta reduction.
    const wallAreas = CC_AREAS_WALL; // [10,50,100,500]
    for (const zone of ["4", "5"]) {
      for (const ar of wallAreas) {
        const gn = r4(gcpWall_hle60(ar, zone, "neg", p.code_version));
        const gp = r4(gcpWall_hle60(ar, zone, "pos", p.code_version));
        prs.push({
          zone, area: ar, gn, gp, isOverhang: false,
          pnN: r2(minPsfCC(qhCC * gn)),
          ppP: r2(minPsfCC(qhCC * gp)),
        });
      }
    }
  }

  if (!hle60 && !useAlt) {
    // Ch.30 Part 3 — Fig 30.4-1  (h > 60 ft, standard procedure)
    // External GCp only; GCpi applied separately below.
    // Areas: [10, 50, 100, 500] sf.
    const areas = [10, 50, 100, 500];
    for (const zone of ["1","1p","2","3"]) {
      for (const ar of areas) {
        const gcpExt_n = r4(gcpRoof_hgt60(ar, zone, "neg"));
        const gcpExt_p = r4(gcpRoof_hgt60(ar, zone, "pos"));
        // p = qh * (GCp_ext - GCpi)  for neg;  qh * (GCp_ext + GCpi) for pos
        prs.push({
          zone, area: ar, gn: gcpExt_n, gp: gcpExt_p, isOverhang: false,
          pnN: r2(minPsfCC(qhCC * (gcpExt_n - gcpi))),
          ppP: r2(minPsfCC(qhCC * (gcpExt_p + gcpi))),
        });
      }
    }
    // Overhangs — h>60 standard procedure (GCpi = 0)
    // oh1: -2.30@10 -> -1.60@500;  oh2/oh3_z4: -3.20@10 -> -2.30@500
    // oh3_z5: -4.10@10 -> -2.60@500  (all external GCp, GCpi=0)
    const ohAreas = [10, 50, 100, 500];
    function gcpOh_hgt60(ar, zone) {
      const a = Math.min(Math.max(ar, 10), 500);
      if (zone === "oh1") {                                            // two-segment: knee at 20sf
        if (a <= 20) return 0.294323 * Math.log10(a) - 2.594323;     // -2.30@10 -> -2.2114@20
        return 0.437358 * Math.log10(a) - 2.780416;                  // -2.2114@20 -> -1.60@500
      }
      if (zone === "oh2" || zone === "oh3z4") {                       // two-segment: knee at 20sf
        if (a <= 20) return 0.411919 * Math.log10(a) - 3.611919;     // -3.20@10 -> -3.076@20
        return 0.555103 * Math.log10(a) - 3.798205;                  // -3.076@20 -> -2.30@500
      }
      if (zone === "oh3z5") {                                          // two-segment: knee at 20sf
        if (a <= 20) return 0.411919 * Math.log10(a) - 4.511919;      // -4.10@10 -> -3.976@20
        return 0.984305 * Math.log10(a) - 5.256611;                   // -3.976@20 -> -2.60@500
      }
      return 0;
    }
    for (const zone of ["oh1","oh2","oh3z4","oh3z5"]) {
      for (const ar of ohAreas) {
        const gcpExt = r4(gcpOh_hgt60(ar, zone));
        prs.push({
          zone, area: ar, gn: gcpExt, gp: 0, isOverhang: true,
          pnN: r2(minPsfCC(qhCC * gcpExt)),  // GCpi=0 for overhangs
          ppP: 0,
        });
      }
    }
    // Wall zones 4' and 5' — areas [10,50,100,500] sf
    // GCp external only; GCpi applied separately (same convention as roof h>60)
    const wallAreas = [10, 50, 100, 500];
    for (const zone of ["4p", "5p"]) {
      for (const ar of wallAreas) {
        const gn = r4(gcpWall_hgt60(ar, zone, "neg"));
        const gp = r4(gcpWall_hgt60(ar, zone, "pos"));
        prs.push({
          zone, area: ar, gn, gp, isOverhang: false,
          pnN: r2(minPsfCC(qhCC * (gn - gcpi))),
          ppP: r2(minPsfCC(qhCC * (gp + gcpi))),
        });
      }
    }
  }

  const parAreas=[10,50,100,500];
  // qp at parapet height — evaluate at absolute height above ground
  const zPar = Math.max((g.parapet_height_ft || 0) > 0 ? g.parapet_height_ft : g.h_ft + (g.min_parapet_ht_ft || 0), g.h_ft);
  const kztPar2 = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft, kztInputs.x_ft, zPar, kztInputs.upwind).kzt;
  const qp_raw = compQz(p.V_mph, p.exposure, zPar, kd, ke, p.code_version, kztPar2, iw, zmCC).qz;
  // Parapet qpCC:
  // 7-16/7-22: qp_raw already includes Kd — use directly.
  // 7-10/7-05: qp_raw includes Kd; strip it so display = qz (no Kd), Kd reapplied via GCpn.
  //            Net: qpCC = qp_raw/kd.  p = qpCC * GCpnA  (GCpnA is net — no separate Kd needed).
  const qpCC = isKdAtPressureCC ? qp_raw / kd : qp_raw;

  // Case A GCpn source depends on code version AND procedure:
  // 7-05 conventional:  7-22 Fig 30.9-1 curve (confirmed from spreadsheet — same as 7-22)
  // 7-05 alternate:     7-05 Fig 6-19 curve (two-segment)
  // 7-10 conventional:  7-22 Fig 30.9-1 curve
  // 7-10 alternate:     7-10 Fig 30.9-1 curve
  // 7-16/7-22:          7-22 Fig 30.9-1 curve (always)
  const is705par    = p.code_version === "7-05";
  const is710par    = p.code_version === "7-10";
  const is710altPar = is710par && useAlt;
  const is705altPar = is705par && useAlt;
  function parGCpnA(ar) {
    if (is705altPar) {
      // 7-05 alternate: ASCE 7-05 Fig 6-19 two-segment log-linear
      if (ar <= 100) return 3.5569 - 0.8578 * Math.log10(Math.max(ar, 10));
      return 2.163202 - 0.160951 * Math.log10(Math.min(ar, 500));
    }
    if (is710altPar) {
      // ASCE 7-10 Fig 30.9-1 (alternate only): two-segment, breakpoint at 100sf
      // Seg 1 (10-100sf): slope=-0.8589, int=3.5589  → 2.700@10sf, 1.841@100sf
      // Seg 2 (100-500sf): slope=-0.1589, int=2.1590 → 1.841@100sf, 1.730@500sf
      if (ar <= 100) return -0.858900 * Math.log10(Math.max(ar, 10)) + 3.558900;
      return -0.158948 * Math.log10(Math.min(ar, 500)) + 2.158996;
    }
    // 7-05 conv / 7-10 conv / 7-16 / 7-22 — all use 7-22 Fig 30.9-1 curve:
    // two-segment, breakpoint at 20sf
    // Seg 1 (10-20sf): slope=-0.4120, int=3.6120  → 3.200@10sf, 3.076@20sf
    // Seg 2 (20-500sf): slope=-0.6266, int=3.8912 → 3.076@20sf, 2.200@500sf
    if (ar <= 20) return -0.411999 * Math.log10(Math.max(ar, 10)) + 3.611999;
    return -0.626619 * Math.log10(Math.min(ar, 500)) + 3.891226;
  }

  // Case B GCpn curves depend on procedure (confirmed from spreadsheet):
  // hle60 / alt6090 / 7-10 alt: INT -1.89@10sf→-1.35@500; COR -2.16→-1.35@500
  // hgt60 std (ALL codes conv incl 7-05): INT flat -1.80→-1.30@500; COR flat -2.70→-1.60@500
  const useHgt60ParB = !hle60 && !useAlt;
  function parGCpnB_int(ar) {
    if (useHgt60ParB) {
      // Two-segment: flat -1.80 for 10-20sf, log-linear to -1.30@500
      if (ar <= 20) return -1.8000;
      return 0.357669 * Math.log10(Math.min(ar, 500)) - 2.265338;
    }
    return interpGCp(ar, [[10,-1.8876],[500,-1.3483]]);
  }
  function parGCpnB_cor(ar) {
    if (useHgt60ParB) {
      // Two-segment: flat -2.70 for 10-20sf, log-linear to -1.60@500
      if (ar <= 20) return -2.7000;
      return 0.786872 * Math.log10(Math.min(ar, 500)) - 3.723744;
    }
    return interpGCp(ar, [[10,-2.1573],[500,-1.3483]]);
  }
  const parPrs = parAreas.map((ar) => ({
    area: ar,
    caseA:    r2(qpCC * parGCpnA(ar)),
    caseBint: r2(qpCC * parGCpnB_int(ar)),
    caseBcor: r2(qpCC * parGCpnB_cor(ar)),
  }));
  const proc = hle60 ? "hle60" : useAlt ? "alt6090" : "hgt60";
  const altIs710 = useAlt && isKdAtPressureCC;

  // Wall positive pressure height profile — h>60 standard procedure only
  // Positive wall C&C varies with height (qz at z); negative applies at all heights at qh.
  // Heights: standard profile heights up to h, capped at h.
  let wallPosProfile = null;
  if (!hle60 && !useAlt) {
    const profileHeights = [15, 20, 25, 30, 40, 50, 60].filter(z => z < g.h_ft);
    profileHeights.push(g.h_ft);
    const posAreas = [10, 50, 100, 500];
    // §30.1.3: p_pos = qzDisp(z)·GCp_pos + qhCC·GCpi
    // qzDisp: for 7-10/7-05, compQz includes Kd — strip it (matches ASCE 7-10 display convention)
    // qhCC: already the correct base for GCpi for all codes (qz_noKd at h for 7-10, qz_withKd for 7-22)
    wallPosProfile = profileHeights.map(z => {
      const kztZ = calcKzt(kztInputs.topo_type, kztInputs.H_ft, kztInputs.Lh_ft, kztInputs.x_ft, z, kztInputs.upwind).kzt;
      const qzObj = compQz(p.V_mph, p.exposure, z, kd, ke, p.code_version, kztZ, iw, zmCC);
      const qzDisp = isKdAtPressureCC ? qzObj.qz / kd : qzObj.qz;
      return {
        z,
        kz: Math.round(qzObj.kz * 100) / 100,  // 2 decimal places per ASCE 7 table
        kzt: r4(kztZ),
        qz: r2(qzDisp),
        // p = qzDisp(z)·GCp + qhCC·GCpi  (GCpi anchored to qh, GCp scales with qz(z))
        pressures: posAreas.map(a => r2(minPsfCC(qzDisp * gcpWall_hgt60(a, "4p", "pos") + qhCC * gcpi))),
      };
    });
  }

  return { qh: r2(qhCC), qp: r2(qpCC), gcpi, a, prs, proc, altEligible, useAlt, altIs710, theta, roof, minPar, zone3eq2, parPrs, parAreas, wallPosProfile, codeVer: p.code_version, minP: minCC };
}

export function validate(p, g) {
  const e = {};
  if (p.V_mph < 85)  e.V_mph = "≥85 mph";
  if (p.V_mph > 300) e.V_mph = "≤300 mph";
  if (g.h_ft  <= 0)  e.h_ft  = ">0";
  if (g.L_ft  <= 0)  e.L_ft  = ">0";
  if (g.B_ft  <= 0)  e.B_ft  = ">0";
  return e;
}

