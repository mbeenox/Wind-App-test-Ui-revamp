import { useState, useMemo, useEffect, useRef } from "react";
import ExcelJS from "exceljs";
import {
  CC_AREAS_ROOF, CC_AREAS_WALL, CODE_VERS, TOPO_TYPES, GUST_MODES,
  EXPOSURES, ENCLOSURES, ROOFS, TABS,
  gcpiOf, calcKzt, calcG, validate,
  apiQz, apiDir, apiLR, apiCC, apiElevated, apiOB, apiRW, apiOtherW
} from './calcCore.js';
import {
  Psf, Field, NInput, Sel, Divider, Chip, Acc, TRow, THead,
  CCMatrix, DirTab, DiagramPane
} from './uiPrimitives.jsx';
import { WSSLookup } from './wss/WSSLookup.jsx';
import { windGeneratePDF } from './windReport.js';
import kztEscarpmentImg from './diagrams/escarpment.png';
import kztRidgeHillImg from './diagrams/ridgeHill.png';

export default function WindCalcInputs({ wssData, wssState, sideTab, onSideTab, onWssResult }) {
  const [proj, setProj] = useState({ projectName:"", jobNumber:"", code_version:"7-22", risk_category:"III", V_mph:120, exposure:"C", enclosure:"enclosed" });
  const [geo, setGeo]   = useState({ L_ft:100, B_ft:60, h_ft:15, roof_type:"monoslope", roof_angle_deg:1.2, parapet_height_ft:20, min_parapet_ht_ft:5,
    hb_ft:0,
    elev_cols_area_sf:0, elev_enc_area_sf:0,
    elev_col_width_d1_ft:0, elev_enc_width_d1_ft:0,
    elev_col_width_d2_ft:0, elev_enc_width_d2_ft:0,
    lng_n_frames:4, lng_As_sf:0,
    ob_roof_type:"monoslope", ob_wind_flow:"clear",
    // Rooftop equipment #1
    ow_ss_h_top:20, ow_ss_s:10, ow_ss_B:25, ow_ss_Lr:0, ow_ss_pctOpen:0,
    ow_os_z:15, ow_os_w:0, ow_os_d:2, ow_os_pct:35, ow_os_Af:10,
    ow_ch_z:15, ow_ch_h:15, ow_ch_D:1, ow_ch_sec:"square",
    ow_tt_z:15, ow_tt_phi:0.27, ow_tt_sec:"square", ow_tt_mem:"flat", ow_tt_dir:"normal",
    rw_eq1_lL:10, rw_eq1_lB:5, rw_eq1_h:5,
    // Rooftop equipment #2
    rw_eq2_en:false, rw_eq2_lL:3, rw_eq2_lB:3, rw_eq2_h:10,
    rw_equip:[{ lL:10, lB:5, h:5 }],
    // Canopy
    rw_can_en:false, rw_can_he:60, rw_can_hc:45,
    // Solar parallel to roof
    rw_sol_par_en:false, rw_sol_par_area:21,
    // Solar not parallel to roof
    rw_sol_np_en:false, rw_sol_np_w:0, rw_sol_np_h1:0.8, rw_sol_np_h2:0.8,
    rw_sol_np_gap:0.25, rw_sol_np_area1:10, rw_sol_np_area2:1000,
    rw_sol_np_Lp:6, rw_sol_np_hpt:0, rw_sol_np_d1:18.4, rw_sol_np_d2:1, rw_sol_np_area:10,
    // C&C user input columns
    cc_user_area1: 500, cc_user_area2: 100,
  });
  const [kd]  = useState(0.85);
  // Topographic factor inputs (§26.8)
  const [kztIn, setKztIn] = useState({
    topo_type: "flat",
    H_ft:   80,    // hill/escarpment height
    Lh_ft:  100,   // half-length of hill
    x_ft:   50,    // distance from crest (+ve = downwind)
    upwind: false,
  });
  // Gust effect factor inputs (§26.11)
  const [gustIn, setGustIn] = useState({
    mode:  "rigid_fixed",
    n1:    1.0,    // natural frequency (Hz)
    beta:  0.02,   // damping ratio
  });
  const ukzt = (f,v) => setKztIn((s) => ({...s,[f]:v}));
  const ugust = (f,v) => setGustIn((s) => ({...s,[f]:v}));
  const [extraHeights, setExtraHeights] = useState([]);
  const addHeight = () => setExtraHeights((h) => [...h, { id: Date.now(), val: "" }]);
  const removeHeight = (id) => setExtraHeights((h) => h.filter((r) => r.id !== id));
  const updateHeight = (id, val) => setExtraHeights((h) => h.map((r) => r.id === id ? {...r, val} : r));
  // WallProfile rows lifted here so custom heights survive tab switches
  const [wallRows, setWallRows] = useState([]);
  const addWallRow    = () => setWallRows((p) => [...p, { id: Date.now(), val: "", locked: false }]);
  const removeWallRow = (id) => setWallRows((p) => p.filter((r) => r.id !== id));
  const updateWallRow = (id, val) => setWallRows((p) => p.map((r) => r.id === id ? { ...r, val, locked: false } : r));
  const lockWallRow   = (id) => setWallRows((p) => p.map((r) => r.id === id ? { ...r, locked: true } : r));
  const [tab, setTab] = useState("qz");
  const [dirSub, setDirSub] = useState("normal");
  const [ccSub,  setCcSub]  = useState("roof");
  const [rwSub,  setRwSub]  = useState("equip");
  const [owSub,  setOwSub]  = useState("solid");
  const [errs, setErrs] = useState({});
  const [apiE, setApiE] = useState(null);
  const [qzR,  setQzR]  = useState(null);
  const [dirR, setDirR] = useState(null);
  const [lrR,  setLrR]  = useState(null);
  const [ccR,  setCcR]  = useState(null);
  const [useAltCC, setUseAltCC] = useState(false);
  const [elevR,setElevR]= useState(null);
  const [obR,  setObR]  = useState(null);
  const [rwR,  setRwR]  = useState(null);
  const [owR,  setOwR]  = useState(null);

  const up = (f,v) => { setProj((p) => ({...p,[f]:v})); setErrs((e) => ({...e,[f]:undefined})); };

  // ── WSS auto-populate ──
  const [wssLocked, setWssLocked] = useState(true); // true = grayed/read-only
  const [wssOverridden, setWssOverridden] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printTabs, setPrintTabs] = useState(['qz','dir','lr','cc','ob','rw','ow']);
  const fileInputRef = useRef(null);
  const loadingFromFile = useRef(false);

  // ── Save / Load project (.wls) ──────────────────────────────────────────
  const handleSave = () => {
    const payload = {
      _fmt: "wls-1",
      proj, geo, kztIn, gustIn,
      extraHeights: extraHeights.map(r => ({ val: r.val })),
      wallRows: wallRows.map(r => ({ val: r.val })),
      useAltCC,
      wssLocked,
      wssOverridden,
      wssData: wssData || null,
      wssState: wssState ? {
        address:     wssState.address,
        lat:         wssState.lat,
        lon:         wssState.lon,
        locMode:     wssState.locMode,
        standard:    wssState.standard,
        riskCategory:wssState.riskCategory,
        siteClass:   wssState.siteClass,
        resolvedAddr:wssState.resolvedAddr,
        resolvedLat: wssState.resolvedLat,
        resolvedLon: wssState.resolvedLon,
        siteElevFt:  wssState.siteElevFt,
        results:     wssState.results,
        statuses:    wssState.statuses,
      } : null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const date = new Date().toISOString().slice(0,10);
    a.href     = url;
    a.download = `WindCalc_${date}.wls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoad = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm("Opening a file will replace your current inputs. Continue?")) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result);
        if (d._fmt !== "wls-1") { alert("Unrecognized file format."); return; }
        // Sanitize before applying to state
        const clamp = (v, lo, hi, fallback) =>
          (typeof v === "number" && isFinite(v) && v >= lo && v <= hi) ? v : fallback;
        if (d.proj) {
          d.proj.projectName   = typeof d.proj.projectName === "string" ? d.proj.projectName.slice(0, 120) : "";
          d.proj.jobNumber     = typeof d.proj.jobNumber   === "string" ? d.proj.jobNumber.slice(0, 40)   : "";
          d.proj.V_mph      = clamp(d.proj.V_mph, 85, 300, 120);
          d.proj.exposure   = ["B","C","D"].includes(d.proj.exposure)   ? d.proj.exposure   : "C";
          d.proj.enclosure  = ["enclosed","partially_enclosed","open"].includes(d.proj.enclosure) ? d.proj.enclosure : "enclosed";
          d.proj.risk_category = ["I","II","III","IV"].includes(d.proj.risk_category) ? d.proj.risk_category : "II";
          d.proj.code_version  = typeof d.proj.code_version === "string" ? d.proj.code_version : "7-22";
        }
        if (d.geo) {
          d.geo.h_ft = clamp(d.geo.h_ft, 0.1, 10000, 15);
          d.geo.L_ft = clamp(d.geo.L_ft, 0.1, 10000, 100);
          d.geo.B_ft = clamp(d.geo.B_ft, 0.1, 10000, 60);
        }
        if (d.proj)         setProj(p  => ({ ...p, ...d.proj }));
        if (d.geo)          setGeo(g   => ({ ...g, ...d.geo  }));
        if (d.kztIn)        setKztIn(  d.kztIn );
        if (d.gustIn)       setGustIn( d.gustIn );
        if (d.extraHeights) setExtraHeights(d.extraHeights.map((r,i) => ({ id: Date.now()+i, val: r.val })));
        if (d.wallRows)     setWallRows(    d.wallRows.map((r,i)     => ({ id: Date.now()+i, val: r.val, locked: false })));
        if (d.useAltCC !== undefined) setUseAltCC(d.useAltCC);
        // Always restore WSS banner state explicitly — never leave stale state from previous session
        setWssLocked(   typeof d.wssLocked    === "boolean" ? d.wssLocked    : true);
        setWssOverridden(typeof d.wssOverridden === "boolean" ? d.wssOverridden : false);
        // Restore full WSS panel state
        if (d.wssState && wssState) {
          const w = d.wssState;
          if (typeof w.address     === "string")  wssState.setAddress(w.address);
          if (typeof w.lat         === "string")  wssState.setLat(w.lat);
          if (typeof w.lon         === "string")  wssState.setLon(w.lon);
          if (typeof w.locMode     === "string")  wssState.setLocMode(w.locMode);
          if (typeof w.standard    === "string")  wssState.setStandard(w.standard);
          if (typeof w.riskCategory=== "string")  wssState.setRiskCategory(w.riskCategory);
          if (typeof w.siteClass   === "string")  wssState.setSiteClass(w.siteClass);
          if (typeof w.resolvedAddr=== "string")  wssState.setResolvedAddr(w.resolvedAddr);
          if (w.resolvedLat != null)              wssState.setResolvedLat(w.resolvedLat);
          if (w.resolvedLon != null)              wssState.setResolvedLon(w.resolvedLon);
          if (w.siteElevFt  != null)              wssState.setSiteElevFt(w.siteElevFt);
          if (w.results  && typeof w.results  === "object") wssState.setResults(w.results);
          if (w.statuses && typeof w.statuses === "object") wssState.setStatuses(w.statuses);
        } else if (wssState) {
          // No WSS state in file — reset panel to blank
          wssState.setAddress('');   wssState.setLat('');    wssState.setLon('');
          wssState.setLocMode('address'); wssState.setStandard('7-22');
          wssState.setRiskCategory('II'); wssState.setSiteClass('D');
          wssState.setResolvedAddr('');   wssState.setResolvedLat(null);
          wssState.setResolvedLon(null);  wssState.setSiteElevFt(null);
          wssState.setResults({});        wssState.setStatuses({});
        }
        // Restore wssData so the banner appears correctly on fresh sessions
        // Use the ref flag to prevent the wssData useEffect from overwriting restored banner state
        loadingFromFile.current = true;
        if (d.wssData && typeof d.wssData === "object") {
          onWssResult && onWssResult(d.wssData);
        } else {
          onWssResult && onWssResult(null);
        }
        // Flag is cleared inside the useEffect after it checks it
      } catch { alert("Could not read file — may be corrupted."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExportCCRoofXLSX = async () => {
    if (!ccR) return;

    // ── area columns ─────────────────────────────────────────────────
    const areas = ccR.proc === "hgt60" ? [10,50,100,500]
      : ccR.proc === "alt6090" ? (ccR.altIs710 ? [10,50,100,500] : [10,100,500,1000])
      : CC_AREAS_ROOF;
    const nAreaCols = areas.length;          // e.g. 4
    const nTotalCols = 1 + nAreaCols;        // label col + area cols

    // ── roof pressure zones ──────────────────────────────────────────
    const roofPrs = ccR.prs.filter(
      (p) => ["1","1p","2","3"].includes(p.zone)
        && !(["7-10","7-05"].includes(ccR.codeVer) && p.zone === "1p")
        && !(ccR.proc === "hgt60" && p.zone === "1p")
    );
    const roofZones = [...new Set(roofPrs.map(p => p.zone))];
    const ROOF_LABELS = {
      "1":  "ROOF PRESSURE (ZONE 1)",
      "1p": "ROOF PRESSURE (ZONE 1\u2019)",
      "2":  "ROOF PRESSURE (ZONE 2)",
      "3":  "ROOF PRESSURE (ZONE 3)",
    };

    // ── overhang worst-case per area ─────────────────────────────────
    const isOldCode  = ["7-05","7-10"].includes(ccR.codeVer);
    const isHgt60Std = ccR.proc === "hgt60";
    const isAlt      = ccR.proc === "alt6090";
    const ohPressures = isHgt60Std
      ? ccR.prs.filter(p => ["oh1","oh2","oh3z4","oh3z5"].includes(p.zone))
      : ccR.prs.filter(p => ["oh1","oh2","oh3"].includes(p.zone) && !(isOldCode && p.zone === "oh2"));
    const ohAreas = isHgt60Std ? [10,50,100,500]
      : isAlt ? (ccR.altIs710 ? [10,50,100,500] : [10,100,500,1000])
      : CC_AREAS_ROOF;
    const ohWorstVals = areas.map(a => {
      const matches = ohPressures.filter(p => p.area === a);
      if (!matches.length) {
        const closest = ohAreas.reduce((best, oa) => Math.abs(oa - a) < Math.abs(best - a) ? oa : best, ohAreas[0]);
        const fallback = ohPressures.filter(p => p.area === closest);
        return fallback.length ? Math.min(...fallback.map(p => p.pnN)) : null;
      }
      return Math.min(...matches.map(p => p.pnN));
    });

    // ── wall zone 4 ───────────────────────────────────────────────────
    // hle60/alt: zone "4"; hgt60: zone "4p" — pull only our 4 area cols (skip 200 sf)
    const wallZoneKey = isHgt60Std ? "4p" : "4";
    const wallPrs4 = ccR.prs.filter(p => p.zone === wallZoneKey);
    const wall4Vals = areas.map(a => {
      const c = wallPrs4.find(p => p.area === a);
      return c ? `${c.ppP.toFixed(1)},${c.pnN.toFixed(1)}` : "";
    });

    // ── parapet worst case ────────────────────────────────────────────
    // ccR.parPrs = [{ area, caseA, caseBint, caseBcor }] for areas [10,20,50,100,200,500]
    // Show worst positive (Case A) and worst negative (min of Case B) per area
    const parWorstVals = areas.map(a => {
      const entry = ccR.parPrs ? ccR.parPrs.find(p => p.area === a) : null;
      if (!entry) return "";
      const worstPos = entry.caseA;
      const worstNeg = Math.min(entry.caseBint, entry.caseBcor);
      if (worstPos > 0 && worstNeg < 0) return `${worstPos.toFixed(1)},${worstNeg.toFixed(1)}`;
      if (worstPos > 0) return worstPos.toFixed(1);
      return worstNeg.toFixed(1);
    });


    // ── ExcelJS workbook setup ───────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = "Wind Load Suite";
    wb.created = new Date();
    const ws = wb.addWorksheet("C&C Roof Pressures");

    // column widths: label col wide, area cols equal
    ws.columns = [
      { width: 38 },
      ...Array(nAreaCols).fill({ width: 16 }),
    ];

    // ── shared style helpers ─────────────────────────────────────────
    const borderThin   = { style: "thin", color: { argb: "FF000000" } };
    const allBorders   = { top: borderThin, left: borderThin, bottom: borderThin, right: borderThin };

    function styleRow(row, bold = false) {
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        if (colNum > nTotalCols) return;
        cell.font      = { name: "Courier New", size: 9, bold };
        cell.border    = allBorders;
        cell.alignment = { horizontal: colNum === 1 ? "left" : "center", vertical: "middle", wrapText: true };
      });
    }

    // ── ROW 1: double header ─────────────────────────────────────────
    // Row 1: "COMPONENT ZONE DESIGNATION" (will merge down to row 2) | "COMPONENT AREA" (merged across area cols)
    const r1 = ws.addRow(["COMPONENT ZONE DESIGNATION", "COMPONENT AREA", ...Array(nAreaCols - 1).fill("")]);
    r1.height = 30;
    ws.mergeCells(r1.number, 2, r1.number, nTotalCols);  // "COMPONENT AREA" spans area cols
    styleRow(r1, true);
    // Larger font for both header labels
    r1.getCell(1).font = { name: "Courier New", size: 13, bold: true };
    r1.getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    r1.getCell(2).font = { name: "Courier New", size: 13, bold: true };
    r1.getCell(2).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    // Row 2: blank (col 1 will be merged with row 1) | area headers
    const r2 = ws.addRow(["", ...areas.map(a => `${a} FT\u00b2`)]);
    r2.height = 20;
    styleRow(r2, true);
    // Merge col 1 vertically across rows 1 and 2 for "COMPONENT ZONE DESIGNATION"
    ws.mergeCells(r1.number, 1, r2.number, 1);

    // ── DATA ROWS ────────────────────────────────────────────────────
    roofZones.forEach(zone => {
      const label = ROOF_LABELS[zone] || zone.toUpperCase();
      const zd    = roofPrs.filter(p => p.zone === zone);
      const vals  = areas.map(a => {
        const c = zd.find(p => p.area === a);
        return c ? `${c.ppP.toFixed(1)}, ${c.pnN.toFixed(1)}` : "";
      });
      const row = ws.addRow([label, ...vals]);
      row.height = 18;
      styleRow(row);
    });

    // wall zone 4 row
    const wallRow = ws.addRow([isHgt60Std ? "WALL PRESSURE (ZONE 4')" : "WALL PRESSURE (ZONE 4)", ...wall4Vals]);
    wallRow.height = 18;
    styleRow(wallRow);

    // parapet worst-case row
    const parRow = ws.addRow(["PARAPET WALL PRESSURE (WORST CASE)", ...parWorstVals]);
    parRow.height = 18;
    styleRow(parRow);

    // overhang worst-case row
    const ohRow = ws.addRow([
      "ROOF OVERHANG PRESSURE (WORST CASE)",
      ...ohWorstVals.map(v => v != null ? v.toFixed(1) : ""),
    ]);
    ohRow.height = 18;
    styleRow(ohRow);

    // ── FOOTER ROWS ──────────────────────────────────────────────────
    const aRow = ws.addRow([`EDGE STRIP (a)`, `${ccR.a} FEET`, ...Array(nAreaCols - 1).fill("")]);
    aRow.height = 18;
    ws.mergeCells(aRow.number, 2, aRow.number, nTotalCols);
    styleRow(aRow, false);

    const hRow = ws.addRow([`(h)`, `${geo.h_ft} FEET`, ...Array(nAreaCols - 1).fill("")]);
    hRow.height = 18;
    ws.mergeCells(hRow.number, 2, hRow.number, nTotalCols);
    styleRow(hRow, false);

    // ── WRITE & DOWNLOAD ─────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement("a");
    a.href       = url;
    a.download   = `CnC_Roof_${proj.jobNumber || "WindCalc"}_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!wssData) return;
    if (loadingFromFile.current) { loadingFromFile.current = false; return; }
    up("V_mph", wssData.V_mph);
    up("risk_category", wssData.risk_category);
    up("code_version", wssData.code_version);
    setWssLocked(true);
    setWssOverridden(false);
  }, [wssData]);

  const wssActive = !!wssData && !wssOverridden;
  const wssFieldLocked = wssActive && wssLocked;
  const ug = (f,v) => { setGeo((p)  => ({...p,[f]:v})); setErrs((e) => ({...e,[f]:undefined})); };

  const shared = useMemo(() => {
    if (!qzR) return null;
    const q = qzR.pressures[qzR.pressures.length - 1];
    const isKdAtPressure = qzR.code_version === "7-05" || qzR.code_version === "7-10";
    const qhDisplay = isKdAtPressure ? q.qz_psf / q.kd : q.qz_psf;
    return { ke: q.ke, kd: q.kd, alpha: q.alpha, zg: q.zg_ft, qh: qhDisplay, kztH: qzR.kztH };
  }, [qzR]);

  // Auto-calculate on any input change, debounced 300ms
  useEffect(() => {
    const ve = validate(proj, geo);
    if (Object.keys(ve).length > 0) { setErrs(ve); return; }
    setErrs({});
    const timer = setTimeout(async () => {
      const bp = { project:{...proj, importance_factor:1}, geometry:{...geo, extraHeights: extraHeights.map(r=>parseFloat(r.val)).filter(v=>!isNaN(v)&&v>0)}, kd, kztInputs:kztIn, gustInputs:gustIn, useAltCC };
      try {
        const [a,b,c,d,e,f2,g2,h2] = await Promise.allSettled([apiQz(bp), apiDir(bp), apiLR(bp), apiCC(bp), apiElevated(bp), apiOB(bp), apiRW(bp), apiOtherW(bp)]);
        if (a.status==="fulfilled") setQzR(a.value);
        if (b.status==="fulfilled") setDirR(b.value);
        if (c.status==="fulfilled") setLrR(c.value);
        if (d.status==="fulfilled") setCcR(d.value);
        if (e.status==="fulfilled") setElevR(e.value);
        if (f2.status==="fulfilled") setObR(f2.value);
        if (g2.status==="fulfilled") setRwR(g2.value);
        if (h2.status==="fulfilled") setOwR(h2.value);
      } catch (err) { setApiE(err.message); }
    }, 300);
    return () => clearTimeout(timer);
  }, [proj, geo, kd, kztIn, gustIn, extraHeights, useAltCC]);

  const lrOk = lrR ? lrR.ok : null;

  // Determine areas for C&C display
  const ccRoofAreas = CC_AREAS_ROOF;
  const ccWallAreas = CC_AREAS_WALL;

  function renderWindPanel() {
    return (
      <div className="px-4 py-3 flex-1">
          <Divider label="Project" />
          <Field label="Project Name">
            <input
              value={proj.projectName || ""}
              onChange={(e) => up("projectName", e.target.value)}
              placeholder="e.g. Main Street Office"
              style={{ width:"100%", padding:"4px 8px", background:"#F0ECE4", border:"1px solid #D8D2C7",
                borderRadius:4, fontSize:12, color:"#1F2933", fontFamily:"inherit", boxSizing:"border-box" }}
            />
          </Field>
          <Field label="Job No.">
            <input
              value={proj.jobNumber || ""}
              onChange={(e) => up("jobNumber", e.target.value)}
              placeholder="e.g. 2026-042"
              style={{ width:"100%", padding:"4px 8px", background:"#F0ECE4", border:"1px solid #D8D2C7",
                borderRadius:4, fontSize:12, color:"#1F2933", fontFamily:"inherit", boxSizing:"border-box" }}
            />
          </Field>
          {/* WSS lock banner */}
          {wssActive && (
            <div style={{ marginBottom: 8, padding: "6px 8px", background: wssOverridden ? "#F3E7D2" : "#E7EFF2", borderRadius: 4, border: wssOverridden ? "1px solid #D8B488" : "1px solid #B7CFDE", fontSize: 10, color: wssOverridden ? "#9A6614" : "#23557A" }}>
              {wssLocked
                ? <><span style={{ fontWeight: 700 }}>🔗 From WSS Lookup</span><br />Edition, RC &amp; V are pre-filled.<br /><button onClick={() => setWssLocked(false)} style={{ marginTop: 4, fontSize: 10, color: "#23557A", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Edit manually</button></>
                : <><span style={{ fontWeight: 700, color: "#9A6614" }}>⚠ Manually overridden</span><br /><button onClick={() => { up("V_mph", wssData.V_mph); up("risk_category", wssData.risk_category); up("code_version", wssData.code_version); setWssLocked(true); setWssOverridden(false); }} style={{ marginTop: 4, fontSize: 10, color: "#23557A", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Restore WSS values</button></>
              }
            </div>
          )}
          <Field label="Edition">
            {wssFieldLocked
              ? <div style={{ padding: "4px 8px", background: "#F0ECE4", border: "1px solid #CBD9E2", borderRadius: 4, fontSize: 12, color: "#5E6A73", fontFamily: "inherit" }}>{CODE_VERS.find(c => c.value === proj.code_version)?.label ?? proj.code_version}</div>
              : <Sel value={proj.code_version} onChange={(v) => { up("code_version",v); setWssOverridden(true); }} options={CODE_VERS} />
            }
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Risk Cat">
              {wssFieldLocked
                ? <div style={{ padding: "4px 8px", background: "#F0ECE4", border: "1px solid #CBD9E2", borderRadius: 4, fontSize: 12, color: "#5E6A73", fontFamily: "inherit" }}>{proj.risk_category}</div>
                : <Sel value={proj.risk_category} onChange={(v) => { up("risk_category",v); setWssOverridden(true); }} options={["I","II","III","IV"].map((v) => ({value:v,label:v}))} />
              }
            </Field>
            <Field label="Exposure"><Sel value={proj.exposure} onChange={(v) => up("exposure",v)} options={EXPOSURES} /></Field>
          </div>
          <Field label="V" unit="mph" error={errs.V_mph}>
            {wssFieldLocked
              ? <div style={{ padding: "4px 8px", background: "#F0ECE4", border: "1px solid #CBD9E2", borderRadius: 4, fontSize: 12, color: "#5E6A73", fontFamily: "inherit" }}>{proj.V_mph}</div>
              : <NInput value={proj.V_mph} onChange={(v) => { up("V_mph",v); setWssOverridden(true); }} min={85} max={300} error={errs.V_mph} />
            }
          </Field>
          <Field label="Enclosure"><Sel value={proj.enclosure} onChange={(v) => up("enclosure",v)} options={ENCLOSURES} /></Field>
          <Divider label="Geometry" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="L" unit="ft" error={errs.L_ft}><NInput value={geo.L_ft} onChange={(v) => ug("L_ft",v)} min={1} error={errs.L_ft} /></Field>
            <Field label="B" unit="ft" error={errs.B_ft}><NInput value={geo.B_ft} onChange={(v) => ug("B_ft",v)} min={1} error={errs.B_ft} /></Field>
          </div>
          <Field label="h" unit="ft" error={errs.h_ft}><NInput value={geo.h_ft} onChange={(v) => ug("h_ft",v)} min={1} error={errs.h_ft} /></Field>
          <Field label="Roof"><Sel value={geo.roof_type} onChange={(v) => ug("roof_type",v)} options={ROOFS.map((r) => ({value:r.value,label:r.label}))} /></Field>
          <Field label="θ" unit="deg"><NInput value={geo.roof_angle_deg} onChange={(v) => ug("roof_angle_deg",v)} min={0} max={90} step={0.1} /></Field>
          <Field label="Parapet ht above grd" unit="ft"><NInput value={geo.parapet_height_ft} onChange={(v) => ug("parapet_height_ft",v)} min={0} step={0.5} /></Field>
          <Field label="Min parapet ht above roof" unit="ft" hint="≥3 ft → Zone 3 neg = Zone 2 (§30.3 Note 6)"><NInput value={geo.min_parapet_ht_ft} onChange={(v) => ug("min_parapet_ht_ft",v)} min={0} step={0.5} /></Field>

          {/* ── Topographic Factor ── */}
          <Divider label="Topographic Factor Kzt" />
          <Field label="Topography">
            <Sel value={kztIn.topo_type} onChange={(v) => ukzt("topo_type", v)} options={TOPO_TYPES} />
          </Field>
          {kztIn.topo_type !== "flat" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="H" unit="ft"><NInput value={kztIn.H_ft} onChange={(v) => ukzt("H_ft", v)} min={0} step={1} /></Field>
                <Field label="Lh" unit="ft"><NInput value={kztIn.Lh_ft} onChange={(v) => ukzt("Lh_ft", v)} min={1} step={1} /></Field>
              </div>
              <Field label="x from crest" unit="ft">
                <NInput value={kztIn.x_ft} onChange={(v) => ukzt("x_ft", v)} step={1} />
              </Field>
              <Field label="Location">
                <Sel value={kztIn.upwind ? "upwind" : "downwind"} onChange={(v) => ukzt("upwind", v === "upwind")}
                  options={[{value:"upwind",label:"Upwind of crest"},{value:"downwind",label:"Downwind of crest"}]} />
              </Field>
              {/* live Kzt preview */}
              {(() => {
                const r = calcKzt(kztIn.topo_type, kztIn.H_ft, kztIn.Lh_ft, kztIn.x_ft, geo.h_ft, kztIn.upwind);
                return (
                  <div className="px-3 py-2 bg-sky-950/30 border border-sky-800/40 rounded text-xs font-mono text-slate-300 space-y-0.5">
                    <div className="flex justify-between"><span className="text-slate-500">H/Lh</span><span>{r.hLh.toFixed(4)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">K1</span><span>{r.k1.toFixed(4)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">K2</span><span>{r.k2.toFixed(4)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">K3</span><span>{r.k3.toFixed(4)}</span></div>
                    <div className="flex justify-between font-bold text-sky-300"><span>Kzt @ h</span><span>{r.kzt.toFixed(4)}</span></div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="px-3 py-2 bg-slate-800/30 rounded text-xs font-mono text-slate-500">Kzt = 1.0 (flat terrain)</div>
          )}

          {/* ── Gust Effect Factor ── */}
          <Divider label="Gust Effect Factor G" />
          <Field label="Method">
            <Sel value={gustIn.mode} onChange={(v) => ugust("mode", v)} options={GUST_MODES} />
          </Field>
          {gustIn.mode !== "rigid_fixed" ? (
            <>
              {gustIn.mode === "flexible" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="n₁" unit="Hz"><NInput value={gustIn.n1} onChange={(v) => ugust("n1", v)} min={0.01} step={0.05} /></Field>
                    <Field label="β" unit="ratio"><NInput value={gustIn.beta} onChange={(v) => ugust("beta", v)} min={0.005} max={0.2} step={0.005} /></Field>
                  </div>
                </>
              ) : null}
              {/* live G preview */}
              {(() => {
                const r = calcG(gustIn.mode, proj.exposure, geo.h_ft, gustIn.n1, gustIn.beta, proj.V_mph);
                return (
                  <div className="px-3 py-2 bg-sky-950/30 border border-sky-800/40 rounded text-xs font-mono text-slate-300 space-y-0.5">
                    {r.Iz  != null ? <div className="flex justify-between"><span className="text-slate-500">Iz</span><span>{r.Iz.toFixed(4)}</span></div> : null}
                    {r.Lz  != null ? <div className="flex justify-between"><span className="text-slate-500">Lz (ft)</span><span>{r.Lz.toFixed(2)}</span></div> : null}
                    {r.Q   != null ? <div className="flex justify-between"><span className="text-slate-500">Q</span><span>{r.Q.toFixed(4)}</span></div> : null}
                    {r.R   != null ? <div className="flex justify-between"><span className="text-slate-500">R</span><span>{r.R.toFixed(4)}</span></div> : null}
                    <div className="flex justify-between font-bold text-sky-300"><span>G</span><span>{r.G.toFixed(4)}</span></div>
                    <div className="text-slate-600 text-[9px] mt-0.5">{r.note}</div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="px-3 py-2 bg-slate-800/30 rounded text-xs font-mono text-slate-500">G = 0.85 (§26.11.1 fixed)</div>
          )}
        </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200" style={{ fontFamily:"'JetBrains Mono','Fira Code','SF Mono',monospace" }}>
      {/* ── SIDEBAR ── */}
      <aside className="w-72 shrink-0 bg-slate-900 border-r border-slate-700 flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b border-slate-700 sticky top-0 bg-slate-900/90 backdrop-blur-sm z-10">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-sm font-bold text-slate-100">WIND LOADS</span>
            <span className="text-[10px] text-sky-500 font-semibold">ASCE 7</span>
          </div>
          {/* Left sidebar tab strip */}
          <div className="flex gap-0 rounded overflow-hidden border border-slate-700" style={{ fontSize: 10 }}>
            <button
              onClick={() => onSideTab("wss")}
              style={{ flex:1, padding:"4px 0", background: sideTab==="wss" ? "#23557A" : "#F0ECE4", color: sideTab==="wss" ? "#fff" : "#4C5862", border:"none", cursor:"pointer", fontWeight: sideTab==="wss" ? 700 : 400, fontFamily:"inherit", fontSize:10 }}
            >🌐 Site Hazards</button>
            <button
              onClick={() => onSideTab("wind")}
              style={{ flex:1, padding:"4px 0", background: sideTab==="wind" ? "#23557A" : "#F0ECE4", color: sideTab==="wind" ? "#fff" : "#4C5862", border:"none", borderLeft:"1px solid #D8D2C7", cursor:"pointer", fontWeight: sideTab==="wind" ? 700 : 400, fontFamily:"inherit", fontSize:10 }}
            >💨 Wind Inputs</button>
          </div>
        </div>
        <div style={{ display: sideTab === "wind" ? "flex" : "none", flex: 1, overflowY: "auto", flexDirection: "column" }}>{renderWindPanel()}</div>
        <div style={{ display: sideTab === "wss" ? "flex" : "none", flex: 1, overflowY: "auto", flexDirection: "column" }}>{/* always mounted so WSS state persists */}
          <div className="px-4 py-3 flex-1 overflow-y-auto">
            <WSSLookup onWindResult={(d) => { onWssResult(d); }} wssState={wssState} />
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* ── Sticky header: chips + main tabs + active sub-tabs ── */}
        <div className="sticky top-0 z-20 bg-slate-900 border-b border-slate-700 shadow-md shadow-slate-950/60">
          {shared ? (
            <div className="px-4 py-2 border-b border-slate-700/60 bg-slate-900/80 flex flex-wrap gap-1.5">
              <Chip label="Ke"   value={shared.ke.toFixed(4)} />
              <Chip label="Kd"   value={shared.kd.toFixed(2)} />
              <Chip label="Kzt"  value={shared.kztH != null ? shared.kztH.toFixed(4) : "1.0000"} />
              <Chip label="α"    value={shared.alpha.toFixed(1)} />
              <Chip label="zg"   value={shared.zg + "'"} />
              <Chip label={proj.code_version === "7-22" ? "Kd·qh" : "qh"} value={shared.qh.toFixed(1) + " psf"} />
              <Chip label="G"    value={dirR ? dirR.G.toFixed(4) : (gustIn.mode==="rigid_fixed" ? "0.8500" : "—")} />
              <Chip label="GCpi" value={"±" + gcpiOf(proj.enclosure)} />
            </div>
          ) : null}

          {/* Main tabs */}
          <div className="px-4 pt-2 flex gap-0.5 items-end">
            {TABS.map((t) => {
              const dis = t.id === "lr" && lrOk === false;
              const act = tab === t.id;
              return (
                <button key={t.id} onClick={() => !dis && setTab(t.id)} disabled={dis}
                  title={dis && lrR ? lrR.reason : ""}
                  className={"px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase rounded-t transition-all " + (act ? "bg-sky-900 text-sky-400 border border-sky-700 border-t-2 border-t-sky-400 border-b-transparent -mb-px" : dis ? "text-slate-600 cursor-not-allowed opacity-40" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40")}>
                  {t.label}{t.id==="lr" && lrOk===false ? <span className="ml-1 text-[8px] text-amber-500">N/A</span> : null}
                </button>
              );
            })}
            <div style={{ marginLeft:"auto", display:"flex", gap:6, alignItems:"center" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".wls"
                style={{ display:"none" }}
                onChange={handleLoad}
              />
              <button
                onClick={handleSave}
                style={{ padding:"4px 10px", fontSize:10, fontWeight:700,
                  letterSpacing:"0.05em", textTransform:"uppercase",
                  background:"#F0ECE4", border:"1px solid #D8D2C7",
                  color:"#4C5862", borderRadius:4, cursor:"pointer", marginBottom:2 }}>
                &#128190; Save
              </button>
              <button
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                style={{ padding:"4px 10px", fontSize:10, fontWeight:700,
                  letterSpacing:"0.05em", textTransform:"uppercase",
                  background:"#F0ECE4", border:"1px solid #D8D2C7",
                  color:"#4C5862", borderRadius:4, cursor:"pointer", marginBottom:2 }}>
                &#128194; Open
              </button>
              <button
                onClick={() => setPrintOpen(true)}
                style={{ padding:"4px 10px", fontSize:10, fontWeight:700,
                  letterSpacing:"0.05em", textTransform:"uppercase",
                  background:"#F0ECE4", border:"1px solid #D8D2C7",
                  color:"#4C5862", borderRadius:4, cursor:"pointer", marginBottom:2 }}>
                &#128438; Print Report
              </button>
            </div>
          </div>

          {/* Sub-tab row — only for tabs that have sub-tabs */}
          {tab === "dir" && dirR ? (() => {
            const dtabs = [
              { id:"normal",   label:"Normal to Ridge" },
              { id:"parallel", label:"Parallel to Ridge" },
              ...(elevR !== null ? [{ id:"elevated", label:"Elevated Bldg §​27.1.5" }] : []),
            ];
            return (
              <div className="px-4 pt-2 pb-1.5 flex gap-0.5 border-t border-slate-700/70">
                {dtabs.map(t => (
                  <button key={t.id} onClick={() => setDirSub(t.id)}
                    className={"px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm transition-colors " + (dirSub === t.id ? "bg-sky-900/50 text-sky-400 border border-sky-700/50" : "text-slate-500 hover:text-slate-300 border border-transparent")}>
                    {t.label}
                  </button>
                ))}
              </div>
            );
          })() : null}

          {tab === "cc" && ccR ? (() => {
            const ctabs = [
              { id:"roof",     label:"Roof (1, 1’, 2, 3)" },
              { id:"overhang", label:"Overhangs" },
              { id:"wall",     label: "Walls" },
              { id:"parapet",  label:"Parapet" },
            ];
            return (
              <div className="px-4 pt-2 pb-1.5 flex gap-0.5 border-t border-slate-700/70">
                {ctabs.map(t => (
                  <button key={t.id} onClick={() => setCcSub(t.id)}
                    className={"px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm transition-colors " + (ccSub === t.id ? "bg-sky-900/50 text-sky-400 border border-sky-700/50" : "text-slate-500 hover:text-slate-300 border border-transparent")}>
                    {t.label}
                  </button>
                ))}
              </div>
            );
          })() : null}

          {tab === "rw" ? (
            <div className="px-4 pt-2 pb-1.5 flex gap-0.5 border-t border-slate-700/70">
              {[
                { id:"equip",  label:"Rooftop Structures" },
                { id:"canopy", label:"Attached Canopies" },
                { id:"solar",  label:"Solar Panels" },
              ].map(t => (
                <button key={t.id} onClick={() => setRwSub(t.id)}
                  className={"px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm transition-colors " + (rwSub === t.id ? "bg-amber-900/50 text-amber-400 border border-amber-700/50" : "text-slate-500 hover:text-slate-300 border border-transparent")}>
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
          {tab === "ow" ? (
            <div className="px-4 pt-2 pb-1.5 flex gap-0.5 border-t border-slate-700/70">
              {[
                { id:"solid",   label:"Solid Signs & Walls" },
                { id:"open",    label:"Open Signs & Frames" },
                { id:"chimney", label:"Chimneys & Tanks" },
                { id:"tower",   label:"Trussed Towers" },
              ].map(t => (
                <button key={t.id} onClick={() => setOwSub(t.id)}
                  className={"px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm transition-colors " + (owSub === t.id ? "bg-sky-900/50 text-sky-400 border border-sky-700/50" : "text-slate-500 hover:text-slate-300 border border-transparent")}>
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* ── Print Report Modal ── */}
        {printOpen ? (
          <div style={{ position:"absolute", inset:0, zIndex:50, background:"rgba(0,0,0,0.6)",
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ background:"#F0ECE4", border:"1px solid #D8D2C7", borderRadius:8,
              padding:"24px 28px", width:360, boxShadow:"0 8px 32px rgba(0,0,0,0.6)" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#1F2933", marginBottom:16 }}>
                Print Wind Load Report
              </div>
              <div style={{ fontSize:11, color:"#5E6A73", marginBottom:12 }}>
                Project inputs are always included. Select tabs to print:
              </div>
              {[
                { id:"qz",  label:"Velocity Pressure (qz)",  ok: !!qzR },
                { id:"dir", label:"MWFRS Directional",       ok: !!dirR },
                { id:"lr",  label:"MWFRS Low-Rise",          ok: !!(lrR && lrR.ok) },
                { id:"cc",  label:"C&C",                     ok: !!ccR },
                { id:"ob",  label:"Open Building",           ok: !!(obR && obR.ok) },
                { id:"rw",  label:"Rooftop Structures",      ok: !!rwR },
                { id:"ow",  label:"Other Structures",        ok: !!(owR && owR.ok) },
              ].map((t) => (
                <label key={t.id} style={{ display:"flex", alignItems:"center", gap:8,
                  padding:"5px 0", cursor: t.ok ? "pointer" : "default",
                  opacity: t.ok ? 1 : 0.35 }}>
                  <input type="checkbox"
                    checked={printTabs.includes(t.id)}
                    disabled={!t.ok}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setPrintTabs((prev) => [...prev, t.id]);
                      } else {
                        setPrintTabs((prev) => prev.filter((x) => x !== t.id));
                      }
                    }}
                    style={{ accentColor:"#23557A", width:13, height:13 }} />
                  <span style={{ fontSize:12, color: t.ok ? "#2E3A45" : "#5E6A73" }}>
                    {t.label}
                    {!t.ok
                      ? <span style={{ marginLeft:6, fontSize:10, color:"#5E6A73" }}>
                          (no results)
                        </span>
                      : null}
                  </span>
                </label>
              ))}
              <div style={{ display:"flex", gap:8, marginTop:20 }}>
                <button
                  onClick={() => {
                    windGeneratePDF(
                      { proj, geo, kd, kztIn, gustIn, shared },
                      { qzR, dirR, lrR, ccR, obR, rwR, owR },
                      printTabs
                    );
                    setPrintOpen(false);
                  }}
                  disabled={printTabs.length === 0}
                  style={{ flex:1, padding:"7px 0", fontSize:11, fontWeight:700,
                    letterSpacing:"0.05em", textTransform:"uppercase",
                    background: printTabs.length ? "#2E6A99" : "#F0ECE4",
                    color: printTabs.length ? "#fff" : "#5E6A73",
                    border:"none", borderRadius:4,
                    cursor: printTabs.length ? "pointer" : "default" }}>
                  Generate PDF
                </button>
                <button
                  onClick={() => setPrintOpen(false)}
                  style={{ padding:"7px 14px", fontSize:11, fontWeight:600,
                    background:"transparent", color:"#5E6A73",
                    border:"1px solid #D8D2C7", borderRadius:4, cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* content — split layout when diagram pane is active */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ minWidth: 0 }}>
          {apiE ? <div className="mb-3 px-2.5 py-1.5 bg-red-950/40 border border-red-800/50 rounded text-xs text-red-400">{apiE}</div> : null}
          {!qzR ? <div className="flex flex-col items-center justify-center h-full opacity-30"><p className="text-sm text-slate-600">Results update automatically as you change inputs</p></div> : null}

          {/* ── qz Profile ── */}
          {tab === "qz" && qzR ? (
            <div>
              <h2 className="text-sm font-bold text-slate-300 mb-3">Velocity Pressure — {qzR.code_version}, Exp {qzR.exposure}, V={qzR.V_mph} mph</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-slate-400 mb-3">
                <span>Kd = {shared.kd.toFixed(2)}</span>
                <span>Ke = {shared.ke.toFixed(4)}</span>
                <span>Kzt @ h = {qzR.kztH != null ? qzR.kztH.toFixed(4) : "1.0000"}</span>
                {kztIn.topo_type !== "flat" ? <span className="text-amber-400/80">Topo: {TOPO_TYPES.find(t=>t.value===kztIn.topo_type)?.label}</span> : null}
              </div>
              <table className="w-full text-xs font-mono tabular-nums">
                <THead cols={["z (ft)","Kz","Kzt","qz (psf)","α","zg (ft)"]} />
                <tbody>
                  {qzR.pressures.map((r, i) => (
                    <TRow key={i} alt={i%2===1} cells={[r.z_ft.toFixed(1), r.kz.toFixed(4), r.kzt != null ? r.kzt.toFixed(4) : "1.0000", r.qz_psf.toFixed(1), r.alpha.toFixed(1), r.zg_ft.toFixed(0)]} />
                  ))}
                </tbody>
              </table>

              {/* ── Kzt Reference Diagrams ── */}
              {kztIn.topo_type !== "flat" && <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#5E6A73",
                  fontFamily: "monospace", textTransform: "uppercase", marginBottom: 8 }}>
                  Topographic Factor Kzt — Fig. 26.8-1
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {[
                    { img: kztEscarpmentImg, label: "Escarpment", alt: "Escarpment — Kzt topographic factor diagram showing H, Lh, upwind/downwind x, and speed-up region" },
                    { img: kztRidgeHillImg,  label: "2D Ridge or 3D Axisymmetrical Hill", alt: "2D Ridge or 3D Axisymmetrical Hill — Kzt topographic factor diagram" },
                  ].map(({ img, label, alt }) => (
                    <div key={label} style={{ flex: "1 1 260px", minWidth: 260, borderRadius: 6,
                      overflow: "hidden", border: "1px solid #D8D2C7" }}>
                      <div style={{ padding: "5px 10px", background: "#F0ECE4",
                        borderBottom: "1px solid #D8D2C7", fontSize: 12, fontWeight: 700,
                        color: "#5E6A73", letterSpacing: "0.08em", fontFamily: "monospace",
                        textTransform: "uppercase" }}>
                        {label}
                      </div>
                      <div style={{ background: "#fff", padding: "8px" }}>
                        <img src={img} alt={alt} style={{ width: "100%", height: "auto", display: "block" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>}
            </div>
          ) : null}

          {/* ── MWFRS Dir ── */}
          {tab === "dir" && (dirR || elevR) ? <DirTab d={dirR} elev={elevR} geo={geo} ug={ug} sub={dirSub} setSub={setDirSub} rows={wallRows} addRow={addWallRow} removeRow={removeWallRow} updateRow={updateWallRow} lockRow={lockWallRow} /> : null}

          {/* ── MWFRS LR ── */}
          {tab === "lr" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-300">MWFRS Low-Rise — Ch. 28</h2>
                {lrR ? (lrR.ok ? <span className="text-xs font-semibold text-emerald-400">Applicable</span> : <span className="text-xs font-semibold text-amber-400">N/A: {lrR.reason}</span>) : null}
              </div>
              {lrR && !lrR.ok ? <div className="px-4 py-3 bg-amber-950/20 border border-amber-800/30 rounded"><p className="text-sm text-amber-400">{lrR.reason}</p></div> : null}
              {lrR && lrR.ok ? (
                <>
                  <div className="flex gap-3 text-xs font-mono text-slate-400"><span>{lrR.code_version === "7-22" ? "Kd·qh" : "qh"} = {lrR.qh} psf</span><span>2a = {lrR.ez} ft</span></div>
                  <Acc title="Case A — Transverse" open={true}>
                    <table className="w-full text-xs font-mono tabular-nums">
                      <THead cols={["Zone","GCpf","+GCpi","−GCpi"]} />
                      <tbody>{lrR.cA.map((r, i) => <TRow key={i} alt={i%2===1} cells={[r.zone, r.gcpf.toFixed(4), <Psf v={r.pN} />, <Psf v={r.pP} />]} />)}</tbody>
                    </table>
                  </Acc>
                  <Acc title="Case B — Longitudinal" open={true}>
                    <table className="w-full text-xs font-mono tabular-nums">
                      <THead cols={["Zone","GCpf","+GCpi","−GCpi"]} />
                      <tbody>{lrR.cB.map((r, i) => <TRow key={i} alt={i%2===1} cells={[r.zone, r.gcpf.toFixed(4), <Psf v={r.pN} />, <Psf v={r.pP} />]} />)}</tbody>
                    </table>
                  </Acc>
                  {/* Horizontal MWFRS Simple Diaphragm Pressures */}
                  {lrR.sd ? (
                    <Acc title="Horizontal MWFRS Simple Diaphragm Pressures (psf)" open={true}>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-slate-500 mb-3">
                        <span>{lrR.code_version === "7-22" ? "Kd·qh" : "qh"} = {lrR.qh.toFixed(1)} psf</span>
                        <span>Edge strip a = {lrR.sd.a} ft</span>
                        <span>End zone 2a = {lrR.sd.endZone2a} ft</span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-300 mb-2 tracking-wide">Transverse direction (normal to L)</p>
                      <div className="space-y-1 mb-4 pl-2 font-mono text-xs">
                        <div className="flex justify-between"><span className="text-slate-400">Interior Zone: &nbsp; Wall</span><span className="text-amber-300 font-bold">{lrR.sd.transverse.intWall.toFixed(1)} psf</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Roof</span><span className="text-sky-400">{lrR.sd.transverse.intRoof.toFixed(1)} psf **</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">End Zone: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Wall</span><span className="text-amber-300 font-bold">{lrR.sd.transverse.endWall.toFixed(1)} psf</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Roof</span><span className="text-sky-400">{lrR.sd.transverse.endRoof.toFixed(1)} psf **</span></div>
                      </div>
                      <p className="text-[11px] font-bold text-slate-300 mb-2 tracking-wide">Longitudinal direction (parallel to L)</p>
                      <div className="space-y-1 mb-3 pl-2 font-mono text-xs">
                        <div className="flex justify-between"><span className="text-slate-400">Interior Zone: &nbsp; Wall</span><span className="text-amber-300 font-bold">{lrR.sd.longitudinal.intWall.toFixed(1)} psf</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">End Zone: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Wall</span><span className="text-amber-300 font-bold">{lrR.sd.longitudinal.endWall.toFixed(1)} psf</span></div>
                      </div>
                      {/* Parapet & windward roof overhang — from Dir result */}
                      {dirR && dirR.parWW != null && dirR.parZ > (geo.h_ft || 0) ? (
                        <div className="mb-3 pt-2.5 border-t border-slate-700/40">
                          <p className="text-[11px] font-bold text-slate-300 mb-2 tracking-wide">Parapet</p>
                          <div className="space-y-1 pl-2 font-mono text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Windward parapet &nbsp;<span className="text-slate-600">(GCpn = +1.5)</span></span>
                              <span className="text-amber-300 font-bold">{dirR.parWW.toFixed(1)} psf</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Leeward parapet &nbsp;&nbsp;<span className="text-slate-600">(GCpn = −1.0)</span></span>
                              <span className="text-sky-400">{dirR.parLW.toFixed(1)} psf</span>
                            </div>
                            {lrR.oh != null ? (
                              <div className="flex justify-between pt-1 border-t border-slate-700/40">
                                <span className="text-slate-400">Windward roof overhangs <span className="text-slate-600 text-[10px]">(upward — add to windward roof pressure)</span></span>
                                <span className="text-sky-400">{lrR.oh.toFixed(1)} psf</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      <div className="space-y-1 pt-1.5 border-t border-slate-700/60 text-[10px] text-slate-500">
                        <p>** NOTE: Total horiz force shall not be less than that determined by neglecting roof forces (except for MWFRS moment frames).</p>
                        <p className="text-amber-400/80 font-medium">The code requires the MWFRS be designed for a min ultimate force of 16 psf multiplied by the wall area plus an 8 psf force applied to the vertical projection of the roof.</p>
                      </div>
                    </Acc>
                  ) : null}

                  {/* ── Longitudinal Directional Force (open/partially enclosed) ── */}
                  {lrR.lng ? (
                    <Acc title="Longitudinal Direction — Open/Partially Enclosed (§28.4.4)" open={false}>
                      {/* Inputs inline */}
                      <div className="border border-slate-700/40 rounded p-3 mb-3 space-y-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Frame Geometry Inputs</p>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-slate-400 whitespace-nowrap"># of frames (n)</span>
                          <NInput value={geo.lng_n_frames} onChange={(v) => ug("lng_n_frames", v)} min={1} step={1} className="w-20 text-right" />
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-slate-400 whitespace-nowrap">Solid end wall area incl. fascia (As)</span>
                          <div className="flex items-center gap-1">
                            <NInput value={geo.lng_As_sf} onChange={(v) => ug("lng_As_sf", v)} min={0} className="w-20 text-right" />
                            <span className="text-slate-500 text-[10px]">sf</span>
                          </div>
                        </div>
                      </div>

                      {/* Computed intermediates */}
                      <div className="space-y-1 font-mono text-xs mb-3">
                        <div className="flex justify-between text-slate-500"><span>Eave height</span><span>{lrR.lng.eave_ht.toFixed(2)} ft</span></div>
                        <div className="flex justify-between text-slate-500"><span>Ridge height</span><span>{lrR.lng.ridge_ht.toFixed(2)} ft</span></div>
                        <div className="flex justify-between text-slate-500"><span>Total end wall area (Ae)</span><span>{lrR.lng.Ae.toFixed(2)} sf</span></div>
                        <div className="flex justify-between text-slate-500"><span>Solidity ratio (Φ = As/Ae)</span><span>{lrR.lng.phi.toFixed(4)}</span></div>
                        <div className="flex justify-between text-slate-500"><span>n (effective, min 3)</span><span>{lrR.lng.n_eff}</span></div>
                        <div className="flex justify-between text-slate-500"><span>KB</span><span>{lrR.lng.KB.toFixed(2)}</span></div>
                        <div className="flex justify-between text-slate-500"><span>KS</span><span>{lrR.lng.KS.toFixed(4)}</span></div>
                        <div className="flex justify-between text-slate-500"><span>Zones 5&amp;6 area</span><span>{lrR.lng.area56.toFixed(2)} sf</span></div>
                        <div className="flex justify-between text-slate-500"><span>Zones 5E&amp;6E area</span><span>{lrR.lng.area5E6E.toFixed(2)} sf</span></div>
                        <div className="flex justify-between text-slate-500"><span>(GCpf)ww − (GCpf)lw</span><span>{lrR.lng.gcpf_diff.toFixed(4)}</span></div>
                      </div>

                      {/* Results */}
                      <div className="border-t border-slate-700/60 pt-3 space-y-2 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">p = Kd·qh·(ΔGCpf)·KB·KS</span>
                          <span className="text-amber-300 font-bold">{lrR.lng.p_lng.toFixed(1)} psf</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-400">F = p × Ae</span>
                          <span className="text-emerald-300 font-bold text-sm">{lrR.lng.F_lng.toFixed(1)} kips</span>
                        </div>
                        <p className="text-[10px] text-slate-500 pt-1">Force applied at centroid of end wall area Ae. Acts in combination with roof loads for open/partially enclosed buildings per §28.4.4.</p>
                      </div>
                    </Acc>
                  ) : null}

                  <p className="text-[10px] text-slate-500 px-1">Light-frame construction or flexible diaphragms need not be designed for the torsional load cases per §28.3.4.</p>
                </>
              ) : null}
            </div>
          ) : null}

          {/* ── C&C ── */}
          {tab === "cc" && ccR ? (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-300">C&C — {ccR.proc === "hle60" ? "h≤60 ft" : ccR.proc === "alt6090" ? "Alt 60– 90 ft" : "h>60 ft"}</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-slate-400">
                <span>{ccR.codeVer === "7-22" ? "Kd·qh" : "qh"} = {ccR.qh} psf</span>
                <span>GCpi = ±{ccR.gcpi}</span>
                <span>a = {ccR.a} ft</span>
                <span>θ = {ccR.theta}°</span>
                <span>Min = {ccR.minP} psf</span>
              </div>
              {ccR.altEligible ? (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-sky-950/40 border border-sky-800/40 rounded text-[10px]">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-slate-300">
                    <input type="checkbox" checked={useAltCC} onChange={e => setUseAltCC(e.target.checked)}
                      className="accent-sky-500 w-3 h-3" />
                    Use Alternate Procedure (60 ft &lt; h &lt; 90 ft) — Ch.30 Alt.
                  </label>
                  <span className="text-slate-500 ml-1">Aₑₙₑ = B²/3 = {(geo.B_ft**2/3).toFixed(0)} sf — {ccR.altIs710 ? "areas [10,50,100,500] sf, GCpi applied separately" : "curves extend to 1000 sf, base = Kᵈ·qʰ"}</span>
                </div>
              ) : null}
              {ccR.theta <= 10 ? (
                <div className="text-[10px] text-amber-500/80 px-1">Note: GCp values from {ccR.proc === "hgt60" && ["7-10","7-05"].includes(ccR.codeVer) ? ccR.codeVer + " Fig 6-17A/B" : ["7-10","7-05"].includes(ccR.codeVer) ? ccR.codeVer + " Fig 6-11A/B" : ccR.proc === "hgt60" ? "ASCE 7-22 Fig 30.4-1" : ccR.proc === "alt6090" ? "ASCE 7 Alt 60–90ft" : "ASCE 7-22 Fig 30.3-2A"} (final design values for \u03b8 \u2264 10\u00b0)</div>
              ) : null}
              {ccR.prs.some(p => p.zone === "3") ? (
                <div className={`text-[10px] px-1 ${ccR.zone3eq2 ? "text-amber-400/90" : "text-slate-500"}`}>
                  {ccR.zone3eq2
                    ? `Zone 3 neg = Zone 2 neg (min parapet = ${ccR.minPar} ft ≥ 3 ft — §30.3 Note 6 applied)`
                    : `Note: Zone 3 neg = Zone 2 when min parapet ≥ 3 ft (current = ${ccR.minPar} ft)`}
                </div>
              ) : null}
                            {ccSub === "roof" ? (
                <div>
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={handleExportCCRoofXLSX}
                      className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-400 border border-emerald-700/50 rounded transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      Generate Excel Table
                    </button>
                  </div>
                  <CCMatrix
                    pressures={ccR.prs.filter((p) => ["1","1p","2","3"].includes(p.zone) && !(["7-10","7-05"].includes(ccR.codeVer) && p.zone === "1p") && !(ccR.proc === "hgt60" && p.zone === "1p"))}
                    title={ccR.proc === "hle60" ? "Roof C&C (psf) \u2014 Fig 30.3-1/2" : ccR.proc === "alt6090" ? "Roof C&C (psf) \u2014 Alt 60\u201390 ft" : "Roof C&C (psf) \u2014 Fig 30.4-1"}
                    areas={ccR.proc === "hgt60" ? [10,50,100,500] : ccR.proc === "alt6090" ? (ccR.altIs710 ? [10,50,100,500] : [10,100,500,1000]) : ccRoofAreas}
                    userAreas={[geo.cc_user_area1, geo.cc_user_area2]}
                    onUserAreaChange={(i,v) => ug(i===0 ? "cc_user_area1" : "cc_user_area2", v)}
                  />
                </div>
              ) : null}

              {ccSub === "overhang" ? (() => {
                const isOldCode = ccR.codeVer === "7-05" || ccR.codeVer === "7-10";
                // h>60 standard: oh1/oh2/oh3z4/oh3z5 zones
                // h<=60 and alt: oh1/oh2/oh3 zones (7-05/7-10 collapse oh1&oh2)
                const isHgt60Std = ccR.proc === "hgt60";
                const isAlt = ccR.proc === "alt6090";
                const ohPressures = isHgt60Std
                  ? ccR.prs.filter(p => ["oh1","oh2","oh3z4","oh3z5"].includes(p.zone))
                  : ccR.prs.filter(p => ["oh1","oh2","oh3"].includes(p.zone) && !(isOldCode && p.zone === "oh2"));
                const labelOverrides = isHgt60Std ? {
                  oh1:    { label: "Overhang Zone 1",       desc: "adj. Zone 2 (GCpi=0)" },
                  oh2:    { label: "Overhang Zone 2",       desc: "adj. Zone 3 (GCpi=0)" },
                  oh3z4:  { label: "Overhang Zone 3 @Z4",   desc: "adj. Zone 3 @wall Z4 (GCpi=0)" },
                  oh3z5:  { label: "Overhang Zone 3 @Z5",   desc: "adj. Zone 3 @wall Z5 (GCpi=0)" },
                } : isOldCode ? {
                  oh1: { label: "Overhang Zone 1 & 2", desc: "Overhang - Field & Edge (GCpi=0)" },
                  oh3: { label: "Overhang Zone 3",     desc: "Overhang - Corner (GCpi=0)" },
                } : {};
                const ohAreas = isHgt60Std ? [10, 50, 100, 500] : isAlt ? (ccR.altIs710 ? [10, 50, 100, 500] : [10, 100, 500, 1000]) : ccRoofAreas;
                const ohTitle = isHgt60Std
                  ? "Roof Overhang C&C (psf) — Fig 30.4-1 (GCpi=0)"
                  : isAlt
                  ? "Roof Overhang C&C (psf) — Alt 60–90 ft (GCpi=0)"
                  : "Roof Overhang C&C (psf) — GCpi = 0 (uplift only)";
                return (
                  <>
                  <div className="text-[10px] text-slate-500 px-1 mb-1">
                    Overhang pressure is <span className="text-sky-400 font-semibold">uplift only</span> — negative (upward) GCp values only. GCpi = 0 on soffit. No positive pressure case is defined.
                  </div>
                  <CCMatrix
                    pressures={ohPressures}
                    title={ohTitle}
                    areas={ohAreas}
                    userAreas={[geo.cc_user_area1, geo.cc_user_area2]}
                    onUserAreaChange={(i,v) => ug(i===0 ? "cc_user_area1" : "cc_user_area2", v)}
                    labelOverrides={labelOverrides}
                  />
                  </>
                );
              })() : null}

              {ccSub === "wall" ? (
                <CCMatrix
                  pressures={ccR.prs.filter((p) => (ccR.proc === "hle60" || ccR.proc === "alt6090") ? ["4","5"].includes(p.zone) : ["4p","5p"].includes(p.zone))}
                  title={(ccR.proc === "hle60" || ccR.proc === "alt6090") ? "Wall C&C (psf) — Fig 30.3-1" : "Wall C&C (psf) — Zones 4’ & 5’ (Fig 30.4-1)"}
                  areas={(ccR.proc === "hle60" || ccR.proc === "alt6090") ? ccWallAreas : [10, 50, 100, 500]}
                  labelOverrides={ccR.proc === "hgt60" ? {
                    "4p": { label: "Negative Zone 4’", desc: "Wall Zone 4’ (field)" },
                    "5p": { label: "Negative Zone 5’", desc: "Wall Zone 5’ (corner)" },
                  } : {}}
                  userAreas={[geo.cc_user_area1, geo.cc_user_area2]}
                  onUserAreaChange={(i,v) => ug(i===0 ? "cc_user_area1" : "cc_user_area2", v)}
                />
              ) : null}

              {ccSub === "wall" && ccR.wallPosProfile ? (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-slate-400 mb-1.5">Wall surface pressure at z — Positive Zone 4’ & 5’ (psf)</p>
                  <p className="text-[10px] text-slate-500 mb-1">Negative zone pressures apply at all heights (shown above). Positive pressures vary with height.</p>
                  <table className="w-full text-[10px] font-mono border-collapse">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="px-2 py-1 text-left text-slate-400">z (ft)</th>
                        <th className="px-2 py-1 text-center text-slate-400">Kz</th>
                        <th className="px-2 py-1 text-center text-slate-400">Kzt</th>
                        <th className="px-2 py-1 text-center text-slate-400">qz (psf)</th>
                        {[10,50,100,500].map(a => <th key={a} className="px-2 py-1 text-center text-sky-500/70">{a} sf</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {ccR.wallPosProfile.map((row, i) => (
                        <tr key={i} className={"border-b border-slate-700/50 " + (row.z === ccR.theta ? "bg-sky-950/20" : "")}>
                          <td className="px-2 py-1 text-slate-300">{row.z === ccR.theta || i === ccR.wallPosProfile.length-1 ? `h = ${row.z}` : `${row.z === 15 ? "0 to 15'" : row.z + " ft"}`}</td>
                          <td className="px-2 py-1 text-center text-slate-400">{row.kz}</td>
                          <td className="px-2 py-1 text-center text-slate-400">{row.kzt}</td>
                          <td className="px-2 py-1 text-center text-slate-400">{row.qz}</td>
                          {row.pressures.map((p, j) => <td key={j} className="px-2 py-1 text-center text-amber-300/90">{p}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {ccSub === "parapet" && ccR.parPrs ? (
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-1.5">Solid Parapet Pressure (psf) — §30.9 / Fig 30.9-1</p>
                  <div className="text-[10px] font-mono text-slate-500 mb-2">Kd × qp = {ccR.qp} psf (qp at parapet height)</div>
                  <table className="w-full text-xs font-mono tabular-nums">
                    <thead>
                      <tr className="border-b-2 border-slate-700">
                        <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase w-36" rowSpan={2}>Case</th>
                        <th className="px-1 py-0.5 text-center text-[10px] font-bold text-slate-400 uppercase" colSpan={ccR.parAreas.length}>Eff. Wind Area (sf)</th>
                      </tr>
                      <tr className="border-b border-slate-700">
                        {ccR.parAreas.map((a) => <th key={a} className="px-1.5 py-1 text-center text-[10px] font-bold text-sky-500/70">{a}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-700/50 bg-slate-900/25">
                        <td className="px-2 py-1.5 text-[11px] font-bold text-slate-200">CASE A: Zone 2 &amp; 3</td>
                        {ccR.parPrs.map((r) => <td key={r.area} className="px-1 py-1.5 text-center text-amber-300/90">{r.caseA.toFixed(1)}</td>)}
                      </tr>
                      <tr className="border-b border-slate-700/50">
                        <td className="px-2 py-1.5 text-[11px] font-bold text-slate-200">CASE B: Interior zone</td>
                        {ccR.parPrs.map((r) => <td key={r.area} className="px-1 py-1.5 text-center text-sky-400/90">{r.caseBint.toFixed(1)}</td>)}
                      </tr>
                      <tr className="border-b border-slate-700/50 bg-slate-900/25">
                        <td className="px-2 py-1.5 text-[11px] font-bold text-slate-200">CASE B: Corner zone</td>
                        {ccR.parPrs.map((r) => <td key={r.area} className="px-1 py-1.5 text-center text-sky-400/90">{r.caseBcor.toFixed(1)}</td>)}
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-[10px] text-slate-500 mt-1.5">Case A = combined WW+LW. Case B = suction; corner zone within a = {ccR.a} ft.</p>
                </div>
              ) : null}
            </div>
          ) : null}


          {/* ── Open Building ── */}
          {tab === "ob" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-300">Open Buildings — Ch.27 &amp; Ch.30</h2>
                {obR ? (obR.ok ? <span className="text-xs font-semibold text-emerald-400">✓</span> : <span className="text-xs font-semibold text-amber-400">N/A</span>) : null}
              </div>

              <div className="border border-slate-700/50 rounded overflow-hidden">
                <div className="px-3 py-2 bg-slate-800/60 text-xs font-bold text-slate-300 uppercase tracking-wide">Open Building Inputs</div>
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400">Roof Type</span>
                    <select value={geo.ob_roof_type} onChange={e => ug("ob_roof_type", e.target.value)}
                      className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 text-xs">
                      <option value="monoslope">Monoslope Free Roof</option>
                      <option value="gable">Gable / Hip Free Roof</option>
                      <option value="troughed">Troughed Free Roof</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400">Wind Flow</span>
                    <select value={geo.ob_wind_flow} onChange={e => ug("ob_wind_flow", e.target.value)}
                      className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 text-xs">
                      <option value="clear">Clear Wind Flow</option>
                      <option value="obstructed">Obstructed Wind Flow</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-slate-500">θ and h pulled from main geometry. θ = {geo.roof_angle_deg.toFixed(1)}°, h = {geo.h_ft} ft.</p>
                </div>
              </div>

              {obR && !obR.ok && <div className="px-3 py-2 bg-amber-950/20 border border-amber-700/30 rounded text-xs text-amber-400">{obR.reason}</div>}

              {obR && obR.ok ? (
                <>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-slate-400">
                    <span>{obR.code_version === "7-22" ? "Kd·qh" : "qh"} = {obR.qh.toFixed(1)} psf</span>
                    <span>G = {obR.G}</span>
                    <span>θ = {obR.theta.toFixed(1)}°</span>
                    <span>{obR.clear ? "Clear" : "Obstructed"} wind flow</span>
                  </div>

                  <Acc title="MWFRS — Wind Normal to Ridge (γ=0° &amp; 180°)" open={true}>
                    <p className="text-[10px] text-slate-500 mb-2">p = Kd·qh × G × Cn. Cnw = windward half, Cnl = leeward half of roof.</p>
                    <table className="w-full text-xs font-mono tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-1 text-[10px] text-slate-400 font-bold uppercase">Case</th>
                          <th className="text-center py-1 text-[10px] text-slate-400 font-bold uppercase">Cnw</th>
                          <th className="text-center py-1 text-[10px] text-slate-400 font-bold uppercase">Cnl</th>
                          <th className="text-right py-1 text-[10px] text-slate-400 font-bold uppercase">pₜ (psf)</th>
                          <th className="text-right py-1 text-[10px] text-slate-400 font-bold uppercase">pₗ (psf)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {obR.mwfrs_normal.cases.map((c, i) => (
                          <tr key={i} className={"border-b border-slate-700/40 " + (i%2===1 ? "bg-slate-800/20" : "")}>
                            <td className="py-1 text-slate-300 font-medium">{c.label}</td>
                            <td className="text-center py-1 text-slate-400">{c.Cnw.toFixed(2)}</td>
                            <td className="text-center py-1 text-slate-400">{c.Cnl.toFixed(2)}</td>
                            <td className={"text-right py-1 font-bold " + (c.pw >= 0 ? "text-amber-300" : "text-sky-400")}>{c.pw.toFixed(1)}</td>
                            <td className={"text-right py-1 font-bold " + (c.pl >= 0 ? "text-amber-300" : "text-sky-400")}>{c.pl.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-slate-500 mt-2">+ = toward roof. − = away from roof. Design for the worst of all applicable load cases.</p>
                    {obR.mwfrs_normal.monoGamma180 && <p className="text-[10px] text-amber-500/80 mt-1">Monoslope: γ=0° and γ=180° cases must both be checked per Fig.27.3-5.</p>}
                  </Acc>

                  <Acc title="MWFRS — Wind Parallel to Ridge (γ=90°)" open={true}>
                    <p className="text-[10px] text-slate-500 mb-2">p = Kd·qh × G × Cn. Distance zones from windward edge. h={obR.mwfrs_parallel.h_val} ft, 2h={obR.mwfrs_parallel.h2_val} ft.</p>
                    <table className="w-full text-xs font-mono tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-1 text-[10px] text-slate-400 font-bold uppercase w-20">Case</th>
                          <th className="text-center py-1 text-[10px] text-slate-400 font-bold uppercase">≤ h</th>
                          <th className="text-center py-1 text-[10px] text-slate-400 font-bold uppercase">&gt;h≤ 2h</th>
                          <th className="text-center py-1 text-[10px] text-slate-400 font-bold uppercase">&gt; 2h</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-700/40">
                          <td className="py-1 text-slate-400">A — Cn</td>
                          {obR.mwfrs_parallel.caseA_Cn.map((v,i) => <td key={i} className="text-center py-1 text-slate-500">{v.toFixed(1)}</td>)}
                        </tr>
                        <tr className="border-b border-slate-700/40 bg-slate-800/20">
                          <td className="py-1 text-slate-300 font-medium">A — p (psf)</td>
                          {obR.mwfrs_parallel.caseA_p.map((v,i) => <td key={i} className={"text-center py-1 font-bold " + (v>=0?"text-amber-300":"text-sky-400")}>{v.toFixed(1)}</td>)}
                        </tr>
                        <tr className="border-b border-slate-700/40">
                          <td className="py-1 text-slate-400">B — Cn</td>
                          {obR.mwfrs_parallel.caseB_Cn.map((v,i) => <td key={i} className="text-center py-1 text-slate-500">{v.toFixed(1)}</td>)}
                        </tr>
                        <tr className="border-b border-slate-700/40 bg-slate-800/20">
                          <td className="py-1 text-slate-300 font-medium">B — p (psf)</td>
                          {obR.mwfrs_parallel.caseB_p.map((v,i) => <td key={i} className={"text-center py-1 font-bold " + (v>=0?"text-amber-300":"text-sky-400")}>{v.toFixed(1)}</td>)}
                        </tr>
                      </tbody>
                    </table>
                  </Acc>

                  {obR.fascia_ok && obR.fascia ? (
                    <Acc title="Fascia Panels — Horizontal Pressures" open={true}>
                      <p className="text-[10px] text-slate-500 mb-2">Applicable only when θ ≤ 5°. GCpn = +1.5 windward, −1.0 leeward.</p>
                      <div className="font-mono text-xs space-y-2">
                        <div className="flex justify-between"><span className="text-slate-400">qp = Kd·qh</span><span className="text-slate-300">{obR.fascia.qp.toFixed(1)} psf</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Windward fascia (GCpn = +1.5)</span><span className="text-amber-300 font-bold">{obR.fascia.ww.toFixed(1)} psf</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Leeward fascia (GCpn = −1.0)</span><span className="text-sky-400 font-bold">{obR.fascia.lw.toFixed(1)} psf</span></div>
                      </div>
                    </Acc>
                  ) : <p className="text-[10px] text-slate-500 px-1">Fascia pressures not applicable — roof angle exceeds 5°.</p>}

                  <Acc title={"C&C — Roof Zones 1/2/3 (§30.8) — a = " + obR.a_cc + " ft"} open={true}>
                    <p className="text-[10px] text-slate-500 mb-2">p = Kd·qh × G × CN. Min {obR.minP} psf on negatives. a² = {obR.a2} sf, 4a² = {obR.a4a2} sf.</p>
                    <table className="w-full text-xs font-mono tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left py-1 text-[10px] text-slate-400 font-bold uppercase w-32">Area Bracket</th>
                          <th className="text-center py-1 text-[10px] font-bold uppercase" colSpan={2}><span className="text-slate-400">Zone 3</span></th>
                          <th className="text-center py-1 text-[10px] font-bold uppercase" colSpan={2}><span className="text-slate-400">Zone 2</span></th>
                          <th className="text-center py-1 text-[10px] font-bold uppercase" colSpan={2}><span className="text-slate-400">Zone 1</span></th>
                        </tr>
                        <tr className="border-b border-slate-700">
                          <th></th>
                          <th className="text-center text-[9px] text-emerald-500/70 py-0.5">+</th>
                          <th className="text-center text-[9px] text-sky-500/70 py-0.5">−</th>
                          <th className="text-center text-[9px] text-emerald-500/70 py-0.5">+</th>
                          <th className="text-center text-[9px] text-sky-500/70 py-0.5">−</th>
                          <th className="text-center text-[9px] text-emerald-500/70 py-0.5">+</th>
                          <th className="text-center text-[9px] text-sky-500/70 py-0.5">−</th>
                        </tr>
                      </thead>
                      <tbody>
                        {obR.cc_zones.map((z, i) => (
                          <tr key={i} className={"border-b border-slate-700/40 " + (i%2===1?"bg-slate-800/20":"")}>
                            <td className="py-1 text-[10px] text-slate-400">{z.area_label}</td>
                            <td className="text-center py-1 text-amber-300/90">{z.psf.z3p.toFixed(1)}</td>
                            <td className="text-center py-1 text-sky-400/90">{z.psf.z3n.toFixed(1)}</td>
                            <td className="text-center py-1 text-amber-300/90">{z.psf.z2p.toFixed(1)}</td>
                            <td className="text-center py-1 text-sky-400/90">{z.psf.z2n.toFixed(1)}</td>
                            <td className="text-center py-1 text-amber-300/90">{z.psf.z1p.toFixed(1)}</td>
                            <td className="text-center py-1 text-sky-400/90">{z.psf.z1n.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[10px] text-slate-500 mt-1.5">Zone 3 = corner (within a of 2 edges). Zone 2 = edge. Zone 1 = interior. + toward roof, − away from roof.</p>
                  </Acc>
                </>
              ) : null}
            </div>
          ) : null}


          {/* ── Roof W ── */}
          {tab === "rw" ? (() => {
            const equip = geo.rw_equip && geo.rw_equip.length ? geo.rw_equip : [{ lL:10, lB:5, h:5 }];
            const addEquip    = () => ug("rw_equip", [...equip, { lL:5, lB:5, h:5 }]);
            const removeEquip = (i) => ug("rw_equip", equip.filter((_,idx)=>idx!==i));
            const updateEquip = (i, field, val) => ug("rw_equip", equip.map((e,idx)=>idx===i?{...e,[field]:val}:e));
            return (
            <div className="space-y-3">

              {/* ── Rooftop Structures sub-tab ── */}
              {rwSub === "equip" && (
              <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-300">Rooftop Structures &amp; Equipment — Ch.29 §29.4.1</h2>
              <div>
                {rwR && rwR.equip && rwR.equip[0]?.method === "Cf" ? (
                  <p className="text-[10px] text-slate-500 mb-3">
                    7-05 Cf method — F = qz·G·Cf·adj·Af. G=0.85, Kd=0.9. qz at centroid height.
                    {rwR.equip[0]?.qzC != null && (
                      <> &nbsp;<span className="text-slate-400 font-bold">qz = {rwR.equip[0].qzC.toFixed(1)} psf</span>{rwR.equip.length > 1 ? " (Item #1)" : ""}.</>
                    )}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 mb-3">GCr = 1.5 vertical, 1.9 horizontal. F = qh × GCr × A. qh = {rwR ? rwR.qhGCr.toFixed(1) : "—"} psf.</p>
                )}

                {equip.map((eq, i) => {
                  const res = rwR?.equip?.[i] ?? null;
                  return (
                    <div key={i} className="border border-slate-700/40 rounded p-2 mb-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wide">Equipment/Structure #{i+1}</p>
                        {equip.length > 1 && (
                          <button onClick={()=>removeEquip(i)}
                            className="text-[10px] text-red-400/60 hover:text-red-400 px-1">✕ Remove</button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><p className="text-slate-500 text-[10px]">Length ∥ L (ft)</p><NInput value={eq.lL} onChange={v=>updateEquip(i,"lL",v)} min={0.1}/></div>
                        <div><p className="text-slate-500 text-[10px]">Length ∥ B (ft)</p><NInput value={eq.lB} onChange={v=>updateEquip(i,"lB",v)} min={0.1}/></div>
                        <div><p className="text-slate-500 text-[10px]">Height (ft)</p><NInput value={eq.h}  onChange={v=>updateEquip(i,"h",  v)} min={0.1}/></div>
                      </div>
                      {res && res.method === "Cf" ? (
                        <div className="font-mono text-xs space-y-1 pt-1 border-t border-slate-700/40">
                          <div className="text-[10px] text-slate-500 pb-0.5">qz={res.qzC} psf · G={res.G} · adj={res.adj}</div>
                          <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-500 font-bold uppercase pb-1">
                            <span>Direction</span><span className="text-right">Cf</span><span className="text-right">Af (sf)</span><span className="text-right">F (kips)</span>
                          </div>
                          <div className="grid grid-cols-4 gap-1"><span className="text-slate-400">Horiz ⊥ B-face</span><span className="text-right text-slate-400">{res.Cf_B}</span><span className="text-right text-slate-500">{res.Af_B}</span><span className="text-right text-amber-300 font-bold">{res.Fh_B.toFixed(1)}</span></div>
                          <div className="grid grid-cols-4 gap-1"><span className="text-slate-400">Horiz ⊥ L-face</span><span className="text-right text-slate-400">{res.Cf_L}</span><span className="text-right text-slate-500">{res.Af_L}</span><span className="text-right text-amber-300 font-bold">{res.Fh_L.toFixed(1)}</span></div>
                        </div>
                      ) : res ? (
                        <div className="font-mono text-xs space-y-1 pt-1 border-t border-slate-700/40">
                          <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-500 font-bold uppercase pb-1">
                            <span>Direction</span><span className="text-right">Area (sf)</span><span className="text-right">Force (kips)</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1"><span className="text-slate-400">Vertical (GCr=1.5)</span><span className="text-right text-slate-500">{res.Ar}</span><span className="text-right text-amber-300 font-bold">{res.Fv.toFixed(1)}</span></div>
                          <div className="grid grid-cols-3 gap-1"><span className="text-slate-400">Horiz ∥ B (GCr=1.9)</span><span className="text-right text-slate-500">{res.Af_B}</span><span className="text-right text-amber-300 font-bold">{res.Fh_B.toFixed(1)}</span></div>
                          <div className="grid grid-cols-3 gap-1"><span className="text-slate-400">Horiz ∥ L (GCr=1.9)</span><span className="text-right text-slate-500">{res.Af_L}</span><span className="text-right text-amber-300 font-bold">{res.Fh_L.toFixed(1)}</span></div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <button onClick={addEquip}
                  className="w-full mt-1 py-1.5 text-xs text-amber-400/80 border border-amber-500/30 border-dashed rounded hover:border-amber-400/60 hover:text-amber-300 transition-colors">
                  + Add Equipment / Structure
                </button>
                <p className="text-[10px] text-slate-500 mt-2">{rwR?.equip?.[0]?.method === "Cf" ? "§6.5.15 ASCE 7-05 — Cf/Af horizontal force method." : "§29.4.1 — ASCE 7-22/7-16. Also applicable for roof screen walls away from edges."}</p>
              </div>
              </div>
              )}

              {/* ── Attached Canopies sub-tab ── */}
              {rwSub === "canopy" && (
              <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-300">Attached Canopies — h ≤ 60 ft — §30.11</h2>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input type="checkbox" checked={!!geo.rw_can_en} onChange={e=>ug("rw_can_en",e.target.checked)} className="accent-amber-400"/>
                  <span className="text-xs text-slate-400">Enable canopy calculation</span>
                </div>
                {geo.rw_can_en && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                      <div><p className="text-slate-500 text-[10px]">Mean eave height he (ft)</p><NInput value={geo.rw_can_he} onChange={v=>ug("rw_can_he",v)} min={0.1}/></div>
                      <div><p className="text-slate-500 text-[10px]">Mean canopy height hc (ft)</p><NInput value={geo.rw_can_hc} onChange={v=>ug("rw_can_hc",v)} min={0.1}/></div>
                    </div>
                    {rwR && rwR.canopy && (
                      <>
                        <div className="text-xs font-mono text-slate-400 mb-2">
                          hc/he = {rwR.canopy.hc_he.toFixed(3)} —
                          {rwR.canopy.hc_he >= 0.9 ? " bracket ≥ 0.9" : rwR.canopy.hc_he > 0.5 ? " bracket 0.5 < hc/he < 0.9" : " bracket ≤ 0.5"}
                        </div>
                        <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wide">Pressures (psf) — qh = {rwR.qhSolar.toFixed(1)} psf</p>
                        <table className="w-full text-xs font-mono tabular-nums mb-2">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left py-1 text-[10px] text-slate-400 font-bold">Area (sf)</th>
                              <th className="text-right py-1 text-[10px] text-slate-400 font-bold">Upper−</th>
                              <th className="text-right py-1 text-[10px] text-slate-400 font-bold">Lower−</th>
                              <th className="text-right py-1 text-[10px] text-slate-400 font-bold">Pos</th>
                              <th className="text-right py-1 text-[10px] text-slate-400 font-bold">Net−</th>
                              <th className="text-right py-1 text-[10px] text-slate-400 font-bold">Net+</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rwR.canopy.rows.map((row,i) => (
                              <tr key={i} className={"border-b border-slate-700/40 " + (i%2===1?"bg-slate-800/20":"")}>
                                <td className="py-0.5 text-slate-400">{row.area}</td>
                                <td className="text-right py-0.5 text-sky-400">{row.upperNeg.toFixed(1)}</td>
                                <td className="text-right py-0.5 text-sky-400">{row.lowerNeg.toFixed(1)}</td>
                                <td className="text-right py-0.5 text-amber-300">{row.pos.toFixed(1)}</td>
                                <td className="text-right py-0.5 text-sky-400 font-bold">{row.combNeg.toFixed(1)}</td>
                                <td className="text-right py-0.5 text-amber-300 font-bold">{row.combPos.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-[10px] text-slate-500">Upper− / Lower− = separate individual surfaces. Net = combined upper + lower. Min pressure 16 psf.</p>
                      </>
                    )}
                  </>
                )}
              </div>
              </div>
              )}

              {/* ── Solar Panels sub-tab ── */}
              {rwSub === "solar" && (
              <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-300">Solar Panels — Ch.29 §29.4.3 &amp; §29.4.4</h2>

              {/* ── Solar Panels — shared geometry inputs ── */}
              <div className="border border-slate-700/50 rounded overflow-hidden">
                <div className="px-3 py-2 bg-slate-800/60 text-xs font-bold text-slate-300 uppercase tracking-wide">Solar Panel Geometry</div>
                <div className="p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-slate-500 text-[10px]">d1 — to roof edge / array (ft)</p><NInput value={geo.rw_sol_np_d1}  onChange={v=>ug("rw_sol_np_d1",v)}  min={0}/></div>
                    <div><p className="text-slate-500 text-[10px]">d2 — to adj. panel (ft)</p><NInput value={geo.rw_sol_np_d2}  onChange={v=>ug("rw_sol_np_d2",v)}  min={0}/></div>
                    <div><p className="text-slate-500 text-[10px]">Panel chord length Lp (ft)</p><NInput value={geo.rw_sol_np_Lp}  onChange={v=>ug("rw_sol_np_Lp",v)}  min={0.1}/></div>
                    <div><p className="text-slate-500 text-[10px]">Parapet above roof hpt (ft)</p><NInput value={geo.rw_sol_np_hpt} onChange={v=>ug("rw_sol_np_hpt",v)} min={0}/></div>
                    <div><p className="text-slate-500 text-[10px]">h1 — low edge to roof (ft)</p><NInput value={geo.rw_sol_np_h1}  onChange={v=>ug("rw_sol_np_h1",v)}  min={0}/></div>
                    <div><p className="text-slate-500 text-[10px]">h2 — high edge to roof (ft)</p><NInput value={geo.rw_sol_np_h2}  onChange={v=>ug("rw_sol_np_h2",v)}  min={0}/></div>
                    <div><p className="text-slate-500 text-[10px]">Panel angle to roof ω (°)</p><NInput value={geo.rw_sol_np_w}   onChange={v=>ug("rw_sol_np_w",v)}   min={0} max={35}/></div>
                    <div><p className="text-slate-500 text-[10px]">Panel gap — min 0.25 in (in)</p><NInput value={geo.rw_sol_np_gap} onChange={v=>ug("rw_sol_np_gap",v)} min={0.25}/></div>
                  </div>
                  <p className="text-[10px] text-slate-500">Lb = min(0.4·√(h·WL), h, Ws) = {rwR ? rwR.solarNP ? rwR.solarNP.Lb + ' ft' : '—' : '—'}. Used by both parallel and not-parallel procedures.</p>
                </div>
              </div>

              {/* ── Solar Panels Parallel ── */}
              <div className="border border-slate-700/50 rounded overflow-hidden">
                <div className="px-3 py-2 bg-slate-800/60 text-xs font-bold text-slate-300 uppercase tracking-wide">Parallel to Roof (ω ≤ 2°) — §29.4.4</div>
                <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <input type="checkbox" checked={!!geo.rw_sol_par_en} onChange={e=>ug("rw_sol_par_en",e.target.checked)} className="accent-amber-400"/>
                  <span className="text-xs text-slate-400">Enable parallel solar calculation</span>
                </div>
                {geo.rw_sol_par_en && rwR && rwR.solarPar && (() => {
                  const s = rwR.solarPar;
                  return (
                    <>
                      <p className="text-[10px] text-slate-500 mb-2">
                        Wind pressure = qh·(Cp)·(γE)·(γa). qh = {rwR.qhSolar.toFixed(1)} psf.
                      </p>
                      <p className="text-[10px] text-slate-500 mb-2">
                        Subtract 4.8 psf internal pressure from roof pressures, then multiply by factors below. Min pressure = 16 psf.
                      </p>

                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-1">Adjustment Factor (γE)(γa)</p>
                      <table className="w-full text-xs font-mono tabular-nums mb-2">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left py-1 text-[10px] text-slate-400 font-bold">Location</th>
                            <th className="text-center py-1 text-[10px] text-slate-400 font-bold">&lt;10 sf</th>
                            <th className="text-center py-1 text-[10px] text-slate-400 font-bold">20 sf</th>
                            <th className="text-center py-1 text-[10px] text-slate-400 font-bold">50 sf</th>
                            <th className="text-center py-1 text-[10px] text-slate-400 font-bold">&gt;100 sf</th>
                            <th className="text-center py-1 text-[10px] text-amber-400 font-bold">
                              <input
                                type="number" min="1"
                                value={geo.rw_sol_par_area}
                                onChange={e => ug("rw_sol_par_area", parseFloat(e.target.value)||1)}
                                onWheel={e => e.target.blur()}
                                className="w-9 text-center bg-transparent border-b border-amber-500/60 text-amber-300 text-[10px] font-bold outline-none"
                              /> sf
                            </th>
                            <th className="text-right py-1 text-[10px] text-slate-400 font-bold w-14">γE</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-700/40">
                            <td className="py-1 text-slate-300">Exposed Uplift</td>
                            {s.table.map((r,i) => <td key={i} className="text-center py-1 text-slate-300">{r.exp_up.toFixed(1)}</td>)}
                            <td className="text-center py-1 text-amber-300 font-bold">{s.user_row.exp_up.toFixed(1)}</td>
                            <td className="text-right py-1 text-[10px] text-slate-500 whitespace-nowrap">γE = 1.5</td>
                          </tr>
                          <tr className="border-b border-slate-700/40 bg-slate-800/20">
                            <td className="py-1 text-slate-300">Non-exposed Uplift</td>
                            {s.table.map((r,i) => <td key={i} className="text-center py-1 text-slate-300">{r.nonexp_up.toFixed(1)}</td>)}
                            <td className="text-center py-1 text-amber-300 font-bold">{s.user_row.nonexp_up.toFixed(1)}</td>
                            <td className="text-right py-1 text-[10px] text-slate-500 whitespace-nowrap">γE = 1.0</td>
                          </tr>
                          <tr className="border-b border-slate-700/40">
                            <td className="py-1 text-slate-300">All panels downward</td>
                            {s.table.map((r,i) => <td key={i} className="text-center py-1 text-slate-300">{r.down.toFixed(1)}</td>)}
                            <td className="text-center py-1 text-amber-300 font-bold">{s.user_row.down.toFixed(1)}</td>
                            <td className="text-right py-1 text-[10px] text-slate-500 whitespace-nowrap">γE = 1.0</td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="text-[10px] text-slate-500 space-y-0.5">
                        <p>A panel is <span className={s.exposed?"text-amber-300 font-bold":"text-slate-400"}>
                          {s.exposed?"EXPOSED":"non-exposed"}
                        </span> — exposed if d1 to roof edge &gt; 0.5h = {(geo.h_ft*0.5).toFixed(1)} ft</p>
                        <p className="pl-3">and either 1) d1 to adjacent array &gt; {Math.max(4*(geo.rw_sol_np_h2||0.8),4).toFixed(1)} ft</p>
                        <p className="pl-3">or 2) d2 to next adjacent panel &gt; {Math.max(4*(geo.rw_sol_np_h2||0.8),4).toFixed(1)} ft</p>
                      </div>
                    </>
                  );
                })()}
                </div>
              </div>

              {/* ── Solar Panels Not Parallel ── */}
              <div className="border border-slate-700/50 rounded overflow-hidden">
                <div className="px-3 py-2 bg-slate-800/60 text-xs font-bold text-slate-300 uppercase tracking-wide">Not Parallel to Roof — §29.4.3</div>
                <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <input type="checkbox" checked={!!geo.rw_sol_np_en} onChange={e=>ug("rw_sol_np_en",e.target.checked)} className="accent-amber-400"/>
                  <span className="text-xs text-slate-400">Enable not-parallel solar calculation</span>
                </div>
                {geo.rw_sol_np_en && rwR && rwR.solarNP && (() => {
                  const s = rwR.solarNP;
                  const zones = ["z1","z2","z3"];
                  const zoneLabels = ["Zone 1","Zone 2","Zone 3"];
                  const uKeys = { exp:["exp","exp_z2","exp_z3"], nexp:["nexp","nexp_z2","nexp_z3"], down:["down","down_z2","down_z3"] };
                  return (
                    <>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-mono text-slate-400 mb-3">
                        <span>gp={s.gp}</span><span>gc={s.gc}</span><span>Lb={s.Lb} ft</span>
                        <span className={s.exposed?"text-amber-300 font-bold":"text-slate-500"}>
                          {s.exposed?"EXPOSED":"Non-exposed"} (0.5h={s.half_h} ft, thresh={s.thresh4} ft)
                        </span>
                      </div>

                      {/* Single unified table matching spreadsheet layout */}
                      <table className="w-full text-xs font-mono tabular-nums">
                        <thead>
                          {/* "User Input" label row spanning the 2 user cols */}
                          <tr>
                            <th colSpan={2} className="text-left py-0.5 text-[10px] text-slate-500"></th>
                            <th colSpan={6} className="text-center py-0.5 text-[10px] text-slate-400 border-b border-slate-700">Wind pressure for normalized area An</th>
                            <th colSpan={2} className="text-center py-0.5 text-[10px] text-amber-400 font-bold border-b border-amber-500/40 border-l border-slate-700/60">User Input</th>
                          </tr>
                          {/* Column headers: γE | Location | 0 sf ... 5000 sf | A= inputs */}
                          <tr className="border-b border-slate-700">
                            <th className="text-left py-0.5 text-[10px] text-slate-500 w-12">γE</th>
                            <th className="text-left py-0.5 text-[10px] text-slate-400">Location</th>
                            {s.std_areas.map((a,i)=><th key={i} className="text-right py-0.5 text-[10px] text-slate-400">{a} sf</th>)}
                            <th className="text-right py-0.5 text-[10px] text-amber-400 border-l border-slate-700/60 pl-1">
                              A=<input type="number" min="1" value={geo.rw_sol_np_area1}
                                onChange={e=>ug("rw_sol_np_area1", parseFloat(e.target.value)||1)}
                                onWheel={e=>e.target.blur()}
                                className="w-8 ml-0.5 text-center bg-transparent border-b border-amber-500/60 text-amber-300 text-[10px] font-bold outline-none"/> sf
                            </th>
                            <th className="text-right py-0.5 text-[10px] text-amber-400">
                              A=<input type="number" min="1" value={geo.rw_sol_np_area2}
                                onChange={e=>ug("rw_sol_np_area2", parseFloat(e.target.value)||1)}
                                onWheel={e=>e.target.blur()}
                                className="w-10 ml-0.5 text-center bg-transparent border-b border-amber-500/60 text-amber-300 text-[10px] font-bold outline-none"/> sf
                            </th>
                          </tr>
                          {/* An= sub-row */}
                          <tr className="border-b border-slate-700/40">
                            <th className="py-0.5 text-[9px] text-slate-600">An=</th>
                            <th></th>
                            {s.std_areas.map((a,i)=><th key={i} className="text-right py-0.5 text-[9px] text-slate-600">{a}</th>)}
                            <th className="text-right py-0.5 text-[9px] text-slate-500 border-l border-slate-700/60 pl-1">{s.user1.An}</th>
                            <th className="text-right py-0.5 text-[9px] text-slate-500">{s.user2.An}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Exposed Zones */}
                          <tr className="border-b border-slate-700/30 bg-slate-800/30">
                            <td colSpan={10} className="py-0.5 text-[10px] font-bold text-slate-300 pl-1">Exposed Zones</td>
                          </tr>
                          {zones.map((zk,zi) => (
                            <tr key={"exp"+zi} className={"border-b border-slate-700/40 "+(zi%2===1?"bg-slate-800/20":"")}>
                              {zi===0 && <td rowSpan={3} className="py-0.5 text-[10px] text-slate-500 align-middle">γE=1.5</td>}
                              <td className="py-0.5 text-slate-400">{zoneLabels[zi]}</td>
                              {s.tbl_exp.map((r,i)=><td key={i} className="text-right py-0.5 text-sky-400/90">{r[zk].toFixed(1)}</td>)}
                              <td className="text-right py-0.5 font-bold text-sky-400 border-l border-slate-700/60 pl-1">{s.user1[uKeys.exp[zi]].toFixed(1)}</td>
                              <td className="text-right py-0.5 font-bold text-sky-400">{s.user2[uKeys.exp[zi]].toFixed(1)}</td>
                            </tr>
                          ))}
                          {/* Non-Exposed Zones */}
                          <tr className="border-b border-slate-700/30 bg-slate-800/30">
                            <td colSpan={10} className="py-0.5 text-[10px] font-bold text-slate-300 pl-1">Non Exposed Zones</td>
                          </tr>
                          {zones.map((zk,zi) => (
                            <tr key={"nexp"+zi} className={"border-b border-slate-700/40 "+(zi%2===1?"bg-slate-800/20":"")}>
                              {zi===0 && <td rowSpan={3} className="py-0.5 text-[10px] text-slate-500 align-middle">γE=1.0</td>}
                              <td className="py-0.5 text-slate-400">{zoneLabels[zi]}</td>
                              {s.tbl_nexp.map((r,i)=><td key={i} className="text-right py-0.5 text-sky-400/80">{r[zk].toFixed(1)}</td>)}
                              <td className="text-right py-0.5 font-bold text-sky-400/80 border-l border-slate-700/60 pl-1">{s.user1[uKeys.nexp[zi]].toFixed(1)}</td>
                              <td className="text-right py-0.5 font-bold text-sky-400/80">{s.user2[uKeys.nexp[zi]].toFixed(1)}</td>
                            </tr>
                          ))}
                          {/* All Zones Downward */}
                          <tr className="border-b border-slate-700/30 bg-slate-800/30">
                            <td colSpan={10} className="py-0.5 text-[10px] font-bold text-slate-300 pl-1">All Zones</td>
                          </tr>
                          {zones.map((zk,zi) => (
                            <tr key={"down"+zi} className={"border-b border-slate-700/40 "+(zi%2===1?"bg-slate-800/20":"")}>
                              {zi===0 && <td rowSpan={3} className="py-0.5 text-[10px] text-slate-500 align-middle">γE=1.0</td>}
                              <td className="py-0.5 text-slate-400">{zoneLabels[zi]}</td>
                              {s.tbl_down.map((r,i)=><td key={i} className="text-right py-0.5 text-amber-300/90">{r[zk].toFixed(1)}</td>)}
                              <td className="text-right py-0.5 font-bold text-amber-300 border-l border-slate-700/60 pl-1">{s.user1[uKeys.down[zi]].toFixed(1)}</td>
                              <td className="text-right py-0.5 font-bold text-amber-300">{s.user2[uKeys.down[zi]].toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-slate-500 mt-1.5">Zone 1 = interior, Zone 2 = edge, Zone 3 = corner. An = A×1000/Lb². Min ±16 psf enforced.</p>
                      <p className="text-[10px] text-amber-500/80 mt-0.5 font-medium">Design for both: (1) panels present + uncovered roof areas, and (2) panels removed.</p>
                    </>
                  );
                })()}
                </div>
              </div>
              </div>
              )}
            </div>
          );
          })() : null}

          {/* ── Other W ── */}
          {tab === "ow" ? (() => {
            const ug = (k,v) => setGeo(g => ({...g, [k]:v}));
            const Row = ({label, val, unit=""}) => (
              <div className="flex justify-between items-baseline py-0.5 border-b border-slate-700/40">
                <span className="text-[11px] text-slate-400">{label}</span>
                <span className="font-mono text-[11px] text-slate-200">{val}{unit ? <span className="text-slate-500 ml-0.5 text-[10px]">{unit}</span> : null}</span>
              </div>
            );
            const Inp = ({label, geoKey, type="number", step, min, options}) => (
              <div className="flex items-center gap-2 py-0.5">
                <label className="text-[11px] text-slate-400 flex-1">{label}</label>
                {options ? (
                  <select value={geo[geoKey]||""} onChange={e=>ug(geoKey, e.target.value)}
                    className="w-36 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-200 outline-none">
                    {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input type={type} step={step||"any"} min={min||0}
                    value={geo[geoKey]||0} onChange={e=>ug(geoKey, parseFloat(e.target.value)||0)}
                    className="w-20 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-200 font-mono outline-none text-right" />
                )}
              </div>
            );
            const ResultBox = ({label, val, unit, highlight}) => (
              <div className={`flex items-center justify-between px-2 py-1 rounded ${highlight ? "bg-sky-900/30 border border-sky-700/40" : "bg-slate-800/50 border border-slate-700/30"}`}>
                <span className="text-[11px] text-slate-400">{label}</span>
                <span className={`font-mono font-bold text-sm ${highlight ? "text-sky-300" : "text-slate-200"}`}>{val} <span className="text-[10px] font-normal text-slate-500">{unit}</span></span>
              </div>
            );

            return (
              <div className="space-y-4">

                {/* ── A. Solid Signs & Freestanding Walls ── */}
                {owSub === "solid" && owR?.solidSign ? (() => {
                  const ss = owR.solidSign;
                  return (
                    <div>
                      <h2 className="text-sm font-bold text-slate-300 mb-1">A. Solid Freestanding Walls & Solid Signs</h2>
                      <p className="text-[10px] text-slate-500 mb-3">§29.3 — F = q<sub>z</sub>·G·C<sub>f</sub>·A<sub>s</sub> &nbsp;|&nbsp; Table 29.3-1</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Inputs</div>
                          <Inp label="Dist to sign top h (ft)" geoKey="ow_ss_h_top" min={1} />
                          <Inp label="Sign/wall height s (ft)" geoKey="ow_ss_s" min={1} />
                          <Inp label="Sign width B (ft)" geoKey="ow_ss_B" min={1} />
                          <Inp label="Wall return Lr (ft)" geoKey="ow_ss_Lr" min={0} />
                          <Inp label="Open area (%)" geoKey="ow_ss_pctOpen" min={0} max={29} />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Parameters</div>
                          <Row label="Kz" val={ss.kz.toFixed(2)} />
                          <Row label="Kzt" val={ss.kztZ.toFixed(2)} />
                          <Row label="qz" val={ss.qzRaw.toFixed(1)} unit="psf" />
                          <Row label="s/h" val={ss.sh.toFixed(2)} />
                          <Row label="B/s" val={ss.bs.toFixed(2)} />
                          {ss.wrf < 1 && <Row label="Wall return factor" val={ss.wrf.toFixed(2)} />}
                          {ss.shr < 1 && <Row label="s/h>0.8 reduction" val={ss.shr.toFixed(2)} />}
                        </div>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Case A & B Results (§29.3.1)</div>
                        <ResultBox label={`Cf (Table 29.3-1, s/h=${ss.sh.toFixed(2)}, B/s=${ss.bs.toFixed(1)})`} val={ss.cfAB.toFixed(2)} />
                        <ResultBox label="F = qz·G·Cf  (per sf of sign area)" val={ss.F_per_sf.toFixed(1)} unit="psf" highlight />
                        <p className="text-[10px] text-slate-500">Multiply by net sign area A<sub>s</sub> for total force (lbs). Min 16 psf for §29.3.1.</p>
                      </div>
                      <div className="mt-3">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Case C — Horizontal Distribution (§29.3.2)</div>
                        <table className="w-full text-xs font-mono tabular-nums">
                          <thead>
                            <tr className="border-b border-slate-700/60">
                              <th className="text-left py-1 text-[10px] font-bold text-slate-400">Zone (from windward edge)</th>
                              <th className="text-right py-1 text-[10px] font-bold text-slate-400">Cf</th>
                              <th className="text-right py-1 text-[10px] font-bold text-slate-400">F (psf)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ss.caseCRows.filter(row => row.cf > 0).map((row, i) => (
                              <tr key={i} className={"border-b border-slate-700/40 " + (i%2===1?"bg-slate-800/20":"")}>
                                <td className="py-0.5 text-slate-400">{row.zone}</td>
                                <td className="text-right py-0.5 text-slate-300">{row.cf.toFixed(2)}</td>
                                <td className="text-right py-0.5 text-sky-400 font-bold">{row.f_psf.toFixed(1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-[10px] text-slate-500 mt-1">B/s={ss.bs.toFixed(2)} — Case C applies to signs with B/s ≥ 2. Zones measured from windward edge in multiples of s.</p>
                      </div>
                    </div>
                  );
                })() : null}

                {/* ── B. Open Signs & Open Frames ── */}
                {owSub === "open" && owR?.openSign ? (() => {
                  const os = owR.openSign;
                  return (
                    <div>
                      <h2 className="text-sm font-bold text-slate-300 mb-1">B. Open Signs & Single-Plane Open Frames</h2>
                      <p className="text-[10px] text-slate-500 mb-3">§29.4 — F = K<sub>d</sub>·q<sub>z</sub>·G·C<sub>f</sub>·A<sub>f</sub> &nbsp;|&nbsp; Open area ≥ 30% of gross</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Inputs</div>
                          <Inp label="Height to centroid z (ft)" geoKey="ow_os_z" min={1} />
                          <Inp label="Width if rect (ft, 0=round)" geoKey="ow_os_w" min={0} />
                          <Inp label="Diameter if round (ft)" geoKey="ow_os_d" min={0} />
                          <Inp label="Open area (% of gross)" geoKey="ow_os_pct" min={30} max={100} />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Parameters</div>
                          <Row label="Kz" val={os.kz.toFixed(2)} />
                          <Row label="Kzt" val={os.kztZ.toFixed(2)} />
                          <Row label="qz" val={os.qzRaw.toFixed(1)} unit="psf" />
                          <Row label="ε (solid/gross ratio)" val={os.eps.toFixed(2)} />
                          {os.isRound && <Row label="D√qz" val={os.dSqQz.toFixed(2)} />}
                          <Row label="Member type" val={os.isRound ? "Round" : "Flat/Rect"} />
                        </div>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Results</div>
                        <ResultBox label={`Cf (Table 29.4-1, ε=${os.eps.toFixed(2)}, ${os.isRound ? "D√qz="+os.dSqQz.toFixed(2) : "flat member"})`} val={os.cf.toFixed(2)} />
                        <ResultBox label="F = Kd·qz·G·Cf  (per sf of solid area Af)" val={os.F_per_sf.toFixed(1)} unit="psf" highlight />
                        <p className="text-[10px] text-slate-500">Multiply by solid projected area A<sub>f</sub> (sf) for total force (lbs). Min 16 psf per §29.4.</p>
                      </div>
                    </div>
                  );
                })() : null}

                {/* ── C. Chimneys & Tanks ── */}
                {owSub === "chimney" && owR?.chimney ? (() => {
                  const ch = owR.chimney;
                  return (
                    <div>
                      <h2 className="text-sm font-bold text-slate-300 mb-1">C. Chimneys, Tanks & Similar Structures</h2>
                      <p className="text-[10px] text-slate-500 mb-3">§29.5 — F = q<sub>z</sub>·G·C<sub>f</sub>·A<sub>f</sub> &nbsp;|&nbsp; Table 29.5-1</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Inputs</div>
                          <Inp label="Height to centroid z (ft)" geoKey="ow_ch_z" min={1} />
                          <Inp label="Total height h (ft)" geoKey="ow_ch_h" min={1} />
                          <Inp label="Diameter / width D (ft)" geoKey="ow_ch_D" min={0.1} step={0.1} />
                          <Inp label="Cross-section" geoKey="ow_ch_sec" options={[
                            {value:"square",       label:"Square"},
                            {value:"hexagonal",    label:"Hexagonal / Octagonal"},
                            {value:"round_smooth", label:"Round — smooth"},
                            {value:"round_rough",  label:"Round — rough"},
                            {value:"round_vrough", label:"Round — very rough"},
                          ]} />
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Parameters</div>
                          <Row label="Kd (Table 26.6-1)" val={ch.kdUsed.toFixed(2)} />
                          <Row label="Kz" val={ch.kz.toFixed(2)} />
                          <Row label="Kzt" val={ch.kztZ.toFixed(2)} />
                          <Row label="qz" val={ch.qzRaw.toFixed(1)} unit="psf" />
                          <Row label="h/D" val={ch.hd.toFixed(2)} />
                        </div>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Results</div>
                        {ch.isSquare ? (
                          <>
                            <div className="text-[10px] text-slate-500 font-semibold mt-1">Wind normal to face</div>
                            <ResultBox label={`Cf (Table 29.5-1, h/D=${ch.hd.toFixed(2)}, square — normal)`} val={ch.cfNormal.toFixed(2)} />
                            <ResultBox label="F = qz·G·Cf  (per sf of projected area Af)" val={ch.F_normal.toFixed(1)} unit="psf" highlight />
                            <div className="text-[10px] text-slate-500 font-semibold mt-2">Wind along diagonal</div>
                            <ResultBox label={`Cf (Table 29.5-1, h/D=${ch.hd.toFixed(2)}, square — diagonal)`} val={ch.cfDiag.toFixed(2)} />
                            <ResultBox label="F = qz·G·Cf  (per sf of projected area Af)" val={ch.F_diag.toFixed(1)} unit="psf" highlight />
                          </>
                        ) : (
                          <>
                            <ResultBox label={`Cf (Table 29.5-1, h/D=${ch.hd.toFixed(2)}, ${geo.ow_ch_sec||"square"})`} val={ch.cf.toFixed(2)} />
                            <ResultBox label="F = qz·G·Cf  (per sf of projected area Af)" val={ch.F_per_sf.toFixed(1)} unit="psf" highlight />
                          </>
                        )}
                        <p className="text-[10px] text-slate-500">Multiply by projected area A<sub>f</sub> = h × D for total force. Min 16 psf per §29.5.</p>
                      </div>
                    </div>
                  );
                })() : null}

                {/* ── D. Trussed Towers ── */}
                {owSub === "tower" && owR?.tower ? (() => {
                  const tt = owR.tower;
                  return (
                    <div>
                      <h2 className="text-sm font-bold text-slate-300 mb-1">D. Trussed Towers</h2>
                      <p className="text-[10px] text-slate-500 mb-3">§29.6 — F = K<sub>d</sub>·q<sub>z</sub>·G·C<sub>f</sub>·A<sub>f</sub> &nbsp;|&nbsp; Table 29.6-1</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Inputs</div>
                          <Inp label="Height to centroid z (ft)" geoKey="ow_tt_z" min={1} />
                          <Inp label="Solidity ratio φ" geoKey="ow_tt_phi" min={0.1} max={0.9} step={0.01} />
                          <Inp label="Tower cross-section" geoKey="ow_tt_sec" options={[
                            {value:"square",   label:"Square / Rectangular"},
                            {value:"triangle", label:"Triangular"},
                          ]} />
                          <Inp label="Member shape" geoKey="ow_tt_mem" options={[
                            {value:"flat",  label:"Flat / Angle"},
                            {value:"round", label:"Round"},
                          ]} />

                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Parameters</div>
                          <Row label="Kd (Table 26.6-1)" val={tt.kdUsed.toFixed(2)} />
                          <Row label="Kz" val={tt.kz.toFixed(2)} />
                          <Row label="Kzt" val={tt.kztZ.toFixed(2)} />
                          <Row label="qz" val={tt.qzRaw.toFixed(1)} unit="psf" />
                          <Row label="φ (solidity)" val={tt.phi.toFixed(2)} />
                          {tt.rmf < 1 && <Row label="Round member factor" val={tt.rmf.toFixed(2)} />}
                        </div>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Results</div>
                        {tt.isSquareTower ? (
                          <>
                            <div className="text-[10px] text-slate-500 font-semibold mt-1">Wind normal to face</div>
                            <ResultBox label={`Cf (Table 29.6-1, φ=${tt.phi.toFixed(2)}, square — normal)`} val={tt.cfNormal.toFixed(2)} />
                            <ResultBox label="F = Kd·qz·G·Cf  (per sf of solid projected area Af)" val={tt.F_normal.toFixed(1)} unit="psf" highlight />
                            <div className="text-[10px] text-slate-500 font-semibold mt-2">Wind along diagonal</div>
                            <ResultBox label={`Cf (Table 29.6-1, φ=${tt.phi.toFixed(2)}, square — diagonal = normal × 1.2)`} val={tt.cfDiag.toFixed(2)} />
                            <ResultBox label="F = Kd·qz·G·Cf  (per sf of solid projected area Af)" val={tt.F_diag.toFixed(1)} unit="psf" highlight />
                          </>
                        ) : (
                          <>
                            <ResultBox label={`Cf (Table 29.6-1, φ=${tt.phi.toFixed(2)}, triangle)`} val={tt.cfNormal.toFixed(2)} />
                            <ResultBox label="F = Kd·qz·G·Cf  (per sf of solid projected area Af)" val={tt.F_normal.toFixed(1)} unit="psf" highlight />
                          </>
                        )}
                        <p className="text-[10px] text-slate-500">Cf = 4φ²−5.9φ+4.0 (square normal); diagonal = normal×1.2; 3.4φ²−4.7φ+3.4 (triangle). Multiply by solid area A<sub>f</sub> for total force.</p>
                      </div>
                    </div>
                  );
                })() : null}

              </div>
            );
          })() : null}

        </div>
          {/* Diagram pane — right side, only for tabs that have one */}
          <DiagramPane tab={tab} dirSub={dirSub} codeVer={proj.code_version} />
        </div>{/* end flex row */}
      </main>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// WSS LOAD LOOKUP — inlined
// ═══════════════════════════════════════════════════════════════════════════════

