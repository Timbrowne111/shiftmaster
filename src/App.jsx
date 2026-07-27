import { useState, useEffect, useMemo, useCallback } from "react";

// ── Constants ──────────────────────────────────────────────────────────
const DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],DAYS_F=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const CAO={maxShift:10,maxWeek:45,maxConsec:7,minRest:11,breakTh:5.5,breakMins:30};
const CT=[{id:"fulltime",label:"Full-time",icon:"🟢",color:"#27ae60",h:38},{id:"parttime",label:"Part-time",icon:"🟡",color:"#f59e0b",h:24},{id:"extra",label:"Extra/Flex",icon:"🔴",color:"#c0392b",h:0}];
const SEGS_DEFAULT=[{id:"mice",name:"MICE",color:"#6366f1"},{id:"leisure",name:"Leisure",color:"#06b6d4"},{id:"business",name:"Business",color:"#f59e0b"},{id:"group",name:"Group",color:"#10b981"}];
const REQ_TYPES=[{id:"holiday",label:"Holiday",icon:"🏖️",color:"#06b6d4"},{id:"day_off",label:"Day Off",icon:"📅",color:"#8b5cf6"},{id:"schedule_change",label:"Schedule Change",icon:"🔄",color:"#f59e0b"}];
const REQ_ST={pending:{label:"Pending",color:"#e67e22",bg:"rgba(230,126,34,0.12)"},approved:{label:"Approved",color:"#27ae60",bg:"rgba(39,174,96,0.12)"},denied:{label:"Denied",color:"#c0392b",bg:"rgba(192,57,43,0.12)"}};
const RV_TYPES=[{id:"probation",label:"Probation",icon:"🔍"},{id:"interim",label:"Interim",icon:"📋"},{id:"annual",label:"Annual",icon:"📊"}];
const WARN_TYPES=[{id:"verbal",label:"Verbal",icon:"💬",color:"#e67e22"},{id:"written",label:"Written",icon:"📝",color:"#c0392b"},{id:"final",label:"Final",icon:"🚨",color:"#7f1d1d"}];

const P={navy:"#2d1b4e",navyL:"#3d2663",navyM:"#4a3175",acc:"#e63946",accDim:"rgba(230,57,70,0.12)",cream:"#faf0f1",wh:"#fff",red:"#c0392b",redL:"rgba(192,57,43,0.12)",grn:"#27ae60",grnL:"rgba(39,174,96,0.12)",org:"#e67e22",orgL:"rgba(230,126,34,0.12)",blu:"#2980b9",bluL:"rgba(41,128,185,0.10)",pur:"#7c3aed",purL:"rgba(124,58,237,0.10)",gry:"#7f8c9b",gryL:"#e8ecf0",gryD:"#4a5568",bg:"#f5f0f6"};

// ── Utilities ──────────────────────────────────────────────────────────
const gid=()=>Math.random().toString(36).substr(2,9);
const euro=v=>`€${Number(v).toFixed(2)}`;
function weekDatesFor(o=0){const n=new Date(),d=n.getDay(),diff=n.getDate()-d+(d===0?-6:1)+o*7,m=new Date(n.setDate(diff));m.setHours(0,0,0,0);return DAYS.map((_,i)=>{const x=new Date(m);x.setDate(m.getDate()+i);return x;});}
function fD(d){return `${d.getDate()}/${d.getMonth()+1}`;}
function sDur(s,e){const[sh,sm]=s.split(":").map(Number),[eh,em]=e.split(":").map(Number);let m=(eh*60+em)-(sh*60+sm);if(m<0)m+=1440;return m/60;}
function tMin(t){const[h,m]=t.split(":").map(Number);return h*60+m;}

// ── CAO Check ──────────────────────────────────────────────────────────
function caoCheck(sid,asgn,defs,di){const w=[],sa=asgn.filter(a=>a.staffId===sid),ta=sa.filter(a=>a.dayIndex===di);let th=0;ta.forEach(a=>{const d=defs.find(s=>s.id===a.shiftId);if(d)th+=sDur(d.startTime,d.endTime);});if(th>CAO.maxShift)w.push({type:"error",msg:`>${CAO.maxShift}h/day`});if(th>CAO.breakTh)w.push({type:"info",msg:`${CAO.breakMins}min break req.`});let wh=0;sa.forEach(a=>{const d=defs.find(s=>s.id===a.shiftId);if(d)wh+=sDur(d.startTime,d.endTime);});if(wh>CAO.maxWeek)w.push({type:"error",msg:`>${CAO.maxWeek}h/week`});const wd=new Set(sa.map(a=>a.dayIndex));let mc=0,c=0;for(let i=0;i<7;i++){if(wd.has(i)){c++;mc=Math.max(mc,c);}else c=0;}if(mc>CAO.maxConsec)w.push({type:"error",msg:`${mc} consec days`});if(di>0){const pv=sa.filter(a=>a.dayIndex===di-1);if(pv.length&&ta.length){let le=0;pv.forEach(a=>{const d=defs.find(s=>s.id===a.shiftId);if(d)le=Math.max(le,tMin(d.endTime));});let es=1440;ta.forEach(a=>{const d=defs.find(s=>s.id===a.shiftId);if(d)es=Math.min(es,tMin(d.startTime));});const r=(1440-le+es)/60;if(r<CAO.minRest)w.push({type:"error",msg:`${r.toFixed(1)}h rest`});}}return w;}

// ── Forecast ───────────────────────────────────────────────────────────
function calcFc(outlet,di,fc,segs,deptId){if(deptId==="fo"){const df=fc.fo?.[di]||{},ci=+(df.checkIns||0),co=+(df.checkOuts||0),tot=ci+co,r={};outlet.shifts.forEach(s=>{const cap=+(outlet.handlingCapacity?.[s.id]||0);if(cap>0){const h=+s.startTime.split(":")[0],load=h<12?co*.7+ci*.3:co*.3+ci*.7;r[s.id]={demand:Math.round(load),recommended:Math.ceil(load/cap),capacity:cap};}else r[s.id]={demand:tot,recommended:s.staffNeeded,capacity:0};});return {totalHandlings:tot,results:r};}const df=fc.fb?.[di]||{};let tot=0;segs.forEach(seg=>{tot+=+(df[seg.id]||0)*(+(outlet.captureRates?.[seg.id]||0)/100);});const r={};outlet.shifts.forEach(s=>{const cap=+(outlet.handlingCapacity?.[s.id]||0);if(cap>0){const sd=tot/(outlet.shifts.length||1);r[s.id]={demand:Math.round(sd),recommended:Math.ceil(sd/cap),capacity:cap};}else r[s.id]={demand:Math.round(tot),recommended:s.staffNeeded,capacity:0};});return {totalExpected:Math.round(tot),results:r};}

// ── Payroll ────────────────────────────────────────────────────────────
const NLP={b1R:.3697,b1M:75518,b2R:.4950,ahk:3362,ak:5532,zvw:.0668,wwL:.0264,wwH:.0764,wia:.0711,whk:.005,vak:.08,penEE:.055,penER:.11};
function calcPay(staff,hrs){const rate=Number(staff.hourlyRate)||13.68,h=Number(hrs)||0,wG=h*rate,aG=wG*52,vak=aG*NLP.vak,tax=aG+vak,it=tax<=NLP.b1M?tax*NLP.b1R:NLP.b1M*NLP.b1R+(tax-NLP.b1M)*NLP.b2R,nit=Math.max(0,it-Math.min(it,NLP.ahk+NLP.ak)),pEE=aG*NLP.penEE,aN=aG-nit-pEE,isFlex=staff.contractType==="extra",ww=aG*(isFlex?NLP.wwH:NLP.wwL),erTot=aG*NLP.zvw+ww+aG*NLP.wia+aG*NLP.whk+aG*NLP.penER+vak,tcA=aG+erTot;return {rate,hrs:h,wG,mG:wG*52/12,aG,vak,nit,nitM:nit/12,pEE,pEEM:pEE/12,aN,mN:aN/12,wN:aN/52,erTot,tcA,tcM:tcA/12,tcW:tcA/52,cph:h>0?tcA/52/h:0};}

