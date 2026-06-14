import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmt(v, d) {
  var dec = (d == null) ? 1 : d;
  if (v == null || (typeof v === 'number' && isNaN(v))) return '\u2014';
  return typeof v === 'number' ? v.toFixed(dec) : String(v);
}
function fmt1(v) { return fmt(v, 1); }
function fmt2(v) { return fmt(v, 2); }
function fmt4(v) { return fmt(v, 4); }

// Returns 'Kd·qh' for 7-22 only (Kd removed from qh formula, applied at pressure step)
// For 7-05/7-10/7-16, Kd is inside the qh formula per Eq. 26.10-1, so label is just 'qh'
function qhLabel(code_version) {
  return code_version === '7-22' ? 'Kd\u00b7qh' : 'qh';
}

var PAGE_W  = 215.9;
var ML      = 14;
var MR      = PAGE_W - 14;
var BODY_W  = MR - ML;

var C_DARK  = [15,  40,  80];
var C_MID   = [30,  55, 100];
var C_LIGHT = [220, 230, 245];
var C_TEXT  = [30,  30,  30];
var C_WHITE = [255, 255, 255];
var C_SUBHD = [40,  60, 110];
var C_MUTED = [80,  80,  80];

function checkPage(doc, y, need) {
  var ph = doc.internal.pageSize.getHeight();
  if (y + (need || 18) > ph - 14) { doc.addPage(); return 20; }
  return y;
}

function secHeader(doc, text, y) {
  y = checkPage(doc, y, 12);
  doc.setFillColor.apply(doc, C_DARK);
  doc.rect(ML, y, BODY_W, 7, 'F');
  doc.setTextColor.apply(doc, C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(text, ML + 2, y + 5);
  doc.setTextColor.apply(doc, C_TEXT);
  doc.setFont('helvetica', 'normal');
  return y + 10;
}

function subHdr(doc, text, y) {
  y = checkPage(doc, y, 10);
  doc.setFillColor.apply(doc, C_LIGHT);
  doc.rect(ML, y, BODY_W, 6, 'F');
  doc.setTextColor.apply(doc, C_SUBHD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(text, ML + 2, y + 4.2);
  doc.setTextColor.apply(doc, C_TEXT);
  doc.setFont('helvetica', 'normal');
  return y + 8;
}

function noteRow(doc, text, y) {
  y = checkPage(doc, y, 7);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'italic');
  doc.text(text, ML, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor.apply(doc, C_TEXT);
  return y + 5;
}

function kvTable(doc, rows, y) {
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: ML },
    tableWidth: BODY_W,
    body: rows,
    styles: { fontSize: 8, cellPadding: 1.5, textColor: C_TEXT, font: 'helvetica' },
    columnStyles: {
      0: { fontStyle: 'normal', textColor: C_MUTED, cellWidth: 56 },
      1: { fontStyle: 'bold',   cellWidth: 36 },
      2: { fontStyle: 'normal', textColor: C_MUTED, cellWidth: 56 },
      3: { fontStyle: 'bold',   cellWidth: 34 },
    },
    theme: 'plain',
    alternateRowStyles: { fillColor: [245, 247, 252] },
  });
  return doc.lastAutoTable.finalY + 4;
}

function pTable(doc, head, body, y) {
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: ML },
    tableWidth: BODY_W,
    head: [head],
    body: body,
    styles: { fontSize: 8, cellPadding: 1.8, textColor: C_TEXT },
    headStyles: { fillColor: C_MID, textColor: C_WHITE, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 247, 252] },
    theme: 'striped',
  });
  return doc.lastAutoTable.finalY + 4;
}

function addFooters(doc, proj) {
  var n = doc.internal.getNumberOfPages();
  for (var i = 1; i <= n; i++) {
    doc.setPage(i);
    var ph = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text('ASCE ' + proj.code_version + ' Wind Load Calculation', ML, ph - 7);
    doc.text('Page ' + i + ' of ' + n, MR, ph - 7, { align: 'right' });
    doc.text(new Date().toLocaleDateString(), PAGE_W / 2, ph - 7, { align: 'center' });
    doc.setDrawColor(200, 200, 200);
    doc.line(ML, ph - 9, MR, ph - 9);
  }
}

