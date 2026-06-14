import { useState } from "react";
import WindCalcInputs from './WindCalcInputs.jsx';

// ─── ROOT APP ────────────────────────────────────────────────────────────────
export default function WindSuiteApp() {
  const [sideTab, setSideTab] = useState('wss');
  const [wssData, setWssData] = useState(null);

  // ── WSS lifted state ──────────────────────────────────────────────────────
  const [wssAddress,     setWssAddress]     = useState('');
  const [wssLat,         setWssLat]         = useState('');
  const [wssLon,         setWssLon]         = useState('');
  const [wssLocMode,     setWssLocMode]     = useState('address');
  const [wssStandard,    setWssStandard]    = useState('7-22');
  const [wssRiskCat,     setWssRiskCat]     = useState('II');
  const [wssSiteClass,   setWssSiteClass]   = useState('D');
  const [wssResolvedAddr,setWssResolvedAddr]= useState('');
  const [wssResolvedLat, setWssResolvedLat] = useState(null);
  const [wssResolvedLon, setWssResolvedLon] = useState(null);
  const [wssSiteElevFt,  setWssSiteElevFt]  = useState(null);
  const [wssResults,     setWssResults]     = useState({});
  const [wssStatuses,    setWssStatuses]    = useState({});

  const wssState = {
    address: wssAddress, setAddress: setWssAddress,
    lat: wssLat,         setLat: setWssLat,
    lon: wssLon,         setLon: setWssLon,
    locMode: wssLocMode, setLocMode: setWssLocMode,
    standard: wssStandard,   setStandard: setWssStandard,
    riskCategory: wssRiskCat, setRiskCategory: setWssRiskCat,
    siteClass: wssSiteClass,  setSiteClass: setWssSiteClass,
    resolvedAddr: wssResolvedAddr, setResolvedAddr: setWssResolvedAddr,
    resolvedLat: wssResolvedLat,   setResolvedLat:  setWssResolvedLat,
    resolvedLon: wssResolvedLon,   setResolvedLon:  setWssResolvedLon,
    siteElevFt: wssSiteElevFt,     setSiteElevFt:   setWssSiteElevFt,
    results: wssResults,   setResults: setWssResults,
    statuses: wssStatuses, setStatuses: setWssStatuses,
  };

  function handleWssResult(data) {
    setWssData(data);
    // Stay on WSS tab so user can see results; values populate Wind Inputs silently
  }

  return (
    <WindCalcInputs
      wssData={wssData}
      wssState={wssState}
      sideTab={sideTab}
      onSideTab={setSideTab}
      onWssResult={handleWssResult}
    />
  );
}