// ── Recommendations ────────────────────────────────────────────────────
function genRecs(staffList,asgn,depts,fc,segs){try{const allD=depts.flatMap(d=>d.outlets.flatMap(o=>o.shifts)),sH={};staffList.forEach(s=>{let h=0;asgn.filter(a=>a.staffId===s.id).forEach(a=>{const d=allD.find(x=>x.id===a.shiftId);if(d)h+=sDur(d.startTime,d.endTime);});sH[s.id]=h;});const ft=staffList.filter(s=>s.contractType==="fulltime"),pt=staffList.filter(s=>s.contractType==="parttime"),ex=staffList.filter(s=>s.contractType==="extra");const uFT=ft.filter(s=>(sH[s.id]||0)<(s.contractHours||38)-2);const swaps=[];asgn.forEach(a=>{const st=staffList.find(s=>s.id===a.staffId);if(!st||st.contractType==="fulltime")return;const sd=allD.find(d=>d.id===a.shiftId);if(!sd)return;const shH=sDur(sd.startTime,sd.endTime);const cands=ft.filter(f=>{if(f.outletId!==st.outletId)return false;if((sH[f.id]||0)+shH>(f.contractHours||38)+2)return false;if(asgn.some(x=>x.staffId===f.id&&x.shiftId===a.shiftId&&x.dayIndex===a.dayIndex))return false;return true;});if(cands.length)swaps.push({currentStaff:st,shift:sd,dayIndex:a.dayIndex,assignmentId:a.id,candidates:cands.map(f=>({...f,currentHours:sH[f.id]||0,remainingCapacity:(f.contractHours||38)-(sH[f.id]||0)}))});});const tFTS=ft.reduce((s,x)=>s+(sH[x.id]||0),0),tPTS=pt.reduce((s,x)=>s+(sH[x.id]||0),0),tEXS=ex.reduce((s,x)=>s+(sH[x.id]||0),0),tS=tFTS+tPTS+tEXS;return {underutilizedFT:uFT,swapSuggestions:swaps,uncoveredFTSuggestions:[],overstaffed:[],utilization:{fulltime:ft.map(s=>({...s,scheduled:sH[s.id]||0,contract:s.contractHours||38,pct:Math.round(((sH[s.id]||0)/(s.contractHours||38))*100)})),parttime:pt.map(s=>({...s,scheduled:sH[s.id]||0,contract:s.contractHours||24,pct:s.contractHours?Math.round(((sH[s.id]||0)/s.contractHours)*100):0})),extra:ex.map(s=>({...s,scheduled:sH[s.id]||0}))},summary:{totalFTCapacity:ft.reduce((s,x)=>s+(x.contractHours||38),0),totalFTScheduled:tFTS,totalPTScheduled:tPTS,totalExScheduled:tEXS,totalScheduled:tS,ftRatio:tS>0?Math.round(tFTS/tS*100):0},staffHours:sH};}catch(e){return {underutilizedFT:[],swapSuggestions:[],uncoveredFTSuggestions:[],overstaffed:[],utilization:{fulltime:[],parttime:[],extra:[]},summary:{totalFTCapacity:0,totalFTScheduled:0,totalPTScheduled:0,totalExScheduled:0,totalScheduled:0,ftRatio:0},staffHours:{}};}}

// ── PERSISTENT STORAGE (Firebase Firestore) ──────────────────────────
import { dbGet, dbSet } from './firebase.js';

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
    {id:"fo",name:"Front Office",icon:"🛎️",outlets:[{id:"fo-desk",name:"Front Desk",shifts:[{id:"fo-early",name:"Early",startTime:"06:00",endTime:"14:30",staffNeeded:2},{id:"fo-late",name:"Late",startTime:"14:00",endTime:"22:30",staffNeeded:2},{id:"fo-night",name:"Night",startTime:"22:00",endTime:"06:30",staffNeeded:1}],captureRates:{},handlingCapacity:{"fo-early":20,"fo-late":25,"fo-night":8}}]},
    {id:"fb",name:"Food & Beverage",icon:"🍽️",outlets:[
      {id:"fb-rest",name:"Restaurant",shifts:[{id:"re-brkfst",name:"Breakfast",startTime:"06:00",endTime:"11:00",staffNeeded:3},{id:"re-lunch",name:"Lunch",startTime:"11:00",endTime:"15:30",staffNeeded:3},{id:"re-dinner",name:"Dinner",startTime:"17:00",endTime:"23:00",staffNeeded:4}],captureRates:{mice:"30",leisure:"65",business:"45",group:"70"},handlingCapacity:{"re-brkfst":25,"re-lunch":20,"re-dinner":18}},
      {id:"fb-bar",name:"Bar",shifts:[{id:"ba-day",name:"Day",startTime:"10:00",endTime:"18:00",staffNeeded:1},{id:"ba-eve",name:"Evening",startTime:"17:00",endTime:"01:00",staffNeeded:2}],captureRates:{mice:"15",leisure:"35",business:"50",group:"10"},handlingCapacity:{"ba-day":30,"ba-eve":22}},
      {id:"fb-rs",name:"Room Service",shifts:[{id:"rs-morn",name:"Morning",startTime:"06:30",endTime:"14:00",staffNeeded:1},{id:"rs-eve",name:"Evening",startTime:"14:00",endTime:"22:00",staffNeeded:1}],captureRates:{mice:"5",leisure:"15",business:"25",group:"3"},handlingCapacity:{"rs-morn":12,"rs-eve":12}},
      {id:"fb-banq",name:"Banqueting",shifts:[{id:"bq-day",name:"Day",startTime:"08:00",endTime:"16:00",staffNeeded:2},{id:"bq-eve",name:"Eve",startTime:"16:00",endTime:"00:00",staffNeeded:2}],captureRates:{mice:"80",leisure:"0",business:"10",group:"60"},handlingCapacity:{"bq-day":30,"bq-eve":30}},
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
    forecast:{fo:{0:{checkIns:"42",checkOuts:"38"},1:{checkIns:"55",checkOuts:"30"},2:{checkIns:"48",checkOuts:"35"},3:{checkIns:"60",checkOuts:"25"},4:{checkIns:"70",checkOuts:"45"},5:{checkIns:"35",checkOuts:"65"},6:{checkIns:"20",checkOuts:"50"}},fb:{0:{mice:"40",leisure:"60",business:"45",group:"20"},1:{mice:"40",leisure:"65",business:"50",group:"20"},2:{mice:"45",leisure:"70",business:"50",group:"25"},3:{mice:"50",leisure:"75",business:"55",group:"30"},4:{mice:"55",leisure:"90",business:"60",group:"35"},5:{mice:"20",leisure:"110",business:"30",group:"40"},6:{mice:"10",leisure:"95",business:"15",group:"35"}}},
    requests:[{id:"req-1",staffId:"s-emma",type:"holiday",startDate:"2026-04-06",endDate:"2026-04-10",reason:"Spring holiday",status:"pending",created:"2026-03-20"}],
    reviews:[{id:"rv-1",staffId:"s-emma",date:"2025-12-15",type:"annual",rating:4,notes:"Excellent guest interaction.",by:"mgr"},{id:"rv-2",staffId:"s-tom",date:"2026-01-10",type:"annual",rating:5,notes:"Outstanding team leader.",by:"mgr"}],
    warnings:[{id:"wn-1",staffId:"s-sem",date:"2026-02-14",type:"verbal",reason:"Late arrival without notice.",by:"mgr"},{id:"wn-2",staffId:"s-sem",date:"2026-03-05",type:"written",reason:"Second late arrival. Formal warning.",by:"mgr"}],
  };
}