function uniqueVals(arr, key) {
  var seen = [];
  arr.forEach(function(item) { if (!seen.includes(item[key])) seen.push(item[key]); });
  return seen;
}

// ─── PROJECT INFO ─────────────────────────────────────────────────────────────

function renderProjectInfo(doc, inputs, y) {
  var proj   = inputs.proj;
  var geo    = inputs.geo;
  var kd     = inputs.kd;
  var kztIn  = inputs.kztIn;
  var gustIn = inputs.gustIn;
  var shared = inputs.shared;

  var encMap  = { enclosed: 'Enclosed', partially_enclosed: 'Partially Enclosed', open: 'Open' };
  var roofMap = { gable: 'Gable', hip: 'Hip', monoslope: 'Monoslope' };
  var topoMap = { flat: 'Flat (Kzt=1.0)', '2d_ridge': '2D Ridge', '2d_escarp': '2D Escarpment', '3d_hill': '3D Axisym. Hill' };
  var gustMap = { rigid_fixed: 'Rigid Fixed G=0.85', rigid_calc: 'Rigid Calculated', flexible: 'Flexible/Resonant' };

  var encLabel  = encMap[proj.enclosure]                    || proj.enclosure;
  var roofLabel = roofMap[geo.roof_type]                    || geo.roof_type;
  var topoLabel = topoMap[kztIn && kztIn.topo_type]        || 'Flat';
  var gustLabel = gustMap[gustIn && gustIn.mode]            || 'Rigid Fixed';
  var gcpiStr   = proj.enclosure === 'partially_enclosed' ? '\u00b10.55' : proj.enclosure === 'open' ? '\u00b10.00' : '\u00b10.18';
  var Gval      = (shared && shared.G != null) ? fmt4(shared.G) : '0.8500';

  y = secHeader(doc, 'PROJECT INPUTS', y);
  var projInfoRows = [];
  if (proj.projectName || proj.jobNumber) {
    projInfoRows.push(['Project Name', proj.projectName || '\u2014', 'Job Number', proj.jobNumber || '\u2014']);
  }
  projInfoRows = projInfoRows.concat([
    ['ASCE Standard',       'ASCE ' + proj.code_version,                  'Risk Category',        proj.risk_category],
    ['Wind Speed V',        proj.V_mph + ' mph',                          'Exposure Category',    proj.exposure],
    ['Enclosure',           encLabel,                                     'Roof Type',            roofLabel + ', \u03b8=' + fmt1(geo.roof_angle_deg) + '\u00b0'],
    ['Length L',            geo.L_ft + ' ft',                            'Width B',              geo.B_ft + ' ft'],
    ['Mean Roof Height h',  geo.h_ft + ' ft',                            'Parapet Ht (abv grd)', (geo.parapet_height_ft || 0) + ' ft'],
    ['Min Parapet Ht',      (geo.min_parapet_ht_ft || 0) + ' ft',        'Kd',                   fmt2(kd)],
    ['Ke',                  shared ? fmt4(shared.ke) : '\u2014',          'Kzt @ h',              shared ? fmt4(shared.kztH) : '\u2014'],
    ['Topo Feature',        topoLabel,                                    'Gust Factor Mode',     gustLabel],
    ['G',                   Gval,                                         'GCpi',                 gcpiStr],
    [qhLabel(proj.code_version),  shared ? fmt1(shared.qh) + ' psf' : '\u2014','', ''],
  ]);
  y = kvTable(doc, projInfoRows, y);
  return y;
}

// ─── QZ PROFILE ──────────────────────────────────────────────────────────────

function renderQz(doc, qzR, y) {
  y = secHeader(doc, 'VELOCITY PRESSURE PROFILE \u2014 qz', y);
  y = noteRow(doc, 'ASCE ' + qzR.code_version + '  |  Exposure ' + qzR.exposure + '  |  V = ' + qzR.V_mph + ' mph', y);
  y = pTable(doc,
    ['z (ft)', 'Kz', 'Kzt', 'qz (psf)', '\u03b1', 'zg (ft)'],
    qzR.pressures.map(function(r) {
      return [fmt1(r.z_ft), fmt4(r.kz), r.kzt != null ? fmt4(r.kzt) : '1.0000', fmt1(r.qz_psf), fmt1(r.alpha), String(r.zg_ft)];
    }),
    y
  );
  return y;
}

