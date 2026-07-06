"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import {
  Upload, Search, HardDrive, Clock, Download, Trash2, Eye, X,
  FileText, FolderOpen, Plus, Grid3X3, List, ArrowUpDown,
  Image, Video, Music, Archive, Settings, Star, MoreHorizontal,
  AlertTriangle, LogOut, ChevronRight, File,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface SupaFile {
  name: string;
  created_at: string;
  metadata: { size: number; mimetype: string };
}
interface ProgressItem {
  name: string;
  status: "uploading" | "done" | "fail";
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const STORAGE_LIMIT = 1 * 1024 * 1024 * 1024;
const BUCKET = "my-files";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function fileEmoji(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "🖼️";
  if (["pdf", "doc", "docx", "txt", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "📄";
  if (["mp4", "webm", "mov", "avi"].includes(ext)) return "🎬";
  if (["mp3", "wav", "aac", "ogg"].includes(ext)) return "🎵";
  if (["zip", "rar", "7z", "gz", "tar"].includes(ext)) return "🗜️";
  return "📃";
}

function fileType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "Images";
  if (["pdf", "doc", "docx", "txt", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "Documents";
  if (["mp4", "webm", "mov", "avi"].includes(ext)) return "Video";
  if (["mp3", "wav", "aac", "ogg"].includes(ext)) return "Audio";
  if (["zip", "rar", "7z", "gz", "tar"].includes(ext)) return "Archives";
  return "Other";
}

const typeColors: Record<string, string> = {
  Images: "from-amber-500/20 to-amber-600/10 border-amber-500/20",
  Documents: "from-blue-500/20 to-blue-600/10 border-blue-500/20",
  Video: "from-violet-500/20 to-violet-600/10 border-violet-500/20",
  Audio: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20",
  Archives: "from-zinc-500/20 to-zinc-600/10 border-zinc-500/20",
  Other: "from-zinc-500/10 to-zinc-600/5 border-zinc-500/10",
};

const typeIcons: Record<string, any> = {
  Images: Image, Documents: FileText, Video: Video, Audio: Music, Archives: Archive, Other: File,
};

const navCategories = [
  { label: "All Files", icon: HardDrive, filter: "" },
  { label: "Images", icon: Image, filter: "jpg,jpeg,png,gif,webp,svg" },
  { label: "Videos", icon: Video, filter: "mp4,webm,mov,avi" },
  { label: "Documents", icon: FileText, filter: "pdf,doc,docx,txt,xls,xlsx,ppt,pptx" },
  { label: "Audio", icon: Music, filter: "mp3,wav,aac,ogg" },
  { label: "Archives", icon: Archive, filter: "zip,rar,7z,gz,tar" },
];

/* ------------------------------------------------------------------ */
/*  Circular Progress                                                  */
/* ------------------------------------------------------------------ */
function CircularProgress({ pct, size = 80 }: { pct: number; size?: number }) {
  const r = size * 0.4;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-fs-surface3)" strokeWidth={size * 0.08} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="url(#grad)" strokeWidth={size * 0.08} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: "easeOut" }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-fs-accent)" />
          <stop offset="100%" stopColor="var(--color-fs-accent-hover)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                    */
/* ------------------------------------------------------------------ */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-fs-surface3/60 rounded-xl animate-pulse ${className}`} />;
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */
export default function AppShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [files, setFiles] = useState<SupaFile[]>([]);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [search, setSearch] = useState("");
  const [previewFile, setPreviewFile] = useState<SupaFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeNav, setActiveNav] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "size">("date");
  const [userId, setUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Auth */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s); 
      setUserId(s?.user?.id ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUserId(s?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  /* Files */
  const loadFiles = useCallback(async () => {
    if (!session || !userId) return;
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (!error) setFiles(((data ?? []) as SupaFile[]).map((f) => ({ ...f, name: f.name })));
  }, [session, userId]);
  useEffect(() => { if (session) loadFiles(); }, [session, loadFiles]);

  /* Upload */
  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      // Size limit check (50MB)
      if (file.size > 50 * 1024 * 1024) {
        setProgress((p) => [...p, { name: file.name, status: "fail", message: "Exceeds 50MB limit" }]);
        setTimeout(() => setProgress((p) => p.filter((pi) => pi.name !== file.name)), 3000);
        continue;
      }
      setProgress((p) => [...p, { name: file.name, status: "uploading", message: "Uploading…" }]);
      const cleanName = file.name.replace(/[^a-zA-Z0-9._\-\s]/g, "").trim();
      const filePath = `${userId}/${cleanName}`;
      const { error } = await supabase.storage.from(BUCKET).upload(filePath, file, { upsert: true });
      setProgress((p) => p.map((pi) => pi.name === file.name ? {
        ...pi,
        status: error ? "fail" : "done",
        message: error ? error.message : "Completed",
      } : pi));
      setTimeout(() => setProgress((p) => p.filter((pi) => pi.name !== file.name)), 3000);
    }
    loadFiles();
    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* Delete */
  const deleteFile = async (name: string) => {
    await supabase.storage.from(BUCKET).remove([`${userId}/${name}`]);
    loadFiles();
  };

  const getFileUrl = useCallback((name: string) => {
    return supabase.storage.from(BUCKET).getPublicUrl(`${userId}/${name}`).data.publicUrl;
  }, [userId]);

  /* Stats */
  const totalBytes = files.reduce((s, f) => s + (f.metadata?.size ?? 0), 0);
  const storagePct = Math.min((totalBytes / STORAGE_LIMIT) * 100, 100);
  const lastUpload = files.length ? files.reduce((a, b) => (new Date(a.created_at) > new Date(b.created_at) ? a : b)) : null;
  const typeBreakdown: Record<string, number> = { Images: 0, Documents: 0, Video: 0, Audio: 0, Archives: 0, Other: 0 };
  const typeSize: Record<string, number> = { Images: 0, Documents: 0, Video: 0, Audio: 0, Archives: 0, Other: 0 };
  files.forEach((f) => {
    const t = fileType(f.name);
    typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
    typeSize[t] = (typeSize[t] || 0) + (f.metadata?.size ?? 0);
  });

  // Filtering + sorting
  let filtered = [...files];
  if (activeNav) {
    const exts = activeNav.split(",");
    filtered = filtered.filter((f) => exts.some((e) => f.name.toLowerCase().endsWith(e)));
  }
  if (search) filtered = filtered.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
  filtered.sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "size") return (b.metadata?.size ?? 0) - (a.metadata?.size ?? 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const sortedSize = [...files].sort((a, b) => (b.metadata?.size ?? 0) - (a.metadata?.size ?? 0));

  /* ---------- Render ---------- */
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-fs-bg">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="w-5 h-5 border-2 border-fs-accent/30 border-t-fs-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin } })} />;
  }

  const largestFiles = sortedSize.slice(0, 4);

  return (
    <div
      className="flex min-h-screen relative z-[1]"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); }}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] bg-fs-accent/5 backdrop-blur-sm flex items-center justify-center">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-fs-surface border-2 border-dashed border-fs-accent/50 rounded-2xl px-14 py-12 text-center shadow-2xl">
              <Upload size={36} className="mx-auto text-fs-accent mb-3" />
              <p className="text-lg font-semibold text-fs-text">Drop to upload</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== SIDEBAR ===== */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.3 }}
        className="w-56 shrink-0 bg-fs-surface/80 backdrop-blur-xl border-r border-fs-border flex flex-col sticky top-0 h-screen overflow-y-auto z-10"
      >
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b border-fs-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fs-accent to-fs-accent-hover flex items-center justify-center shadow-lg shadow-fs-accent/20">
              <HardDrive size={15} className="text-white" />
            </div>
            <span className="text-base font-bold tracking-tight">File<span className="text-fs-accent">Sync</span></span>
          </div>
        </div>

        {/* Storage ring */}
        <div className="px-5 py-5 border-b border-fs-border/50">
          <div className="flex items-center gap-4">
            <CircularProgress pct={storagePct} size={64} />
            <div>
              <p className="text-sm font-semibold text-fs-text">{formatSize(totalBytes)}</p>
              <p className="text-[11px] text-fs-text3">of {formatSize(STORAGE_LIMIT)} used</p>
            </div>
          </div>
          {storagePct > 80 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="flex items-center gap-2 mt-3 text-[11px] text-fs-danger bg-fs-danger10 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="shrink-0" />
              Storage nearly full
            </motion.div>
          )}
        </div>

        {/* Nav categories */}
        <div className="px-3 py-3 border-b border-fs-border/50 space-y-0.5">
          {navCategories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeNav === cat.filter;
            const count = cat.filter
              ? files.filter((f) => cat.filter.split(",").some((e) => f.name.toLowerCase().endsWith(e))).length
              : files.length;
            return (
              <button
                key={cat.label}
                onClick={() => setActiveNav(isActive ? "" : cat.filter)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm transition-all ${
                  isActive ? "bg-fs-accent10 text-fs-accent font-medium" : "text-fs-text2 hover:text-fs-text hover:bg-fs-surface2"
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1 text-left">{cat.label}</span>
                <span className="text-[11px] text-fs-text3 tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Recent uploads */}
        <div className="px-5 py-4 border-b border-fs-border/50 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[1px] text-fs-text3 mb-3">Recent</p>
          {files.length === 0 ? (
            <p className="text-xs text-fs-text3">No uploads yet</p>
          ) : (
            <div className="space-y-2">
              {[...files].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 4).map((f) => (
                <div key={f.name} className="flex items-center gap-2.5">
                  <span className="text-base">{fileEmoji(f.name)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-fs-text2 truncate">{f.name}</p>
                    <p className="text-[10px] text-fs-text3">{formatSize(f.metadata?.size ?? 0)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settings / Sign out */}
        <div className="px-3 py-3 border-t border-fs-border/50 space-y-0.5">
          <button className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-fs-text3 hover:text-fs-text hover:bg-fs-surface2 transition-all">
            <Settings size={15} />
            Settings
          </button>
          <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-fs-text3 hover:text-fs-danger hover:bg-fs-danger10 transition-all">
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </motion.aside>

      {/* ===== MAIN ===== */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top nav */}
        <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="sticky top-0 z-10 bg-fs-bg/80 backdrop-blur-xl border-b border-fs-border/50 px-6 py-3">
          <div className="flex items-center gap-3 max-w-6xl mx-auto w-full">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-fs-text3 pointer-events-none" />
              <motion.input
                type="text" placeholder="Search files…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                whileFocus={{ scale: 1.01 }}
                className="w-full pl-9 pr-3 py-[9px] rounded-xl bg-fs-surface border border-fs-border text-sm text-fs-text outline-none focus:border-fs-accent/40 focus:shadow-sm focus:shadow-fs-accent/5 transition-all placeholder:text-fs-text3"
              />
            </div>

            {/* Sort */}
            <div className="relative">
              <select
                value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                className="appearance-none bg-fs-surface border border-fs-border rounded-xl px-3 py-[9px] pr-8 text-xs text-fs-text2 outline-none cursor-pointer hover:border-fs-border-h transition-colors"
              >
                <option value="date">Newest</option>
                <option value="name">Name</option>
                <option value="size">Size</option>
              </select>
              <ArrowUpDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fs-text3 pointer-events-none" />
            </div>

            {/* View toggle */}
            <div className="flex bg-fs-surface border border-fs-border rounded-xl overflow-hidden">
              <button onClick={() => setViewMode("grid")} className={`p-2 ${viewMode === "grid" ? "bg-fs-accent10 text-fs-accent" : "text-fs-text3 hover:text-fs-text2"}`}><Grid3X3 size={15} /></button>
              <button onClick={() => setViewMode("list")} className={`p-2 ${viewMode === "list" ? "bg-fs-accent10 text-fs-accent" : "text-fs-text3 hover:text-fs-text2"}`}><List size={15} /></button>
            </div>

            {/* Upload */}
            <motion.label whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 px-4 py-[9px] rounded-xl bg-fs-accent text-white text-sm font-semibold cursor-pointer hover:bg-fs-accent-hover hover:shadow-lg hover:shadow-fs-accent/20 active:scale-[0.97] transition-all"
            >
              <Plus size={14} /> Upload
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
            </motion.label>

            {/* Avatar */}
            <div className="w-[34px] h-[34px] rounded-xl bg-gradient-to-br from-fs-accent/30 to-fs-surface3 border border-fs-border flex items-center justify-center text-xs font-semibold text-fs-text2 shrink-0">
              {session.user?.email?.[0]?.toUpperCase() ?? "U"}
            </div>
          </div>
        </motion.div>

        {/* Content */}
        <div className="flex-1 px-6 py-5 max-w-6xl mx-auto w-full">
          {/* Progress toast */}
          <AnimatePresence>
            {progress.map((p) => (
              <motion.div key={p.name} initial={{ opacity: 0, y: -10, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-2 last:mb-4">
                <div className="bg-fs-surface border border-fs-border/60 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                  <span className="text-base shrink-0">{p.status === "done" ? "✅" : p.status === "fail" ? "❌" : "⏳"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-fs-text truncate">{p.name}</p>
                    <div className="h-1 bg-fs-surface3 rounded-full overflow-hidden mt-1.5">
                      <motion.div animate={{ width: p.status === "done" || p.status === "fail" ? "100%" : "60%" }} className="h-full rounded-full bg-gradient-to-r from-fs-accent to-fs-accent-hover" />
                    </div>
                  </div>
                  <span className={`text-[11px] shrink-0 whitespace-nowrap ${p.status === "done" ? "text-fs-success" : p.status === "fail" ? "text-fs-danger" : "text-fs-text3"}`}>{p.message}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-bold text-fs-text tracking-tight">
                {activeNav ? navCategories.find((c) => c.filter === activeNav)?.label ?? "Files" : "Files"}
              </motion.h1>
              <p className="text-sm text-fs-text3 mt-0.5">
                {filtered.length} {filtered.length === 1 ? "item" : "items"}
                {lastUpload && <> · Last upload {formatDate(lastUpload.created_at)}</>}
              </p>
            </div>
          </div>

          {/* Analytics cards */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <AnalyticCard label="Storage Used" value={formatSize(totalBytes)} sub={`${storagePct.toFixed(1)}% of ${formatSize(STORAGE_LIMIT)}`} icon={HardDrive} color="text-fs-accent" />
            <AnalyticCard label="Total Files" value={String(files.length)} sub={lastUpload ? `Latest: ${formatDate(lastUpload.created_at).split(",")[0]}` : "No files"} icon={File} color="text-fs-text2" />
            <AnalyticCard label="Largest File" value={largestFiles[0] ? formatSize(largestFiles[0].metadata?.size ?? 0) : "—"} sub={largestFiles[0]?.name ?? "No files"} icon={ArrowUpDown} color="text-fs-text2" />
            <AnalyticCard label="File Types" value={String(Object.keys(typeBreakdown).filter((k) => typeBreakdown[k] > 0).length)} sub={`${files.length} total files`} icon={Grid3X3} color="text-fs-text2" />
          </motion.div>

          {/* Storage breakdown */}
          {files.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-6">
              {Object.entries(typeBreakdown).filter(([, c]) => c > 0).map(([type, count]) => {
                const Icon = typeIcons[type] || File;
                const pct = totalBytes > 0 ? ((typeSize[type] || 0) / totalBytes) * 100 : 0;
                return (
                  <div key={type} className={`bg-gradient-to-br ${typeColors[type] || typeColors.Other} border rounded-xl p-3`}>
                    <Icon size={16} className="opacity-60 mb-2" />
                    <p className="text-xs font-semibold text-fs-text">{count}</p>
                    <p className="text-[10px] text-fs-text3">{type}</p>
                    <div className="h-0.5 bg-white/5 rounded-full mt-2 overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.3 }} className="h-full bg-white/15 rounded-full" />
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {/* Files grid */}
          <AnimatePresence mode="wait">
            {filtered.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-16 text-fs-text3 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-fs-surface border border-fs-border flex items-center justify-center">
                  <FolderOpen size={28} className="opacity-30" />
                </div>
                <p className="text-base font-medium text-fs-text2">No files yet</p>
                <span className="text-sm text-fs-text3">Drop files or click Upload to get started</span>
              </motion.div>
            ) : viewMode === "grid" ? (
              <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filtered.map((file, idx) => (
                  <FileCard key={file.name} file={file} idx={idx} onPreview={setPreviewFile} onDelete={deleteFile} getUrl={getFileUrl} />
                ))}
              </motion.div>
            ) : (
              <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1">
                {filtered.map((file, idx) => (
                  <FileRow key={file.name} file={file} idx={idx} onPreview={setPreviewFile} onDelete={deleteFile} getUrl={getFileUrl} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPreviewFile(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative z-[101] bg-fs-surface border border-fs-border/80 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-fs-border/50">
                <span className="text-sm font-medium text-fs-text truncate pr-4">{previewFile.name}</span>
                <button onClick={() => setPreviewFile(null)} className="w-7 h-7 rounded-lg bg-fs-surface2 border border-fs-border text-fs-text3 hover:text-fs-text hover:border-fs-border-h transition-all flex items-center justify-center shrink-0"><X size={13} /></button>
              </div>
              <div className="flex-1 overflow-auto p-5 flex items-center justify-center min-h-[280px]">
                {["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(previewFile.name.split(".").pop()?.toLowerCase() ?? "") ? (
                  <img src={getFileUrl(previewFile.name)} alt="" className="max-w-full max-h-[55vh] rounded-xl object-contain" />
                ) : previewFile.name.endsWith(".pdf") ? (
                  <iframe src={getFileUrl(previewFile.name)} className="w-full h-[55vh] rounded-xl border-none" />
                ) : (
                  <div className="text-center text-fs-text3 text-sm">
                    <div className="w-16 h-16 rounded-2xl bg-fs-surface2 border border-fs-border flex items-center justify-center mx-auto mb-4"><FileText size={28} className="opacity-40" /></div>
                    <p className="mb-3 text-fs-text2 font-medium">Preview not available</p>
                    <a href={getFileUrl(previewFile.name)} download={previewFile.name} className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-fs-accent text-white text-sm font-semibold hover:bg-fs-accent-hover hover:shadow-lg hover:shadow-fs-accent/20 transition-all"><Download size={14} /> Download</a>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  File Card (Grid)                                                    */
/* ------------------------------------------------------------------ */
function FileCard({ file, idx, onPreview, onDelete, getUrl }: {
  file: SupaFile; idx: number; onPreview: (f: SupaFile) => void; onDelete: (n: string) => void; getUrl: (n: string) => string;
}) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03, duration: 0.25 }}
      whileHover={{ y: -3, scale: 1.02 }}
      className="group bg-fs-surface border border-fs-border/60 rounded-[16px] overflow-hidden hover:border-fs-accent/20 hover:shadow-lg hover:shadow-fs-accent/5 transition-all duration-200"
    >
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-fs-surface2/50 flex items-center justify-center overflow-hidden">
        {isImage ? (
          <motion.img whileHover={{ scale: 1.08 }} src={getUrl(file.name)} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl">{fileEmoji(file.name)}</span>
        )}
        {/* Extension badge */}
        <span className="absolute top-2 right-2 text-[10px] font-medium px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-sm text-white/80">{ext.toUpperCase()}</span>
        {/* Favorite */}
        <button className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/20 backdrop-blur-sm text-white/60 hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100"><Star size={12} /></button>
      </div>
      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-1">
          <p className="text-[13px] font-medium text-fs-text truncate flex-1">{file.name}</p>
          <button className="p-1 rounded-md text-fs-text3 hover:text-fs-text2 opacity-0 group-hover:opacity-100 transition-all shrink-0 -mr-1 -mt-1"><MoreHorizontal size={13} /></button>
        </div>
        <p className="text-[11px] text-fs-text3 mt-1">{formatSize(file.metadata?.size ?? 0)} · {formatDate(file.created_at).split(",")[0]}</p>
        {/* Hover actions */}
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={() => onPreview(file)} className="flex-1 text-[11px] py-1.5 rounded-lg bg-fs-surface2 border border-fs-border text-fs-text3 hover:text-fs-text hover:border-fs-border-h transition-all"><Eye size={11} className="inline mr-1 -mt-0.5" />View</button>
          <a href={getUrl(file.name)} target="_blank" rel="noopener" className="flex-1 text-[11px] py-1.5 rounded-lg bg-fs-surface2 border border-fs-border text-fs-text3 hover:text-fs-accent hover:border-fs-accent/30 transition-all text-center"><Download size={11} className="inline mr-1 -mt-0.5" />Get</a>
          <button onClick={() => onDelete(file.name)} className="flex-1 text-[11px] py-1.5 rounded-lg bg-fs-surface2 border border-fs-border text-fs-text3 hover:text-fs-danger hover:border-fs-danger/30 transition-all"><Trash2 size={11} className="inline mr-1 -mt-0.5" />Del</button>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  File Row (List)                                                     */
/* ------------------------------------------------------------------ */
function FileRow({ file, idx, onPreview, onDelete, getUrl }: {
  file: SupaFile; idx: number; onPreview: (f: SupaFile) => void; onDelete: (n: string) => void; getUrl: (n: string) => string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.02, duration: 0.2 }}
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-fs-surface/50 border border-transparent hover:border-fs-border/60 hover:bg-fs-surface transition-all group cursor-default"
    >
      <span className="text-lg shrink-0">{fileEmoji(file.name)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fs-text truncate">{file.name}</p>
        <p className="text-[11px] text-fs-text3">{formatSize(file.metadata?.size ?? 0)}</p>
      </div>
      <p className="text-[11px] text-fs-text3 hidden sm:block">{formatDate(file.created_at)}</p>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
        <button onClick={() => onPreview(file)} className="p-1.5 rounded-lg text-fs-text3 hover:text-fs-text hover:bg-fs-surface2 transition-all"><Eye size={13} /></button>
        <a href={getUrl(file.name)} target="_blank" rel="noopener" className="p-1.5 rounded-lg text-fs-text3 hover:text-fs-accent hover:bg-fs-accent10 transition-all"><Download size={13} /></a>
        <button onClick={() => onDelete(file.name)} className="p-1.5 rounded-lg text-fs-text3 hover:text-fs-danger hover:bg-fs-danger10 transition-all"><Trash2 size={13} /></button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Analytic Card                                                       */
/* ------------------------------------------------------------------ */
function AnalyticCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub: string; icon: any; color: string }) {
  return (
    <div className="bg-fs-surface border border-fs-border/60 rounded-xl p-4 hover:border-fs-border-h transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={color} />
        <span className="text-[11px] text-fs-text3">{label}</span>
      </div>
      <p className="text-lg font-bold text-fs-text tracking-tight">{value}</p>
      <p className="text-[11px] text-fs-text3 mt-0.5 truncate">{sub}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Login Screen                                                       */
/* ------------------------------------------------------------------ */
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="fixed inset-0 bg-fs-bg flex items-center justify-center z-[200] p-6">
      <div className="relative">
        <div className="absolute -inset-16 bg-fs-accent/5 rounded-full blur-3xl" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative bg-fs-surface border border-fs-border/80 rounded-2xl px-10 py-12 text-center max-w-sm w-full shadow-2xl shadow-black/40">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fs-accent/20 to-fs-accent/5 border border-fs-accent/20 flex items-center justify-center mx-auto mb-5">
            <HardDrive size={24} className="text-fs-accent" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1.5">File<span className="text-fs-accent">Sync</span></h1>
          <p className="text-sm text-fs-text3 mb-8">Sign in to access your files</p>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={onLogin}
            className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-xl border border-fs-border-h bg-fs-surface2 text-sm font-medium text-fs-text hover:border-fs-accent/50 hover:bg-fs-accent10 hover:shadow-sm hover:shadow-fs-accent/10 transition-all w-full justify-center"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.7-2.9-11.9-7.1l-6.6 4.8C9.5 39.6 16.3 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.2 5.2C40.5 35.8 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
            </svg>
            Continue with Google
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