// ══════════════════════════════════════════════════════════════════════
// ── SMALL COMPONENTS ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
function Badge({children,color=P.gry,bg=P.gryL}){return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:700,background:bg,color}}>{children}</span>;}
function SBadge({type,compact}){const ct=CT.find(c=>c.id===type)||CT[2];if(compact)return <span style={{fontSize:10}} title={ct.label}>{ct.icon}</span>;return <Badge color={ct.color} bg={ct.color+"18"}>{ct.icon} {ct.label}</Badge>;}
function Ind({rec,assigned,compact}){if(!rec&&!assigned)return null;const d=assigned-rec,st=d>=0?(d===0?"ok":"over"):"under";const c={ok:{i:"✓",c:P.grn,b:P.grnL},over:{i:"▲",c:P.blu,b:P.bluL},under:{i:"▼",c:P.red,b:P.redL}}[st];return <Badge color={c.c} bg={c.b}>{c.i} {compact?`${assigned}/${rec}`:st==="ok"?"Staffed":d>0?`+${d}`:String(d)}</Badge>;}
function WNav({wo,set,wd}){return <div style={{display:"flex",alignItems:"center",gap:6}}><button style={S.wBtn} onClick={()=>set(wo-1)}>‹</button><span style={{fontSize:13,fontWeight:600,color:P.cream,minWidth:130,textAlign:"center"}}>{fD(wd[0])} — {fD(wd[6])}</span><button style={S.wBtn} onClick={()=>set(wo+1)}>›</button>{wo!==0&&<button style={{...S.wBtn,fontSize:10}} onClick={()=>set(0)}>Today</button>}</div>;}
function CovB({shift,asgn,di}){const n=asgn.filter(a=>a.shiftId===shift.id&&a.dayIndex===di).length,ok=n>=shift.staffNeeded;return <Badge color={ok?P.grn:n>0?P.org:P.red} bg={ok?P.grnL:n>0?P.orgL:P.redL}><span style={{fontSize:8}}>{ok?"●":"○"}</span> {n}/{shift.staffNeeded}</Badge>;}

// ══════════════════════════════════════════════════════════════════════
// ── SCHEDULE GRID ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
function Grid({outlet,asgn,setAsgn,staff,wd,allDefs,fc,segs,deptId}){
  const[tt,setTt]=useState(null);
  const getA=(sid,di)=>asgn.filter(a=>a.shiftId===sid&&a.dayIndex===di);
  const avail=(sid,di)=>{const ids=getA(sid,di).map(a=>a.staffId);return staff.filter(s=>!ids.includes(s.id));};
  if(!outlet.shifts.length)return <div style={{padding:24,textAlign:"center",color:P.gry}}>No shifts defined. Add in ⚙️ Settings.</div>;
  const hasFc=deptId==="fo"?DAYS.some((_,i)=>Number(fc.fo?.[i]?.checkIns||0)+Number(fc.fo?.[i]?.checkOuts||0)>0):DAYS.some((_,i)=>segs.some(seg=>Number(fc.fb?.[i]?.[seg.id]||0)>0));
  const dFc=DAYS.map((_,i)=>calcFc(outlet,i,fc,segs,deptId));
  return (<div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr><th style={{...S.th,width:140,minWidth:140}}>Shift</th>{DAYS.map((d,i)=> <th key={d} style={S.th}><div>{d}</div><div style={{fontWeight:400,fontSize:11,opacity:.7}}>{fD(wd[i])}</div></th>)}</tr></thead>
    <tbody>{outlet.shifts.map(shift=> <tr key={shift.id}><td style={S.tdL}><div style={{fontWeight:700,fontSize:13}}>{shift.name}</div><div style={{fontSize:11,color:P.gry}}>{shift.startTime}–{shift.endTime}</div><div style={{fontSize:10,color:P.gry}}>Min: {shift.staffNeeded}</div></td>
      {DAYS.map((_,di)=>{const as=getA(shift.id,di),av=avail(shift.id,di),full=as.length>=shift.staffNeeded,fr=dFc[di]?.results?.[shift.id],rec=fr?.recommended||0,hFc=hasFc&&fr&&fr.capacity>0,mx=Math.max(shift.staffNeeded,hFc?rec:0);
        return <td key={di} style={{...S.td,background:full?"rgba(39,174,96,0.04)":as.length>0?"rgba(230,126,34,0.04)":"rgba(192,57,43,0.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,gap:3,flexWrap:"wrap"}}><CovB shift={shift} asgn={asgn} di={di}/>{hFc&&<Ind rec={rec} assigned={as.length} compact/>}</div>
          {hFc&&<div style={{fontSize:10,color:P.pur,marginBottom:3}}>📊 ~{fr.demand} → {rec} rec.</div>}
          {as.map(a=>{const st=staff.find(s=>s.id===a.staffId),ws=caoCheck(a.staffId,asgn,allDefs,di),he=ws.some(w=>w.type==="error");
            return <div key={a.id} style={{...S.chip,borderLeft:he?`3px solid ${P.red}`:`3px solid ${P.grn}`,position:"relative"}} onMouseEnter={e=>{if(ws.length)setTt({x:e.clientX,y:e.clientY+10,w:ws});}} onMouseLeave={()=>setTt(null)}>
              <SBadge type={st?.contractType} compact/><span style={{flex:1,fontSize:12}}>{st?.name||"?"}</span>
              <button onClick={()=>setAsgn(asgn.filter(x=>x.id!==a.id))} style={S.chipRm}>✕</button>{he&&<span style={{position:"absolute",top:-4,right:-4,fontSize:10}}>⚠️</span>}</div>;})}
          {as.length<mx&&<select style={S.asSel} value="" onChange={e=>{if(e.target.value)setAsgn([...asgn,{id:gid(),shiftId:shift.id,dayIndex:di,staffId:e.target.value}]);}}><option value="">+ Assign</option>{av.map(s=> <option key={s.id} value={s.id}>{CT.find(c=>c.id===s.contractType)?.icon||""} {s.name}</option>)}</select>}
        </td>;})}</tr>)}</tbody></table>
    {tt&&<div style={{position:"fixed",left:tt.x+8,top:tt.y,background:P.navy,color:P.cream,padding:"8px 12px",borderRadius:8,fontSize:11,zIndex:1000,maxWidth:280,boxShadow:"0 4px 16px rgba(0,0,0,.3)"}}><strong style={{color:P.acc}}>CAO Warnings</strong>{tt.w.map((w,i)=> <div key={i} style={{marginTop:4}}>{w.type==="error"?"🔴":"🔵"} {w.msg}</div>)}</div>}
  </div>);
}

// ── Shift Def Editor ───────────────────────────────────────────────────
function ShiftDefs({outlet,onUp}){const[add,setAdd]=useState(false),[en,setEn]=useState(""),[es,setEs]=useState("07:00"),[ee,setEe]=useState("15:00"),[ec,setEc]=useState(1);
  const sv=()=>{if(!en.trim())return;onUp({...outlet,shifts:[...outlet.shifts,{id:gid(),name:en,startTime:es,endTime:ee,staffNeeded:+ec}]});setAdd(false);setEn("");};
  const upS=(sid,f,v)=>onUp({...outlet,shifts:outlet.shifts.map(s=>s.id===sid?{...s,[f]:f==="staffNeeded"?+v:v}:s)});
  return <div style={S.shiftEd}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><h4 style={{margin:0,color:P.navy,fontWeight:700,fontSize:15}}>{outlet.name} — Shifts</h4><button style={S.addBtn} onClick={()=>setAdd(true)}>+ Add</button></div>
    {outlet.shifts.length===0&&!add&&<p style={{color:P.gry,fontSize:13,fontStyle:"italic"}}>No shifts yet.</p>}
    {outlet.shifts.map(s=> <div key={s.id} style={S.shRow}><input style={{...S.shInp,width:120}} value={s.name} onChange={e=>upS(s.id,"name",e.target.value)}/><label style={S.mini}>From <input type="time" style={S.shInp} value={s.startTime} onChange={e=>upS(s.id,"startTime",e.target.value)}/></label><label style={S.mini}>To <input type="time" style={S.shInp} value={s.endTime} onChange={e=>upS(s.id,"endTime",e.target.value)}/></label><label style={S.mini}>Min <input type="number" min={1} style={{...S.shInp,width:50}} value={s.staffNeeded} onChange={e=>upS(s.id,"staffNeeded",e.target.value)}/></label><span style={{color:P.gry,fontSize:12}}>{sDur(s.startTime,s.endTime).toFixed(1)}h</span><button style={S.delBtn} onClick={()=>onUp({...outlet,shifts:outlet.shifts.filter(x=>x.id!==s.id)})}>✕</button></div>)}
    {add&&<div style={{...S.shRow,background:P.accDim,borderColor:P.acc}}><input style={{...S.shInp,width:120}} placeholder="Name" value={en} onChange={e=>setEn(e.target.value)} autoFocus/><label style={S.mini}>From <input type="time" style={S.shInp} value={es} onChange={e=>setEs(e.target.value)}/></label><label style={S.mini}>To <input type="time" style={S.shInp} value={ee} onChange={e=>setEe(e.target.value)}/></label><label style={S.mini}>Min <input type="number" min={1} style={{...S.shInp,width:50}} value={ec} onChange={e=>setEc(e.target.value)}/></label><button style={S.addBtn} onClick={sv}>Save</button><button style={S.delBtn} onClick={()=>setAdd(false)}>✕</button></div>}
  </div>;
}

// ── Employee Week View ─────────────────────────────────────────────────
function EmpView({staff,asgn,depts,wd}){const allS=depts.flatMap(d=>d.outlets.flatMap(o=>o.shifts.map(s=>({...s,outletName:o.name}))));const my=asgn.filter(a=>a.staffId===staff.id);let wt=0;my.forEach(a=>{const s=allS.find(x=>x.id===a.shiftId);if(s)wt+=sDur(s.startTime,s.endTime);});
  return <div><div style={{marginBottom:20,padding:16,background:P.accDim,borderRadius:12,border:`1px solid ${P.acc}40`}}><h3 style={{margin:"0 0 4px",color:P.navy}}>{staff.name}</h3><p style={{margin:0,fontSize:13,color:P.gryD}}>This week: <strong>{wt.toFixed(1)}h</strong></p></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8}}>{DAYS.map((d,i)=>{const da=my.filter(a=>a.dayIndex===i),isT=wd[i]?.toDateString()===new Date().toDateString();return <div key={d} style={{...S.dayCard,...(isT?{borderColor:P.acc,background:P.accDim}:{})}}><div style={{fontWeight:700,fontSize:13,color:P.navy}}>{d}</div><div style={{fontSize:11,color:P.gry,marginBottom:8}}>{fD(wd[i])}</div>{!da.length?<div style={{fontSize:12,color:P.gry,fontStyle:"italic"}}>Off</div>:da.map(a=>{const sh=allS.find(x=>x.id===a.shiftId);if(!sh)return null;return <div key={a.id} style={S.empCard}><div style={{fontWeight:700,fontSize:12,color:P.navy}}>{sh.name}</div><div style={{fontSize:11,color:P.gry}}>{sh.outletName}</div><div style={{fontSize:12,fontWeight:600,color:P.acc,marginTop:4}}>{sh.startTime}–{sh.endTime}</div></div>;})}</div>;})}</div></div>;
}