// ─── MWFRS DIRECTIONAL ───────────────────────────────────────────────────────

function renderDir(doc, dirR, y) {
  y = secHeader(doc, 'MWFRS DIRECTIONAL \u2014 Ch. 27', y);
  y = noteRow(doc, qhLabel(dirR.code_version) + ' = ' + fmt1(dirR.qh) + ' psf  |  G = ' + fmt4(dirR.G) + '  |  GCpi = \u00b1' + dirR.gcpi + '  |  Kd = ' + fmt2(dirR.kd), y);

  // Normal to ridge
  y = subHdr(doc, 'Wind Normal to Ridge', y);
  y = kvTable(doc, [
    ['B/L (LW ratio)', fmt4(dirR.ratioLW_n), 'Cp,LW', fmt4(dirR.cLW_n)],
    ['h/B (roof ratio)', fmt4(dirR.ratioRoof_n), 'Cp,WW', '0.80'],
  ], y);

  y = subHdr(doc, 'Windward Wall Profile \u2014 Normal to Ridge', y);
  y = pTable(doc,
    ['z (ft)', 'Kz', 'Kzt', 'p (\u2212GCpi) psf', 'p (+GCpi) psf'],
    dirR.profile.map(function(r) {
      return [fmt1(r.z_ft), fmt4(r.kz), fmt4(r.kzt != null ? r.kzt : 1), fmt1(r.pN), fmt1(r.pP)];
    }),
    y
  );

  y = subHdr(doc, 'Roof & Leeward Wall \u2014 Normal to Ridge', y);
  var nRows = (dirR.roofNormal || []).map(function(r) {
    return [r.zone, fmt4(r.cp), fmt1(dirR.qh * dirR.G * r.cp - dirR.qh * dirR.gcpi), fmt1(dirR.qh * dirR.G * r.cp + dirR.qh * dirR.gcpi)];
  });
  nRows.push(['Leeward Wall', fmt4(dirR.cLW_n), fmt1(dirR.lwP_n), fmt1(dirR.lwN_n)]);
  nRows.push(['Side Wall', '\u22120.70', fmt1(dirR.swP), fmt1(dirR.swN)]);
  y = pTable(doc, ['Zone / Location', 'Cp', 'p (\u2212GCpi) psf', 'p (+GCpi) psf'], nRows, y);

  // Parallel to ridge
  y = subHdr(doc, 'Wind Parallel to Ridge', y);
  y = kvTable(doc, [
    ['L/B (LW ratio)', fmt4(dirR.ratioLW_p), 'Cp,LW', fmt4(dirR.cLW_p)],
    ['h/L (roof ratio)', fmt4(dirR.ratioRoof_p), 'Cp,WW', '0.80'],
  ], y);

  var pRows = (dirR.roofParallel || []).map(function(r) {
    return [r.zone, fmt4(r.cp), fmt1(dirR.qh * dirR.G * r.cp - dirR.qh * dirR.gcpi), fmt1(dirR.qh * dirR.G * r.cp + dirR.qh * dirR.gcpi)];
  });
  pRows.push(['Leeward Wall', fmt4(dirR.cLW_p), fmt1(dirR.lwP_p), fmt1(dirR.lwN_p)]);
  pRows.push(['Side Wall', '\u22120.70', fmt1(dirR.swP), fmt1(dirR.swN)]);
  y = pTable(doc, ['Zone / Location', 'Cp', 'p (\u2212GCpi) psf', 'p (+GCpi) psf'], pRows, y);

  // Parapet
  if (dirR.parZ && dirR.parZ > 0) {
    y = subHdr(doc, 'Parapet (z = ' + fmt1(dirR.parZ) + ' ft above ground)', y);
    y = kvTable(doc, [
      ['Kz at parapet', fmt4(dirR.parKz), 'Kzt at parapet', fmt4(dirR.parKzt)],
      ['qp (parapet)', fmt1(dirR.parQp) + ' psf', '', ''],
      ['WW parapet (+GCpn=+1.5)', fmt1(dirR.parWW) + ' psf', 'LW parapet (\u2212GCpn=\u22121.0)', fmt1(dirR.parLW) + ' psf'],
    ], y);
  }

  return y;
}

// ─── MWFRS LOW-RISE ──────────────────────────────────────────────────────────

