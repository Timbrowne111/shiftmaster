import { useState, useEffect, useMemo, useCallback } from "react";
import { dbGet, dbSet, authLogin, authCreateUser, authSendReset, authChangePassword, authLogout } from './firebase.js';

// ── Constants ──────────────────────────────────────────────────────────
const DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const CAO={maxShift:10,maxWeek:45,maxConsec:7,minRest:11,breakTh:5.5,breakMins:30};
const CT=[{id:"fulltime",label:"Full-time",icon:"🟢",color:"#27ae60"},{id:"parttime",label:"Part-time",icon:"🟡",color:"#f59e0b"},{id:"extra",label:"Extra/Flex",icon:"🔴",color:"#c0392b"}];
const SEGS_DEFAULT=[{id:"mice",name:"MICE",color:"#6366f1"},{id:"leisure",name:"Leisure",color:"#06b6d4"},{id:"business",name:"Business",color:"#f59e0b"},{id:"group",name:"Group",color:"#10b981"}];
const REQ_TYPES=[{id:"holiday",label:"Holiday",icon:"🏖️",color:"#06b6d4"},{id:"day_off",label:"Day Off",icon:"📅",color:"#8b5cf6"},{id:"schedule_change",label:"Schedule Change",icon:"🔄",color:"#f59e0b"}];

// ── Palette ────────────────────────────────────────────────────────────
const P={
  navy:"#1e1145",navyL:"#2d1b6e",navyM:"#3a2580",
  acc:"#e63946",accDim:"rgba(230,57,70,0.08)",accSoft:"rgba(230,57,70,0.15)",
  cream:"#faf0f1",wh:"#ffffff",
  red:"#dc2626",redL:"rgba(220,38,38,0.08)",
  grn:"#16a34a",grnL:"rgba(22,163,74,0.08)",
  org:"#ea580c",orgL:"rgba(234,88,12,0.08)",
  blu:"#2563eb",bluL:"rgba(37,99,235,0.08)",
  pur:"#7c3aed",purL:"rgba(124,58,237,0.08)",
  gry:"#94a3b8",gryL:"#f1f5f9",gryM:"#e2e8f0",gryD:"#475569",
  bg:"#f8fafc",card:"#ffffff",
  // Schedule cell colors
  cellFull:"rgba(22,163,74,0.06)",cellPartial:"rgba(234,88,12,0.06)",cellEmpty:"rgba(220,38,38,0.05)",
};

// ── Utilities ──────────────────────────────────────────────────────────
const gid=()=>Math.random().toString(36).substr(2,9);
const euro=v=>`€${Number(v).toFixed(2)}`;
function weekDatesFor(o=0){const n=new Date(),d=n.getDay(),diff=n.getDate()-d+(d===0?-6:1)+o*7,m=new Date(n.setDate(diff));m.setHours(0,0,0,0);return DAYS.map((_,i)=>{const x=new Date(m);x.setDate(m.getDate()+i);return x;});}
function fD(d){return `${d.getDate()}/${d.getMonth()+1}`;}
function sDur(s,e){const[sh,sm]=s.split(":").map(Number),[eh,em]=e.split(":").map(Number);let m=(eh*60+em)-(sh*60+sm);if(m<0)m+=1440;return m/60;}
function tMin(t){const[h,m]=t.split(":").map(Number);return h*60+m;}

// ── CAO Check ──────────────────────────────────────────────────────────
function caoCheck(sid,asgn,defs,di){const w=[],sa=asgn.filter(a=>a.staffId===sid),ta=sa.filter(a=>a.dayIndex===di);let th=0;ta.forEach(a=>{const d=defs.find(s=>s.id===a.shiftId);if(d)th+=sDur(d.startTime,d.endTime);});if(th>CAO.maxShift)w.push({type:"error",msg:`Max ${CAO.maxShift}h/day exceeded (${th.toFixed(1)}h)`});if(th>CAO.breakTh)w.push({type:"info",msg:`${CAO.breakMins}min break required`});let wh=0;sa.forEach(a=>{const d=defs.find(s=>s.id===a.shiftId);if(d)wh+=sDur(d.startTime,d.endTime);});if(wh>CAO.maxWeek)w.push({type:"error",msg:`Max ${CAO.maxWeek}h/week exceeded (${wh.toFixed(1)}h)`});const wd=new Set(sa.map(a=>a.dayIndex));let mc=0,c=0;for(let i=0;i<7;i++){if(wd.has(i)){c++;mc=Math.max(mc,c);}else c=0;}if(mc>CAO.maxConsec)w.push({type:"error",msg:`${mc} consecutive days (max ${CAO.maxConsec})`});if(di>0){const pv=sa.filter(a=>a.dayIndex===di-1);if(pv.length&&ta.length){let le=0;pv.forEach(a=>{const d=defs.find(s=>s.id===a.shiftId);if(d)le=Math.max(le,tMin(d.endTime));});let es=1440;ta.forEach(a=>{const d=defs.find(s=>s.id===a.shiftId);if(d)es=Math.min(es,tMin(d.startTime));});const r=(1440-le+es)/60;if(r<CAO.minRest)w.push({type:"error",msg:`Only ${r.toFixed(1)}h rest (min ${CAO.minRest}h)`});}}return w;}

// ── Payroll ────────────────────────────────────────────────────────────
const NLP={b1R:.3697,b1M:75518,b2R:.4950,ahk:3362,ak:5532,zvw:.0668,wwL:.0264,wwH:.0764,wia:.0711,whk:.005,vak:.08,penEE:.055,penER:.11};
function calcPay(staff,hrs){const rate=Number(staff.hourlyRate)||13.68,h=Number(hrs)||0,wG=h*rate,aG=wG*52,vak=aG*NLP.vak,tax=aG+vak,it=tax<=NLP.b1M?tax*NLP.b1R:NLP.b1M*NLP.b1R+(tax-NLP.b1M)*NLP.b2R,nit=Math.max(0,it-Math.min(it,NLP.ahk+NLP.ak)),pEE=aG*NLP.penEE,aN=aG-nit-pEE,isFlex=staff.contractType==="extra",ww=aG*(isFlex?NLP.wwH:NLP.wwL),erTot=aG*NLP.zvw+ww+aG*NLP.wia+aG*NLP.whk+aG*NLP.penER+vak,tcA=aG+erTot;return {rate,hrs:h,wG,mG:wG*52/12,aG,vak,nit,nitM:nit/12,pEE,pEEM:pEE/12,aN,mN:aN/12,wN:aN/52,erTot,tcA,tcM:tcA/12,tcW:tcA/52,cph:h>0?tcA/52/h:0};}

// ── Recommendations ────────────────────────────────────────────────────
function genRecs(staffList,asgn,depts){try{const allD=depts.flatMap(d=>d.outlets.flatMap(o=>o.shifts)),sH={};staffList.forEach(s=>{let h=0;asgn.filter(a=>a.staffId===s.id).forEach(a=>{const d=allD.find(x=>x.id===a.shiftId);if(d)h+=sDur(d.startTime,d.endTime);});sH[s.id]=h;});const ft=staffList.filter(s=>s.contractType==="fulltime"),pt=staffList.filter(s=>s.contractType==="parttime"),ex=staffList.filter(s=>s.contractType==="extra");const tFTS=ft.reduce((s,x)=>s+(sH[x.id]||0),0),tPTS=pt.reduce((s,x)=>s+(sH[x.id]||0),0),tEXS=ex.reduce((s,x)=>s+(sH[x.id]||0),0),tS=tFTS+tPTS+tEXS;return {summary:{totalFTCapacity:ft.reduce((s,x)=>s+(x.contractHours||38),0),totalFTScheduled:tFTS,totalPTScheduled:tPTS,totalExScheduled:tEXS,totalScheduled:tS,ftRatio:tS>0?Math.round(tFTS/tS*100):0},staffHours:sH};}catch{return {summary:{totalFTCapacity:0,totalFTScheduled:0,totalPTScheduled:0,totalExScheduled:0,totalScheduled:0,ftRatio:0},staffHours:{}};}}

