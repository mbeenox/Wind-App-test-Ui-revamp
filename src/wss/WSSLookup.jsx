import { useState, useEffect, useRef } from "react";
import {
  WSS_PROXY, wssFetch, wssGeocode, wssFetchWind, wssFetchSeismic,
  wssFetchSnow, wssFetchIce, wssFetchRain, wssFetchFlood,
  wssFetchTornado, wssFetchTsunami
} from './wssApi.js';
import { wssGeneratePDF } from './wssReport.js';

// ─── WSS UI helpers ───────────────────────────────────────────────────────────
function WssFmt(v, d=3) { if (v==null||isNaN(v)) return 'N/A'; return typeof v==='number'?v.toFixed(d):String(v); }

function WssStatusBadge({ status }) {
  const map = { loading:['#3b82f6','…'], success:['#22c55e','✓'], error:['#ef4444','✗'], idle:['#64748b','—'] };
  const [color, sym] = map[status]||map.idle;
  return <span style={{ marginLeft:4, fontWeight:700, color }}>{sym}</span>;
}

function WssCard({ title, icon, status, children }) {
  const borderColor = { loading:'#1e40af', success:'#166534', error:'#991b1b', idle:'#334155' }[status]||'#334155';
  return (
    <div style={{ background:'#0f172a', border:`1px solid ${borderColor}`, borderRadius:6, marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderBottom:`1px solid ${borderColor}` }}>
        <span style={{ fontSize:14 }}>{icon}</span>
        <span style={{ fontWeight:700, fontSize:11, color:'#cbd5e1', flex:1 }}>{title}</span>
        <WssStatusBadge status={status} />
      </div>
      <div style={{ padding:'8px 10px', fontSize:11 }}>{children}</div>
    </div>
  );
}

function WssRow({ label, value, highlight }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 0', borderBottom:'1px solid #1e293b', background: highlight?'#0c2340':'transparent' }}>
      <span style={{ color:'#94a3b8' }}>{label}</span>
      <span style={{ color: highlight?'#7dd3fc':'#e2e8f0', fontWeight: highlight?700:400 }}>{value ?? 'N/A'}</span>
    </div>
  );
}