function renderLR(doc, lrR, y) {
  y = secHeader(doc, 'MWFRS LOW-RISE \u2014 Ch. 28', y);
  if (!lrR.ok) {
    y = noteRow(doc, 'Not applicable: ' + lrR.reason, y);
    return y;
  }
  y = noteRow(doc, qhLabel(lrR.code_version) + ' = ' + fmt1(lrR.qh) + ' psf  |  GCpi = \u00b1' + lrR.gcpi + '  |  End zone 2a = ' + lrR.ez + ' ft', y);

  y = subHdr(doc, 'Case A \u2014 Transverse', y);
  y = pTable(doc,
    ['Zone', 'GCpf', 'p (+GCpi) psf', 'p (\u2212GCpi) psf'],
    (lrR.cA || []).map(function(r) { return [r.zone, fmt4(r.gcpf), fmt1(r.pN), fmt1(r.pP)]; }),
    y
  );

  y = subHdr(doc, 'Case B \u2014 Longitudinal', y);
  y = pTable(doc,
    ['Zone', 'GCpf', 'p (+GCpi) psf', 'p (\u2212GCpi) psf'],
    (lrR.cB || []).map(function(r) { return [r.zone, fmt4(r.gcpf), fmt1(r.pN), fmt1(r.pP)]; }),
    y
  );

  if (lrR.sd) {
    var sd = lrR.sd;
    y = subHdr(doc, 'Simple Diaphragm Horizontal MWFRS (\u00a728.4)', y);
    y = kvTable(doc, [
      ['Edge zone width a', sd.a + ' ft', 'End zone 2a', sd.endZone2a + ' ft'],
      ['Transverse \u2014 Interior', sd.transverse.intWall + ' psf', 'Transverse \u2014 End', sd.transverse.endWall + ' psf'],
      ['Longitudinal \u2014 Interior', sd.longitudinal.intWall + ' psf', 'Longitudinal \u2014 End', sd.longitudinal.endWall + ' psf'],
    ], y);
  }

  return y;
}

// ─── C&C ─────────────────────────────────────────────────────────────────────