// ══════════════════════════════════════════════════════════════════════
// ── TEST HOTEL DEMO DATA ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
function buildTestHotel(){
  const mk=(sh,d,st)=>({id:gid(),shiftId:sh,dayIndex:d,staffId:st});
  const staff=[
    {id:"s-emma",name:"Emma Bakker",email:"emma@test.com",outletId:"fo-desk",contractType:"fulltime",contractHours:38,hourlyRate:16.50},
    {id:"s-daan",name:"Daan Smit",email:"daan@test.com",outletId:"fo-desk",contractType:"fulltime",contractHours:38,hourlyRate:15.80},
    {id:"s-lisa",name:"Lisa Jansen",email:"",outletId:"fo-desk",contractType:"fulltime",contractHours:38,hourlyRate:17.20},
    {id:"s-max",name:"Max Mulder",email:"",outletId:"fo-desk",contractType:"parttime",contractHours:24,hourlyRate:14.50},
    {id:"s-soph",name:"Sophie Visser",email:"",outletId:"fo-desk",contractType:"extra",contractHours:0,hourlyRate:13.68},
    {id:"s-tom",name:"Tom de Boer",email:"tom@test.com",outletId:"fb-rest",contractType:"fulltime",contractHours:38,hourlyRate:15.50},
    {id:"s-anna",name:"Anna Meijer",email:"",outletId:"fb-rest",contractType:"fulltime",contractHours:38,hourlyRate:15.50},
    {id:"s-luca",name:"Luca Peters",email:"",outletId:"fb-rest",contractType:"fulltime",contractHours:38,hourlyRate:14.80},
    {id:"s-julia",name:"Julia Hendriks",email:"",outletId:"fb-rest",contractType:"fulltime",contractHours:38,hourlyRate:14.80},
    {id:"s-finn",name:"Finn de Groot",email:"",outletId:"fb-rest",contractType:"parttime",contractHours:24,hourlyRate:13.68},
    {id:"s-mila",name:"Mila Scholten",email:"",outletId:"fb-rest",contractType:"parttime",contractHours:20,hourlyRate:13.68},
    {id:"s-sem",name:"Sem Willems",email:"",outletId:"fb-rest",contractType:"extra",contractHours:0,hourlyRate:13.68},
    {id:"s-bram",name:"Bram Kuijpers",email:"bram@test.com",outletId:"fb-bar",contractType:"fulltime",contractHours:38,hourlyRate:16.00},
    {id:"s-eva",name:"Eva Dijkstra",email:"",outletId:"fb-bar",contractType:"fulltime",contractHours:38,hourlyRate:15.20},
    {id:"s-noa",name:"Noa Vermeer",email:"",outletId:"fb-bar",contractType:"parttime",contractHours:20,hourlyRate:13.68},
    {id:"s-liam",name:"Liam Brouwer",email:"",outletId:"fb-rs",contractType:"fulltime",contractHours:38,hourlyRate:14.50},
    {id:"s-fleur",name:"Fleur van den Berg",email:"",outletId:"fb-rs",contractType:"parttime",contractHours:24,hourlyRate:13.68},
    {id:"s-jesse",name:"Jesse Dekker",email:"",outletId:"fb-banq",contractType:"fulltime",contractHours:38,hourlyRate:15.80},
    {id:"s-roos",name:"Roos van Leeuwen",email:"",outletId:"fb-banq",contractType:"fulltime",contractHours:38,hourlyRate:15.50},
    {id:"s-tijn",name:"Tijn Kok",email:"",outletId:"fb-banq",contractType:"parttime",contractHours:20,hourlyRate:13.68},
    {id:"s-amber",name:"Amber Schouten",email:"",outletId:"fb-banq",contractType:"extra",contractHours:0,hourlyRate:13.68},
  ];
  const departments=[
    {id:"fo",name:"Front Office",icon:"🛎️",outlets:[{id:"fo-desk",name:"Front Desk",shifts:[
      {id:"fo-early",name:"Early",startTime:"06:00",endTime:"14:30",staffNeeded:2},
      {id:"fo-late",name:"Late",startTime:"14:00",endTime:"22:30",staffNeeded:2},
      {id:"fo-night",name:"Night",startTime:"22:00",endTime:"06:30",staffNeeded:1}
    ],captureRates:{},handlingCapacity:{}}]},
    {id:"fb",name:"Food & Beverage",icon:"🍽️",outlets:[
      {id:"fb-rest",name:"Restaurant",shifts:[
        {id:"re-brkfst",name:"Breakfast",startTime:"06:00",endTime:"11:00",staffNeeded:3},
        {id:"re-lunch",name:"Lunch",startTime:"11:00",endTime:"15:30",staffNeeded:3},
        {id:"re-dinner",name:"Dinner",startTime:"17:00",endTime:"23:00",staffNeeded:4}
      ],captureRates:{},handlingCapacity:{}},
      {id:"fb-bar",name:"Bar",shifts:[
        {id:"ba-day",name:"Day",startTime:"10:00",endTime:"18:00",staffNeeded:1},
        {id:"ba-eve",name:"Evening",startTime:"17:00",endTime:"01:00",staffNeeded:2}
      ],captureRates:{},handlingCapacity:{}},
      {id:"fb-rs",name:"Room Service",shifts:[
        {id:"rs-morn",name:"Morning",startTime:"06:30",endTime:"14:00",staffNeeded:1},
        {id:"rs-eve",name:"Evening",startTime:"14:00",endTime:"22:00",staffNeeded:1}
      ],captureRates:{},handlingCapacity:{}},
      {id:"fb-banq",name:"Banqueting",shifts:[
        {id:"bq-day",name:"Day",startTime:"08:00",endTime:"16:00",staffNeeded:2},
        {id:"bq-eve",name:"Eve",startTime:"16:00",endTime:"00:00",staffNeeded:2}
      ],captureRates:{},handlingCapacity:{}},
    ]},
  ];
  const a=[];const m=(sh,d,st)=>a.push(mk(sh,d,st));
  [0,1,2,3,4].forEach(d=>{m("fo-early",d,"s-emma");m("fo-early",d,"s-daan");});m("fo-early",5,"s-daan");m("fo-early",5,"s-max");m("fo-early",6,"s-max");
  m("fo-late",0,"s-lisa");m("fo-late",0,"s-max");m("fo-late",1,"s-lisa");m("fo-late",1,"s-max");m("fo-late",2,"s-lisa");m("fo-late",2,"s-soph");m("fo-late",3,"s-lisa");m("fo-late",3,"s-soph");m("fo-late",4,"s-lisa");m("fo-late",4,"s-soph");m("fo-late",5,"s-emma");m("fo-late",5,"s-soph");m("fo-late",6,"s-emma");
  m("fo-night",0,"s-max");m("fo-night",1,"s-soph");m("fo-night",2,"s-max");m("fo-night",3,"s-soph");m("fo-night",4,"s-soph");m("fo-night",5,"s-lisa");
  [0,1,2,3,4].forEach(d=>{m("re-brkfst",d,"s-tom");m("re-brkfst",d,"s-anna");m("re-brkfst",d,"s-finn");});m("re-brkfst",5,"s-tom");m("re-brkfst",5,"s-finn");m("re-brkfst",5,"s-sem");m("re-brkfst",6,"s-anna");m("re-brkfst",6,"s-sem");
  [0,1,2,3,4].forEach(d=>{m("re-lunch",d,"s-luca");m("re-lunch",d,"s-julia");m("re-lunch",d,"s-mila");});m("re-lunch",5,"s-luca");m("re-lunch",5,"s-mila");m("re-lunch",6,"s-julia");m("re-lunch",6,"s-mila");m("re-lunch",6,"s-sem");
  [0,1,2,3,4].forEach(d=>{m("re-dinner",d,"s-tom");m("re-dinner",d,"s-anna");m("re-dinner",d,"s-luca");m("re-dinner",d,"s-julia");});m("re-dinner",5,"s-tom");m("re-dinner",5,"s-luca");m("re-dinner",5,"s-julia");m("re-dinner",5,"s-finn");m("re-dinner",6,"s-anna");m("re-dinner",6,"s-luca");m("re-dinner",6,"s-finn");
  [0,1,2,3,4].forEach(d=>m("ba-day",d,"s-bram"));m("ba-day",5,"s-noa");m("ba-day",6,"s-noa");
  [0,1,2,3,4].forEach(d=>{m("ba-eve",d,"s-eva");m("ba-eve",d,"s-noa");});m("ba-eve",5,"s-bram");m("ba-eve",5,"s-eva");m("ba-eve",6,"s-bram");
  [0,1,2,3,4].forEach(d=>m("rs-morn",d,"s-liam"));m("rs-morn",5,"s-fleur");m("rs-morn",6,"s-fleur");
  [0,1,2].forEach(d=>m("rs-eve",d,"s-fleur"));[3,4,5].forEach(d=>m("rs-eve",d,"s-liam"));
  [0,1,2,3,4].forEach(d=>{m("bq-day",d,"s-jesse");m("bq-day",d,"s-roos");});m("bq-day",5,"s-jesse");m("bq-day",5,"s-tijn");
  [0,1,2,3].forEach(d=>{m("bq-eve",d,"s-roos");m("bq-eve",d,"s-tijn");});m("bq-eve",4,"s-jesse");m("bq-eve",4,"s-amber");m("bq-eve",5,"s-roos");m("bq-eve",5,"s-amber");
  return {
    id:"test",name:"Test Hotel",
    hotelManager:{name:"Sarah van Dijk",email:"sarah@test.com",password:"manager1"},
    deptManagers:[{id:gid(),name:"Jan de Vries",email:"jan@test.com",password:"manager1",deptIds:["fb"]}],
    staffLogin:{username:"staff",password:"staff123"},
    staff,departments,assignments:a,segments:SEGS_DEFAULT,
    forecast:{fo:{},fb:{}},requests:[],reviews:[],warnings:[],
    lastLogin:new Date().toISOString(),createdAt:new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════
// ── UI COMPONENTS ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

function Badge({children,color=P.gry,bg=P.gryL}){
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:bg,color,letterSpacing:0.2}}>{children}</span>;
}

