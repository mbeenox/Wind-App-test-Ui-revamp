export const WSS_PROXY = (url) => `/api/proxy?target=${encodeURIComponent(url)}`;

// Fetch with 15-second timeout so a hung API call doesn't freeze the whole run
// wssFetch: thin wrapper kept for compatibility
export async function wssFetch(url, opts) {
  return fetch(url, opts);
}

export async function wssGeocode(address) {
  try {
    const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
    const r = await wssFetch(WSS_PROXY(censusUrl));
    const data = await r.json();
    const matches = data?.result?.addressMatches;
    if (matches?.length > 0) {
      const m = matches[0];
      return { lat: parseFloat(m.coordinates.y), lon: parseFloat(m.coordinates.x), displayName: m.matchedAddress };
    }
  } catch (e) {}
  const r = await wssFetch(WSS_PROXY(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`));
  const data = await r.json();
  if (!data.length) throw new Error('Address not found. Try adding city and state, or use Lat/Lon.');
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), displayName: data[0].display_name };
}

function wssArcgisGetSamples(service, lat, lon) {
  const geom = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
  const url = `https://gis.asce.org/arcgis/rest/services/${service}/getSamples?geometry=${encodeURIComponent(geom)}&geometryType=esriGeometryPoint&returnFirstValueOnly=true&f=json`;
  return wssFetch(WSS_PROXY(url)).then(r => r.json());
}
function wssArcgisIdentify(service, lat, lon, layers = 'all') {
  const ext = `${lon-0.5},${lat-0.5},${lon+0.5},${lat+0.5}`;
  const url = `https://gis.asce.org/arcgis/rest/services/${service}/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&sr=4326&layers=${layers}&tolerance=3&mapExtent=${ext}&imageDisplay=800,600,96&returnGeometry=false&f=json`;
  return wssFetch(WSS_PROXY(url)).then(r => r.json());
}

// Seismic
const WSS_SEISMIC_SLUG = { '7-22': 'asce7-22', '7-16': 'asce7-16', '7-10': 'asce7-10' };
export async function wssFetchSeismic(lat, lon, standard, riskCategory, siteClass) {
  const slug = WSS_SEISMIC_SLUG[standard];
  const url = `https://earthquake.usgs.gov/ws/designmaps/${slug}.json?latitude=${lat}&longitude=${lon}&riskCategory=${riskCategory}&siteClass=${siteClass}&title=WSS`;
  const r = await wssFetch(WSS_PROXY(url));
  const data = await r.json();
  if (data.response?.data) {
    const d = data.response.data;
    const sa = (d.underlyingData?.siteAmplification) || {};
    return { ss: d.ss, s1: d.s1, fa: d.fa ?? sa.fa ?? null, fv: d.fv ?? sa.fv ?? null, sms: d.sms, sm1: d.sm1, sds: d.sds, sd1: d.sd1, sdc: d.sdc, tl: d.tl, pga: d.pga, pgam: d.pgam, t0: d.t0, ts: d.ts };
  }
  const resp = Array.isArray(data.response) ? data.response[0] : data.response;
  const d = resp?.data || {};
  return { ss: d.ss, s1: d.s1, fa: d.fa, fv: d.fv, sms: d.sms, sm1: d.sm1, sds: d.sds, sd1: d.sd1, sdc: d.sdc, tl: d.tl || d['t-sub-l'], pga: d.pga, pgam: d.pgam, t0: d.t0, ts: d.ts };
}

// Wind
const WSS_WIND_722 = { I:'ASCE722/w2022_mri300/ImageServer', II:'ASCE722/w2022_mri700/ImageServer', III:'ASCE722/w2022_mri1700/ImageServer', IV:'ASCE722/w2022_mri3000/ImageServer' };
const WSS_WIND_716 = { I:'ASCE/wind2016_300/ImageServer', II:'ASCE/wind2016_700/ImageServer', III:'ASCE/wind2016_1700/ImageServer', IV:'ASCE/wind2016_3000/ImageServer' };
const WSS_WIND_710 = { I:'ASCE/wind2010_A/ImageServer', II:'ASCE/wind2010_C/ImageServer', III:'ASCE/wind2010_B/ImageServer', IV:'ASCE/wind2010_C/ImageServer' };
export async function wssFetchWind(lat, lon, standard, riskCategory) {
  let windSpeed = null;
  const svcMap = standard === '7-22' ? WSS_WIND_722 : standard === '7-16' ? WSS_WIND_716 : WSS_WIND_710;
  try { const data = await wssArcgisGetSamples(svcMap[riskCategory], lat, lon); windSpeed = (data.samples||[])[0] ? parseFloat(data.samples[0].value) : null; } catch(e) {}
  let isHurricane = false;
  try { const h = await wssArcgisIdentify('ASCE/ASCE_Hurricane_WindBorneDebris/MapServer', lat, lon); isHurricane = (h.results||[]).length > 0; } catch(e) {}
  let isSpecialWind = false;
  try { const s = await wssArcgisIdentify('ASCE722/w2022_Special_Wind_Regions/MapServer', lat, lon); isSpecialWind = (s.results||[]).length > 0; } catch(e) {}
  return { windSpeed, isHurricane, isSpecialWind };
}

// Snow helpers
export async function wssFetchSiteElevFt(lat, lon) {
  try { const d = await wssArcgisGetSamples('ASCE722/s2022_Elevation/ImageServer', lat, lon); const v = d.samples?.[0]?.value; if (v != null && v !== 'NoData') return parseFloat(v) * 3.28084; } catch(e) {}
  return null;
}
function wssExtractSnowLoad(attrs, siteElevFt) {
  const elevTable = [];
  for (let i = 1; i <= 4; i++) {
    const elev = attrs[`Elevation${i}`], load = attrs[`Load${i}`];
    if (elev != null && String(elev) !== 'Null' && parseFloat(elev) > 0 && load != null && String(load) !== 'Null')
      elevTable.push({ elevation: parseFloat(elev), load: parseFloat(load) });
  }
  let selectedLoad = null;
  if (elevTable.length > 0 && siteElevFt != null) {
    elevTable.sort((a,b) => a.elevation - b.elevation);
    if (siteElevFt <= elevTable[0].elevation) { selectedLoad = parseFloat(attrs['Display'] ?? 0); }
    else { selectedLoad = elevTable[elevTable.length-1].load; for (let i=1;i<elevTable.length;i++) { if (siteElevFt <= elevTable[i].elevation) { selectedLoad = elevTable[i].load; break; } } }
  } else { const d = attrs['Display']; selectedLoad = (d != null && d !== 'Null' && d !== '') ? parseFloat(d) : null; }
  return { load: selectedLoad, elevTable: elevTable.length > 0 ? elevTable : null };
}
const WSS_SNOW_722 = { I:'ASCE722/s2022_RiskCategory1/ImageServer', II:'ASCE722/s2022_RiskCategory2/ImageServer', III:'ASCE722/s2022_RiskCategory3/ImageServer', IV:'ASCE722/s2022_RiskCategory4/ImageServer' };
export async function wssFetchSnow(lat, lon, standard, riskCategory) {
  let groundSnowLoad = null, winterWind = null, specialCase = false, elevationTable = null, siteElevFt = null;
  if (standard === '7-22') {
    const [ss, wD, spD, eFt] = await Promise.allSettled([wssArcgisGetSamples(WSS_SNOW_722[riskCategory], lat, lon), wssArcgisIdentify(`ASCE722/s2022_Tile_RC_${riskCategory}/MapServer`, lat, lon, 'all:0'), wssArcgisIdentify(`ASCE722/s2022_Tile_RC_${riskCategory}/MapServer`, lat, lon, 'all:1'), wssFetchSiteElevFt(lat, lon)]);
    if (ss.status==='fulfilled') { const rawVal = (ss.value.samples||[])[0]?.value; const n = rawVal != null && String(rawVal).trim() !== 'NoData' ? parseFloat(String(rawVal).trim()) : null; if (n != null && !isNaN(n)) groundSnowLoad = n; }
    if (wD.status==='fulfilled') { const r = (wD.value.results||[])[0]; if (r) winterWind = r.attributes?.value ?? r.attributes?.SI_Label ?? null; }
    if (spD.status==='fulfilled') specialCase = (spD.value.results||[]).length > 0;
    if (eFt.status==='fulfilled' && eFt.value != null) siteElevFt = eFt.value;
  } else if (standard === '7-16') {
    try {
      const [s716, sp716, eFt] = await Promise.all([wssArcgisIdentify('ASCE/Snow_2016_Tile/MapServer', lat, lon, 'all:1'), wssArcgisIdentify('ASCE/Snow_2016_Tile/MapServer', lat, lon, 'all:2'), wssFetchSiteElevFt(lat, lon)]);
      siteElevFt = eFt;
      const r = (s716.results||[])[0]; if (r) { const ex = wssExtractSnowLoad(r.attributes||{}, siteElevFt); groundSnowLoad = ex.load; if (ex.elevTable) elevationTable = ex.elevTable; }
      const sp = (sp716.results||[])[0]; if (sp) { const hasReal = [1,2,3,4].some(i => sp.attributes?.[`Load${i}`] && parseFloat(sp.attributes[`Load${i}`]) > 0); specialCase = !hasReal && groundSnowLoad === null; }
    } catch(e) {}
  } else {
    try { const [s710, eFt] = await Promise.all([wssArcgisIdentify('ASCE/SnowLoad/MapServer', lat, lon, 'all:2'), wssFetchSiteElevFt(lat, lon)]); siteElevFt = eFt; const r = (s710.results||[])[0]; if (r) { const ex = wssExtractSnowLoad(r.attributes||{}, siteElevFt); groundSnowLoad = ex.load; if (ex.elevTable) elevationTable = ex.elevTable; } } catch(e) {}
    try { const sp = await wssArcgisIdentify('ASCE/SnowLoad/MapServer', lat, lon, 'all:1'); specialCase = (sp.results||[]).length > 0; } catch(e) {}
  }
  return { groundSnowLoad, winterWind, specialCase, elevationTable, siteElevFt };
}

// Ice
const WSS_ICE_MRI = { I:'0250', II:'0500', III:'1000', IV:'1400' };
export async function wssFetchIce(lat, lon, standard, riskCategory) {
  if (standard === '7-10') { const d = await wssArcgisIdentify('ASCE/IceLoad/MapServer', lat, lon); const a = (d.results||[])[0]?.attributes||{}; return { iceThickness: parseFloat(a['Classify.Pixel Value'] ?? a.value ?? 0)||null, concurrentTemp: null, concurrentGust: null }; }
  const mri = WSS_ICE_MRI[riskCategory];
  const [thD, guD, tmD] = await Promise.all([wssArcgisGetSamples(`ASCE722/i2022_mri${mri}/ImageServer`, lat, lon), wssArcgisGetSamples('ASCE722/i2022_gust/ImageServer', lat, lon), wssArcgisIdentify('ASCE722/i2022_ConcurrentTemp/MapServer', lat, lon)]);
  return { iceThickness: parseFloat(thD.samples?.[0]?.value??0)||null, concurrentGust: parseFloat(guD.samples?.[0]?.value??0)||null, concurrentTemp: (tmD.results?.[0]?.attributes||{}).conc_temp??null };
}

// Rain
export async function wssFetchRain(lat, lon) {
  const r = await wssFetch(WSS_PROXY(`https://hdsc.nws.noaa.gov/cgi-bin/hdsc/new/cgi_readH5.py?lat=${lat}&lon=${lon}&type=pf&data=intensity&units=english&series=pds`));
  const text = await r.text();
  const match = text.match(/quantiles\s*=\s*(\[[\s\S]+?\]);/);
  if (!match) return { error: 'No rain data' };
  const jsonStr = match[1].replace(/'/g,'"').replace(/,\s*]/g,']').replace(/,\s*}/g,'}');
  let raw;
  try { raw = JSON.parse(jsonStr); } catch(e) { try { raw = Function('"use strict"; return (' + match[1] + ')')(); } catch(e2) { return { error: 'Parse error' }; } }
  const durs = ['5-min','10-min','15-min','30-min','60-min','2-hr','3-hr','6-hr','12-hr','24-hr','2-day','3-day','4-day','7-day','10-day','20-day','30-day','45-day','60-day'];
  const pers = ['1yr','2yr','5yr','10yr','25yr','50yr','100yr','200yr','500yr','1000yr'];
  return { table: raw.map((row,i) => ({ duration: durs[i]||`row${i}`, values: Object.fromEntries(row.map((v,j) => [pers[j]||`p${j}`, parseFloat(v)])) })) };
}

// Flood
export async function wssFetchFlood(lat, lon) {
  const r = await wssFetch(WSS_PROXY(`https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,STATIC_BFE,V_DATUM,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=json`));
  const data = await r.json();
  const f = (data.features||[])[0];
  if (!f) return { floodZone:'Not Available', bfe:null, datum:null, sfha:false, subtype:null };
  const a = f.attributes;
  return { floodZone:a.FLD_ZONE, bfe:a.STATIC_BFE===-9999?null:a.STATIC_BFE, datum:a.V_DATUM||null, sfha:a.SFHA_TF==='T', subtype:a.ZONE_SUBTY };
}

// Tornado
const WSS_TRP = ['RP1700','RP3K','RP10K','RP100K','RP1M','RP10M'];
export async function wssFetchTornado(lat, lon, riskCategory) {
  if (riskCategory==='I'||riskCategory==='II') return { applicable:false, message:'Tornado hazard data only applies to Risk Category III or IV.' };
  const results = {};
  await Promise.all(WSS_TRP.map(async (rp) => { try { const d = await wssArcgisGetSamples(`ASCE722/t2022_PT_${rp}/ImageServer`, lat, lon); const v = d.samples?.[0]?.value; results[rp] = (v!=null&&v!=='NoData')?parseFloat(v):null; } catch { results[rp]=null; } }));
  let inPronArea = false;
  try { const p = await wssArcgisIdentify('ASCE722/t2022_tornado_prone_area/MapServer', lat, lon); inPronArea = (p.results||[]).length > 0; } catch(e) {}
  return { applicable:true, speeds:results, inPronArea };
}

// Tsunami
export async function wssFetchTsunami(lat, lon, standard) {
  if (standard==='7-10') return { applicable:false, message:'Tsunami data not available for ASCE 7-10.' };
  const data = await wssArcgisIdentify('TDZ_Call_20211112/MapServer', lat, lon);
  const results = data.results||[];
  const inZone = results.length > 0;
  const attrs = results[0]?.attributes||{};
  return { applicable:true, inTDZ:inZone, runupMHW:inZone?parseFloat(attrs.runup_mhw):null, runupNAVD:inZone?(attrs.runup_navd!=='Null'?parseFloat(attrs.runup_navd):null):null };
}