function renderCC(doc, ccR, y) {
  var procLabel = ccR.proc === 'hle60' ? 'h \u2264 60 ft' : ccR.proc === 'alt6090' ? 'Alt 60\u201390 ft' : 'h > 60 ft';
  y = secHeader(doc, 'COMPONENTS & CLADDING (C&C) \u2014 ' + procLabel, y);
  y = noteRow(doc, qhLabel(ccR.codeVer) + ' = ' + fmt1(ccR.qh) + ' psf  |  GCpi = \u00b1' + ccR.gcpi + '  |  a = ' + ccR.a + ' ft  |  \u03b8 = ' + ccR.theta + '\u00b0  |  Min = ' + ccR.minP + ' psf', y);
  if (ccR.zone3eq2) {
    y = noteRow(doc, 'Zone 3 neg = Zone 2 neg (min parapet = ' + ccR.minPar + ' ft \u2265 3 ft \u2014 \u00a730.3 Note 6)', y);
  }

  function ccGrid(prs, title, zonePrefix) {
    var filtered = prs.filter(function(p) { return p.zone && p.zone.startsWith ? p.zone.startsWith(zonePrefix || '') : true; });
    if (!filtered.length) return y;
    y = subHdr(doc, title, y);
    var areas = uniqueVals(filtered, 'area');
    var zones = uniqueVals(filtered, 'zone');
    var head = ['Area (sf)'].concat(zones.reduce(function(a, z) { return a.concat(['Z' + z + ' neg', 'Z' + z + ' pos']); }, []));
    var body = areas.map(function(a) {
      var row = [String(a)];
      zones.forEach(function(z) {
        var rec = filtered.find(function(p) { return p.zone === z && p.area === a; });
        row.push(rec ? fmt1(rec.pnN) : '\u2014');
        row.push(rec ? fmt1(rec.ppP) : '\u2014');
      });
      return row;
    });
    y = pTable(doc, head, body, y);
    return y;
  }

  // Roof zones 1/1p/2/3
  var roofPrs = (ccR.prs || []).filter(function(p) { return ['1','1p','2','3'].includes(p.zone); });
  if (roofPrs.length) {
    y = subHdr(doc, 'Roof C&C (psf)', y);
    var rAreas = uniqueVals(roofPrs, 'area');
    var rZones = uniqueVals(roofPrs, 'zone');
    var rHead  = ['Area (sf)'].concat(rZones.reduce(function(a,z) { return a.concat(['Z'+z+' neg','Z'+z+' pos']); }, []));
    var rBody  = rAreas.map(function(a) {
      var row = [String(a)];
      rZones.forEach(function(z) {
        var rec = roofPrs.find(function(p) { return p.zone===z && p.area===a; });
        row.push(rec ? fmt1(rec.pnN) : '\u2014');
        row.push(rec ? fmt1(rec.ppP) : '\u2014');
      });
      return row;
    });
    y = pTable(doc, rHead, rBody, y);
  }

  // Overhang zones
  var ohPrs = (ccR.prs || []).filter(function(p) { return p.zone && p.zone.indexOf('oh') === 0; });
  if (ohPrs.length) {
    y = subHdr(doc, 'Roof Overhang C&C (psf) \u2014 GCpi = 0', y);
    var oAreas = uniqueVals(ohPrs, 'area');
    var oZones = uniqueVals(ohPrs, 'zone');
    var oHead  = ['Area (sf)'].concat(oZones.reduce(function(a,z) { return a.concat([z+' neg',z+' pos']); }, []));
    var oBody  = oAreas.map(function(a) {
      var row = [String(a)];
      oZones.forEach(function(z) {
        var rec = ohPrs.find(function(p) { return p.zone===z && p.area===a; });
        row.push(rec ? fmt1(rec.pnN) : '\u2014');
        row.push(rec ? fmt1(rec.ppP) : '\u2014');
      });
      return row;
    });
    y = pTable(doc, oHead, oBody, y);
  }

  // Wall zones: 4/5 for h<=60ft and alt (Fig 30.3-1), or 4p/5p for h>60ft (Fig 30.4-1)
  var isHgt60 = ccR.proc === 'hgt60';
  var wallPrs = (ccR.prs || []).filter(function(p) {
    return isHgt60
      ? (p.zone === '4p' || p.zone === '5p')
      : (p.zone === '4'  || p.zone === '5');
  });
  if (wallPrs.length) {
    var wallTitle = isHgt60
      ? 'Wall C&C (psf) \u2014 Zones 4\u2019 & 5\u2019 (Fig 30.4-1, h > 60 ft)'
      : 'Wall C&C (psf) \u2014 Fig 30.3-1';
    y = subHdr(doc, wallTitle, y);
    var wAreas = uniqueVals(wallPrs, 'area');
    var wZones = uniqueVals(wallPrs, 'zone');
    var wHead  = ['Area (sf)'].concat(wZones.reduce(function(a,z) { return a.concat(['Z'+z+' neg','Z'+z+' pos']); }, []));
    var wBody  = wAreas.map(function(a) {
      var row = [String(a)];
      wZones.forEach(function(z) {
        var rec = wallPrs.find(function(p) { return p.zone===z && p.area===a; });
        row.push(rec ? fmt1(rec.pnN) : '\u2014');
        row.push(rec ? fmt1(rec.ppP) : '\u2014');
      });
      return row;
    });
    y = pTable(doc, wHead, wBody, y);
  }

  // Parapet C&C — §30.9 / Fig 30.9-1
  // parPrs: [{area, caseA, caseBint, caseBcor}, ...]  parAreas: [10, 20, 50, ...]
  if (ccR.parPrs && ccR.parPrs.length) {
    y = subHdr(doc, 'Solid Parapet C&C (psf) \u2014 \u00a730.9 / Fig 30.9-1', y);
    y = noteRow(doc, 'Kd \u00d7 qp = ' + ccR.qp + ' psf (at parapet height) | Case A = combined WW+LW | Case B = suction', y);
    var parAreas = ccR.parAreas || ccR.parPrs.map(function(r) { return r.area; });
    var parHead  = ['Case'].concat(parAreas.map(function(a) { return String(a) + ' sf'; }));
    var parBody  = [
      ['Case A: Zone 2 & 3'].concat(ccR.parPrs.map(function(r) { return fmt1(r.caseA); })),
      ['Case B: Interior zone'].concat(ccR.parPrs.map(function(r) { return fmt1(r.caseBint); })),
      ['Case B: Corner zone (a=' + ccR.a + ' ft)'].concat(ccR.parPrs.map(function(r) { return fmt1(r.caseBcor); })),
    ];
    y = pTable(doc, parHead, parBody, y);
  }

  return y;
}

