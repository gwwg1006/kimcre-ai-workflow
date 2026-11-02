"use client";

import { useEffect, useState } from "react";
import { readUploadResponse } from "@/lib/upload-response";
import { AlertTriangle, Box, Check, ChevronDown, ChevronUp, CirclePause, Clock3, Loader2, MoreHorizontal, Pencil, Play, Plus, Printer, Trash2 } from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Status = "waiting" | "printing" | "completed" | "error";
type Priority = "urgent" | "normal" | "low";
type Job = { screenshot?: string; id: number; printer: string; modelName: string; fileName: string; quantity: number; completedQuantity: number; material: string; color: string; nozzle: string; estimatedTime: string; printSettings: string; customer: string; note: string; status: Status; priority: Priority; sortOrder: number };
const printers = ["P2S", "H2S", "A2L", "A1", "X2D"];
const blank: Omit<Job, "id"> = { printer: "P2S", modelName: "", fileName: "", quantity: 1, completedQuantity: 0, material: "PLA", color: "White", nozzle: "0.4 mm", estimatedTime: "", printSettings: "0.20 mm Standard", customer: "", note: "", status: "waiting", priority: "normal", sortOrder: 99 };
const statusInfo: Record<Status, { label: string; cls: string; icon: typeof Clock3 }> = {
  waiting: { label: "출력 대기", cls: "bg-amber-100 text-amber-800", icon: Clock3 },
  printing: { label: "출력 중", cls: "bg-blue-100 text-blue-700", icon: Play },
  completed: { label: "완료", cls: "bg-emerald-100 text-emerald-700", icon: Check },
  error: { label: "오류", cls: "bg-red-100 text-red-700", icon: AlertTriangle },
};
const priorityRank: Record<Priority, number> = { urgent: 0, normal: 1, low: 2 };

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Job | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);
  const [saving, setSaving] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerPrinter, setRegisterPrinter] = useState("P2S");

  useEffect(() => {
    let active = true;
    fetch("/api/jobs").then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (active) setJobs(d.jobs); }).catch(e => toast.error(e instanceof Error ? e.message : "불러오기 실패")).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const sortedJobs = [...jobs].sort((a,b) => priorityRank[a.priority] - priorityRank[b.priority] || a.sortOrder - b.sortOrder || a.id - b.id);
  async function patchJob(id: number, changes: Partial<Job>, quiet = false) { const previous = jobs; setJobs(v => v.map(j => j.id === id ? { ...j, ...changes } : j)); try { const r = await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setJobs(v => v.map(j => j.id === id ? d.job : j)); setSelected(v => v?.id === id ? d.job : v); if (!quiet) toast.success("작업이 업데이트되었습니다."); } catch (e) { setJobs(previous); toast.error(e instanceof Error ? e.message : "수정 실패"); } }
  async function removeJob(id: number) { if (!confirm("이 작업을 삭제할까요?")) return; const r = await fetch(`/api/jobs/${id}`, { method: "DELETE" }); if (r.ok) { setJobs(v => v.filter(j => j.id !== id)); setSelected(null); toast.success("작업을 삭제했습니다."); } else toast.error("삭제하지 못했습니다."); }
  async function saveJob(data: Omit<Job, "id"> | Job) { setSaving(true); try { const hasId = "id" in data; const r = await fetch(hasId ? `/api/jobs/${data.id}` : "/api/jobs", { method: hasId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setJobs(v => hasId ? v.map(j => j.id === d.job.id ? d.job : j) : [...v, d.job]); setEditing(null); setSelected(null); toast.success(hasId ? "작업을 수정했습니다." : "새 작업을 추가했습니다."); } catch (e) { toast.error(e instanceof Error ? e.message : "저장 실패"); } finally { setSaving(false); } }
  async function move(job: Job, direction: -1 | 1) { const column = sortedJobs.filter(j => j.printer === job.printer); const i = column.findIndex(j => j.id === job.id); const target = column[i + direction]; if (!target) return; await Promise.all([patchJob(job.id, { sortOrder: target.sortOrder }, true), patchJob(target.id, { sortOrder: job.sortOrder }, true)]); }
  const counts = { total: jobs.length, printing: jobs.filter(j => j.status === "printing").length, waiting: jobs.filter(j => j.status === "waiting").length, completed: jobs.filter(j => j.status === "completed").length };

  return <main className="min-h-screen bg-[#f4f5f7] text-[#15191f]">
    <Toaster position="bottom-right" richColors />
    <header className="border-b border-slate-200 bg-white px-3 py-4 sm:px-4 sm:py-5 lg:px-7"><div className="mx-auto flex max-w-[1800px] flex-col gap-3 sm:gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div><div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold tracking-[.18em] text-blue-600 sm:mb-2 sm:text-xs"><span className="h-2 w-2 rounded-full bg-blue-600" /> LIVE PRODUCTION</div><h1 className="text-2xl font-black tracking-[-.04em] sm:text-3xl">PRINT FARM</h1></div>
      <div className="grid w-full grid-cols-4 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2"><Stat label="전체 작업" value={counts.total} /><Stat label="출력 중" value={counts.printing} tone="blue" /><Stat label="대기" value={counts.waiting} tone="amber" /><Stat label="완료" value={counts.completed} tone="green" /><Button className="col-span-4 h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold hover:bg-blue-700 sm:ml-1 sm:h-12 sm:rounded-xl sm:px-5 sm:text-base" onClick={() => { setRegisterPrinter("P2S"); setRegisterOpen(true); }}><Plus className="mr-1.5 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5" /> 작업 등록</Button></div>
    </div></header>
    <section className="mx-auto max-w-[1800px] p-2 sm:p-3 lg:p-6">{loading ? <div className="flex h-[60vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" /> 작업 불러오는 중</div> : <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
      {printers.map(printer => { const list = sortedJobs.filter(j => j.printer === printer); const active = list.find(j => j.status === "printing"); const hasError = list.some(j => j.status === "error"); return <section key={printer} className="min-h-[290px] rounded-xl border border-slate-200 bg-[#e9ebef] p-1.5 shadow-[0_1px_2px_rgba(0,0,0,.03)] sm:min-h-[520px] sm:rounded-2xl sm:p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-1 px-0.5 py-0.5 sm:mb-3 sm:px-1 sm:py-1"><div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5"><div className="hidden h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white sm:grid"><Printer className="h-4 w-4" /></div><div className="min-w-0"><h2 className="truncate text-sm font-black sm:text-lg">{printer}</h2><p className="text-[10px] font-semibold text-slate-500 sm:text-xs">{list.length}개 작업</p></div></div><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold sm:px-2.5 sm:py-1 sm:text-xs ${hasError ? "bg-red-100 text-red-700" : active ? "bg-blue-100 text-blue-700" : list.length ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-500"}`}>{hasError ? "오류" : active ? "출력 중" : list.length ? "대기" : "비어 있음"}</span></div>
        <div className="space-y-1.5 sm:space-y-2.5">{list.map((job, index) => <JobCard key={job.id} job={job} first={index===0} last={index===list.length-1} onOpen={() => setSelected(job)} onStatus={(status) => void patchJob(job.id,{status})} onMove={(d) => void move(job,d)} />)}
        {!list.length && <button onClick={() => { setRegisterPrinter(printer); setRegisterOpen(true); }} className="flex h-24 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-[11px] font-semibold text-slate-400 transition hover:border-blue-400 hover:text-blue-600 sm:h-40 sm:rounded-xl sm:text-sm"><Plus className="mb-1 h-4 w-4 sm:mb-2 sm:h-6 sm:w-6" />작업 등록</button>}</div>
      </section> })}</div>}</section>
    <Dialog open={registerOpen} onOpenChange={setRegisterOpen}><DialogContent className="max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>작업 등록</DialogTitle><DialogDescription>스크린샷은 선택 사항입니다. 파일 선택이나 붙여넣기로 추가할 수 있습니다.</DialogDescription></DialogHeader><ScreenshotForm key={registerOpen ? registerPrinter : "closed"} initialPrinter={registerPrinter} onSaved={(job) => { setJobs(v => [...v, job]); setRegisterOpen(false); }} /></DialogContent></Dialog>
    <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}><SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg">{selected && <Detail job={selected} onEdit={() => { setEditing(selected); setSelected(null); }} onDelete={() => void removeJob(selected.id)} onPatch={(c) => void patchJob(selected.id,c)} />}</SheetContent></Sheet>
    <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="text-2xl">작업 수정</DialogTitle><DialogDescription>모델과 출력 조건을 수정합니다.</DialogDescription></DialogHeader>{editing && <JobForm initial={editing} saving={saving} onSave={saveJob} onCancel={() => setEditing(null)} />}</DialogContent></Dialog>
  </main>;
}

function Stat({label,value,tone="slate"}:{label:string;value:number;tone?:string}) { const colors:Record<string,string>={slate:"bg-slate-100 text-slate-900",blue:"bg-blue-50 text-blue-700",amber:"bg-amber-50 text-amber-800",green:"bg-emerald-50 text-emerald-700"}; return <div className={`min-w-0 rounded-lg px-2 py-1.5 sm:min-w-[82px] sm:rounded-xl sm:px-3 sm:py-2 ${colors[tone]}`}><div className="truncate text-[10px] font-semibold opacity-65 sm:text-xs">{label}</div><div className="text-lg font-black leading-5 sm:text-xl sm:leading-6">{value}</div></div> }

function JobCard({job,first,last,onOpen,onStatus,onMove}:{job:Job;first:boolean;last:boolean;onOpen:()=>void;onStatus:(s:Status)=>void;onMove:(d:-1|1)=>void}) { const info=statusInfo[job.status]; const Icon=info.icon; if (job.screenshot) return <article className="overflow-hidden rounded-lg border bg-white"><button className="block w-full" onClick={onOpen} aria-label="스크린샷 크게 보기"><img src={job.screenshot} alt={job.modelName} className="h-auto w-full" loading="lazy" /></button><div className="flex flex-wrap items-center justify-between gap-1 p-2"><span className={`rounded px-1.5 py-1 text-xs ${info.cls}`}>{info.label}</span><button onClick={onOpen} className="min-h-8 text-xs font-semibold text-blue-700">상세 / 수정</button></div></article>; return <article onClick={onOpen} className={`group cursor-pointer overflow-hidden rounded-lg border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:rounded-xl ${job.priority==="urgent"?"border-l-[3px] border-l-red-500 sm:border-l-4":"border-slate-200"}`}><div className="p-2 sm:p-3"><div className="mb-2 flex items-start gap-1.5 sm:mb-3 sm:gap-3"><div className={`grid h-8 w-8 shrink-0 place-items-center rounded-md sm:h-12 sm:w-12 sm:rounded-lg ${job.material.includes("CF")?"bg-zinc-800 text-zinc-100":job.color.toLowerCase().includes("white")?"border bg-slate-50 text-slate-500":"bg-gradient-to-br from-blue-100 to-indigo-200 text-blue-700"}`}><Box className="h-4 w-4 sm:h-6 sm:w-6" /></div><div className="min-w-0 flex-1"><div className="mb-0.5 flex items-center gap-1 sm:mb-1 sm:gap-1.5">{job.priority==="urgent"&&<span className="rounded bg-red-50 px-1 py-0.5 text-[9px] font-black text-red-600 sm:px-1.5 sm:text-[11px]">긴급</span>}{job.priority==="low"&&<span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-500 sm:px-1.5 sm:text-[11px]">낮음</span>}</div><h3 className="truncate text-xs font-extrabold sm:text-[15px]" title={job.modelName}>{job.modelName}</h3><p className="truncate text-[10px] font-medium text-slate-500 sm:text-xs">{job.customer || "고객 미지정"}</p></div><DropdownMenu><DropdownMenuTrigger asChild><button aria-label="작업 메뉴" onClick={e=>e.stopPropagation()} className="-mr-1 rounded-md p-0.5 text-slate-400 hover:bg-slate-100 sm:mr-0 sm:rounded-lg sm:p-1"><MoreHorizontal className="h-4 w-4 sm:h-5 sm:w-5" /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={first} onClick={e=>{e.stopPropagation();onMove(-1)}}><ChevronUp /> 위로 이동</DropdownMenuItem><DropdownMenuItem disabled={last} onClick={e=>{e.stopPropagation();onMove(1)}}><ChevronDown /> 아래로 이동</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onClick={e=>{e.stopPropagation();onStatus("waiting")}}><CirclePause /> 출력 대기</DropdownMenuItem><DropdownMenuItem onClick={e=>{e.stopPropagation();onStatus("printing")}}><Play /> 출력 시작</DropdownMenuItem><DropdownMenuItem onClick={e=>{e.stopPropagation();onStatus("completed")}}><Check /> 완료 처리</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><div className="grid grid-cols-2 gap-x-1 gap-y-1 border-t border-slate-100 pt-1.5 text-[10px] sm:gap-x-2 sm:gap-y-2 sm:pt-2.5 sm:text-xs"><Meta label="재료" value={`${job.material} · ${job.color}`} /><Meta label="수량" value={`${job.completedQuantity}/${job.quantity}개`} /><Meta label="시간" value={job.estimatedTime||"미입력"} /><div className={`ml-auto inline-flex w-fit items-center gap-0.5 rounded-full px-1 py-0.5 text-[9px] font-bold sm:gap-1 sm:px-2 sm:py-1 sm:text-xs ${info.cls}`}><Icon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />{info.label}</div></div>{job.note && <p className="mt-1.5 truncate rounded-md bg-slate-50 px-1.5 py-1 text-[10px] font-medium text-slate-600 sm:mt-2 sm:px-2 sm:py-1.5 sm:text-xs">{job.note}</p>}</div>{job.status==="printing"&&<div className="h-1 bg-blue-100"><div className="h-full bg-blue-500" style={{width:`${Math.max(8,job.completedQuantity/job.quantity*100)}%`}} /></div>}</article> }
function Meta({label,value}:{label:string;value:string}) { return <div className="min-w-0"><span className="text-[9px] text-slate-400 sm:text-xs">{label}</span><div className="truncate font-bold text-slate-700">{value}</div></div> }

function Detail({job,onEdit,onDelete,onPatch}:{job:Job;onEdit:()=>void;onDelete:()=>void;onPatch:(c:Partial<Job>)=>void}) { const info=statusInfo[job.status]; return <div>{job.screenshot && <a href={job.screenshot} target="_blank" rel="noreferrer" className="block"><img src={job.screenshot} alt={job.modelName} className="h-auto w-full" /><span className="block p-2 text-center text-sm text-blue-700">원본 크게 보기 ↗</span></a>}<div className="bg-slate-950 p-6 text-white"><SheetHeader><div className="mb-6 flex items-center gap-2 text-sm font-bold text-blue-300"><Printer className="h-4 w-4" />{job.printer} · {info.label}</div><SheetTitle className="text-left text-3xl font-black text-white">{job.modelName}</SheetTitle><SheetDescription className="text-left text-slate-400">{job.fileName || "파일명 미입력"}</SheetDescription></SheetHeader><div className="mt-7 flex gap-2"><Button onClick={onEdit} className="bg-white text-slate-950 hover:bg-slate-100"><Pencil /> 수정</Button><Button variant="outline" onClick={onDelete} className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"><Trash2 /> 삭제</Button></div></div><div className="space-y-6 p-6"><section><h3 className="mb-3 text-sm font-black text-slate-500">진행 상태</h3><div className="grid grid-cols-3 gap-2">{(["waiting","printing","completed"] as Status[]).map(s=><button key={s} onClick={()=>onPatch({status:s})} className={`rounded-xl border px-2 py-3 text-sm font-bold ${job.status===s?"border-blue-600 bg-blue-50 text-blue-700":"border-slate-200 hover:bg-slate-50"}`}>{statusInfo[s].label}</button>)}</div></section><section><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black text-slate-500">완료 수량</h3><b>{job.completedQuantity} / {job.quantity}개</b></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={()=>onPatch({completedQuantity:Math.max(0,job.completedQuantity-1)})}>−</Button><div className="flex-1 overflow-hidden rounded-lg bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{width:`${job.quantity?job.completedQuantity/job.quantity*100:0}%`}} /></div><Button variant="outline" size="icon" onClick={()=>onPatch({completedQuantity:Math.min(job.quantity,job.completedQuantity+1)})}>+</Button></div></section><section className="grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4"><Info label="필라멘트" value={job.material}/><Info label="색상" value={job.color}/><Info label="노즐" value={job.nozzle}/><Info label="예상 시간" value={job.estimatedTime||"—"}/><Info label="출력 설정" value={job.printSettings}/><Info label="우선순위" value={job.priority==="urgent"?"긴급":job.priority==="low"?"낮음":"일반"}/></section><section><Info label="고객 / 주문" value={job.customer||"—"}/><div className="mt-4"><Info label="작업 메모" value={job.note||"—"}/></div></section></div></div> }
function Info({label,value}:{label:string;value:string}) { return <div><div className="mb-1 text-xs font-bold text-slate-400">{label}</div><div className="text-sm font-bold text-slate-800">{value}</div></div> }

function JobForm({initial,saving,onSave,onCancel}:{initial:Omit<Job,"id">|Job;saving:boolean;onSave:(j:Omit<Job,"id">|Job)=>void;onCancel:()=>void}) { const [f,setF]=useState(initial); const set=(k:string,v:string|number)=>setF(x=>({...x,[k]:v})); return <form className="grid gap-4 pt-2" onSubmit={e=>{e.preventDefault();onSave(f)}}><div className="grid gap-4 sm:grid-cols-2"><Field label="모델명 *"><Input required value={f.modelName} onChange={e=>set("modelName",e.target.value)} placeholder="Motor_Holder_v3" /></Field><Field label="STL / 3MF 파일명"><Input value={f.fileName} onChange={e=>set("fileName",e.target.value)} placeholder="model.3mf" /></Field><Field label="프린터"><Picker value={f.printer} onChange={v=>set("printer",v)} options={printers}/></Field><Field label="우선순위"><Picker value={f.priority} onChange={v=>set("priority",v)} options={["urgent","normal","low"]} labels={{urgent:"긴급",normal:"일반",low:"낮음"}}/></Field><Field label="수량"><Input type="number" min="1" value={f.quantity} onChange={e=>set("quantity",Number(e.target.value))}/></Field><Field label="완료 수량"><Input type="number" min="0" max={f.quantity} value={f.completedQuantity} onChange={e=>set("completedQuantity",Number(e.target.value))}/></Field><Field label="재료"><Input value={f.material} onChange={e=>set("material",e.target.value)} placeholder="PLA" /></Field><Field label="색상"><Input value={f.color} onChange={e=>set("color",e.target.value)} placeholder="White" /></Field><Field label="노즐"><Input value={f.nozzle} onChange={e=>set("nozzle",e.target.value)} placeholder="0.4 mm" /></Field><Field label="예상 출력시간"><Input value={f.estimatedTime} onChange={e=>set("estimatedTime",e.target.value)} placeholder="3시간 20분" /></Field><Field label="출력 설정"><Input value={f.printSettings} onChange={e=>set("printSettings",e.target.value)} /></Field><Field label="고객 / 주문"><Input value={f.customer} onChange={e=>set("customer",e.target.value)} placeholder="KAIST" /></Field></div><Field label="작업 메모"><Textarea value={f.note} onChange={e=>set("note",e.target.value)} placeholder="서포트 PETG Black" rows={3}/></Field><div className="mt-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>취소</Button><Button disabled={saving} className="bg-blue-600 hover:bg-blue-700">{saving&&<Loader2 className="animate-spin"/>}{"id" in f&&f.id?"수정 저장":"작업 추가"}</Button></div></form> }
function Field({label,children}:{label:string;children:React.ReactNode}) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div> }
function Picker({value,onChange,options,labels={}}:{value:string;onChange:(v:string)=>void;options:string[];labels?:Record<string,string>}) { return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o} value={o}>{labels[o]||o}</SelectItem>)}</SelectContent></Select> }

function ScreenshotForm({ initialPrinter, onSaved }: { initialPrinter: string; onSaved: (job: Job) => void }) {
  const [fields, setFields] = useState<Omit<Job, "id">>({ ...blank, printer: initialPrinter });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState("");
  const set = (key: keyof Omit<Job, "id">, value: string | number) => setFields(current => ({ ...current, [key]: value }));
  function setScreenshot(selected: File | undefined) {
    setUploaded("");
    if (!selected) return;
    if (!selected.type.startsWith("image/")) { toast.error("이미지 파일만 등록할 수 있습니다."); return; }
    if (selected.size > 10 * 1024 * 1024) { toast.error("10MB 이하 파일을 선택하세요."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    if (!fields.modelName) set("modelName", selected.name || "붙여넣은 스크린샷");
    if (!fields.fileName) set("fileName", selected.name || "clipboard-image.png");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      let url = uploaded;
      if (!url && file) {
        const form = new FormData(); form.append("file", file);
        const response = await fetch("/api/screenshots", { method: "POST", body: form });
        const data = await readUploadResponse(response);
        if (typeof data.url !== "string" || !data.url.startsWith("/api/screenshots/")) throw new Error("이미지 저장 주소를 받지 못했습니다. 다시 시도해 주세요.");
        url = data.url; setUploaded(url);
      }
      const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, modelName: fields.modelName || file?.name || "새 작업", fileName: fields.fileName || file?.name || "", screenshot: url }) });
      const data = await readUploadResponse(response);
      if (!data.job?.id) throw new Error("작업 등록 결과를 받지 못했습니다. 목록을 새로고침해 확인해 주세요.");
      onSaved(data.job); toast.success("작업을 등록했습니다.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "등록에 실패했습니다."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} onPaste={event => { const image = Array.from(event.clipboardData.files).find(item => item.type.startsWith("image/")); if (image) { event.preventDefault(); setScreenshot(image); } }} className="grid gap-4">
    <div className="grid min-h-28 place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center outline-none transition focus-within:border-blue-500" tabIndex={0}>
      <div><b className="text-sm">스크린샷 붙여넣기</b><p className="mt-1 text-xs text-slate-500">이 영역을 클릭한 뒤 Ctrl/Cmd + V, 또는 아래에서 파일을 선택하세요.</p></div>
      <Input className="mt-3 max-w-xs bg-white" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => setScreenshot(e.target.files?.[0])} />
    </div>
    {preview && <img src={preview} alt="등록할 스크린샷 미리보기" className="max-h-72 w-full rounded-lg border object-contain" />}
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="모델명 *"><Input required value={fields.modelName} onChange={e => set("modelName", e.target.value)} placeholder="작업명" /></Field>
      <Field label="프린터"><Picker value={fields.printer} onChange={value => set("printer", value)} options={printers} /></Field>
      <Field label="수량"><Input type="number" min="1" value={fields.quantity} onChange={e => set("quantity", Number(e.target.value))} /></Field>
      <Field label="완료 수량"><Input type="number" min="0" max={fields.quantity} value={fields.completedQuantity} onChange={e => set("completedQuantity", Number(e.target.value))} /></Field>
      <Field label="재료"><Input value={fields.material} onChange={e => set("material", e.target.value)} /></Field>
      <Field label="색상"><Input value={fields.color} onChange={e => set("color", e.target.value)} /></Field>
      <Field label="노즐"><Input value={fields.nozzle} onChange={e => set("nozzle", e.target.value)} /></Field>
      <Field label="예상 출력시간"><Input value={fields.estimatedTime} onChange={e => set("estimatedTime", e.target.value)} placeholder="3시간 20분" /></Field>
      <Field label="고객 / 주문"><Input value={fields.customer} onChange={e => set("customer", e.target.value)} /></Field>
      <Field label="우선순위"><Picker value={fields.priority} onChange={value => set("priority", value)} options={["urgent", "normal", "low"]} labels={{urgent:"긴급", normal:"일반", low:"낮음"}} /></Field>
      <Field label="출력 설정"><Input value={fields.printSettings} onChange={e => set("printSettings", e.target.value)} /></Field>
      <Field label="파일명"><Input value={fields.fileName} onChange={e => set("fileName", e.target.value)} /></Field>
    </div>
    <Field label="작업 메모"><Textarea value={fields.note} onChange={e => set("note", e.target.value)} rows={3} /></Field>
    <p className="text-xs text-slate-500">PNG / JPG / WebP · 최대 10MB. 등록한 이미지는 공개 사이트 방문자에게 표시됩니다.</p>
    <Button disabled={busy} type="submit">{busy ? "등록 중…" : "작업 등록"}</Button>
  </form>;
}
