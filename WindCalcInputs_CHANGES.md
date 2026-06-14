# WindCalcInputs.jsx — Three Changes to Apply

## Change 1 of 3: Add import at the top of the file
Add this line immediately after the existing `import { WSSLookup }` line (line 12):

```js
import { windGeneratePDF } from './windReport.js';
```

So the top of the file reads:
```js
import { WSSLookup } from './wss/WSSLookup.jsx';
import { windGeneratePDF } from './windReport.js';
```

---

## Change 2 of 3: Add modal state variables
Inside `WindCalcInputs`, after the existing useState declarations
(look for the block that has `const [tab, setTab]`, `const [dirSub, setDirSub]`, etc.)
add these two lines:

```js
  const [printOpen, setPrintOpen] = useState(false);
  const [printTabs, setPrintTabs] = useState(['qz','dir','lr','cc','ob','rw','ow']);
```

---

## Change 3 of 3: Add Print button + modal JSX
Find this comment in the JSX (it's in the sticky header, right after the TABS.map block
that renders the tab buttons):

```jsx
          {/* Sub-tab row — only for tabs that have sub-tabs */}
```

Immediately BEFORE that comment, add the Print button:

```jsx
            <button
              onClick={() => setPrintOpen(true)}
              style={{ marginLeft:'auto', padding:'4px 10px', fontSize:10, fontWeight:700,
                letterSpacing:'0.05em', textTransform:'uppercase',
                background:'#0f172a', border:'1px solid #334155',
                color:'#94a3b8', borderRadius:4, cursor:'pointer' }}>
              &#128438; Print Report
            </button>
```

Then, immediately AFTER the entire sticky header closing `</div>` (the one that closes
the `sticky top-0 z-20` div), add the modal. Search for:

```jsx
        {/* content */}
```

And insert this block BETWEEN the sticky header's closing `</div>` and `{/* content */}`:

```jsx
        {/* ── Print Report Modal ── */}
        {printOpen ? (
          <div style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(0,0,0,0.6)',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:8,
              padding:'24px 28px', width:360, boxShadow:'0 8px 32px rgba(0,0,0,0.6)' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0', marginBottom:16 }}>
                Print Wind Load Report
              </div>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:12 }}>
                Project inputs are always included. Select tabs to print:
              </div>
              {[
                { id:'qz',  label:'Velocity Pressure (qz)',    ok: !!qzR },
                { id:'dir', label:'MWFRS Directional',         ok: !!dirR },
                { id:'lr',  label:'MWFRS Low-Rise',            ok: !!(lrR && lrR.ok) },
                { id:'cc',  label:'C&C',                       ok: !!ccR },
                { id:'ob',  label:'Open Building',             ok: !!(obR && obR.ok) },
                { id:'rw',  label:'Rooftop Structures',        ok: !!rwR },
                { id:'ow',  label:'Other Structures',          ok: !!(owR && owR.ok) },
              ].map((t) => (
                <label key={t.id} style={{ display:'flex', alignItems:'center', gap:8,
                  padding:'5px 0', cursor: t.ok ? 'pointer' : 'default',
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
                    style={{ accentColor:'#38bdf8', width:13, height:13 }} />
                  <span style={{ fontSize:12, color: t.ok ? '#cbd5e1' : '#475569' }}>
                    {t.label}
                    {!t.ok
                      ? <span style={{ marginLeft:6, fontSize:10, color:'#475569' }}>
                          (no results)
                        </span>
                      : null}
                  </span>
                </label>
              ))}
              <div style={{ display:'flex', gap:8, marginTop:20 }}>
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
                  style={{ flex:1, padding:'7px 0', fontSize:11, fontWeight:700,
                    letterSpacing:'0.05em', textTransform:'uppercase',
                    background: printTabs.length ? '#0ea5e9' : '#1e293b',
                    color: printTabs.length ? '#fff' : '#475569',
                    border:'none', borderRadius:4, cursor: printTabs.length ? 'pointer' : 'default' }}>
                  Generate PDF
                </button>
                <button
                  onClick={() => setPrintOpen(false)}
                  style={{ padding:'7px 14px', fontSize:11, fontWeight:600,
                    background:'transparent', color:'#64748b',
                    border:'1px solid #334155', borderRadius:4, cursor:'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
```

---

## Variables used in the modal
The modal references these variables that are already in scope inside WindCalcInputs:
- `proj`, `geo`, `kd`, `kztIn`, `gustIn`, `shared` — all existing state/computed values
- `qzR`, `dirR`, `lrR`, `ccR`, `obR`, `rwR`, `owR` — all existing result states
- `printOpen`, `setPrintOpen`, `printTabs`, `setPrintTabs` — added in Change 2

All variables are in scope. No other changes needed anywhere in the file.

---

## esbuild JSX reminder
The modal JSX follows the existing convention. The `{printOpen ? (` block
uses the approved pattern — the closing tag is on its own line, not on the same
line as the ternary.