// ─── OPEN BUILDING ────────────────────────────────────────────────────────────

function renderOB(doc, obR, y) {
  y = secHeader(doc, 'OPEN BUILDING \u2014 Ch. 27 \u00a727.4 / Ch. 30 \u00a730.8', y);
  y = noteRow(doc, qhLabel(obR.code_version) + ' = ' + fmt1(obR.qh) + ' psf  |  G = ' + fmt4(obR.G) + '  |  \u03b8 = ' + obR.theta + '\u00b0  |  ' + (obR.clear ? 'Clear flow' : 'Obstructed flow'), y);

  y = subHdr(doc, 'MWFRS \u2014 Normal to Ridge (\u03b3=0\u00b0/180\u00b0)', y);
  if (obR.mwfrs_normal && obR.mwfrs_normal.cases) {
    y = pTable(doc,
      ['Case', 'Cn,w', 'Cn,l', 'p,w (psf)', 'p,l (psf)'],
      obR.mwfrs_normal.cases.map(function(c) { return [c.label, fmt4(c.Cnw), fmt4(c.Cnl), fmt1(c.pw), fmt1(c.pl)]; }),
      y
    );
  }

  y = subHdr(doc, 'MWFRS \u2014 Parallel to Ridge (\u03b3=90\u00b0)', y);
  var par = obR.mwfrs_parallel;
  if (par) {
    y = pTable(doc,
      ['Region', 'Case A Cn', 'Case A (psf)', 'Case B Cn', 'Case B (psf)'],
      [
        ['0 to h = '   + fmt1(par.h_val)  + ' ft', fmt4(par.caseA_Cn[0]), fmt1(par.caseA_p[0]), fmt4(par.caseB_Cn[0]), fmt1(par.caseB_p[0])],
        ['h to 2h = '  + fmt1(par.h2_val) + ' ft', fmt4(par.caseA_Cn[1]), fmt1(par.caseA_p[1]), fmt4(par.caseB_Cn[1]), fmt1(par.caseB_p[1])],
        ['> 2h',                                    fmt4(par.caseA_Cn[2]), fmt1(par.caseA_p[2]), fmt4(par.caseB_Cn[2]), fmt1(par.caseB_p[2])],
      ],
      y
    );
  }

  if (obR.fascia) {
    y = subHdr(doc, 'Fascia Panels (\u03b8 \u2264 5\u00b0)', y);
    y = kvTable(doc, [
      ['qp', fmt1(obR.fascia.qp) + ' psf', 'Windward (+1.5)', fmt1(obR.fascia.ww) + ' psf'],
      ['Leeward (\u22121.0)', fmt1(obR.fascia.lw) + ' psf', '', ''],
    ], y);
  }

  if (obR.cc_zones && obR.cc_zones.length) {
    y = subHdr(doc, 'C&C Roof Zones (\u00a730.8) \u2014 a = ' + fmt1(obR.a_cc) + ' ft', y);
    y = pTable(doc,
      ['Area Bracket', 'Z3 pos', 'Z3 neg', 'Z2 pos', 'Z2 neg', 'Z1 pos', 'Z1 neg'],
      obR.cc_zones.map(function(z) {
        return [z.area_label, fmt1(z.psf.z3p), fmt1(z.psf.z3n), fmt1(z.psf.z2p), fmt1(z.psf.z2n), fmt1(z.psf.z1p), fmt1(z.psf.z1n)];
      }),
      y
    );
  }

  return y;
}

// ─── ROOFTOP STRUCTURES ───────────────────────────────────────────────────────

