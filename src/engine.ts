export type Point={stress:number;collapse:number};
export type Pipe={id:string;enabled:boolean;grade:string;od:number;weight:number;area:number;burst:number;collapse:number;body:number|null;joint:number|null;price:number|null;table:Point[]};
export type Params={depth:number;od:number;mud:number;pore:number;burstDF:number;collapseDF:number;tensionDF:number;tolerance:number;step:number};
export type Segment={pipe:Pipe;start:number;end:number;weight:number;cost:number|null;topLoad:number;topStress:number;minCollapseSF:number;minTensionSF:number};
export type Trace={depth:number;grade:string;weight:number;load:number;stress:number;rating:number;required:number;factor:number;status:string};
export type Result={status:'safe'|'none'|'incomplete';segments:Segment[];totalWeight:number;totalCost:number|null;burstRequired:number;bottomCollapse:number;rejected:string[];trace:Trace[];method:string;warnings:string[]};
export const defaults:Params={depth:8000,od:9.625,mud:12.5,pore:6000,burstDF:1.1,collapseDF:1.125,tensionDF:1.8,tolerance:1,step:25};
// All ratings below transcribed from lecture slides 36, 46, 55. Missing strengths are deliberately null.
export const initialPipes:Pipe[]=[
 {id:'n40',enabled:true,grade:'N-80',od:9.625,weight:40,area:11.454,burst:5750,collapse:3090,body:null,joint:null,price:null,table:[[-10000,3170],[-5000,3130],[0,3090],[5000,3030],[10000,2980],[15000,2910],[20000,2840]].map(([stress,collapse])=>({stress,collapse}))},
 {id:'n435',enabled:true,grade:'N-80',od:9.625,weight:43.5,area:12.559,burst:6330,collapse:3810,body:null,joint:null,price:null,table:[[-10000,3870],[-5000,3840],[0,3810],[5000,3770],[10000,3720],[15000,3660],[20000,3590]].map(([stress,collapse])=>({stress,collapse}))},
 {id:'n47',enabled:true,grade:'N-80',od:9.625,weight:47,area:13.572,burst:6870,collapse:4760,body:1086000,joint:905000,price:null,table:[[-10000,4870],[-5000,4820],[0,4760],[5000,4680],[10000,4600],[15000,4500],[20000,4390]].map(([stress,collapse])=>({stress,collapse}))},
 {id:'n535',enabled:true,grade:'N-80',od:9.625,weight:53.5,area:15.547,burst:7930,collapse:6620,body:null,joint:null,price:null,table:[[-10000,6850],[-5000,6740],[0,6620],[5000,6480],[10000,6320],[15000,6150],[20000,5960]].map(([stress,collapse])=>({stress,collapse}))}
];
export function interpolate(points:Point[],stress:number):number|null{const a=[...points].filter(p=>Number.isFinite(p.stress)&&Number.isFinite(p.collapse)&&p.collapse>0).sort((x,y)=>x.stress-y.stress);if(a.length<2||stress<a[0].stress-1e-8||stress>a[a.length-1].stress+1e-8)return null;for(let i=1;i<a.length;i++){if(stress<=a[i].stress){const x=a[i-1],y=a[i];if(y.stress===x.stress)return null;return x.collapse+(stress-x.stress)*(y.collapse-x.collapse)/(y.stress-x.stress)}}return a[a.length-1].collapse}
export function validate(p:Params,pipes:Pipe[]):string[]{const e:string[]=[];for(const k of ['depth','od','mud','pore','burstDF','collapseDF','tensionDF','tolerance','step'] as (keyof Params)[])if(!Number.isFinite(p[k])||p[k]<=0)e.push(`${k} must be positive`);if(p.burstDF<1||p.collapseDF<1||p.tensionDF<1)e.push('Design factors must be at least 1');if(p.step>p.depth)e.push('Grid step cannot exceed well depth');for(const x of pipes.filter(x=>x.enabled&&x.od===p.od)){if(!x.grade.trim()||[x.od,x.weight,x.area,x.burst,x.collapse].some(v=>!Number.isFinite(v)||v<=0))e.push(`${x.id}: invalid casing specifications`);if(x.table.length<2||x.table.some(q=>!Number.isFinite(q.stress)||!Number.isFinite(q.collapse)||q.collapse<=0))e.push(`${x.id}: invalid axial-collapse table`);if(x.body!==null&&x.body<=0||x.joint!==null&&x.joint<=0)e.push(`${x.id}: invalid tensile strength`)}return e}
// Collapse-first iterative sizing across enabled grades and weights.
// Tension is reported separately and never suppresses the collapse solution.
export type Iteration={candidate:string;iteration:number;assumed:number;weightBelow:number;stress:number;correctedCollapse:number;newDepth:number};
export type Trial={label:string;accepted:boolean;reason:string;transitions:number[];iterations:Iteration[]};
export function calculate(p:Params,pipes:Pipe[]):Result & {iterations:Iteration[];trials:Trial[]} {
 const errors=validate(p,pipes),burstRequired=p.pore*p.burstDF,bottomCollapse=.052*p.mud*p.depth*p.collapseDF;
 const warnings:string[]=[],rejected:string[]=[],iterations:Iteration[]=[],trials:Trial[]=[];
 const all=pipes.filter(x=>x.enabled&&Math.abs(x.od-p.od)<.00001);
 const empty=(status:'none'|'incomplete')=>({status,segments:[],totalWeight:0,totalCost:null,burstRequired,bottomCollapse,rejected,trace:[],warnings:[...errors,...warnings],method:'Iterative axial-stress corrected collapse transitions; tension checked separately',iterations,trials} as Result & {iterations:Iteration[];trials:Trial[]});
 if(errors.length)return empty('incomplete');
 const qualified=all.filter(x=>{if(x.burst<burstRequired){rejected.push(x.grade+' '+x.weight+' lb/ft: burst '+x.burst+' < '+burstRequired+' psi');return false}if(x.table.length<2){rejected.push(x.grade+' '+x.weight+' lb/ft: missing collapse correction table');return false}return true});
 if(!qualified.length){warnings.push('No burst-qualified casing with collapse correction data.');return empty('none')}
 const gradient=.052*p.mud, tol=p.tolerance;
 const sequences:Pipe[][]=[];
 // Enumerate distinct casing choices, allowing mixed grades and multiple weights.
 for(const a of qualified)sequences.push([a]);
 for(const a of qualified)for(const b of qualified)if(a.id!==b.id&&a.collapse<b.collapse)sequences.push([a,b]);
 for(const a of qualified)for(const b of qualified)for(const c of qualified)if(a.id!==b.id&&b.id!==c.id&&a.collapse<b.collapse&&b.collapse<c.collapse)sequences.push([a,b,c]);
 let best:{parts:{pipe:Pipe;start:number;end:number}[];weight:number;cost:number|null;iterations:Iteration[]}|null=null;
 const allPriced=qualified.every(x=>x.price!==null&&Number.isFinite(x.price)&&x.price>=0);
 if(!allPriced)warnings.push('Prices incomplete: minimizing total casing weight as a proxy.');
 for(const seq of sequences){
  const label=seq.map(x=>x.grade+' '+x.weight).join(' → '),it:Iteration[]=[];
  let parts:{pipe:Pipe;start:number;end:number}[]=[{pipe:seq[seq.length-1],start:0,end:p.depth}];
  let reason='';
  // Build from bottom to top, inserting each lighter option after finding its collapse transition.
  for(let k=seq.length-2;k>=0;k--){
   const upper=seq[k];
   const lower=parts[0];
   const belowFixed=parts.slice(1).reduce((s,x)=>s+(x.end-x.start)*x.pipe.weight,0);
   let h=Math.min(lower.end,Math.max(0,upper.collapse/(p.collapseDF*gradient)));
   let converged=false;
   for(let i=0;i<100;i++){
    const weightBelow=belowFixed+(lower.end-h)*lower.pipe.weight;
    const stress=weightBelow/upper.area;
    const rating=interpolate(upper.table,stress);
    if(rating===null){reason='Axial stress outside supplied collapse table for '+upper.grade+' '+upper.weight;break}
    const newDepth=Math.max(0,Math.min(lower.end,rating/(p.collapseDF*gradient)));
    it.push({candidate:label,iteration:i+1,assumed:h,weightBelow,stress,correctedCollapse:rating,newDepth});
    if(Math.abs(newDepth-h)<=tol){h=newDepth;converged=true;break}
    h=newDepth;
   }
   if(reason)break;
   if(!converged){reason='Collapse iteration did not converge';break}
   if(h<=0||h>=lower.end-1e-6){reason='No positive interval for '+upper.grade+' '+upper.weight;break}
   parts=[{pipe:upper,start:0,end:h},{...lower,start:h},...parts.slice(1)];
  }
  if(!reason){
   for(let j=0;j<parts.length;j++){
    const s=parts[j];
    const below=parts.slice(j+1).reduce((sum,x)=>sum+(x.end-x.start)*x.pipe.weight,0);
    const load=below+(s.end-s.start)*s.pipe.weight;
    const rating=interpolate(s.pipe.table,load/s.pipe.area);
    if(rating===null||rating+1e-7<gradient*s.end*p.collapseDF){reason='Collapse check failed at '+s.end.toFixed(1)+' ft for '+s.pipe.grade+' '+s.pipe.weight;break}
   }
  }
  const weight=parts.reduce((s,x)=>s+(x.end-x.start)*x.pipe.weight,0);
  const cost=allPriced?parts.reduce((s,x)=>s+(x.end-x.start)*(x.pipe.price||0),0):null;
  trials.push({label,accepted:!reason,reason:reason||'Collapse and burst pass; tension checked separately',transitions:parts.slice(0,-1).map(x=>x.end),iterations:it});
  iterations.push(...it);
  if(!reason&&(!best||(allPriced?cost!<best.cost!:weight<best.weight)))best={parts,weight,cost,iterations:it};
 }
 if(!best){warnings.push('No collapse-feasible arrangement found using entered grades, weights and correction tables.');return empty('none')}
 const parts=best.parts;
 const segments:Segment[]=parts.map((part,j)=>{
  const below=parts.slice(j+1).reduce((s,x)=>s+(x.end-x.start)*x.pipe.weight,0);
  const load=below+(part.end-part.start)*part.pipe.weight,stress=load/part.pipe.area;
  const rating=interpolate(part.pipe.table,stress)!;
  const strength=part.pipe.body!==null&&part.pipe.joint!==null?Math.min(part.pipe.body,part.pipe.joint):null;
  return {...part,weight:(part.end-part.start)*part.pipe.weight,cost:part.pipe.price===null?null:(part.end-part.start)*part.pipe.price,topLoad:load,topStress:stress,minCollapseSF:rating/(gradient*part.end),minTensionSF:strength===null?NaN:strength/load};
 });
 const trace:Trace[]=segments.map(s=>({depth:s.end,grade:s.pipe.grade,weight:s.pipe.weight,load:s.topLoad,stress:s.topStress,rating:interpolate(s.pipe.table,s.topStress)!,required:gradient*s.end*p.collapseDF,factor:s.minCollapseSF,status:'PASS (collapse)'}));
 const missing=segments.filter(s=>!Number.isFinite(s.minTensionSF));
 const failed=segments.filter(s=>Number.isFinite(s.minTensionSF)&&s.minTensionSF<p.tensionDF);
 if(missing.length)warnings.push('Collapse design calculated; tension NOT VERIFIED: missing body/joint strength for '+missing.map(s=>s.pipe.grade+' '+s.pipe.weight).join(', '));
 if(failed.length)warnings.push('Tension FAIL for '+failed.map(s=>s.pipe.grade+' '+s.pipe.weight).join(', '));
 if(!missing.length&&!failed.length)warnings.push('Tension check passed for entered strengths.');
 return {status:missing.length||failed.length?'incomplete':'safe',segments,totalWeight:best.weight,totalCost:best.cost,burstRequired,bottomCollapse,rejected,trace,method:'Iterative collapse transition sizing across grades/weights; tension verification separate; selected '+(allPriced?'lowest entered cost':'lowest total weight')+' among enumerated candidates',warnings,iterations,trials};
}
