import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { T } from '../lib/theme.js'
import { Card, PageHeader, Btn, Input, Alert } from '../components/UI.jsx'

const PERM_CONFIG = [
  { key:'canExportSlip',    label:'Export Salary Slips',    desc:'Generate and download PDF salary slips' },
  { key:'canCloseMonth',    label:'Close Month',            desc:'Finalise monthly salary records' },
  { key:'canChangeWage',    label:'Change Employee Wage',   desc:'Update daily wage rate for any employee' },
  { key:'canManageLoan',    label:'Manage Loans',           desc:'Add loans, update EMIs, close loans' },
  { key:'canManageAdvance', label:'Manage Advances',        desc:'Record cash advances against salary' },
  { key:'canManualPunch',   label:'Manual Punch Entry',     desc:'Add or correct attendance punch records' },
]

function Toggle({ checked, onChange }) {
  return (
    <div onClick={()=>onChange(!checked)} style={{
      width:44, height:24, borderRadius:T.full, cursor:'pointer', position:'relative',
      background: checked ? T.brand : T.n300, transition:'background .2s',
      flexShrink:0,
    }}>
      <div style={{
        position:'absolute', top:2, left: checked?20:2, width:20, height:20,
        borderRadius:'50%', background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,.2)',
        transition:'left .2s',
      }}/>
    </div>
  )
}

export default function SettingsPage() {
  const { state, dispatch } = useStore()
  const { currentUser, adminPerms, config } = state

  const [perms,   setPerms]   = useState({ ...adminPerms })
  const [geoLat,  setGeoLat]  = useState(String(config.geofenceLat))
  const [geoLng,  setGeoLng]  = useState(String(config.geofenceLng))
  const [geoR,    setGeoR]    = useState(String(config.geofenceRadius))
  const [toast,   setToast]   = useState(null)

  const showToast = m => { setToast(m); setTimeout(()=>setToast(null),2500) }

  if (currentUser.role !== 'owner') {
    return (
      <div style={{ padding:'60px 24px', textAlign:'center', color:T.n400 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <div style={{ fontSize:18, fontWeight:700, color:T.n600 }}>Owner access only</div>
      </div>
    )
  }

  const savePerms = () => {
    dispatch({ type:'SET_ADMIN_PERMS', perms })
    showToast('Permissions saved')
  }

  const saveGeo = () => {
    dispatch({ type:'UPDATE_CONFIG', config:{ geofenceLat:Number(geoLat), geofenceLng:Number(geoLng), geofenceRadius:Number(geoR) }})
    showToast('Geofence updated')
  }

  return (
    <div>
      {toast && (
        <div style={{ position:'fixed',bottom:28,left:'50%',transform:'translateX(-50%)',background:T.green,color:'#fff',padding:'11px 22px',borderRadius:T.r12,fontWeight:700,fontSize:T.base,zIndex:900,boxShadow:T.shadowMd }}>
          ✓ {toast}
        </div>
      )}

      <PageHeader title="Settings" sub="System configuration and admin permissions"/>

      {/* Geofence */}
      <Card style={{ marginBottom:16 }}>
        <div style={{ fontSize:T.md, fontWeight:800, color:T.n800, marginBottom:4 }}>Geofence Settings</div>
        <div style={{ fontSize:T.sm, color:T.n400, marginBottom:16 }}>Define the factory location and allowed radius for punch-in/out</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
          <Input label="Factory Latitude"  value={geoLat} onChange={setGeoLat} type="number"/>
          <Input label="Factory Longitude" value={geoLng} onChange={setGeoLng} type="number"/>
          <Input label="Radius (meters)"   value={geoR}   onChange={setGeoR}   type="number"
            note="Recommended: 300–400m for factories"/>
        </div>
        <Alert type="info">
          Current: {config.geofenceLat}, {config.geofenceLng} · {config.geofenceRadius}m radius.
          Open Google Maps, long-press your factory entrance, and read the coordinates to verify accuracy.
        </Alert>
        <div style={{ marginTop:16 }}>
          <Btn onClick={saveGeo}>Update Geofence</Btn>
        </div>
      </Card>

      {/* Admin permissions */}
      <Card>
        <div style={{ fontSize:T.md, fontWeight:800, color:T.n800, marginBottom:4 }}>Admin Permissions</div>
        <div style={{ fontSize:T.sm, color:T.n400, marginBottom:20 }}>
          Control what users with the <strong>Admin</strong> role can do. Owners always have full access.
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {PERM_CONFIG.map(p => (
            <label key={p.key} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between', gap:16,
              padding:'14px 16px', borderRadius:T.r12, border:`1.5px solid ${perms[p.key]?T.brandBorder:T.border}`,
              cursor:'pointer', background: perms[p.key]?T.brandLight:'transparent', transition:'all .15s',
            }}>
              <div>
                <div style={{ fontSize:T.base, fontWeight:700, color:T.n700 }}>{p.label}</div>
                <div style={{ fontSize:T.sm, color:T.n400, marginTop:2 }}>{p.desc}</div>
              </div>
              <Toggle checked={!!perms[p.key]} onChange={v => setPerms(p2=>({...p2,[p.key]:v}))}/>
            </label>
          ))}
        </div>
        <div style={{ marginTop:20 }}>
          <Btn onClick={savePerms}>Save Permissions</Btn>
        </div>
      </Card>

      {/* Migration note */}
      <Card style={{ marginTop:16, background:T.n50 }}>
        <div style={{ fontSize:T.md, fontWeight:800, color:T.n800, marginBottom:8 }}>Migration Checklist</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[
            { done:true,  text:'All bug fixes applied (overlap merge, carry forward, loan tracking)' },
            { done:true,  text:'deductMonth field on advances (FIX #3)' },
            { done:true,  text:'dailyWageUsed stored in MonthClose (FIX #2)' },
            { done:true,  text:'Loan EMI pre-filled in Close Month (FIX #11)' },
            { done:true,  text:'Active salary period concept (FIX #8)' },
            { done:true,  text:'Geofence radius 350m + maximumAge:0 (geofence fix)' },
            { done:false, text:'Connect to Supabase (replace seed.js with real queries)' },
            { done:false, text:'Add Supabase Auth (replace PIN comparison with JWT)' },
            { done:false, text:'Deploy to Vercel (push to GitHub, connect repo)' },
            { done:false, text:'Add Supabase Realtime for live dashboard updates' },
            { done:false, text:'Generate SQL migration from seed.js schema' },
          ].map((item,i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', fontSize:T.sm, color: item.done?T.green:T.n500 }}>
              <span style={{ flexShrink:0, fontWeight:800 }}>{item.done?'✓':'○'}</span>
              {item.text}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