function renderRW(doc, rwR, y) {
  y = secHeader(doc, 'ROOFTOP STRUCTURES \u2014 \u00a727.3.3 / \u00a729.4 / Solar', y);
  y = noteRow(doc, 'qh,equip = ' + fmt1(rwR.qhEquip) + ' psf  |  qh,solar = ' + fmt1(rwR.qhSolar) + ' psf', y);

  if (rwR.eq1 || rwR.eq2) {
    y = subHdr(doc, 'Rooftop Equipment \u00a727.3.3', y);
    var eqRows = [];
    [rwR.eq1, rwR.eq2].forEach(function(eq, idx) {
      if (!eq) return;
      var lbl = idx === 0 ? 'Equip #1' : 'Equip #2';
      eqRows.push([lbl + ' (L\u00d7B\u00d7h ft)', eq.lL + '\u00d7' + eq.lB + '\u00d7' + eq.h, 'Fv (vertical)', fmt1(eq.Fv) + ' psf']);
      eqRows.push(['Fh,L (horiz \u2225 L)', fmt1(eq.Fh_L) + ' psf', 'Fh,B (horiz \u2225 B)', fmt1(eq.Fh_B) + ' psf']);
    });
    if (eqRows.length) y = kvTable(doc, eqRows, y);
  }

  if (rwR.canopy) {
    y = subHdr(doc, 'Rooftop Canopy \u00a727.3.4', y);
    y = kvTable(doc, [
      ['qh,canopy', fmt1(rwR.canopy.qh) + ' psf', 'h/L', fmt2(rwR.canopy.hL)],
      ['p (neg GCp)', fmt1(rwR.canopy.pNeg) + ' psf', 'p (pos GCp)', fmt1(rwR.canopy.pPos) + ' psf'],
    ], y);
  }

  if (rwR.solarPar) {
    y = subHdr(doc, 'Solar Panels \u2014 Parallel to Roof \u00a729.4.4', y);
    y = kvTable(doc, [
      ['GCrn (net)', fmt2(rwR.solarPar.GCrn), 'F (psf)', fmt1(rwR.solarPar.F_psf)],
    ], y);
  }

  if (rwR.solarNP && rwR.solarNP.zones && rwR.solarNP.zones.length) {
    y = subHdr(doc, 'Solar Panels \u2014 Not Parallel to Roof \u00a729.4.5', y);
    y = pTable(doc,
      ['Zone', 'GCrn', 'p (psf)'],
      rwR.solarNP.zones.map(function(z) { return [z.zone, fmt2(z.GCrn), fmt1(z.p_psf)]; }),
      y
    );
  }

  return y;
}

// ─── OTHER STRUCTURES ─────────────────────────────────────────────────────────