function WeekNav({wo,set,wd}){
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.1)",padding:"6px 12px",borderRadius:10}}>
      <button style={S.wBtn} onClick={()=>set(wo-1)}>‹</button>
      <span style={{fontSize:14,fontWeight:600,color:P.wh,minWidth:150,textAlign:"center"}}>
        {fD(wd[0])} — {fD(wd[6])}
      </span>
      <button style={S.wBtn} onClick={()=>set(wo+1)}>›</button>
      {wo!==0&&<button style={{...S.wBtn,fontSize:11,padding:"4px 12px"}} onClick={()=>set(0)}>Today</button>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── SCHEDULE GRID (clean UX redesign) ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
function ScheduleGrid({outlet,asgn,setAsgn,staff,wd,allDefs}){
  const[tt,setTt]=useState(null);
  if(!outlet.shifts.length) return (
    <div style={{padding:48,textAlign:"center"}}>
      <div style={{fontSize:40,marginBottom:12}}>📋</div>
      <p style={{color:P.gryD,fontSize:15,fontWeight:600}}>No shifts defined for {outlet.name}</p>
      <p style={{color:P.gry,fontSize:13}}>Go to ⚙️ Settings to add shift times</p>
    </div>
  );

  return (
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:13}}>
        <thead>
          <tr>
            <th style={S.schedTh}></th>
            {DAYS.map((d,i)=> (
              <th key={d} style={{...S.schedTh,textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:700}}>{d}</div>
                <div style={{fontSize:11,fontWeight:400,color:P.gry}}>{fD(wd[i])}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {outlet.shifts.map((shift,si)=> {
            const dur=sDur(shift.startTime,shift.endTime);
            return (
              <tr key={shift.id}>
                {/* Shift label */}
                <td style={{...S.schedTdLabel,borderTop:si===0?"none":undefined}}>
                  <div style={{fontWeight:700,fontSize:14,color:P.navy,marginBottom:2}}>{shift.name}</div>
                  <div style={{fontSize:12,color:P.gry}}>{shift.startTime} – {shift.endTime}</div>
                  <div style={{fontSize:11,color:P.gry,marginTop:2}}>
                    {dur.toFixed(1)}h · min {shift.staffNeeded} staff
                  </div>
                </td>
                {/* Day cells */}
                {DAYS.map((_,di)=>{
                  const assigned=asgn.filter(a=>a.shiftId===shift.id&&a.dayIndex===di);
                  const available=staff.filter(s=>!assigned.find(a=>a.staffId===s.id));
                  const count=assigned.length;
                  const needed=shift.staffNeeded;
                  const isFull=count>=needed;
                  const isEmpty=count===0;
                  const bg=isFull?P.cellFull:isEmpty?P.cellEmpty:P.cellPartial;

                  return (
                    <td key={di} style={{...S.schedTd,background:bg,borderTop:si===0?"none":undefined}}>
                      {/* Coverage bar */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:700,color:isFull?P.grn:isEmpty?P.red:P.org}}>
                          {count}/{needed}
                        </span>
                        {!isFull&&<span style={{fontSize:10,color:P.red,fontWeight:600}}>
                          {needed-count} open
                        </span>}
                      </div>
                      {/* Assigned staff */}
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {assigned.map(a=>{
                          const st=staff.find(s=>s.id===a.staffId);
                          const ct=CT.find(c=>c.id===st?.contractType);
                          const ws=caoCheck(a.staffId,asgn,allDefs,di);
                          const hasErr=ws.some(w=>w.type==="error");
                          return (
                            <div key={a.id}
                              style={{
                                display:"flex",alignItems:"center",gap:6,
                                padding:"5px 8px",borderRadius:8,
                                background:hasErr?"rgba(220,38,38,0.06)":P.wh,
                                border:`1px solid ${hasErr?"rgba(220,38,38,0.2)":P.gryM}`,
                                transition:"all 0.15s",
                              }}
                              onMouseEnter={e=>{if(ws.length)setTt({x:e.clientX,y:e.clientY+12,w:ws});}}
                              onMouseLeave={()=>setTt(null)}
                            >
                              <span style={{fontSize:11}} title={ct?.label}>{ct?.icon}</span>
                              <span style={{flex:1,fontSize:13,fontWeight:500,color:P.navy}}>
                                {st?.name?.split(" ")[0]}
                              </span>
                              {hasErr&&<span style={{fontSize:11}}>⚠️</span>}
                              <button onClick={()=>setAsgn(asgn.filter(x=>x.id!==a.id))}
                                style={{border:"none",background:"none",color:P.gry,cursor:"pointer",fontSize:13,padding:0,lineHeight:1}}>×</button>
                            </div>
                          );
                        })}
                      </div>
                      {/* Assign dropdown */}
                      {!isFull&&available.length>0&&(
                        <select
                          style={{
                            width:"100%",marginTop:4,padding:"5px 6px",
                            border:`1.5px dashed ${P.gryM}`,borderRadius:8,
                            background:"transparent",fontSize:12,color:P.gry,
                            cursor:"pointer",outline:"none",
                          }}
                          value=""
                          onChange={e=>{if(e.target.value)setAsgn([...asgn,{id:gid(),shiftId:shift.id,dayIndex:di,staffId:e.target.value}]);}}
                        >
                          <option value="">+ assign staff</option>
                          {available.map(s=>{
                            const ct2=CT.find(c=>c.id===s.contractType);
                            return <option key={s.id} value={s.id}>{ct2?.icon} {s.name}</option>;
                          })}
                        </select>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Tooltip */}
      {tt&&(
        <div style={{
          position:"fixed",left:Math.min(tt.x+12,window.innerWidth-300),top:tt.y,
          background:P.navy,color:P.wh,padding:"12px 16px",borderRadius:12,
          fontSize:12,zIndex:9999,maxWidth:300,lineHeight:1.6,
          boxShadow:"0 8px 30px rgba(0,0,0,0.3)",
        }}>
          <div style={{fontWeight:700,color:P.acc,marginBottom:6}}>⚠ CAO Compliance</div>
          {tt.w.map((w,i)=> <div key={i}>{w.type==="error"?"🔴":"🔵"} {w.msg}</div>)}
        </div>
      )}
    </div>
  );
}

// ── Shift Manager (settings) ───────────────────────────────────────────
function ShiftManager({outlet,onUp}){
  const[adding,setAdding]=useState(false);
  const[name,setName]=useState(""),[start,setStart]=useState(""),[end,setEnd]=useState(""),[need,setNeed]=useState(1);

  const save=()=>{
    if(!name.trim()||!start||!end)return;
    onUp({...outlet,shifts:[...outlet.shifts,{id:gid(),name:name.trim(),startTime:start,endTime:end,staffNeeded:+need}]});
    setAdding(false);setName("");setStart("");setEnd("");setNeed(1);
  };

  return (
    <div style={{marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <h4 style={{margin:0,color:P.navy,fontSize:16}}>{outlet.name}</h4>
        <button style={S.btnPrimary} onClick={()=>setAdding(true)}>+ Add Shift</button>
      </div>

      {outlet.shifts.length===0&&!adding&&(
        <div style={{padding:24,background:P.gryL,borderRadius:12,textAlign:"center"}}>
          <p style={{color:P.gry,fontSize:14}}>No shifts defined. Click "+ Add Shift" to create custom shift times.</p>
        </div>
      )}

      {/* Existing shifts */}
      <div style={{display:"grid",gap:8}}>
        {outlet.shifts.map(s=> (
          <div key={s.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:P.gryL,borderRadius:10,flexWrap:"wrap"}}>
            <input style={{...S.inp,width:130,fontWeight:600}} value={s.name}
              onChange={e=>onUp({...outlet,shifts:outlet.shifts.map(x=>x.id===s.id?{...x,name:e.target.value}:x)})}/>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <input type="time" style={{...S.inp,width:110}} value={s.startTime}
                onChange={e=>onUp({...outlet,shifts:outlet.shifts.map(x=>x.id===s.id?{...x,startTime:e.target.value}:x)})}/>
              <span style={{color:P.gry}}>→</span>
              <input type="time" style={{...S.inp,width:110}} value={s.endTime}
                onChange={e=>onUp({...outlet,shifts:outlet.shifts.map(x=>x.id===s.id?{...x,endTime:e.target.value}:x)})}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:12,color:P.gry}}>Min staff:</span>
              <input type="number" min={1} style={{...S.inp,width:55,textAlign:"center"}} value={s.staffNeeded}
                onChange={e=>onUp({...outlet,shifts:outlet.shifts.map(x=>x.id===s.id?{...x,staffNeeded:+e.target.value}:x)})}/>
            </div>
            <span style={{fontSize:12,color:P.gry,marginLeft:"auto"}}>{sDur(s.startTime,s.endTime).toFixed(1)}h</span>
            <button style={{...S.btnIcon,color:P.red}} onClick={()=>onUp({...outlet,shifts:outlet.shifts.filter(x=>x.id!==s.id)})}>✕</button>
          </div>
        ))}
      </div>

      {/* Add form */}
      {adding&&(
        <div style={{marginTop:8,padding:16,background:P.accSoft,borderRadius:12,border:`1px solid ${P.acc}30`}}>
          <p style={{margin:"0 0 10px",fontSize:13,fontWeight:700,color:P.navy}}>New Shift</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <input style={{...S.inp,width:140}} placeholder="Shift name (e.g. Morning)" value={name} onChange={e=>setName(e.target.value)} autoFocus/>
            <input type="time" style={{...S.inp,width:110}} value={start} onChange={e=>setStart(e.target.value)} placeholder="Start"/>
            <span style={{color:P.gry}}>→</span>
            <input type="time" style={{...S.inp,width:110}} value={end} onChange={e=>setEnd(e.target.value)} placeholder="End"/>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:12,color:P.gry}}>Min staff:</span>
              <input type="number" min={1} style={{...S.inp,width:55,textAlign:"center"}} value={need} onChange={e=>setNeed(e.target.value)}/>
            </div>
            <button style={S.btnPrimary} onClick={save}>Save</button>
            <button style={S.btnGhost} onClick={()=>setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Employee Week View ─────────────────────────────────────────────────
function EmpView({staff,asgn,depts,wd}){
  const allS=depts.flatMap(d=>d.outlets.flatMap(o=>o.shifts.map(s=>({...s,outletName:o.name}))));
  const my=asgn.filter(a=>a.staffId===staff.id);
  let wt=0;my.forEach(a=>{const s=allS.find(x=>x.id===a.shiftId);if(s)wt+=sDur(s.startTime,s.endTime);});

  return (
    <div>
      <div style={{marginBottom:24,padding:20,background:`linear-gradient(135deg,${P.navy},${P.navyM})`,borderRadius:16,color:P.wh}}>
        <h2 style={{margin:"0 0 4px",fontFamily:"'Georgia',serif",fontSize:22}}>{staff.name}</h2>
        <p style={{margin:0,fontSize:14,opacity:0.8}}>This week: <strong style={{color:P.acc}}>{wt.toFixed(1)} hours</strong> scheduled</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:10}}>
        {DAYS.map((d,i)=>{
          const da=my.filter(a=>a.dayIndex===i);
          const isToday=wd[i]?.toDateString()===new Date().toDateString();
          return (
            <div key={d} style={{
              padding:14,borderRadius:14,textAlign:"center",minHeight:120,
              background:isToday?P.accSoft:P.wh,
              border:`2px solid ${isToday?P.acc:P.gryM}`,
              transition:"all 0.15s",
            }}>
              <div style={{fontWeight:700,fontSize:14,color:P.navy}}>{d}</div>
              <div style={{fontSize:11,color:P.gry,marginBottom:10}}>{fD(wd[i])}</div>
              {!da.length
                ? <div style={{fontSize:13,color:P.gry,fontStyle:"italic",marginTop:12}}>Day off</div>
                : da.map(a=>{
                    const sh=allS.find(x=>x.id===a.shiftId);
                    if(!sh)return null;
                    return (
                      <div key={a.id} style={{padding:8,borderRadius:10,background:P.gryL,marginBottom:6,textAlign:"left"}}>
                        <div style={{fontWeight:700,fontSize:13,color:P.navy}}>{sh.name}</div>
                        <div style={{fontSize:11,color:P.gry}}>{sh.outletName}</div>
                        <div style={{fontSize:13,fontWeight:600,color:P.acc,marginTop:4}}>{sh.startTime} – {sh.endTime}</div>
                      </div>
                    );
                  })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── USERS PANEL ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
function UsersPanel({h,upH}){
  const[addDM,setAddDM]=useState(false);
  const[dmN,setDmN]=useState(""),[dmE,setDmE]=useState(""),[dmP,setDmP]=useState(""),[dmD,setDmD]=useState({});
  const[editId,setEditId]=useState(null),[editD,setEditD]=useState({});
  const[saving,setSaving]=useState(false),[msg,setMsg]=useState("");

  const toggle=(id,obj,set)=>set({...obj,[id]:!obj[id]});
  const sel=obj=>Object.keys(obj).filter(k=>obj[k]);

  const saveDM=async()=>{
    if(!dmN.trim()||!dmE.trim()||!dmP.trim()){setMsg("Name, email and password required.");return;}
    if(!sel(dmD).length){setMsg("Select at least one department.");return;}
    setSaving(true);setMsg("");
    await authCreateUser(dmE.trim().toLowerCase(),dmP);
    upH("deptManagers",[...(h.deptManagers||[]),{id:gid(),name:dmN.trim(),email:dmE.trim().toLowerCase(),password:dmP,deptIds:sel(dmD)}]);
    setDmN("");setDmE("");setDmP("");setDmD({});setAddDM(false);setSaving(false);
    setMsg("✓ Manager created");setTimeout(()=>setMsg(""),3000);
  };

  return (
    <div>
      {msg&&<div style={{padding:10,borderRadius:10,background:msg.startsWith("✓")?P.grnL:P.redL,color:msg.startsWith("✓")?P.grn:P.red,fontSize:13,marginBottom:12,fontWeight:600}}>{msg}</div>}

      {/* Hotel Manager */}
      <div style={{...S.card,marginBottom:16}}>
        <h3 style={{margin:"0 0 12px",color:P.navy,fontSize:17}}>👔 Hotel Manager</h3>
        <div style={{display:"grid",gap:6}}>
          <div style={S.infoRow}><span style={S.infoLabel}>Name</span><span style={{fontWeight:600}}>{h.hotelManager?.name||"—"}</span></div>
          <div style={S.infoRow}><span style={S.infoLabel}>Email (login)</span><span style={{fontWeight:600,color:P.blu}}>{h.hotelManager?.email||"—"}</span></div>
        </div>
        {h.hotelManager?.email&&<button style={{...S.btnSoft,marginTop:10}} onClick={async()=>{const r=await authSendReset(h.hotelManager.email);alert(r.ok?"Reset email sent!":"Error: "+r.code);}}>📧 Send Password Reset</button>}
      </div>

      {/* Department Managers */}
      <div style={{...S.card,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,color:P.navy,fontSize:17}}>📋 Department Managers</h3>
          {!addDM&&<button style={S.btnPrimary} onClick={()=>{setAddDM(true);setDmD({});}}>+ Add Manager</button>}
        </div>

        {addDM&&(
          <div style={{padding:20,background:P.accSoft,borderRadius:14,border:`1px solid ${P.acc}30`,marginBottom:16}}>
            <h4 style={{margin:"0 0 14px",color:P.navy}}>New Department Manager</h4>
            <div style={{display:"grid",gap:10,marginBottom:14}}>
              <input style={S.inp} placeholder="Full name" value={dmN} onChange={e=>setDmN(e.target.value)}/>
              <input style={S.inp} placeholder="Email (used for login)" type="email" value={dmE} onChange={e=>setDmE(e.target.value)}/>
              <input style={S.inp} placeholder="Password" type="password" value={dmP} onChange={e=>setDmP(e.target.value)}/>
            </div>
            <p style={{fontSize:13,fontWeight:700,color:P.navy,margin:"0 0 10px"}}>Assign to departments:</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
              {(h.departments||[]).map(d=>(
                <button key={d.id} onClick={()=>toggle(d.id,dmD,setDmD)} style={{
                  padding:"10px 16px",borderRadius:10,cursor:"pointer",fontSize:14,fontWeight:600,
                  border:`2px solid ${dmD[d.id]?P.acc:P.gryM}`,
                  background:dmD[d.id]?P.accSoft:P.wh,color:dmD[d.id]?P.acc:P.gryD,
                  transition:"all 0.15s",
                }}>{d.icon} {d.name} {dmD[d.id]&&"✓"}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button style={{...S.btnPrimary,opacity:saving?.5:1}} onClick={saveDM} disabled={saving}>{saving?"Creating...":"Create Manager"}</button>
              <button style={S.btnGhost} onClick={()=>{setAddDM(false);setMsg("");}}>Cancel</button>
            </div>
          </div>
        )}

        {!(h.deptManagers||[]).length&&!addDM&&<p style={{color:P.gry,fontSize:14,padding:12}}>No department managers yet.</p>}

        <div style={{display:"grid",gap:10}}>
          {(h.deptManagers||[]).map(dm=>{
            const deptNames=(dm.deptIds||[]).map(did=>h.departments.find(d=>d.id===did)).filter(Boolean);
            const isEdit=editId===dm.id;
            return (
              <div key={dm.id} style={{padding:16,borderRadius:12,border:`1px solid ${P.gryM}`,background:P.gryL}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,color:P.navy}}>{dm.name}</div>
                    <div style={{fontSize:13,color:P.gry,marginTop:2}}>{dm.email||"No email"}</div>
                    <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                      {deptNames.map(d=><Badge key={d.id} color={P.acc} bg={P.accSoft}>{d.icon} {d.name}</Badge>)}
                      {!deptNames.length&&<Badge color={P.org} bg={P.orgL}>No departments</Badge>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button style={S.btnSoft} onClick={()=>{if(isEdit){setEditId(null);}else{setEditId(dm.id);const o={};(dm.deptIds||[]).forEach(id=>{o[id]=true;});setEditD(o);}}}>
                      {isEdit?"Cancel":"Edit Depts"}
                    </button>
                    {dm.email&&<button style={{...S.btnSoft,color:P.blu,background:P.bluL}} onClick={async()=>{const r=await authSendReset(dm.email);alert(r.ok?"Sent!":"Error");}}>📧</button>}
                    <button style={{...S.btnIcon,color:P.red}} onClick={()=>upH("deptManagers",(h.deptManagers||[]).filter(x=>x.id!==dm.id))}>✕</button>
                  </div>
                </div>
                {isEdit&&(
                  <div style={{marginTop:12,padding:14,background:P.wh,borderRadius:10,border:`1px solid ${P.gryM}`}}>
                    <p style={{fontSize:13,fontWeight:600,color:P.navy,margin:"0 0 8px"}}>Departments for {dm.name}:</p>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                      {(h.departments||[]).map(d=>(
                        <button key={d.id} onClick={()=>toggle(d.id,editD,setEditD)} style={{
                          padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,
                          border:`2px solid ${editD[d.id]?P.acc:P.gryM}`,background:editD[d.id]?P.accSoft:P.wh,color:editD[d.id]?P.acc:P.gryD,
                        }}>{d.icon} {d.name} {editD[d.id]&&"✓"}</button>
                      ))}
                    </div>
                    <button style={S.btnPrimary} onClick={()=>{upH("deptManagers",(h.deptManagers||[]).map(x=>x.id===dm.id?{...x,deptIds:sel(editD)}:x));setEditId(null);}}>Save</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Staff accounts */}
      <div style={{...S.card,marginBottom:16}}>
        <h3 style={{margin:"0 0 8px",color:P.navy,fontSize:17}}>👤 Staff Accounts</h3>
        <p style={{fontSize:13,color:P.gry,margin:"0 0 12px"}}>With email → reset via email. Without → manager resets manually.</p>
        <div style={{display:"grid",gap:4,maxHeight:450,overflowY:"auto"}}>
          {h.staff.map(s=>(
            <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:8,background:P.gryL}}>
              <span style={{fontSize:13}}><strong>{s.name}</strong>{s.email?<span style={{color:P.blu,marginLeft:6,fontSize:12}}>{s.email}</span>:<span style={{color:P.gry,marginLeft:6,fontSize:12}}>no email</span>}</span>
              <div style={{display:"flex",gap:4}}>
                {s.email&&<button style={{...S.btnSoft,fontSize:11,padding:"3px 8px"}} onClick={async()=>{const r=await authSendReset(s.email);alert(r.ok?"Sent!":"Error");}}>📧</button>}
                <button style={{...S.btnSoft,fontSize:11,padding:"3px 8px",color:P.org,background:P.orgL}} onClick={()=>{const np=prompt("New password for "+s.name+":");if(np)upH("staff",h.staff.map(x=>x.id===s.id?{...x,password:np}:x));}}>Reset PW</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shared login */}
      <div style={S.card}>
        <h3 style={{margin:"0 0 8px",color:P.navy,fontSize:17}}>🔗 Shared Staff Login</h3>
        <p style={{fontSize:13,color:P.gry,margin:"0 0 10px"}}>One login for all staff. They pick their name after signing in.</p>
        <div style={{display:"grid",gap:6}}>
          <div style={S.infoRow}><span style={S.infoLabel}>Username</span><span style={{fontWeight:600}}>{h.staffLogin?.username||"—"}</span></div>
          <div style={S.infoRow}><span style={S.infoLabel}>Password</span><span style={{fontWeight:600}}>{h.staffLogin?.password||"—"}</span></div>
        </div>
        <button style={{...S.btnSoft,marginTop:10}} onClick={()=>{const u=prompt("Username:",h.staffLogin?.username||"");const p=prompt("Password:",h.staffLogin?.password||"");if(u&&p)upH("staffLogin",{username:u,password:p});}}>Edit</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── MAIN APP ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
export default function App(){
  const[loading,setLoading]=useState(true);
  const[system,setSystem]=useState(null);
  const[hotelData,setHotelData]=useState({});
  const[user,setUser]=useState(null);
  const[curHotel,setCurHotel]=useState(null);
  const[view,setView]=useState("schedule");
  const[selDept,setSelDept]=useState("");
  const[selOut,setSelOut]=useState("");
  const[wo,setWo]=useState(0);
  const[staffPick,setStaffPick]=useState(null);
  const[loginErr,setLoginErr]=useState("");
  const[loginLoading,setLoginLoading]=useState(false);

  const wd=useMemo(()=>weekDatesFor(wo),[wo]);

  // ── Load ──
  useEffect(()=>{(async()=>{
    let sys=await dbGet("system");
    if(!sys){
      const testHotel=buildTestHotel();
      sys={admins:[{id:"adm-1",name:"Tim Browne",email:"browne.t@buas.nl",password:"admin123"}],hotels:[{id:"test",name:"Test Hotel"}]};
      await dbSet("system",sys);
      await dbSet("hotel:test",testHotel);
      await authCreateUser("browne.t@buas.nl","admin123");
      await authCreateUser("sarah@test.com","manager1");
      await authCreateUser("jan@test.com","manager1");
      for(const s of testHotel.staff){if(s.email)await authCreateUser(s.email,"welcome1");}
    }
    if(!sys.hotels.find(h=>h.id==="test")){sys.hotels.push({id:"test",name:"Test Hotel"});await dbSet("system",sys);}
    let testData=await dbGet("hotel:test");
    if(!testData){const t=buildTestHotel();await dbSet("hotel:test",t);testData=t;
      await authCreateUser("sarah@test.com","manager1");await authCreateUser("jan@test.com","manager1");
      for(const s of t.staff){if(s.email)await authCreateUser(s.email,"welcome1");}}
    setSystem(sys);
    const hd={};for(const hMeta of sys.hotels){const d=await dbGet("hotel:"+hMeta.id);if(d)hd[hMeta.id]=d;}
    if(!hd["test"]&&testData)hd["test"]=testData;
    setHotelData(hd);setLoading(false);
  })();},[]);

  const saveSystem=useCallback(async(s)=>{setSystem(s);await dbSet("system",s);},[]);
  const saveHotel=useCallback(async(hid,data)=>{const d={...data,lastActivity:new Date().toISOString()};setHotelData(prev=>({...prev,[hid]:d}));await dbSet("hotel:"+hid,d);},[]);

  const h=curHotel?hotelData[curHotel]:null;
  const allDefs=h?h.departments.flatMap(d=>d.outlets.flatMap(o=>o.shifts)):[];
  const cDept=h?h.departments.find(d=>d.id===selDept):null;
  const cOut=cDept?.outlets.find(o=>o.id===selOut);
  const visibleDepts=h?(user?.deptIds?h.departments.filter(d=>user.deptIds.includes(d.id)):h.departments):[];
  const outStaff=h&&cOut?h.staff.filter(s=>s.outletId===cOut.id):[];
  const outAsgn=h&&cOut?h.assignments.filter(a=>cOut.shifts.find(s=>s.id===a.shiftId)):[];
  const recs=useMemo(()=>h?genRecs(h.staff,h.assignments,h.departments):{summary:{ftRatio:0,totalFTScheduled:0,totalPTScheduled:0,totalExScheduled:0,totalScheduled:0,totalFTCapacity:0},staffHours:{}},[h]);

  const upH=(field,val)=>{if(!h||!curHotel)return;saveHotel(curHotel,{...h,[field]:val});};
  const upOut=(did,u)=>upH("departments",h.departments.map(d=>d.id===did?{...d,outlets:d.outlets.map(o=>o.id===u.id?u:o)}:d));
  const setAsgn=v=>upH("assignments",v);

  // ── Role lookup ──
  const findRole=e=>{
    const adm=system.admins.find(a=>(a.email||"").toLowerCase()===e);
    if(adm)return {role:"admin",name:adm.name,email:adm.email,id:adm.id};
    for(const hM of system.hotels){const hd=hotelData[hM.id];if(!hd)continue;
      if((hd.hotelManager?.email||"").toLowerCase()===e)return {role:"hotelManager",name:hd.hotelManager.name,email:hd.hotelManager.email,hotelId:hM.id,hd};}
    for(const hM of system.hotels){const hd=hotelData[hM.id];if(!hd?.deptManagers)continue;
      const dm=hd.deptManagers.find(m=>(m.email||"").toLowerCase()===e);
      if(dm)return {role:"deptManager",name:dm.name,email:dm.email,hotelId:hM.id,deptIds:dm.deptIds||[],hd};}
    for(const hM of system.hotels){const hd=hotelData[hM.id];if(!hd?.staff)continue;
      const st=hd.staff.find(s=>(s.email||"").toLowerCase()===e);
      if(st)return {role:"staff",name:st.name,email:st.email,hotelId:hM.id,staffId:st.id,staff:st};}
    return null;
  };
  const applyRole=f=>{
    setUser({role:f.role,name:f.name,email:f.email,id:f.id,hotelId:f.hotelId,deptIds:f.deptIds,staffId:f.staffId});
    if(f.hotelId){setCurHotel(f.hotelId);if(f.hd)dbSet("hotel:"+f.hotelId,{...f.hd,lastLogin:new Date().toISOString()});
      const hd=f.hd||hotelData[f.hotelId];if(hd){const fd=f.deptIds?hd.departments.find(d=>f.deptIds.includes(d.id)):hd.departments[0];if(fd){setSelDept(fd.id);setSelOut(fd.outlets?.[0]?.id||"");}}
      if(f.staff)setStaffPick(f.staff);}
  };

  // ── Login ──
  const handleLogin=async(email,pw)=>{
    if(!system)return;setLoginLoading(true);setLoginErr("");
    const e=email.toLowerCase().trim();
    if(e.includes("@")){const r=await authLogin(e,pw);if(r.ok){const f=findRole(e);if(f){applyRole(f);setLoginLoading(false);return;}setLoginErr("No role assigned to this account.");setLoginLoading(false);return;}}
    for(const hM of system.hotels){const hd=hotelData[hM.id];if(!hd?.staff)continue;
      const st=hd.staff.find(s=>((s.username||s.name||"").toLowerCase()===e)&&s.password===pw);
      if(st){setUser({role:"staff",name:st.name,hotelId:hM.id,staffId:st.id});setCurHotel(hM.id);setStaffPick(st);setLoginLoading(false);return;}}
    for(const hM of system.hotels){const hd=hotelData[hM.id];if(!hd?.staffLogin)continue;
      if((hd.staffLogin.username||"").toLowerCase()===e&&hd.staffLogin.password===pw){setUser({role:"staff",name:"Staff",hotelId:hM.id});setCurHotel(hM.id);setLoginLoading(false);return;}}
    setLoginErr("Invalid email or password");setLoginLoading(false);
  };

  const handleForgot=async(email)=>{
    const e=email.toLowerCase().trim();
    if(!e.includes("@"))return "Enter an email address";
    const r=await authSendReset(e);
    return r.ok?null:r.code==="auth/user-not-found"?"No account found for this email.":"Error: "+r.code;
  };

  const logout=async()=>{await authLogout();setUser(null);setCurHotel(null);setView("schedule");setStaffPick(null);setLoginErr("");};

  // ── Loading ──
  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${P.navy},${P.navyM})`}}>
      <div style={{textAlign:"center",color:P.wh}}>
        <div style={{fontSize:56,marginBottom:8}}>🏨</div>
        <h1 style={{fontFamily:"'Georgia',serif",color:P.acc,fontSize:28,margin:"0 0 8px"}}>ShiftMaster</h1>
        <p style={{opacity:0.7}}>Loading...</p>
      </div>
    </div>
  );

  // ── Login Screen ──
  if(!user) return <LoginScreen onLogin={handleLogin} onForgot={handleForgot} err={loginErr} busy={loginLoading}/>;

  // ── Admin ──
  if(user.role==="admin"&&!curHotel) return <AdminView system={system} saveSystem={saveSystem} hotelData={hotelData} saveHotel={saveHotel} logout={logout}
    onEnterHotel={async hid=>{let hd=hotelData[hid];if(!hd){hd=await dbGet("hotel:"+hid);if(hd)setHotelData(prev=>({...prev,[hid]:hd}));}if(!hd){alert("Hotel data not found.");return;}
      await dbSet("hotel:"+hid,{...hd,lastLogin:new Date().toISOString()});setHotelData(prev=>({...prev,[hid]:{...hd,lastLogin:new Date().toISOString()}}));
      setCurHotel(hid);const fd=hd.departments?.[0];if(fd){setSelDept(fd.id);setSelOut(fd.outlets?.[0]?.id||"");}
    }}/>;

  // ── Staff ──
  if(user.role==="staff"){
    if(!h) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><p>Hotel not found.</p><button style={S.btnPrimary} onClick={logout}>Back</button></div>;
    if(!staffPick) return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:P.bg,padding:20}}>
        <div style={{background:P.wh,borderRadius:20,padding:32,width:"100%",maxWidth:420,boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
          <div style={{textAlign:"center",marginBottom:20}}><span style={{fontSize:40}}>🏨</span><h2 style={{margin:"8px 0 0",color:P.navy,fontFamily:"'Georgia',serif"}}>{h.name}</h2><p style={{color:P.gry,fontSize:14}}>Select your name</p></div>
          <div style={{display:"grid",gap:6,maxHeight:400,overflowY:"auto"}}>
            {h.staff.map(s=><button key={s.id} style={{padding:"14px 16px",border:`1.5px solid ${P.gryM}`,borderRadius:12,background:P.wh,cursor:"pointer",textAlign:"left",fontSize:15,fontWeight:600,color:P.navy}} onClick={()=>setStaffPick(s)}>
              {CT.find(c=>c.id===s.contractType)?.icon} {s.name}
            </button>)}
          </div>
          <button style={{...S.btnGhost,marginTop:12,width:"100%"}} onClick={logout}>← Sign out</button>
        </div>
      </div>
    );
    return (
      <div style={S.app}>
        <header style={S.header}><div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:24}}>🏨</span><div><h1 style={S.hTitle}>ShiftMaster</h1><p style={S.hSub}>{h.name}</p></div></div>
          <div style={{display:"flex",alignItems:"center",gap:10}}><WeekNav wo={wo} set={setWo} wd={wd}/><button style={S.btnGhostW} onClick={()=>setStaffPick(null)}>Switch</button><button style={S.btnGhostW} onClick={logout}>Out</button></div></header>
        <main style={S.main}><EmpView staff={staffPick} asgn={h.assignments} depts={h.departments} wd={wd}/></main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // ── MANAGER VIEW ───────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════
  if(!h) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><p>Hotel not found.</p><button style={S.btnPrimary} onClick={logout}>Back</button></div>;
  const isHM=user.role==="hotelManager"||user.role==="admin";
  const isAdmin=user.role==="admin"&&!!curHotel;

  const navItems=[{id:"schedule",l:"Schedule",i:"📋"}];
  if(isHM)navItems.push({id:"optimize",l:"Optimize",i:"💡"},{id:"hr",l:"HR & Payroll",i:"🏛️"},{id:"settings",l:"Settings",i:"⚙️"},{id:"staff",l:"Staff",i:"👥"},{id:"users",l:"Users",i:"🔑"});
  else navItems.push({id:"staff",l:"Staff",i:"👥"});

  return (
    <div style={S.app}>
      {/* Header */}
      <header style={S.header}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <span style={{fontSize:28}}>🏨</span>
          <div>
            <h1 style={S.hTitle}>ShiftMaster</h1>
            <p style={S.hSub}>{h.name} · {user.name}</p>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <WeekNav wo={wo} set={setWo} wd={wd}/>
          {isAdmin&&<button style={{...S.btnPrimary,background:P.pur,fontSize:12}} onClick={()=>{setCurHotel(null);setView("schedule");}}>← All Hotels</button>}
          <button style={S.btnGhostW} onClick={logout}>Sign Out</button>
        </div>
      </header>

      {/* Navigation */}
      <nav style={S.nav}>
        <div style={{display:"flex",gap:2}}>
          {navItems.map(v=>(
            <button key={v.id} onClick={()=>setView(v.id)} style={{
              padding:"10px 18px",border:"none",borderRadius:0,cursor:"pointer",fontSize:13,fontWeight:600,
              background:view===v.id?P.wh:"transparent",color:view===v.id?P.navy:P.gryD,
              borderBottom:view===v.id?`3px solid ${P.acc}`:"3px solid transparent",
              transition:"all 0.15s",
            }}>{v.i} {v.l}</button>
          ))}
        </div>
      </nav>

      <main style={S.main}>
        {/* Department selector */}
        {["schedule","settings"].includes(view)&&(
          <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
            {visibleDepts.map(d=>(
              <button key={d.id} onClick={()=>{setSelDept(d.id);setSelOut(d.outlets[0]?.id||"");}} style={{
                padding:"12px 24px",borderRadius:12,cursor:"pointer",fontSize:15,fontWeight:700,
                border:`2px solid ${selDept===d.id?P.acc:P.gryM}`,
                background:selDept===d.id?P.accSoft:P.wh,color:selDept===d.id?P.navy:P.gryD,
                transition:"all 0.15s",boxShadow:selDept===d.id?"0 2px 8px rgba(230,57,70,0.15)":"none",
              }}>{d.icon} {d.name}</button>
            ))}
          </div>
        )}

        {/* Outlet sub-tabs */}
        {["schedule"].includes(view)&&cDept&&cDept.outlets.length>1&&(
          <div style={{display:"flex",gap:6,marginBottom:16}}>
            {cDept.outlets.map(o=>(
              <button key={o.id} onClick={()=>setSelOut(o.id)} style={{
                padding:"8px 18px",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600,
                border:`1.5px solid ${selOut===o.id?P.navy:P.gryM}`,
                background:selOut===o.id?P.navy:P.wh,color:selOut===o.id?P.wh:P.gryD,
                transition:"all 0.15s",
              }}>{o.name}</button>
            ))}
          </div>
        )}

        {/* SCHEDULE */}
        {view==="schedule"&&cOut&&(
          <div style={S.card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <h2 style={{margin:0,color:P.navy,fontSize:20}}>{cOut.name}</h2>
                <p style={{margin:"4px 0 0",color:P.gry,fontSize:13}}>{cDept?.icon} {cDept?.name} · {cOut.shifts.length} shifts defined</p>
              </div>
            </div>
            <ScheduleGrid outlet={cOut} asgn={outAsgn}
              setAsgn={na=>{const others=h.assignments.filter(a=>!cOut.shifts.find(s=>s.id===a.shiftId));setAsgn([...others,...na]);}}
              staff={outStaff} wd={wd} allDefs={allDefs}/>
          </div>
        )}

        {/* OPTIMIZE */}
        {view==="optimize"&&isHM&&(
          <div style={S.card}>
            <h2 style={{margin:"0 0 20px",color:P.navy,fontSize:20}}>Schedule Health</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16}}>
              {[
                {label:"FT Ratio",value:recs.summary.ftRatio+"%",sub:"Target: ≥80%",color:recs.summary.ftRatio>=80?P.grn:P.org},
                {label:"Full-time",value:recs.summary.totalFTScheduled.toFixed(0)+"h",sub:`of ${recs.summary.totalFTCapacity}h capacity`,color:P.grn},
                {label:"Part-time",value:recs.summary.totalPTScheduled.toFixed(0)+"h",sub:"",color:P.org},
                {label:"Extra/Flex",value:recs.summary.totalExScheduled.toFixed(0)+"h",sub:"",color:P.red},
              ].map((c,i)=>(
                <div key={i} style={{padding:24,borderRadius:16,background:P.gryL,textAlign:"center"}}>
                  <div style={{fontSize:36,fontWeight:800,color:c.color}}>{c.value}</div>
                  <div style={{fontSize:14,fontWeight:600,color:P.navy,marginTop:4}}>{c.label}</div>
                  {c.sub&&<div style={{fontSize:12,color:P.gry,marginTop:2}}>{c.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HR */}
        {view==="hr"&&isHM&&(
          <div style={S.card}>
            <h2 style={{margin:"0 0 16px",color:P.navy,fontSize:20}}>Payroll Overview</h2>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr style={{background:P.gryL}}>
                  {["Employee","Type","€/hr","Hours","Gross/mo","Net/mo","Employer/mo","Cost/hr"].map(h2=>(
                    <th key={h2} style={{padding:"12px 10px",textAlign:"left",fontSize:12,fontWeight:700,color:P.navy,borderBottom:`2px solid ${P.gryM}`}}>{h2}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {h.staff.map(s=>{
                    let hrs=0;h.assignments.filter(a=>a.staffId===s.id).forEach(a=>{const d=allDefs.find(x=>x.id===a.shiftId);if(d)hrs+=sDur(d.startTime,d.endTime);});
                    const p=calcPay(s,hrs);const ct=CT.find(c=>c.id===s.contractType);
                    return (
                      <tr key={s.id} style={{borderBottom:`1px solid ${P.gryL}`}}>
                        <td style={{padding:"10px",fontWeight:600,color:P.navy}}>{s.name}</td>
                        <td style={{padding:"10px"}}>{ct?.icon} {ct?.label}</td>
                        <td style={{padding:"10px"}}>{euro(p.rate)}</td>
                        <td style={{padding:"10px"}}>{p.hrs.toFixed(1)}</td>
                        <td style={{padding:"10px"}}>{euro(p.mG)}</td>
                        <td style={{padding:"10px",color:P.grn,fontWeight:600}}>{euro(p.mN)}</td>
                        <td style={{padding:"10px",color:P.navy,fontWeight:600}}>{euro(p.tcM)}</td>
                        <td style={{padding:"10px"}}>{p.cph>0?euro(p.cph):"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {view==="settings"&&isHM&&(
          <div>
            {/* Departments */}
            <div style={{...S.card,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <h2 style={{margin:0,color:P.navy,fontSize:20}}>Departments & Outlets</h2>
                <button style={S.btnPrimary} onClick={()=>{const nm=prompt("Department name:");if(!nm?.trim())return;const ic=prompt("Emoji icon:")||"🏢";upH("departments",[...h.departments,{id:gid(),name:nm.trim(),icon:ic.trim(),outlets:[]}]);}}>+ Department</button>
              </div>
              <div style={{display:"grid",gap:10}}>
                {h.departments.map(dept=>(
                  <div key={dept.id} style={{padding:16,borderRadius:12,background:P.gryL,border:`1px solid ${P.gryM}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontWeight:700,fontSize:16,color:P.navy}}>{dept.icon} {dept.name}</span>
                      <div style={{display:"flex",gap:6}}>
                        <button style={S.btnSoft} onClick={()=>{const nm=prompt("Outlet name:");if(nm?.trim())upH("departments",h.departments.map(d=>d.id===dept.id?{...d,outlets:[...d.outlets,{id:gid(),name:nm.trim(),shifts:[],captureRates:{},handlingCapacity:{}}]}:d));}}>+ Outlet</button>
                        {!["fo","fb"].includes(dept.id)&&<button style={{...S.btnIcon,color:P.red}} onClick={()=>{if(confirm("Delete "+dept.name+"?"))upH("departments",h.departments.filter(d=>d.id!==dept.id));}}>✕</button>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {dept.outlets.map(o=>(
                        <span key={o.id} style={{padding:"6px 12px",borderRadius:8,background:P.wh,border:`1px solid ${P.gryM}`,fontSize:13,fontWeight:500}}>
                          {o.name} <span style={{color:P.gry}}>({o.shifts.length})</span>
                          <button style={{border:"none",background:"none",color:P.red,cursor:"pointer",marginLeft:4}} onClick={()=>upH("departments",h.departments.map(d=>d.id===dept.id?{...d,outlets:d.outlets.filter(x=>x.id!==o.id)}:d))}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Shift config for selected dept */}
            {cDept&&(
              <div style={S.card}>
                <h2 style={{margin:"0 0 16px",color:P.navy,fontSize:20}}>{cDept.icon} {cDept.name} — Shifts</h2>
                {cDept.outlets.map(o=><ShiftManager key={o.id} outlet={o} onUp={u=>upOut(cDept.id,u)}/>)}
              </div>
            )}
          </div>
        )}

        {/* STAFF */}
        {view==="staff"&&(
          <div style={S.card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{margin:0,color:P.navy,fontSize:20}}>Staff</h2>
              {isHM&&<button style={S.btnPrimary} onClick={async()=>{const nm=prompt("Name:");if(!nm?.trim())return;const em=prompt("Email (optional):")||"";const pw=prompt("Password:")||"welcome1";const oid=prompt("Outlet ID:")||"";if(em)await authCreateUser(em,pw);upH("staff",[...h.staff,{id:gid(),name:nm.trim(),email:em,password:pw,outletId:oid,contractType:"fulltime",contractHours:38,hourlyRate:13.68}]);}}>+ Add</button>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:10}}>
              {h.staff.map(s=>{
                const ct=CT.find(c=>c.id===s.contractType);
                const outlet=h.departments.flatMap(d=>d.outlets).find(o=>o.id===s.outletId);
                return (
                  <div key={s.id} style={{padding:14,borderRadius:12,border:`1px solid ${P.gryM}`,background:P.gryL,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}><span>{ct?.icon}</span><strong style={{color:P.navy,fontSize:14}}>{s.name}</strong></div>
                      <div style={{fontSize:12,color:P.gry,marginTop:2}}>{outlet?.name||""} {s.contractHours>0&&`· ${s.contractHours}h/wk`} {s.email&&`· ${s.email}`}</div>
                    </div>
                    {isHM&&<button style={{...S.btnIcon,color:P.red}} onClick={()=>upH("staff",h.staff.filter(x=>x.id!==s.id))}>✕</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* USERS */}
        {view==="users"&&isHM&&<UsersPanel h={h} upH={upH}/>}
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── LOGIN SCREEN ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
function LoginScreen({onLogin,onForgot,err,busy}){
  const[email,setEmail]=useState(""),[pw,setPw]=useState(""),[forgot,setForgot]=useState(false),[fEmail,setFEmail]=useState(""),[fErr,setFErr]=useState(""),[fMsg,setFMsg]=useState(""),[fBusy,setFBusy]=useState(false);

  if(forgot) return (
    <div style={S.loginWrap}><div style={S.loginBox}>
      <div style={{textAlign:"center",marginBottom:20}}><span style={{fontSize:52}}>🏨</span><h1 style={S.loginH1}>ShiftMaster</h1><p style={{color:P.gry,fontSize:14}}>Reset your password</p></div>
      <input style={S.loginInp} placeholder="Email address" type="email" value={fEmail} onChange={e=>{setFEmail(e.target.value);setFErr("");setFMsg("");}} onKeyDown={e=>e.key==="Enter"&&(async()=>{setFBusy(true);const r=await onForgot(fEmail);setFBusy(false);r?setFErr(r):setFMsg("Reset email sent to "+fEmail);})()}/>
      {fErr&&<p style={{color:P.red,fontSize:13,margin:0}}>{fErr}</p>}
      {fMsg&&<div style={{padding:12,borderRadius:10,background:P.grnL,color:P.grn,fontSize:13,textAlign:"center"}}>{fMsg}</div>}
      <button style={{...S.loginBtn,opacity:fBusy?.5:1}} onClick={async()=>{setFBusy(true);const r=await onForgot(fEmail);setFBusy(false);r?setFErr(r):setFMsg("Reset email sent to "+fEmail);}}>{fBusy?"Sending...":"Send Reset Link"}</button>
      <button style={S.loginLink} onClick={()=>{setForgot(false);setFErr("");setFMsg("");}}>← Back</button>
    </div></div>
  );

  return (
    <div style={S.loginWrap}><div style={S.loginBox}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <span style={{fontSize:52}}>🏨</span>
        <h1 style={S.loginH1}>ShiftMaster</h1>
        <p style={{color:P.gry,fontSize:14}}>Your schedule; our solution</p>
      </div>
      <input style={S.loginInp} placeholder="Email or username" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin(email,pw)}/>
      <input style={S.loginInp} placeholder="Password" type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onLogin(email,pw)}/>
      {err&&<p style={{color:P.red,fontSize:13,margin:0}}>{err}</p>}
      <button style={{...S.loginBtn,opacity:busy?.5:1}} onClick={()=>onLogin(email,pw)} disabled={busy}>{busy?"Signing in...":"Sign In"}</button>
      <button style={S.loginLink} onClick={()=>{setForgot(true);setFEmail(email);}}>Forgot password?</button>
    </div></div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── ADMIN VIEW ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
function AdminView({system,saveSystem,hotelData,saveHotel,logout,onEnterHotel}){
  const[tab,setTab]=useState("hotels");
  const now=new Date(),THREE_MO=90*24*3600000;
  const active=[],archived=[];
  system.hotels.forEach(hM=>{const hd=hotelData[hM.id];if(hd?.archived){archived.push(hM);return;}
    const la=hd?.lastLogin||hd?.lastActivity||hd?.createdAt;
    if(la&&now-new Date(la)>THREE_MO&&hM.id!=="test"){archived.push(hM);}else{active.push(hM);}});

  return (
    <div style={S.app}>
      <header style={S.header}><div style={{display:"flex",alignItems:"center",gap:14}}><span style={{fontSize:28}}>🏨</span><div><h1 style={S.hTitle}>ShiftMaster</h1><p style={S.hSub}>System Admin</p></div></div>
        <button style={S.btnGhostW} onClick={logout}>Sign Out</button></header>
      <nav style={S.nav}><div style={{display:"flex",gap:2}}>
        {["hotels","archive","admins"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"10px 18px",border:"none",borderRadius:0,cursor:"pointer",fontSize:13,fontWeight:600,background:tab===t?P.wh:"transparent",color:tab===t?P.navy:P.gryD,borderBottom:tab===t?`3px solid ${P.acc}`:"3px solid transparent"}}>
            {t==="hotels"?"🏨 Hotels":t==="archive"?"📦 Archive":"🔒 Admins"}
          </button>
        ))}
      </div></nav>
      <main style={S.main}>
        {tab==="hotels"&&<div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h2 style={{margin:0,color:P.navy,fontSize:20}}>Active Hotels</h2>
            <button style={S.btnPrimary} onClick={async()=>{const nm=prompt("Hotel name:");if(!nm?.trim())return;const id=gid();const mgNm=prompt("Manager name:")||"Manager";const em=prompt("Manager email:");const pw=prompt("Manager password:")||"manager1";if(em)await authCreateUser(em,pw);
              saveSystem({...system,hotels:[...system.hotels,{id,name:nm.trim()}]});
              saveHotel(id,{id,name:nm.trim(),hotelManager:{name:mgNm,email:em||"",password:pw},deptManagers:[],staffLogin:{username:"staff",password:"staff123"},staff:[],departments:[{id:"fo",name:"Front Office",icon:"🛎️",outlets:[]},{id:"fb",name:"Food & Beverage",icon:"🍽️",outlets:[]}],assignments:[],segments:SEGS_DEFAULT,forecast:{fo:{},fb:{}},requests:[],reviews:[],warnings:[],lastLogin:new Date().toISOString(),createdAt:new Date().toISOString()});
            }}>+ Add Hotel</button></div>
          <div style={{display:"grid",gap:12}}>
            {active.map(hM=>{const hd=hotelData[hM.id];return (
              <div key={hM.id} style={{padding:20,borderRadius:14,border:`1px solid ${P.gryM}`,background:P.gryL}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                  <div>
                    <h3 style={{margin:0,color:P.navy,fontSize:18}}>{hM.name}{hM.id==="test"&&<Badge color={P.pur} bg={P.purL}>Demo</Badge>}</h3>
                    <p style={{margin:"4px 0 0",fontSize:13,color:P.gry}}>{hd?`${hd.departments?.length||0} departments · ${hd.staff?.length||0} staff`:"Loading..."}</p>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button style={S.btnPrimary} onClick={()=>onEnterHotel(hM.id)}>Enter →</button>
                    {hM.id!=="test"&&<button style={{...S.btnIcon,color:P.red}} onClick={()=>{if(confirm("Delete "+hM.name+"?"))saveSystem({...system,hotels:system.hotels.filter(x=>x.id!==hM.id)});}}>✕</button>}
                  </div>
                </div>
              </div>
            );})}
          </div>
        </div>}
        {tab==="archive"&&<div style={S.card}>
          <h2 style={{margin:"0 0 12px",color:P.navy,fontSize:20}}>Archived Hotels</h2>
          <p style={{color:P.gry,fontSize:13,margin:"0 0 16px"}}>Hotels inactive 3+ months. Auto-deleted after 5 years.</p>
          {archived.length?archived.map(hM=>(
            <div key={hM.id} style={{padding:16,borderRadius:12,background:P.orgL,marginBottom:8}}>
              <strong>{hM.name}</strong>
              <button style={{...S.btnSoft,marginLeft:10}} onClick={()=>{const hd=hotelData[hM.id];if(hd)saveHotel(hM.id,{...hd,archived:false});}}>Restore</button>
            </div>
          )):<p style={{color:P.gry}}>No archived hotels.</p>}
        </div>}
        {tab==="admins"&&<div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <h2 style={{margin:0,color:P.navy,fontSize:20}}>System Admins</h2>
            <button style={S.btnPrimary} onClick={async()=>{const nm=prompt("Name:");const em=prompt("Email:");const pw=prompt("Password:");if(!nm||!em||!pw)return;await authCreateUser(em,pw);saveSystem({...system,admins:[...system.admins,{id:gid(),name:nm,email:em,password:pw}]});}}>+ Add</button>
          </div>
          {system.admins.map(a=>(
            <div key={a.id} style={{...S.infoRow,marginBottom:6}}>
              <span><strong>{a.name}</strong> — {a.email}</span>
              <div style={{display:"flex",gap:4}}>
                <button style={S.btnSoft} onClick={async()=>{const r=await authSendReset(a.email);alert(r.ok?"Sent!":"Error");}}>📧</button>
                {system.admins.length>1&&<button style={{...S.btnIcon,color:P.red}} onClick={()=>saveSystem({...system,admins:system.admins.filter(x=>x.id!==a.id)})}>✕</button>}
              </div>
            </div>
          ))}
        </div>}
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── STYLES ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
const S={
  // App shell
  app:{minHeight:"100vh",background:P.bg,fontFamily:"'Inter','Segoe UI',system-ui,-apple-system,sans-serif"},
  header:{background:`linear-gradient(135deg,${P.navy},${P.navyM})`,padding:"16px 28px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:14},
  hTitle:{margin:0,fontSize:22,fontWeight:800,color:P.acc,fontFamily:"'Georgia',serif",letterSpacing:"-0.3px"},
  hSub:{margin:0,fontSize:12,color:"rgba(255,255,255,0.6)"},
  nav:{background:P.wh,padding:"0 28px",borderBottom:`1px solid ${P.gryM}`,display:"flex",justifyContent:"space-between",alignItems:"center"},
  main:{padding:"24px 28px",maxWidth:1400,margin:"0 auto"},

  // Cards
  card:{background:P.card,borderRadius:16,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.04)",border:`1px solid ${P.gryM}`},

  // Buttons
  btnPrimary:{padding:"8px 18px",border:"none",borderRadius:10,background:P.acc,color:P.wh,cursor:"pointer",fontSize:13,fontWeight:700,transition:"opacity 0.15s"},
  btnSoft:{padding:"6px 14px",border:`1px solid ${P.gryM}`,borderRadius:8,background:P.gryL,color:P.gryD,cursor:"pointer",fontSize:12,fontWeight:600},
  btnGhost:{padding:"8px 18px",border:`1.5px solid ${P.gryM}`,borderRadius:10,background:"transparent",color:P.gryD,cursor:"pointer",fontSize:13,fontWeight:600},
  btnGhostW:{padding:"6px 14px",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,background:"transparent",color:"rgba(255,255,255,0.8)",cursor:"pointer",fontSize:12,fontWeight:500},
  btnIcon:{border:"none",background:"transparent",cursor:"pointer",fontSize:16,fontWeight:700,padding:"4px 8px"},
  wBtn:{padding:"5px 12px",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,background:"transparent",color:P.wh,cursor:"pointer",fontSize:15,fontWeight:700},

  // Inputs
  inp:{padding:"10px 14px",border:`1.5px solid ${P.gryM}`,borderRadius:10,fontSize:14,outline:"none",background:P.wh,boxSizing:"border-box",width:"100%"},

  // Info rows
  infoRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderRadius:10,background:P.gryL,border:`1px solid ${P.gryM}`},
  infoLabel:{fontSize:13,fontWeight:600,color:P.gry},

  // Schedule grid
  schedTh:{padding:"10px 12px",fontSize:13,fontWeight:700,color:P.navy,borderBottom:`2px solid ${P.gryM}`,background:P.gryL,textAlign:"left"},
  schedTd:{padding:"10px 8px",verticalAlign:"top",borderBottom:`1px solid ${P.gryL}`,borderRight:`1px solid ${P.gryL}`,minWidth:140},
  schedTdLabel:{padding:"12px 14px",verticalAlign:"top",borderBottom:`1px solid ${P.gryL}`,background:P.gryL,minWidth:160},

  // Login
  loginWrap:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${P.navy} 0%,${P.navyL} 50%,${P.navyM} 100%)`,padding:20},
  loginBox:{background:P.wh,borderRadius:24,padding:"44px 36px",width:"100%",maxWidth:400,display:"flex",flexDirection:"column",alignItems:"center",gap:14,boxShadow:"0 20px 60px rgba(0,0,0,0.25)"},
  loginH1:{margin:"10px 0 0",fontSize:30,fontWeight:800,color:P.navy,fontFamily:"'Georgia',serif",letterSpacing:"-0.5px"},
  loginInp:{width:"100%",padding:"14px 16px",border:`1.5px solid ${P.gryM}`,borderRadius:12,fontSize:15,outline:"none",boxSizing:"border-box",transition:"border 0.2s"},
  loginBtn:{width:"100%",padding:14,border:"none",borderRadius:12,background:P.navy,color:P.acc,fontSize:16,fontWeight:700,cursor:"pointer"},
  loginLink:{background:"none",border:"none",color:P.gry,cursor:"pointer",fontSize:13},

  // Misc
  dayCard:{padding:14,borderRadius:14,border:`2px solid ${P.gryM}`,background:P.wh,textAlign:"center",minHeight:120},
  empCard:{padding:8,borderRadius:10,background:P.gryL,marginBottom:6,textAlign:"left",border:`1px solid ${P.gryM}`},
  chip:{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:8,background:P.wh,border:`1px solid ${P.gryM}`,fontSize:13},
  profRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderRadius:10,background:P.gryL,border:`1px solid ${P.gryM}`,marginBottom:4},
  profL:{fontSize:13,fontWeight:600,color:P.gry},
  statCard:{padding:24,borderRadius:16,background:P.gryL,textAlign:"center"},
};
