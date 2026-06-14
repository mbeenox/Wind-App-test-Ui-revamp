import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── PDF REPORT ─────────────────────────────────────────────────────────────────



function wssPdfFmt(val, decimals = 3) {
  if (val == null || val === undefined || isNaN(val)) return 'N/A';
  return typeof val === 'number' ? val.toFixed(decimals) : String(val);
}

function sectionHeader(doc, text, y) {
  doc.setFillColor(15, 40, 80);
  doc.rect(14, y, 182, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(text, 16, y + 5);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  return y + 10;
}

export function wssGeneratePDF(inputs, results) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;

  // ── Header ──
  doc.setFillColor(15, 40, 80);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('WSS Load Lookup', 14, 13);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Site Hazard Report  |  Wind · Seismic · Snow · Ice · Rain · Flood · Tsunami · Tornado', 14, 21);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 14, 21, { align: 'right' });
  doc.setTextColor(30, 30, 30);
  y = 36;

  // ── Site Info ──
  y = sectionHeader(doc, 'SITE INFORMATION', y);
  const snowResult = results.snow || {};
  const elevFt = snowResult.siteElevFt != null ? `${Math.round(snowResult.siteElevFt).toLocaleString()} ft NAVD88` : 'N/A';
  const latStr = inputs.lat != null ? inputs.lat.toFixed(6) : 'N/A';
  const lonStr = inputs.lon != null ? inputs.lon.toFixed(6) : 'N/A';
  autoTable(doc, {
    startY: y,
    head: [],
    body: [
      ['Address', inputs.address || 'N/A', 'Standard', `ASCE ${inputs.standard}`],
      ['Latitude', latStr, 'Risk Category', `RC ${inputs.riskCategory}`],
      ['Longitude', lonStr, 'Site Class', inputs.siteClass],
      ['Site Elevation', elevFt, 'Report Date', new Date().toLocaleDateString()],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 35 },
      2: { fontStyle: 'bold', cellWidth: 35 },
    },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 6;

  // ── Wind ──
  if (results.wind) {
    y = sectionHeader(doc, 'WIND', y);
    const w = results.wind;
    autoTable(doc, {
      startY: y,
      head: [['Parameter', 'Value', 'Notes']],
      body: [
        ['Ultimate Wind Speed (V)', w.windSpeed ? `${wssPdfFmt(w.windSpeed, 0)} mph` : 'N/A', `ASCE ${inputs.standard} Fig. 26.5-1`],
        ['Hurricane-Prone Region', w.isHurricane ? 'YES' : 'NO', w.isHurricane ? 'Wind-borne debris requirements apply' : ''],
        ['Special Wind Region', w.isSpecialWind ? 'YES — See Authority Having Jurisdiction' : 'NO', w.isSpecialWind ? 'Site-specific study may be required' : ''],
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 40, 80], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── Seismic ──
  if (results.seismic) {
    y = sectionHeader(doc, 'SEISMIC', y);
    const s = results.seismic;
    autoTable(doc, {
      startY: y,
      head: [['Parameter', 'Value', 'Parameter', 'Value']],
      body: [
        ['Ss (0.2 sec)', wssPdfFmt(s.ss), 'S1 (1.0 sec)', wssPdfFmt(s.s1)],
        ['Fa', s.fa != null ? wssPdfFmt(s.fa) : (inputs.standard === '7-22' ? 'N/A (multi-period)' : 'N/A'), 'Fv', s.fv != null ? wssPdfFmt(s.fv) : (inputs.standard === '7-22' ? 'N/A (multi-period)' : 'N/A')],
        ['SMS', wssPdfFmt(s.sms), 'SM1', wssPdfFmt(s.sm1)],
        ['SDS', wssPdfFmt(s.sds), 'SD1', wssPdfFmt(s.sd1)],
        ['SDC', s.sdc ?? 'N/A', 'TL (sec)', wssPdfFmt(s.tl, 1)],
        ['PGA (g)', wssPdfFmt(s.pga), 'PGAm (g)', wssPdfFmt(s.pgam)],
        ['T0 (sec)', wssPdfFmt(s.t0), 'Ts (sec)', wssPdfFmt(s.ts)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 40, 80], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── Snow ──
  if (results.snow) {
    y = sectionHeader(doc, 'GROUND SNOW LOAD', y);
    const sn = results.snow;
    autoTable(doc, {
      startY: y,
      head: [['Parameter', 'Value', 'Notes']],
      body: [
        ['Ground Snow Load (pg)', sn.groundSnowLoad != null ? `${Math.round(sn.groundSnowLoad)} psf` : 'N/A', `ASCE ${inputs.standard}`],
        ['Winter Wind Parameter', sn.winterWind ?? 'N/A', ''],
        ['Special Case', sn.specialCase ? 'YES — Site study required' : 'NO', ''],
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 40, 80], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── Ice ──
  if (results.ice) {
    const ic = results.ice;
    y = sectionHeader(doc, 'ICE', y);
    autoTable(doc, {
      startY: y,
      head: [['Parameter', 'Value']],
      body: [
        ['Radial Ice Thickness', ic.iceThickness != null ? `${wssPdfFmt(ic.iceThickness, 3)} in` : 'N/A'],
        ['Concurrent Temperature', ic.concurrentTemp != null ? `${ic.concurrentTemp} °F` : 'N/A'],
        ['Concurrent 3-s Gust', ic.concurrentGust != null ? `${wssPdfFmt(ic.concurrentGust, 1)} mph` : 'N/A'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 40, 80], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Check if new page needed
  if (y > 220) { doc.addPage(); y = 14; }

  // ── Flood ──
  if (results.flood) {
    const fl = results.flood;
    y = sectionHeader(doc, 'FLOOD', y);
    autoTable(doc, {
      startY: y,
      head: [['Parameter', 'Value']],
      body: [
        ['FEMA Flood Zone', fl.floodZone ?? 'N/A'],
        ['Special Flood Hazard Area (SFHA)', fl.sfha ? 'YES' : 'NO'],
        ['Base Flood Elevation (BFE)', fl.bfe != null ? `${fl.bfe} ft (${fl.datum})` : 'N/A'],
        ['Zone Subtype', fl.subtype ?? 'N/A'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 40, 80], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── Tsunami ──
  if (results.tsunami) {
    const ts = results.tsunami;
    y = sectionHeader(doc, 'TSUNAMI', y);
    if (!ts.applicable) {
      autoTable(doc, { startY: y, body: [[ts.message]], theme: 'plain', styles: { fontSize: 9 }, margin: { left: 14, right: 14 } });
    } else {
      autoTable(doc, {
        startY: y,
        head: [['Parameter', 'Value']],
        body: [
          ['In Tsunami Design Zone (TDZ)', ts.inTDZ ? 'YES' : 'NO'],
          ['Runup Elevation (MHW)', ts.runupMHW != null ? `${wssPdfFmt(ts.runupMHW, 2)} ft` : 'N/A'],
          ['Runup Elevation (NAVD88)', ts.runupNAVD != null ? `${wssPdfFmt(ts.runupNAVD, 2)} ft` : 'N/A'],
        ],
        theme: 'striped',
        headStyles: { fillColor: [15, 40, 80], fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 2 },
        margin: { left: 14, right: 14 },
      });
    }
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── Tornado ──
  if (results.tornado) {
    const tor = results.tornado;
    y = sectionHeader(doc, 'TORNADO', y);
    if (!tor.applicable) {
      autoTable(doc, { startY: y, body: [[tor.message]], theme: 'plain', styles: { fontSize: 9 }, margin: { left: 14, right: 14 } });
    } else {
      const rows = Object.entries(tor.speeds || {}).map(([rp, v]) => [
        rp.replace('RP', '').replace('K', ',000').replace('M', ',000,000') + '-yr MRI',
        v != null ? `${wssPdfFmt(v, 0)} mph` : 'N/A',
      ]);
      autoTable(doc, {
        startY: y,
        head: [['Return Period (PT — 1 sq ft)', 'Tornado Wind Speed']],
        body: [['In Tornado-Prone Area', tor.inPronArea ? 'YES' : 'NO'], ...rows],
        theme: 'striped',
        headStyles: { fillColor: [15, 40, 80], fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 2 },
        margin: { left: 14, right: 14 },
      });
    }
    y = doc.lastAutoTable.finalY + 6;
  }

  // ── Rain ──
  if (results.rain?.table) {
    if (y > 220) { doc.addPage(); y = 14; }
    y = sectionHeader(doc, 'RAIN (NOAA Atlas 14)', y);

    // Helper to get a value from the table
    const rainGet = (duration, period) => {
      const row = results.rain.table.find(r => r.duration === duration);
      return row ? wssPdfFmt(row.values[period], 3) : 'N/A';
    };

    autoTable(doc, {
      startY: y,
      head: [['Parameter', 'Value', 'Reference']],
      body: [
        [
          '15-min Rainfall Intensity (100-yr MRI)',
          `${rainGet('15-min', '100yr')} in/hr`,
          'NOAA Atlas 14, PDS'
        ],
        [
          '60-min Rainfall Intensity (100-yr MRI)',
          `${rainGet('60-min', '100yr')} in/hr`,
          'NOAA Atlas 14, PDS · ASCE 7 §8.3'
        ],
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 40, 80], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 1: { fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
      didParseCell: (data) => {
        if (data.row.index >= 0 && data.column.index === 1) {
          data.cell.styles.fillColor = [255, 243, 220];
          data.cell.styles.textColor = [15, 40, 80];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 4;

    // Note
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.setFont('helvetica', 'italic');
    doc.text(
      'Full precipitation frequency table (19 durations × 10 return periods) available in the WSS Load Lookup app.',
      14, y
    );
    doc.setFont('helvetica', 'normal');
    y += 8;
  }

  // ── Footer ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(
      'WSS Load Lookup  |  Data sourced from USGS, ASCE GIS, FEMA NFHL, NOAA Atlas 14  |  Verify all values against governing code before use.',
      14, doc.internal.pageSize.getHeight() - 8
    );
    doc.text(`Page ${i} of ${pageCount}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }

  const siteName = (inputs.address || 'site').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  doc.save(`WSS_Report_${siteName}_${new Date().toISOString().slice(0,10)}.pdf`);
}