function renderOW(doc, owR, y) {
  y = secHeader(doc, 'OTHER STRUCTURES \u2014 \u00a729.3 / \u00a729.4 / \u00a729.5 / \u00a729.6', y);

  if (owR.solidSign) {
    var ss = owR.solidSign;
    y = subHdr(doc, 'A. Solid Freestanding Walls & Signs (\u00a729.3)', y);
    y = kvTable(doc, [
      ['Kz', fmt2(ss.kz), 'Kzt', fmt2(ss.kztZ)],
      ['qz', fmt1(ss.qzRaw) + ' psf', 's/h', fmt2(ss.sh)],
      ['B/s', fmt2(ss.bs), 'Cf (Case A/B)', fmt2(ss.cfAB)],
      ['Wall return factor', fmt2(ss.wrf), 's/h reduction', fmt2(ss.shr)],
      ['F/As (uniform)', fmt1(ss.F_per_sf) + ' psf', '', ''],
    ], y);
    if (ss.caseCRows && ss.caseCRows.length) {
      y = noteRow(doc, 'Case C \u2014 Horizontal distribution (B/s \u2265 2):', y);
      y = pTable(doc,
        ['Zone', 'Cf', 'F/As (psf)'],
        ss.caseCRows.map(function(r) { return [r.zone, fmt2(r.cf), fmt1(r.F_per_sf)]; }),
        y
      );
    }
  }

  if (owR.openSign) {
    var os = owR.openSign;
    y = subHdr(doc, 'B. Open Signs & Single-Plane Open Frames (\u00a729.4)', y);
    y = kvTable(doc, [
      ['Kz', fmt2(os.kz), 'Kzt', fmt2(os.kztZ)],
      ['qz', fmt1(os.qzRaw) + ' psf', '\u03b5 (solid ratio)', fmt2(os.eps)],
      ['Member type', os.isRound ? 'Round' : 'Flat/Rect', os.isRound ? 'D\u221aqz' : '', os.isRound ? fmt2(os.dSqQz) : ''],
      ['Cf', fmt2(os.cf), 'F/Af', fmt1(os.F_per_sf) + ' psf'],
    ], y);
  }

  if (owR.chimney) {
    var ch = owR.chimney;
    y = subHdr(doc, 'C. Chimneys, Tanks & Similar Structures (\u00a729.5)', y);
    y = kvTable(doc, [
      ['Kd', fmt2(ch.kdUsed), 'Kz', fmt2(ch.kz)],
      ['Kzt', fmt2(ch.kztZ), 'qz', fmt1(ch.qzRaw) + ' psf'],
      ['h/D', fmt2(ch.hd), 'Section', ch.section],
      ['Cf', fmt2(ch.cf), 'F/Af', fmt1(ch.F_per_sf) + ' psf'],
    ], y);
  }

  if (owR.tower) {
    var tt = owR.tower;
    y = subHdr(doc, 'D. Trussed Towers (\u00a729.6)', y);
    var ttRows = [
      ['Kd', fmt2(tt.kdUsed), 'Kz', fmt2(tt.kz)],
      ['Kzt', fmt2(tt.kztZ), 'qz', fmt1(tt.qzRaw) + ' psf'],
      ['\u03c6 (solidity)', fmt2(tt.phi), 'Section', tt.section],
      ['Member shape', tt.memberShape, '', ''],
      ['Cf (normal)', fmt2(tt.cfNormal), 'F/Af normal', fmt1(tt.F_normal) + ' psf'],
    ];
    if (tt.isSquareTower) {
      ttRows.push(['Cf (diagonal)', fmt2(tt.cfDiag), 'F/Af diagonal', fmt1(tt.F_diag) + ' psf']);
    }
    y = kvTable(doc, ttRows, y);
  }

  return y;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export function windGeneratePDF(inputs, results, selectedTabs) {
  var proj = inputs.proj;
  var geo  = inputs.geo;
  var qzR  = results.qzR;
  var dirR = results.dirR;
  var lrR  = results.lrR;
  var ccR  = results.ccR;
  var obR  = results.obR;
  var rwR  = results.rwR;
  var owR  = results.owR;

  var doc = new jsPDF({ unit: 'mm', format: 'letter' });
  var y = 14;

  // Cover header
  doc.setFillColor.apply(doc, C_DARK);
  doc.rect(0, 0, PAGE_W, 30, 'F');
  doc.setTextColor.apply(doc, C_WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Wind Load Calculation', ML, 13);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  var projMeta = [];
  if (proj.projectName) projMeta.push(proj.projectName);
  if (proj.jobNumber)   projMeta.push('Job ' + proj.jobNumber);
  if (projMeta.length > 0) {
    doc.text(projMeta.join('  |  '), ML, 18);
  }
  doc.text(
    'ASCE ' + proj.code_version +
    '  |  V = ' + proj.V_mph + ' mph' +
    '  |  Exp ' + proj.exposure +
    '  |  ' + geo.L_ft + '\u00d7' + geo.B_ft + ' ft, h = ' + geo.h_ft + ' ft',
    ML, projMeta.length > 0 ? 24 : 21
  );
  doc.text('Generated: ' + new Date().toLocaleString(), MR, projMeta.length > 0 ? 24 : 21, { align: 'right' });
  doc.setTextColor.apply(doc, C_TEXT);
  y = 38;

  // Project inputs — always printed
  y = renderProjectInfo(doc, inputs, y);

  // Selected sections
  var renderers = {
    qz:  function() { y = renderQz(doc, qzR, y); },
    dir: function() { y = renderDir(doc, dirR, y); },
    lr:  function() { y = renderLR(doc, lrR, y); },
    cc:  function() { y = renderCC(doc, ccR, y); },
    ob:  function() { y = renderOB(doc, obR, y); },
    rw:  function() { y = renderRW(doc, rwR, y); },
    ow:  function() { y = renderOW(doc, owR, y); },
  };

  for (var i = 0; i < selectedTabs.length; i++) {
    var id = selectedTabs[i];
    if (renderers[id]) {
      y = checkPage(doc, y, 20);
      renderers[id]();
    }
  }

  addFooters(doc, proj);

  var ts = new Date().toISOString().slice(0, 10);
  var jobSuffix = proj.jobNumber ? '_' + proj.jobNumber.replace(/[^a-zA-Z0-9-]/g, '') : '';
  doc.save('WindCalc_ASCE' + proj.code_version + jobSuffix + '_' + ts + '.pdf');
}