// ══════════════════════════════════════════════════════════════════════
// ── MAIN APP ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
export default function App(){
  const[loading,setLoading]=useState(true);
  const[system,setSystem]=useState(null); // {admins,hotels}
  const[hotelData,setHotelData]=useState({}); // {hotelId: hotelObject}
  const[user,setUser]=useState(null); // {role,name,email,hotelId,deptIds?}
  const[curHotel,setCurHotel]=useState(null); // hotelId
  const[view,setView]=useState("schedule");
  const[selDept,setSelDept]=useState("");
  const[selOut,setSelOut]=useState("");
  const[wo,setWo]=useState(0);
  const[pm,setPm]=useState(null);
  const[pd,setPd]=useState(0);
  const[staffPick,setStaffPick]=useState(null); // for staff login name picker

  const wd=useMemo(()=>weekDatesFor(wo),[wo]);

  // ── Load from storage ──
  useEffect(()=>{(async()=>{
    let sys=await dbGet("system");
    if(!sys){
      const testHotel=buildTestHotel();
      sys={admins:[{id:"adm-1",name:"System Admin",email:"admin@shiftmaster.com",password:"admin123"}],hotels:[{id:"test",name:"Test Hotel"}]};
      await dbSet("system",sys);
      await dbSet("hotel:test",testHotel);
    }
    setSystem(sys);
    const hd={};
    for(const h of sys.hotels){const d=await dbGet("hotel:"+h.id);if(d)hd[h.id]=d;}
    setHotelData(hd);
    setLoading(false);
  })();},[]);

  // ── Save helpers ──
  const saveSystem=useCallback(async(s)=>{setSystem(s);await dbSet("system",s);},[]);
  const saveHotel=useCallback(async(hid,data)=>{setHotelData(prev=>({...prev,[hid]:data}));await dbSet("hotel:"+hid,data);},[]);

  // ── Current hotel data ──
  const h=curHotel?hotelData[curHotel]:null;
  const allDefs=h?h.departments.flatMap(d=>d.outlets.flatMap(o=>o.shifts)):[];
  const cDept=h?h.departments.find(d=>d.id===selDept):null;
  const cOut=cDept?.outlets.find(o=>o.id===selOut);
  const visibleDepts=h?(user?.deptIds?h.departments.filter(d=>user.deptIds.includes(d.id)):h.departments):[];
  const outStaff=h&&cOut?h.staff.filter(s=>s.outletId===cOut.id):[];
  const outAsgn=h&&cOut?h.assignments.filter(a=>cOut.shifts.find(s=>s.id===a.shiftId)):[];

  const recs=useMemo(()=>h?genRecs(h.staff,h.assignments,h.departments,h.forecast||{},h.segments||[]):{underutilizedFT:[],swapSuggestions:[],uncoveredFTSuggestions:[],overstaffed:[],utilization:{fulltime:[],parttime:[],extra:[]},summary:{totalFTCapacity:0,totalFTScheduled:0,totalPTScheduled:0,totalExScheduled:0,totalScheduled:0,ftRatio:0},staffHours:{}},[h]);

  // ── Update helpers for current hotel ──
  const upH=(field,val)=>{if(!h||!curHotel)return;const nd={...h,[field]:val};saveHotel(curHotel,nd);};
  const upOut=(did,u)=>upH("departments",h.departments.map(d=>d.id===did?{...d,outlets:d.outlets.map(o=>o.id===u.id?u:o)}:d));
  const setAsgn=(v)=>upH("assignments",v);

  // ── Login handler ──
  const handleLogin=(email,pw)=>{
    if(!system)return "System loading...";
    const e=email.toLowerCase().trim();
    // Admin
    const adm=system.admins.find(a=>a.email.toLowerCase()===e&&a.password===pw);
    if(adm){setUser({role:"admin",name:adm.name,email:adm.email,id:adm.id});return null;}
    // Hotel manager
    for(const hMeta of system.hotels){const hd=hotelData[hMeta.id];if(!hd)continue;
      if(hd.hotelManager?.email?.toLowerCase()===e&&hd.hotelManager?.password===pw){setUser({role:"hotelManager",name:hd.hotelManager.name,email:hd.hotelManager.email,hotelId:hMeta.id});setCurHotel(hMeta.id);const fd=hd.departments[0];if(fd){setSelDept(fd.id);setSelOut(fd.outlets[0]?.id||"");}return null;}}
    // Dept manager
    for(const hMeta of system.hotels){const hd=hotelData[hMeta.id];if(!hd?.deptManagers)continue;
      const dm=hd.deptManagers.find(m=>m.email?.toLowerCase()===e&&m.password===pw);
      if(dm){setUser({role:"deptManager",name:dm.name,email:dm.email,hotelId:hMeta.id,deptIds:dm.deptIds||[]});setCurHotel(hMeta.id);const fd=hd.departments.find(d=>(dm.deptIds||[]).includes(d.id));if(fd){setSelDept(fd.id);setSelOut(fd.outlets[0]?.id||"");}return null;}}
    // Staff (shared login per hotel)
    for(const hMeta of system.hotels){const hd=hotelData[hMeta.id];if(!hd?.staffLogin)continue;
      if(hd.staffLogin.username.toLowerCase()===e&&hd.staffLogin.password===pw){setUser({role:"staff",name:"Staff",hotelId:hMeta.id});setCurHotel(hMeta.id);return null;}}
    return "Invalid email or password";
  };

  const handleForgot=(email)=>{
    const e=email.toLowerCase().trim();
    if(!system)return "System loading";
    const all=[...system.admins];
    Object.values(hotelData).forEach(hd=>{if(hd.hotelManager?.email)all.push(hd.hotelManager);(hd.deptManagers||[]).forEach(m=>{if(m.email)all.push(m);});(hd.staff||[]).forEach(s=>{if(s.email)all.push(s);});});
    return all.find(u=>u.email?.toLowerCase()===e)?null:"User not found. No account matches this email.";
  };

  const logout=()=>{setUser(null);setCurHotel(null);setView("schedule");setPm(null);setStaffPick(null);};

  // ── Loading ──
  if(loading)return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${P.navy},${P.navyM})`}}><div style={{textAlign:"center",color:P.cream}}><div style={{fontSize:48}}>🏨</div><h1 style={{fontFamily:"'Georgia',serif",color:P.acc}}>ShiftMaster</h1><p>Loading...</p></div></div>;

  // ══════════════════════════════════════════════════════════════════
  // ── LOGIN SCREEN ───────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════
  if(!user){
    return <LoginScreen onLogin={handleLogin} onForgot={handleForgot}/>;
  }

  // ══════════════════════════════════════════════════════════════════
  // ── ADMIN VIEW ─────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════
  if(user.role==="admin"&&!curHotel){
    return <AdminView system={system} saveSystem={saveSystem} hotelData={hotelData} saveHotel={saveHotel} logout={logout} onEnterHotel={(hid)=>{
      setCurHotel(hid);const hd=hotelData[hid];if(hd){const fd=hd.departments[0];if(fd){setSelDept(fd.id);setSelOut(fd.outlets[0]?.id||"");}}
    }}/>;
  }
  // Admin inside a hotel — treat as hotel manager but with back button
  if(user.role==="admin"&&curHotel){
    // Falls through to the hotel manager/dept manager view below
    // We override isHM to true and add back-to-admin capability
  }

  // ══════════════════════════════════════════════════════════════════
  // ── STAFF VIEW ─────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════
  if(user.role==="staff"){
    if(!h)return <div style={S.center}><p>Hotel data not found.</p><button style={S.addBtn} onClick={logout}>Back</button></div>;
    if(!staffPick)return (
      <div style={S.loginCont}><div style={{...S.loginCard,maxWidth:450}}>
        <div style={{textAlign:"center",marginBottom:16}}><span style={{fontSize:36}}>🏨</span><h2 style={{margin:"8px 0 0",color:P.navy,fontFamily:"'Georgia',serif"}}>{h.name}</h2><p style={{color:P.gry,fontSize:13}}>Select your name to view your schedule</p></div>
        <div style={{display:"grid",gap:6,width:"100%",maxHeight:400,overflowY:"auto"}}>
          {h.staff.map(s=> <button key={s.id} style={{padding:"12px 16px",border:`1px solid ${P.gryL}`,borderRadius:10,background:P.wh,cursor:"pointer",textAlign:"left",fontSize:14,fontWeight:600,color:P.navy,display:"flex",alignItems:"center",gap:8}} onClick={()=>setStaffPick(s)}>
            <SBadge type={s.contractType} compact/> {s.name}
          </button>)}
        </div>
        <button style={S.linkBtn} onClick={logout}>← Sign out</button>
      </div></div>
    );
    return (
      <div style={S.app}><header style={S.header}><div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:24}}>🏨</span><div><h1 style={S.hTitle}>ShiftMaster</h1><p style={S.hSub}>{h.name} — {staffPick.name}</p></div></div>
        <div style={{display:"flex",alignItems:"center",gap:12}}><WNav wo={wo} set={setWo} wd={wd}/><button style={{...S.addBtn,background:P.gryL,color:P.gryD,fontSize:11}} onClick={()=>setStaffPick(null)}>Switch</button><button style={S.logBtn} onClick={logout}>Out</button></div></header>
        <main style={S.main}><EmpView staff={staffPick} asgn={h.assignments} depts={h.departments} wd={wd}/></main></div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // ── HOTEL MANAGER / DEPT MANAGER VIEW ──────────────────────────────
  // ══════════════════════════════════════════════════════════════════
  if(!h)return <div style={S.center}><p>Hotel not found.</p><button style={S.addBtn} onClick={logout}>Back</button></div>;
  const isHM=user.role==="hotelManager"||user.role==="admin";
  const isAdminInHotel=user.role==="admin"&&!!curHotel;
  const backToAdmin=()=>{setCurHotel(null);setView("schedule");};
  const pendReqs=(h.requests||[]).filter(r=>r.status==="pending").length;
  const issueCount=recs.swapSuggestions.length;

  const navItems=[{id:"schedule",l:"📋 Schedule"}];
  if(isHM)navItems.push({id:"forecast",l:"📊 Forecast"},{id:"recommend",l:"💡 Optimize"},{id:"requests",l:"📨 Requests"},{id:"hr",l:"🏛️ HR"},{id:"settings",l:"⚙️ Settings"},{id:"staff",l:"👥 Staff"},{id:"users",l:"🔑 Users"});
  else navItems.push({id:"requests",l:"📨 Requests"},{id:"staff",l:"👥 Staff"});

  return (
    <div style={S.app}>
      <header style={S.header}><div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:24}}>🏨</span><div><h1 style={S.hTitle}>ShiftMaster</h1><p style={S.hSub}>{h.name} — {user.name} ({isAdminInHotel?"Admin":isHM?"Hotel Manager":"Dept Manager"})</p></div></div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><WNav wo={wo} set={setWo} wd={wd}/>{isAdminInHotel&&<button style={{...S.addBtn,background:P.pur,fontSize:11}} onClick={backToAdmin}>← All Hotels</button>}<button style={S.logBtn} onClick={logout}>Sign Out</button></div></header>

      <nav style={S.nav}><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{navItems.map(v=> <button key={v.id} style={{...S.navBtn,...(view===v.id?S.navBtnA:{}),position:"relative"}} onClick={()=>setView(v.id)}>{v.l}
        {v.id==="recommend"&&issueCount>0&&<span style={{position:"absolute",top:-4,right:-4,background:P.red,color:P.wh,fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:10}}>{issueCount}</span>}
        {v.id==="requests"&&pendReqs>0&&<span style={{position:"absolute",top:-4,right:-4,background:P.org,color:P.wh,fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:10}}>{pendReqs}</span>}
      </button>)}</div><div style={{display:"flex",gap:4}}>
        <button style={S.prBtn} onClick={()=>setPm("daily")}>🖨️ Daily</button><button style={S.prBtn} onClick={()=>setPm("staff")}>🖨️ Staff</button>
      </div></nav>

      <main style={S.main}>
        {/* Dept tabs */}
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {visibleDepts.map(d=> <button key={d.id} style={{...S.deptTab,...(selDept===d.id?S.deptTabA:{})}} onClick={()=>{setSelDept(d.id);setSelOut(d.outlets[0]?.id||"");}}>{d.icon} {d.name}</button>)}
        </div>

        {/* Outlet tabs */}
        {cDept&&cDept.outlets.length>1&&<div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap"}}>
          {cDept.outlets.map(o=> <button key={o.id} style={{...S.outTab,...(selOut===o.id?S.outTabA:{})}} onClick={()=>setSelOut(o.id)}>{o.name}</button>)}
        </div>}

        {/* SCHEDULE */}
        {view==="schedule"&&cOut&&<div style={S.card}>
          <h3 style={{margin:"0 0 12px",color:P.navy}}>{cOut.name} — Schedule</h3>
          <Grid outlet={cOut} asgn={outAsgn} setAsgn={na=>{const others=h.assignments.filter(a=>!cOut.shifts.find(s=>s.id===a.shiftId));setAsgn([...others,...na]);}} staff={outStaff} wd={wd} allDefs={allDefs} fc={h.forecast||{}} segs={h.segments||[]} deptId={selDept}/>
        </div>}

        {/* FORECAST */}
        {view==="forecast"&&isHM&&<div style={S.card}>
          <h3 style={{margin:"0 0 12px",color:P.navy}}>📊 Forecast — {cDept?.icon} {cDept?.name}</h3>
          <p style={{fontSize:12,color:P.gry}}>Configure forecast data, capture rates, and handling capacity per outlet in the Forecast settings. Coming in next update.</p>
        </div>}

        {/* OPTIMIZE */}
        {view==="recommend"&&isHM&&<div style={S.card}>
          <h3 style={{margin:"0 0 12px",color:P.navy}}>💡 Schedule Health — FT Ratio: {recs.summary.ftRatio}%</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:16}}>
            <div style={S.statCard}><div style={{fontSize:28,fontWeight:800,color:recs.summary.ftRatio>=80?P.grn:P.org}}>{recs.summary.ftRatio}%</div><div style={{fontSize:12}}>FT coverage</div></div>
            <div style={S.statCard}><div style={{fontSize:28,fontWeight:800,color:P.grn}}>{recs.summary.totalFTScheduled.toFixed(0)}h</div><div style={{fontSize:12}}>FT hours</div></div>
            <div style={S.statCard}><div style={{fontSize:28,fontWeight:800,color:P.org}}>{recs.summary.totalPTScheduled.toFixed(0)}h</div><div style={{fontSize:12}}>PT hours</div></div>
            <div style={S.statCard}><div style={{fontSize:28,fontWeight:800,color:P.red}}>{recs.summary.totalExScheduled.toFixed(0)}h</div><div style={{fontSize:12}}>Flex hours</div></div>
          </div>
          {recs.swapSuggestions.length>0&&<div><h4 style={{color:P.pur}}>🔄 {recs.swapSuggestions.length} swap opportunities (PT/Extra → FT)</h4>
            {recs.swapSuggestions.slice(0,6).map((sg,i)=> <div key={i} style={S.recRow}><strong>{DAYS[sg.dayIndex]}</strong> — {sg.shift.name}: replace {sg.currentStaff.name} with {sg.candidates[0]?.name}</div>)}
          </div>}
        </div>}

        {/* REQUESTS */}
        {view==="requests"&&<div style={S.card}>
          <h3 style={{margin:"0 0 12px",color:P.navy}}>📨 Requests ({pendReqs} pending)</h3>
          {(h.requests||[]).filter(r=>r.status==="pending").map(r=>{const st=h.staff.find(s=>s.id===r.staffId);const rt=REQ_TYPES.find(t=>t.id===r.type)||REQ_TYPES[0];return (
            <div key={r.id} style={{padding:14,borderRadius:10,border:`1px solid ${P.gryL}`,background:P.bg,marginBottom:8,borderLeft:`4px solid ${rt.color}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <div><strong>{st?.name}</strong> — {rt.icon} {rt.label}: {r.startDate}{r.startDate!==r.endDate&&` → ${r.endDate}`}<div style={{fontSize:12,color:P.gry}}>{r.reason}</div></div>
                <div style={{display:"flex",gap:6}}><button onClick={()=>upH("requests",h.requests.map(x=>x.id===r.id?{...x,status:"approved"}:x))} style={{padding:"6px 14px",border:"none",borderRadius:8,background:P.grnL,color:P.grn,cursor:"pointer",fontWeight:700,fontSize:12}}>✓ Approve</button>
                  <button onClick={()=>upH("requests",h.requests.map(x=>x.id===r.id?{...x,status:"denied"}:x))} style={{padding:"6px 14px",border:"none",borderRadius:8,background:P.redL,color:P.red,cursor:"pointer",fontWeight:700,fontSize:12}}>✗ Deny</button></div>
              </div></div>);})}
          {!pendReqs&&<p style={{color:P.gry,textAlign:"center",padding:16}}>All caught up!</p>}
        </div>}

        {/* HR */}
        {view==="hr"&&isHM&&<div style={S.card}>
          <h3 style={{margin:"0 0 12px",color:P.navy}}>🏛️ HR — Payroll Overview</h3>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr><th style={S.fcTh}>Employee</th><th style={S.fcTh}>Type</th><th style={S.fcTh}>€/hr</th><th style={S.fcTh}>Hours</th><th style={S.fcTh}>Gross/mo</th><th style={S.fcTh}>Net/mo</th><th style={S.fcTh}>Employer/mo</th><th style={S.fcTh}>Cost/hr</th></tr></thead>
            <tbody>{h.staff.map(s=>{let hrs=0;h.assignments.filter(a=>a.staffId===s.id).forEach(a=>{const d=allDefs.find(x=>x.id===a.shiftId);if(d)hrs+=sDur(d.startTime,d.endTime);});const p=calcPay(s,hrs);const ct=CT.find(c=>c.id===s.contractType);
              return <tr key={s.id}><td style={S.fcTd}><strong>{s.name}</strong></td><td style={S.fcTd}>{ct?.icon}</td><td style={S.fcTd}>{euro(p.rate)}</td><td style={S.fcTd}>{p.hrs.toFixed(1)}</td><td style={S.fcTd}>{euro(p.mG)}</td><td style={{...S.fcTd,color:P.grn,fontWeight:700}}>{euro(p.mN)}</td><td style={{...S.fcTd,color:P.navy,fontWeight:700}}>{euro(p.tcM)}</td><td style={S.fcTd}>{p.cph>0?euro(p.cph):"—"}</td></tr>;})}</tbody>
          </table></div>
        </div>}

        {/* SETTINGS */}
        {view==="settings"&&isHM&&<div>
          <div style={{...S.card,marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,color:P.navy}}>🏢 Departments & Outlets</h3>
              <button style={S.addBtn} onClick={()=>{const nm=prompt("Department name:");if(!nm?.trim())return;const ic=prompt("Emoji icon:")||"🏢";const nd={id:gid(),name:nm.trim(),icon:ic.trim(),outlets:[]};upH("departments",[...h.departments,nd]);setSelDept(nd.id);}}>+ Department</button></div>
            {h.departments.map(dept=> <div key={dept.id} style={{padding:12,borderRadius:10,border:`1px solid ${P.gryL}`,background:P.bg,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{fontWeight:700}}>{dept.icon} {dept.name} ({dept.outlets.length} outlets)</span>
                <div style={{display:"flex",gap:4}}>
                  <button style={{...S.addBtn,fontSize:11,padding:"4px 8px"}} onClick={()=>{const nm=prompt("Outlet name:");if(!nm?.trim())return;upH("departments",h.departments.map(d=>d.id===dept.id?{...d,outlets:[...d.outlets,{id:gid(),name:nm.trim(),shifts:[],captureRates:{},handlingCapacity:{}}]}:d));}}>+ Outlet</button>
                  {!["fo","fb"].includes(dept.id)&&<button style={S.delBtn} onClick={()=>{if(confirm("Delete "+dept.name+"?"))upH("departments",h.departments.filter(d=>d.id!==dept.id));}}>✕</button>}
                </div></div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{dept.outlets.map(o=> <span key={o.id} style={{padding:"3px 8px",borderRadius:6,background:P.wh,border:`1px solid ${P.gryL}`,fontSize:12}}>{o.name} <button style={{border:"none",background:"none",color:P.red,cursor:"pointer",fontSize:11}} onClick={()=>upH("departments",h.departments.map(d=>d.id===dept.id?{...d,outlets:d.outlets.filter(x=>x.id!==o.id)}:d))}>✕</button></span>)}</div>
            </div>)}
          </div>
          {cDept&&<div style={S.card}><h3 style={{margin:"0 0 12px",color:P.navy}}>{cDept.icon} {cDept.name} — Shifts</h3>
            {cDept.outlets.map(o=> <ShiftDefs key={o.id} outlet={o} onUp={u=>upOut(cDept.id,u)}/>)}
          </div>}
        </div>}

        {/* STAFF */}
        {view==="staff"&&<div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,color:P.navy}}>👥 Staff</h3>
            <button style={S.addBtn} onClick={()=>{const nm=prompt("Staff name:");if(!nm?.trim())return;const em=prompt("Email (optional):")||"";const oid=prompt("Outlet ID (e.g. fo-desk, fb-rest):")||"";upH("staff",[...h.staff,{id:gid(),name:nm.trim(),email:em,outletId:oid,contractType:"fulltime",contractHours:38,hourlyRate:13.68}]);}}>+ Add</button></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:8}}>
            {(user.deptIds?h.staff.filter(s=>{const o=h.departments.flatMap(d=>d.outlets).find(o2=>o2.id===s.outletId);return o&&user.deptIds.includes(h.departments.find(d=>d.outlets.some(o3=>o3.id===o.id))?.id);}):h.staff).map(s=>{const o=h.departments.flatMap(d=>d.outlets.map(o2=>({...o2,deptName:d.name}))).find(x=>x.id===s.outletId);return (
              <div key={s.id} style={S.staffCard}><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:6}}><SBadge type={s.contractType}/><strong style={{color:P.navy}}>{s.name}</strong></div>
                <div style={{fontSize:11,color:P.gry,marginTop:2}}>{o?`${o.deptName} → ${o.name}`:""} {s.contractHours>0&&`· ${s.contractHours}h/wk`} {s.email&&`· ${s.email}`}</div></div>
                {isHM&&<button style={S.delBtn} onClick={()=>upH("staff",h.staff.filter(x=>x.id!==s.id))}>✕</button>}
              </div>);})}
          </div>
        </div>}

        {/* USERS (hotel manager only) */}
        {view==="users"&&isHM&&<div style={S.card}>
          <h3 style={{margin:"0 0 16px",color:P.navy}}>🔑 Hotel Access Management</h3>
          <div style={{marginBottom:20}}>
            <h4 style={{color:P.navy,margin:"0 0 8px"}}>👔 Hotel Manager</h4>
            <div style={S.profRow}><span style={S.profL}>Name</span><span>{h.hotelManager?.name||"—"}</span></div>
            <div style={S.profRow}><span style={S.profL}>Email</span><span>{h.hotelManager?.email||"—"}</span></div>
          </div>
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><h4 style={{color:P.navy,margin:0}}>📋 Department Managers</h4>
              <button style={S.addBtn} onClick={()=>{const nm=prompt("Name:");const em=prompt("Email:");const pw=prompt("Password:");const dids=prompt("Department IDs (comma-sep, e.g. fo,fb):");if(!nm||!em||!pw)return;upH("deptManagers",[...(h.deptManagers||[]),{id:gid(),name:nm,email:em,password:pw,deptIds:(dids||"").split(",").map(x=>x.trim())}]);}}>+ Add</button></div>
            {(h.deptManagers||[]).map(dm=> <div key={dm.id} style={{...S.profRow,marginBottom:4}}>
              <span><strong>{dm.name}</strong> ({dm.email}) — Depts: {(dm.deptIds||[]).join(", ")}</span>
              <button style={S.delBtn} onClick={()=>upH("deptManagers",(h.deptManagers||[]).filter(x=>x.id!==dm.id))}>✕</button>
            </div>)}
          </div>
          <div>
            <h4 style={{color:P.navy,margin:"0 0 8px"}}>👤 Staff Login (shared)</h4>
            <div style={S.profRow}><span style={S.profL}>Username</span><span>{h.staffLogin?.username||"—"}</span></div>
            <div style={S.profRow}><span style={S.profL}>Password</span><span>{h.staffLogin?.password||"—"}</span></div>
            <button style={{...S.addBtn,marginTop:8}} onClick={()=>{const u=prompt("Staff username:",h.staffLogin?.username||"staff");const p=prompt("Staff password:",h.staffLogin?.password||"");if(u&&p)upH("staffLogin",{username:u,password:p});}}>Edit Staff Login</button>
          </div>
        </div>}
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── LOGIN SCREEN ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
function LoginScreen({onLogin,onForgot}){
  const[email,setEmail]=useState(""),[pw,setPw]=useState(""),[err,setErr]=useState(""),[msg,setMsg]=useState(""),[forgot,setForgot]=useState(false),[fEmail,setFEmail]=useState("");
  const submit=()=>{const e=onLogin(email,pw);if(e)setErr(e);};
  const doForgot=()=>{if(!fEmail.trim()){setErr("Enter your email");return;}const e=onForgot(fEmail);if(e){setErr(e);setMsg("");}else{setMsg("Password reset link sent to "+fEmail);setErr("");}};
  if(forgot)return (
    <div style={S.loginCont}><div style={S.loginCard}>
      <div style={{textAlign:"center",marginBottom:16}}><span style={{fontSize:46}}>🏨</span><h1 style={S.loginTitle}>ShiftMaster</h1><p style={S.loginSub}>Reset your password</p></div>
      <input style={S.input} placeholder="Email address" type="email" value={fEmail} onChange={e=>{setFEmail(e.target.value);setErr("");setMsg("");}} onKeyDown={e=>e.key==="Enter"&&doForgot()} autoFocus/>
      {err&&<p style={{color:P.red,fontSize:13,margin:0}}>{err}</p>}
      {msg&&<div style={{padding:12,borderRadius:10,background:P.grnL,fontSize:13,color:P.grn,textAlign:"center"}}>{msg}</div>}
      <button style={S.primBtn} onClick={doForgot}>Send Reset Link</button>
      <button style={S.linkBtn} onClick={()=>{setForgot(false);setErr("");setMsg("");}}>← Back to Sign In</button>
    </div></div>
  );
  return (
    <div style={S.loginCont}><div style={S.loginCard}>
      <div style={{textAlign:"center",marginBottom:16}}><span style={{fontSize:46}}>🏨</span><h1 style={S.loginTitle}>ShiftMaster</h1><p style={S.loginSub}>Your schedule; our solution</p></div>
      <input style={S.input} placeholder="Email / Username" value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()}/>
      <input style={S.input} placeholder="Password" type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&submit()}/>
      {err&&<p style={{color:P.red,fontSize:13,margin:0}}>{err}</p>}
      <button style={S.primBtn} onClick={submit}>Sign In</button>
      <button style={S.linkBtn} onClick={()=>{setForgot(true);setFEmail(email);}}>Forgot password?</button>
    </div></div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── ADMIN VIEW ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