function WssAutocomplete({ value, onChange, onSelect }) {
  const [sugg, setSugg] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debRef = useRef(null);
  const wrapRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  async function fetchSugg(q) {
    if (q.length < 3) { setSugg([]); setOpen(false); return; }
    setLoading(true);
    try { const r = await wssFetch(WSS_PROXY(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1&countrycodes=us`)); const d = await r.json(); setSugg(d||[]); setOpen((d||[]).length>0); setActiveIdx(-1); } catch(e) { setSugg([]); setOpen(false); }
    setLoading(false);
  }
  function sel(item) { onChange(item.display_name); setSugg([]); setOpen(false); onSelect({ lat:parseFloat(item.lat), lon:parseFloat(item.lon), displayName:item.display_name }); }
  function handleKey(e) {
    if (!open) return;
    if (e.key==='ArrowDown') { e.preventDefault(); setActiveIdx(i=>Math.min(i+1,sugg.length-1)); }
    else if (e.key==='ArrowUp') { e.preventDefault(); setActiveIdx(i=>Math.max(i-1,0)); }
    else if (e.key==='Enter'&&activeIdx>=0) { e.preventDefault(); sel(sugg[activeIdx]); }
    else if (e.key==='Escape') setOpen(false);
  }
  return (
    <div style={{ position:'relative' }} ref={wrapRef}>
      <div style={{ display:'flex', gap:4 }}>
        <input
          style={{ flex:1, background:'#1e293b', border:'1px solid #334155', borderRadius:4, padding:'5px 8px', color:'#e2e8f0', fontSize:11, fontFamily:'inherit' }}
          placeholder="e.g. 1234 Main St, Houston TX"
          value={value}
          onChange={e => { onChange(e.target.value); clearTimeout(debRef.current); debRef.current = setTimeout(()=>fetchSugg(e.target.value),320); }}
          onKeyDown={handleKey}
          onFocus={() => sugg.length>0&&setOpen(true)}
          autoComplete="off"
        />
        {loading && <span style={{ color:'#64748b', fontSize:10, alignSelf:'center' }}>…</span>}
      </div>
      {open && sugg.length>0 && (
        <ul style={{ position:'absolute', top:'100%', left:0, right:0, background:'#1e293b', border:'1px solid #334155', borderRadius:4, zIndex:999, listStyle:'none', margin:'2px 0 0', padding:0, maxHeight:200, overflowY:'auto' }}>
          {sugg.map((item,i) => {
            const parts = item.display_name.split(', ');
            return (
              <li key={item.place_id} onMouseDown={()=>sel(item)} onMouseEnter={()=>setActiveIdx(i)}
                style={{ padding:'6px 10px', cursor:'pointer', background:i===activeIdx?'#0f2040':'transparent', borderBottom:'1px solid #0f172a' }}>
                <div style={{ fontSize:11, color:'#e2e8f0', fontWeight:600 }}>{parts.slice(0,2).join(', ')}</div>
                {parts.length>2&&<div style={{ fontSize:10, color:'#64748b' }}>{parts.slice(2,4).join(', ')}</div>}
              </li>
            );
          })}
          <li style={{ padding:'4px 10px', fontSize:9, color:'#475569' }}>Powered by OpenStreetMap</li>
        </ul>
      )}
    </div>
  );
}

function WssMapPicker({ onLocationSelect, syncLocation }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markerRef = useRef(null);
  const [pinLabel, setPinLabel] = useState('Click map to drop a pin');
  useEffect(() => {
    const init = () => {
      if (!window.L || leafletMap.current) return;
      const L = window.L;
      const map = L.map(mapRef.current, { center:[38.5,-96], zoom:4 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(map);
      const icon = L.divIcon({ className:'', html:'<div style="width:14px;height:14px;background:#e8a020;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>', iconSize:[14,14], iconAnchor:[7,7] });
      map.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        if (markerRef.current) { markerRef.current.setLatLng([lat,lng]); } else { markerRef.current = L.marker([lat,lng],{icon}).addTo(map); }
        let dn = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try { const r = await wssFetch(WSS_PROXY(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)); const d = await r.json(); if (d.display_name) dn = d.display_name; } catch(e) {}
        setPinLabel(dn);
        onLocationSelect({ lat, lon:lng, displayName:dn });
      });
      leafletMap.current = map;
      if (syncLocation?.lat) { map.flyTo([syncLocation.lat, syncLocation.lon], 14); setPinLabel(syncLocation.displayName||''); }
    };
    if (window.L) { init(); } else { const iv = setInterval(()=>{ if(window.L){clearInterval(iv);init();} },100); return ()=>clearInterval(iv); }
    return () => { if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current=null; markerRef.current=null; } };
  }, []);
  useEffect(() => {
    if (!syncLocation?.lat || !leafletMap.current) return;
    leafletMap.current.flyTo([syncLocation.lat, syncLocation.lon], 14, {animate:true,duration:1.2});
    if (markerRef.current) { markerRef.current.setLatLng([syncLocation.lat, syncLocation.lon]); }
    setPinLabel(syncLocation.displayName||'');
  }, [syncLocation]);
  return (
    <div>
      <div ref={mapRef} style={{ height:260, borderRadius:4, border:'1px solid #334155', overflow:'hidden' }} />
      <div style={{ marginTop:4, fontSize:10, color:'#64748b' }}>📍 {pinLabel}</div>
    </div>
  );
}

function WssRainCard({ rain }) {
  const [show, setShow] = useState(false);
  const table = rain.table||[];
  const get = (dur,per) => { const row=table.find(r=>r.duration===dur); return row?WssFmt(row.values[per],3):'N/A'; };
  const pers = ['1yr','2yr','5yr','10yr','25yr','50yr','100yr','200yr','500yr','1000yr'];
  const hdrs = ['1-yr','2-yr','5-yr','10-yr','25-yr','50-yr','100-yr','200-yr','500-yr','1000-yr'];
  return (
    <div>
      <div style={{ display:'flex', gap:16, marginBottom:8 }}>
        <div style={{ flex:1, background:'#0c2040', borderRadius:4, padding:8 }}>
          <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>15-min (100-yr)</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#7dd3fc' }}>{get('15-min','100yr')} <span style={{ fontSize:10, fontWeight:400 }}>in/hr</span></div>
        </div>
        <div style={{ flex:1, background:'#0c2040', borderRadius:4, padding:8 }}>
          <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>60-min (100-yr)</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#7dd3fc' }}>{get('60-min','100yr')} <span style={{ fontSize:10, fontWeight:400 }}>in/hr</span></div>
        </div>
      </div>
      <button onClick={()=>setShow(s=>!s)} style={{ fontSize:10, color:'#38bdf8', background:'none', border:'none', cursor:'pointer', padding:0 }}>
        {show?'▲ Hide Atlas 14 Table':'▼ Show Full Atlas 14 Table'}
      </button>
      {show && (
        <div style={{ overflowX:'auto', marginTop:6 }}>
          <table style={{ width:'100%', fontSize:9, borderCollapse:'collapse' }}>
            <thead><tr style={{ borderBottom:'1px solid #334155' }}><th style={{ textAlign:'left', padding:'2px 4px', color:'#64748b' }}>Dur</th>{hdrs.map((h,i)=><th key={h} style={{ textAlign:'right', padding:'2px 4px', color:i===6?'#7dd3fc':'#64748b' }}>{h}</th>)}</tr></thead>
            <tbody>{table.map(row=>{const hl=['15-min','60-min'].includes(row.duration);return(<tr key={row.duration} style={{ background:hl?'#0c1a30':'transparent' }}><td style={{ padding:'2px 4px', color:'#94a3b8' }}>{row.duration}</td>{pers.map((p,i)=><td key={p} style={{ textAlign:'right', padding:'2px 4px', color:hl&&i===6?'#7dd3fc':'#cbd5e1' }}>{WssFmt(row.values[p],3)}</td>)}</tr>);})}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ─── WSSLookup — main embedded component ─────────────────────────────────────
const WSS_STDS = ['7-22','7-16','7-10'];
const WSS_RCS  = ['I','II','III','IV'];
const WSS_SC_722 = ['A','B','BC','C','CD','D','DE','E'];
const WSS_SC_OLD = ['A','B','C','D','E','F'];

export function WSSLookup({ onWindResult, wssState }) {
  const {
    address, setAddress,
    lat, setLat,
    lon, setLon,
    locMode, setLocMode,
    standard, setStandard,
    riskCategory, setRiskCategory,
    siteClass, setSiteClass,
    resolvedAddr, setResolvedAddr,
    resolvedLat, setResolvedLat,
    resolvedLon, setResolvedLon,
    siteElevFt, setSiteElevFt,
    results, setResults,
    statuses, setStatuses,
  } = wssState;

  // Transient UI state — kept local, not saved
  const [syncLoc, setSyncLoc] = useState(null);
  const [running, setRunning] = useState(false);
  const [globalErr, setGlobalErr] = useState('');

  const siteClasses = standard === '7-22' ? WSS_SC_722 : WSS_SC_OLD;

  function setStatus(h, s) { setStatuses(p=>({...p,[h]:s})); }
  function setResult(h, d) { setResults(p=>({...p,[h]:d})); }

  async function handleRun() {
    setGlobalErr(''); setResults({}); setStatuses({}); setSiteElevFt(null); setRunning(true);
    let fLat, fLon, dispAddr;
    try {
      if (locMode==='latlon') {
        fLat=parseFloat(lat); fLon=parseFloat(lon);
        if (isNaN(fLat)||isNaN(fLon)) throw new Error('Invalid lat/lon values');
        dispAddr=`${fLat.toFixed(5)}, ${fLon.toFixed(5)}`;
      } else if (locMode==='map') {
        fLat=parseFloat(lat); fLon=parseFloat(lon);
        if (isNaN(fLat)||isNaN(fLon)) throw new Error('Please click a location on the map first');
        dispAddr=address||`${fLat.toFixed(5)}, ${fLon.toFixed(5)}`;
      } else {
        if (!address.trim()) throw new Error('Please enter an address');
        if (lat&&lon&&!isNaN(parseFloat(lat))&&!isNaN(parseFloat(lon))) { fLat=parseFloat(lat); fLon=parseFloat(lon); dispAddr=address; }
        else { const geo=await wssGeocode(address); fLat=geo.lat; fLon=geo.lon; dispAddr=geo.displayName; }
      }
      setResolvedAddr(dispAddr); setResolvedLat(fLat); setResolvedLon(fLon);
    } catch(e) { setGlobalErr(e.message); setRunning(false); return; }

    const run = async (hazard, fn) => {
      setStatus(hazard,'loading');
      try { const d=await fn(); setResult(hazard,d); setStatus(hazard,'success'); }
      catch(e) { setResult(hazard,{error:e.message}); setStatus(hazard,'error'); }
    };

    let windData = null;
    try {
      await Promise.all([
        run('wind',    async()=>{ const d=await wssFetchWind(fLat,fLon,standard,riskCategory); windData=d; return d; }),
        run('seismic', ()=>wssFetchSeismic(fLat,fLon,standard,riskCategory,siteClass)),
        run('snow',    async()=>{ const d=await wssFetchSnow(fLat,fLon,standard,riskCategory); if(d.siteElevFt!=null)setSiteElevFt(d.siteElevFt); return d; }),
        run('ice',     ()=>wssFetchIce(fLat,fLon,standard,riskCategory)),
        run('rain',    ()=>wssFetchRain(fLat,fLon)),
        run('flood',   ()=>wssFetchFlood(fLat,fLon)),
        run('tsunami', ()=>wssFetchTsunami(fLat,fLon,standard)),
        run('tornado', ()=>wssFetchTornado(fLat,fLon,riskCategory)),
      ]);
    } catch(e) {
      setGlobalErr('Lookup error: ' + e.message);
    }
    setRunning(false);
    if (windData && windData.windSpeed != null && onWindResult) {
      onWindResult({ V_mph: Math.round(windData.windSpeed), risk_category: riskCategory, code_version: standard });
    }
  }

  function handleDownloadPDF() {
    wssGeneratePDF(
      { address: resolvedAddr, lat: resolvedLat, lon: resolvedLon, standard, riskCategory, siteClass },
      results
    );
  }

  const hasResults = Object.keys(results).length > 0;
  const allDone = hasResults && !running;
  const w=results.wind||{}, s=results.seismic||{}, sn=results.snow||{}, ic=results.ice||{}, fl=results.flood||{}, ts=results.tsunami||{}, tor=results.tornado||{}, rain=results.rain||{};

  const inp = (label, content) => (
    <div style={{ marginBottom:8 }}>
      <div style={{ fontSize:9, color:'#64748b', textTransform:'uppercase', letterSpacing:1, marginBottom:3 }}>{label}</div>
      {content}
    </div>
  );

  const iStyle = { width:'100%', background:'#1e293b', border:'1px solid #334155', borderRadius:4, padding:'5px 8px', color:'#e2e8f0', fontSize:11, fontFamily:'inherit', boxSizing:'border-box' };
  const tabBtn = (mode, label) => (
    <button key={mode} onClick={()=>setLocMode(mode)}
      style={{ flex:1, padding:'5px 0', background:locMode===mode?'#0369a1':'#1e293b', color:locMode===mode?'#fff':'#64748b', border:'none', borderRadius:0, cursor:'pointer', fontSize:10, fontFamily:'inherit', fontWeight:locMode===mode?700:400 }}>
      {label}
    </button>
  );

  return (
    <div style={{ fontSize:11, color:'#e2e8f0' }}>

      {/* Send-to-Wind banner */}
      {allDone && w.windSpeed!=null && (
        <div style={{ marginBottom:10, padding:'8px 10px', background:'#052e16', border:'1px solid #166534', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
          <div style={{ fontSize:10 }}>
            <span style={{ fontWeight:700, color:'#7dd3fc' }}>V = {Math.round(w.windSpeed)} mph</span>
            <span style={{ color:'#475569', margin:'0 4px' }}>·</span>
            <span style={{ color:'#cbd5e1' }}>RC {riskCategory}</span>
            <span style={{ color:'#475569', margin:'0 4px' }}>·</span>
            <span style={{ color:'#cbd5e1' }}>ASCE {standard}</span>
            {w.isHurricane && <span style={{ marginLeft:8, color:'#fbbf24' }}>⚠ Hurricane Region</span>}
            {w.isSpecialWind && <span style={{ marginLeft:8, color:'#fbbf24' }}>⚠ Special Wind Region</span>}
          </div>
          <span style={{ fontSize:10, color:'#4ade80', fontWeight:700 }}>✓ Auto-sent to Wind Inputs</span>
          <button onClick={handleDownloadPDF}
            style={{ padding:'4px 10px', background:'#1e293b', color:'#7dd3fc', border:'1px solid #334155', borderRadius:4, cursor:'pointer', fontSize:10, fontWeight:700, fontFamily:'inherit', whiteSpace:'nowrap' }}>
            ↓ PDF Report
          </button>
        </div>
      )}

      {/* Location mode tabs */}
      <div style={{ display:'flex', borderRadius:4, overflow:'hidden', border:'1px solid #334155', marginBottom:8 }}>
        {[['address','Address'],['latlon','Lat / Lon'],['map','Map']].map(([m,l])=>tabBtn(m,l))}
      </div>

      {locMode==='address' && inp('Street Address',
        <WssAutocomplete value={address} onChange={setAddress} onSelect={({lat:lt,lon:ln,displayName})=>{ setAddress(displayName); setLat(String(lt)); setLon(String(ln)); setSyncLoc({lat:lt,lon:ln,displayName}); }} />
      )}
      {locMode==='latlon' && (
        <div style={{ display:'flex', gap:6, marginBottom:8 }}>
          {inp('Latitude', <input style={iStyle} placeholder="32.7767" value={lat} onChange={e=>setLat(e.target.value)} />)}
          {inp('Longitude', <input style={iStyle} placeholder="-96.7970" value={lon} onChange={e=>setLon(e.target.value)} />)}
        </div>
      )}
      {locMode==='map' && inp('', <WssMapPicker syncLocation={syncLoc} onLocationSelect={({lat:lt,lon:ln,displayName})=>{ setLat(String(lt)); setLon(String(ln)); setAddress(displayName); setSyncLoc({lat:lt,lon:ln,displayName}); }} />)}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
        {inp('ASCE Standard',
          <select style={iStyle} value={standard} onChange={e=>{ setStandard(e.target.value); setSiteClass('D'); }}>
            {WSS_STDS.map(s=><option key={s} value={s}>ASCE {s}</option>)}
          </select>
        )}
        {inp('Risk Category',
          <select style={iStyle} value={riskCategory} onChange={e=>setRiskCategory(e.target.value)}>
            {WSS_RCS.map(rc=><option key={rc} value={rc}>RC {rc}</option>)}
          </select>
        )}
      </div>
      {inp('Site Soil Class',
        <select style={iStyle} value={siteClass} onChange={e=>setSiteClass(e.target.value)}>
          {siteClasses.map(sc=><option key={sc} value={sc}>{sc}</option>)}
        </select>
      )}

      {globalErr && <div style={{ padding:'6px 8px', background:'#450a0a', border:'1px solid #991b1b', borderRadius:4, color:'#fca5a5', fontSize:10, marginBottom:8 }}>{globalErr}</div>}

      <button onClick={handleRun} disabled={running}
        style={{ width:'100%', padding:'8px 0', background:running?'#1e293b':'#0369a1', color:running?'#64748b':'#fff', border:'none', borderRadius:4, cursor:running?'default':'pointer', fontWeight:700, fontSize:11, fontFamily:'inherit', marginBottom:12 }}>
        {running?'Running…':'Run Hazard Lookup'}
      </button>

      {/* Results */}
      {hasResults && (
        <div>
          {resolvedAddr && (
            <div style={{ marginBottom:8, padding:'6px 8px', background:'#0f172a', border:'1px solid #1e293b', borderRadius:4, fontSize:10, color:'#64748b' }}>
              📍 {resolvedAddr}
              {siteElevFt!=null && <span style={{ marginLeft:8, color:'#475569' }}>⛰ {Math.round(siteElevFt).toLocaleString()} ft NAVD88</span>}
            </div>
          )}

          <WssCard title="Wind" icon="🌬" status={statuses.wind||'idle'}>
            {w.error?<div style={{color:'#fca5a5'}}>{w.error}</div>:<>
              <WssRow label="V (mph)" value={w.windSpeed?`${WssFmt(w.windSpeed,0)} mph`:'N/A'} highlight />
              <WssRow label="Hurricane-Prone Region" value={w.isHurricane?'⚠ YES':'No'} />
              <WssRow label="Special Wind Region" value={w.isSpecialWind?'⚠ YES — Verify AHJ':'No'} />
            </>}
          </WssCard>

          <WssCard title="Seismic" icon="🌍" status={statuses.seismic||'idle'}>
            {s.error?<div style={{color:'#fca5a5'}}>{s.error}</div>:<>
              <WssRow label="Ss (0.2 sec)" value={WssFmt(s.ss)} highlight />
              <WssRow label="S1 (1.0 sec)" value={WssFmt(s.s1)} highlight />
              <WssRow label="SDS" value={WssFmt(s.sds)} />
              <WssRow label="SD1" value={WssFmt(s.sd1)} />
              <WssRow label="SDC" value={s.sdc??'N/A'} />
              <WssRow label="Fa / Fv" value={s.fa!=null&&s.fv!=null?`${WssFmt(s.fa)} / ${WssFmt(s.fv)}`:standard==='7-22'?'N/A (multi-period)':'N/A'} />
              <WssRow label="TL (sec)" value={WssFmt(s.tl,1)} />
            </>}
          </WssCard>

          <WssCard title="Snow" icon="❄" status={statuses.snow||'idle'}>
            {sn.error?<div style={{color:'#fca5a5'}}>{sn.error}</div>:<>
              <WssRow label="Ground Snow Load (pg)" value={sn.groundSnowLoad!=null?`${Math.round(sn.groundSnowLoad)} psf`:'N/A'} highlight />
              {sn.siteElevFt!=null&&<WssRow label="Site Elevation" value={`${Math.round(sn.siteElevFt).toLocaleString()} ft`} />}
              {sn.elevationTable&&(
                <div style={{ marginTop:6, fontSize:9 }}>
                  <div style={{ color:'#64748b', marginBottom:3 }}>* Elevation-dependent pg:</div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead><tr><th style={{ textAlign:'left', color:'#64748b', padding:'2px 4px' }}>Up to Elev (ft)</th><th style={{ textAlign:'right', color:'#64748b', padding:'2px 4px' }}>pg (psf)</th></tr></thead>
                    <tbody>{sn.elevationTable.map((row,i)=><tr key={i}><td style={{ padding:'2px 4px', color:'#94a3b8' }}>{row.elevation.toLocaleString()}</td><td style={{ textAlign:'right', padding:'2px 4px', color:'#cbd5e1' }}>{WssFmt(row.load,1)}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
              <WssRow label="Winter Wind" value={sn.winterWind??'N/A'} />
              <WssRow label="Special Case" value={sn.specialCase?'⚠ Site study required':'No'} />
            </>}
          </WssCard>

          <WssCard title="Ice" icon="🧊" status={statuses.ice||'idle'}>
            {ic.error?<div style={{color:'#fca5a5'}}>{ic.error}</div>:<>
              <WssRow label="Radial Ice Thickness" value={ic.iceThickness!=null?`${WssFmt(ic.iceThickness,3)} in`:'N/A'} highlight />
              <WssRow label="Concurrent Temp" value={ic.concurrentTemp!=null?`${ic.concurrentTemp} °F`:'N/A'} />
              <WssRow label="Concurrent Gust" value={ic.concurrentGust!=null?`${WssFmt(ic.concurrentGust,1)} mph`:'N/A'} />
            </>}
          </WssCard>

          <WssCard title="Flood" icon="🌊" status={statuses.flood||'idle'}>
            {fl.error?<div style={{color:'#fca5a5'}}>{fl.error}</div>:<>
              <WssRow label="FEMA Flood Zone" value={fl.floodZone??'N/A'} highlight />
              <WssRow label="SFHA" value={fl.sfha?'⚠ YES':'No'} />
              <WssRow label="BFE" value={fl.bfe!=null?`${fl.bfe} ft (${fl.datum})`:'N/A'} />
              <WssRow label="Zone Subtype" value={fl.subtype??'N/A'} />
            </>}
          </WssCard>

          <WssCard title="Tsunami" icon="🌊" status={statuses.tsunami||'idle'}>
            {ts.error?<div style={{color:'#fca5a5'}}>{ts.error}</div>
              :!ts.applicable?<div style={{color:'#64748b',fontSize:10}}>{ts.message}</div>:<>
              <WssRow label="In Tsunami Design Zone" value={ts.inTDZ?'⚠ YES':'No'} highlight />
              <WssRow label="Runup (MHW)" value={ts.runupMHW!=null?`${WssFmt(ts.runupMHW,2)} ft`:'N/A'} />
              <WssRow label="Runup (NAVD88)" value={ts.runupNAVD!=null?`${WssFmt(ts.runupNAVD,2)} ft`:'N/A'} />
            </>}
          </WssCard>

          <WssCard title="Tornado" icon="🌪" status={statuses.tornado||'idle'}>
            {tor.error?<div style={{color:'#fca5a5'}}>{tor.error}</div>
              :!tor.applicable?<div style={{color:'#64748b',fontSize:10}}>{tor.message}</div>:<>
              <WssRow label="In Tornado-Prone Area" value={tor.inPronArea?'⚠ YES':'No'} highlight />
              {Object.entries(tor.speeds||{}).map(([rp,v])=><WssRow key={rp} label={rp.replace('RP','').replace('K',',000').replace('M',',000,000')+'-yr MRI'} value={v!=null?`${WssFmt(v,0)} mph`:'N/A'} />)}
            </>}
          </WssCard>

          <WssCard title="Rain (NOAA Atlas 14)" icon="🌧" status={statuses.rain||'idle'}>
            {rain.error?<div style={{color:'#fca5a5'}}>{rain.error}</div>
              :rain.table?<WssRainCard rain={rain} />:<div style={{color:'#64748b'}}>No data</div>}
          </WssCard>

          <div style={{ padding:'8px 0', fontSize:9, color:'#334155', textAlign:'center' }}>
            Data: USGS · ASCE GIS · FEMA NFHL · NOAA Atlas 14 — Verify before use in design.
          </div>
        </div>
      )}
    </div>
  );
}