function AdminView({system,saveSystem,hotelData,saveHotel,logout,onEnterHotel}){
  const[tab,setTab]=useState("hotels");
  const addHotel=()=>{const nm=prompt("Hotel name:");if(!nm?.trim())return;const id=gid();const em=prompt("Hotel manager email:");const pw=prompt("Hotel manager password:");const mgNm=prompt("Hotel manager name:")||"Manager";
    const newHotel={id,name:nm.trim(),hotelManager:{name:mgNm,email:em||"",password:pw||"manager1"},deptManagers:[],staffLogin:{username:"staff",password:"staff123"},staff:[],departments:[{id:"fo",name:"Front Office",icon:"🛎️",outlets:[]},{id:"fb",name:"Food & Beverage",icon:"🍽️",outlets:[]}],assignments:[],segments:SEGS_DEFAULT,forecast:{fo:{},fb:{}},requests:[],reviews:[],warnings:[]};
    saveSystem({...system,hotels:[...system.hotels,{id,name:nm.trim()}]});saveHotel(id,newHotel);};
  const delHotel=(hid)=>{if(!confirm("Delete this hotel permanently?"))return;saveSystem({...system,hotels:system.hotels.filter(h=>h.id!==hid)});};

  return (
    <div style={S.app}>
      <header style={S.header}><div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:24}}>🏨</span><div><h1 style={S.hTitle}>ShiftMaster</h1><p style={S.hSub}>System Admin</p></div></div>
        <button style={S.logBtn} onClick={logout}>Sign Out</button></header>
      <nav style={S.nav}><div style={{display:"flex",gap:4}}>
        {[{id:"hotels",l:"🏨 Hotels"},{id:"admins",l:"🔒 Admins"}].map(t=> <button key={t.id} style={{...S.navBtn,...(tab===t.id?S.navBtnA:{})}} onClick={()=>setTab(t.id)}>{t.l}</button>)}
      </div></nav>
      <main style={S.main}>
        {tab==="hotels"&&<div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,color:P.navy}}>🏨 Hotels</h3><button style={S.addBtn} onClick={addHotel}>+ Add Hotel</button></div>
          <div style={{display:"grid",gap:12}}>
            {system.hotels.map(hMeta=>{const hd=hotelData[hMeta.id];return (
              <div key={hMeta.id} style={{padding:16,borderRadius:12,border:`1px solid ${P.gryL}`,background:P.bg}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><h4 style={{margin:0,color:P.navy}}>{hMeta.name}{hMeta.id==="test"&&<Badge color={P.pur} bg={P.purL}>Demo</Badge>}</h4>
                    <div style={{fontSize:12,color:P.gry,marginTop:4}}>{hd?`${hd.departments?.length||0} depts · ${hd.staff?.length||0} staff · Manager: ${hd.hotelManager?.email||"—"}`:"Loading..."}</div></div>
                  <div style={{display:"flex",gap:4}}><button style={S.addBtn} onClick={()=>onEnterHotel(hMeta.id)}>Enter →</button>{hMeta.id!=="test"&&<button style={S.delBtn} onClick={()=>delHotel(hMeta.id)}>✕</button>}</div>
                </div></div>);})}
          </div>
        </div>}
        {tab==="admins"&&<div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,color:P.navy}}>🔒 System Admins</h3>
            <button style={S.addBtn} onClick={()=>{const nm=prompt("Name:");const em=prompt("Email:");const pw=prompt("Password:");if(!nm||!em||!pw)return;saveSystem({...system,admins:[...system.admins,{id:gid(),name:nm,email:em,password:pw}]});}}>+ Add Admin</button></div>
          {system.admins.map(a=> <div key={a.id} style={{...S.profRow,marginBottom:6}}><span><strong>{a.name}</strong> — {a.email}</span>{system.admins.length>1&&<button style={S.delBtn} onClick={()=>saveSystem({...system,admins:system.admins.filter(x=>x.id!==a.id)})}>✕</button>}</div>)}
        </div>}
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ── STYLES ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
const S={
  loginCont:{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${P.navy} 0%,${P.navyL} 50%,${P.navyM} 100%)`,padding:20},
  loginCard:{background:P.wh,borderRadius:20,padding:"40px 32px",width:"100%",maxWidth:380,display:"flex",flexDirection:"column",alignItems:"center",gap:12,boxShadow:"0 20px 60px rgba(0,0,0,.3)"},
  loginTitle:{margin:"8px 0 0",fontSize:28,fontWeight:800,color:P.navy,letterSpacing:"-.5px",fontFamily:"'Georgia',serif"},
  loginSub:{margin:"4px 0 0",fontSize:13,color:P.gry},
  input:{width:"100%",padding:"12px 14px",border:`1.5px solid ${P.gryL}`,borderRadius:10,fontSize:14,outline:"none",boxSizing:"border-box"},
  primBtn:{width:"100%",padding:12,border:"none",borderRadius:10,background:P.navy,color:P.acc,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:4},
  linkBtn:{background:"none",border:"none",color:P.gry,cursor:"pointer",fontSize:13,marginTop:4},
  app:{minHeight:"100vh",background:P.bg,fontFamily:"'Segoe UI',system-ui,-apple-system,sans-serif"},
  header:{background:P.navy,padding:"14px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12},
  hTitle:{margin:0,fontSize:20,fontWeight:800,color:P.acc,fontFamily:"'Georgia',serif"},
  hSub:{margin:0,fontSize:12,color:P.cream,opacity:.7},
  wBtn:{padding:"4px 10px",border:`1px solid ${P.acc}`,borderRadius:6,background:"transparent",color:P.acc,cursor:"pointer",fontSize:14,fontWeight:700},
  logBtn:{padding:"6px 14px",border:"1px solid rgba(255,255,255,.2)",borderRadius:6,background:"transparent",color:P.cream,cursor:"pointer",fontSize:12},
  nav:{background:P.wh,padding:"8px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${P.gryL}`,flexWrap:"wrap",gap:8},
  navBtn:{padding:"8px 16px",border:"none",borderRadius:8,background:"transparent",color:P.gryD,cursor:"pointer",fontSize:13,fontWeight:600},
  navBtnA:{background:P.navy,color:P.acc},
  prBtn:{padding:"6px 12px",border:`1px solid ${P.gryL}`,borderRadius:6,background:P.wh,color:P.gryD,cursor:"pointer",fontSize:12,fontWeight:600},
  main:{padding:24,maxWidth:1300,margin:"0 auto"},
  card:{background:P.wh,borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,.06)",border:`1px solid ${P.gryL}`},
  center:{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12},
  deptTab:{padding:"10px 20px",border:`2px solid ${P.gryL}`,borderRadius:10,background:P.wh,color:P.gryD,cursor:"pointer",fontSize:14,fontWeight:700},
  deptTabA:{borderColor:P.acc,background:P.accDim,color:P.navy},
  outTab:{padding:"6px 14px",border:`1.5px solid ${P.gryL}`,borderRadius:8,background:P.wh,color:P.gryD,cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center"},
  outTabA:{borderColor:P.navy,background:P.navy,color:P.acc},
  th:{padding:"10px 8px",textAlign:"center",fontSize:12,fontWeight:700,color:P.navy,borderBottom:`2px solid ${P.gryL}`,background:P.bg},
  td:{padding:6,verticalAlign:"top",borderBottom:`1px solid ${P.gryL}`,borderRight:`1px solid ${P.gryL}`,minWidth:120},
  tdL:{padding:"10px 8px",verticalAlign:"top",borderBottom:`1px solid ${P.gryL}`,background:P.bg},
  chip:{display:"flex",alignItems:"center",gap:4,padding:"3px 6px",marginBottom:3,borderRadius:6,background:P.wh,border:`1px solid ${P.gryL}`,fontSize:12},
  chipRm:{border:"none",background:"transparent",color:P.gry,cursor:"pointer",fontSize:10,padding:"0 2px"},
  asSel:{width:"100%",padding:"3px 4px",border:`1px dashed ${P.gry}`,borderRadius:6,background:"transparent",fontSize:11,color:P.gry,cursor:"pointer"},
  shiftEd:{padding:16,background:P.bg,borderRadius:12,marginBottom:12,border:`1px solid ${P.gryL}`},
  shRow:{display:"flex",alignItems:"center",gap:8,padding:8,marginBottom:6,borderRadius:8,border:`1px solid ${P.gryL}`,background:P.wh,flexWrap:"wrap"},
  shInp:{padding:"6px 8px",border:`1px solid ${P.gryL}`,borderRadius:6,fontSize:13,outline:"none"},
  mini:{display:"flex",alignItems:"center",gap:4,fontSize:11,color:P.gry,fontWeight:600},
  addBtn:{padding:"6px 14px",border:"none",borderRadius:6,background:P.acc,color:P.wh,cursor:"pointer",fontSize:12,fontWeight:700},
  delBtn:{padding:"4px 8px",border:"none",borderRadius:4,background:"transparent",color:P.red,cursor:"pointer",fontSize:14,fontWeight:700},
  staffCard:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:12,borderRadius:10,border:`1px solid ${P.gryL}`,background:P.bg,gap:8},
  dayCard:{padding:12,borderRadius:12,border:`1.5px solid ${P.gryL}`,background:P.wh,textAlign:"center",minHeight:100},
  empCard:{padding:8,borderRadius:8,background:P.bg,marginBottom:6,border:`1px solid ${P.gryL}`},
  statCard:{padding:16,borderRadius:12,background:P.bg,border:`1px solid ${P.gryL}`,textAlign:"center"},
  recRow:{padding:"10px 14px",borderRadius:10,border:`1px solid ${P.gryL}`,background:P.bg,marginBottom:6,fontSize:13},
  fcTh:{padding:"8px 10px",textAlign:"left",fontSize:12,fontWeight:700,color:P.navy,borderBottom:`2px solid ${P.gryL}`,background:P.bg},
  fcTd:{padding:"6px 10px",borderBottom:`1px solid ${P.gryL}`,fontSize:12},
  profRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:8,background:P.bg,border:`1px solid ${P.gryL}`,marginBottom:4},
  profL:{fontSize:12,fontWeight:600,color:P.gry},
};
