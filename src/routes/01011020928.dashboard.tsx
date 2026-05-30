import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Users, Upload, Download, TrendingUp, Clock, FileType,
  LogOut, RefreshCw, Calendar, Globe, BarChart3,
  Eye, HardDrive, MapPin, Flag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/01011020928/dashboard")({
  component: AdminDashboard,
});

interface UploadRecord {
  id: string;
  font_name: string;
  file_size: number;
  features_count: number;
  is_variable: boolean;
  axes_count: number;
  storage_path: string | null;
  created_at: string;
}

interface VisitRecord {
  id: string;
  page: string;
  country: string | null;
  user_agent: string | null;
  created_at: string;
}

interface Counters {
  total_visits: number;
  total_uploads: number;
  total_downloads: number;
}

function AdminDashboard() {
  const navigate = useNavigate();
  const [counters, setCounters] = useState<Counters | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "uploads" | "visits">("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/01011020928" });
        return;
      }
      const { data: roleData } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!roleData) {
        await supabase.auth.signOut();
        navigate({ to: "/01011020928" });
        return;
      }

      const [c, u, v] = await Promise.all([
        supabase.from("stats_counters").select("*").eq("id", 1).single(),
        supabase.from("uploads").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("visits").select("*").order("created_at", { ascending: false }).limit(300),
      ]);
      if (c.data) setCounters(c.data as Counters);
      if (u.data) setUploads(u.data as UploadRecord[]);
      if (v.data) setVisits(v.data as VisitRecord[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/01011020928" });
  };

  const handleDownloadFont = async (storagePath: string, fontName: string) => {
    try {
      const { data, error } = await supabase.storage.from("fonts").download(storagePath);
      if (error || !data) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fontName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("فشل تحميل الملف");
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

  // Daily visits aggregation
  const dailyVisits: Record<string, number> = {};
  visits.forEach(v => {
    const key = v.created_at.split("T")[0];
    dailyVisits[key] = (dailyVisits[key] || 0) + 1;
  });

  // Country aggregation
  const countryCounts: Record<string, number> = {};
  visits.forEach(v => {
    const c = v.country || "غير معروف";
    countryCounts[c] = (countryCounts[c] || 0) + 1;
  });
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const today = new Date().toISOString().split("T")[0];
  const visitsToday = dailyVisits[today] || 0;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const visitsWeek = visits.filter(v => v.created_at >= weekAgo).length;
  const uploadsToday = uploads.filter(u => u.created_at.startsWith(today)).length;

  const maxVisits = Math.max(1, ...Object.values(dailyVisits));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  const statCards = [
    { label: "إجمالي الزيارات", value: counters?.total_visits ?? 0, icon: Users, color: "blue", sub: `اليوم: ${visitsToday}` },
    { label: "الخطوط المرفوعة", value: counters?.total_uploads ?? 0, icon: Upload, color: "emerald", sub: `اليوم: ${uploadsToday}` },
    { label: "التحميلات", value: counters?.total_downloads ?? 0, icon: Download, color: "purple", sub: "إجمالي" },
    { label: "زيارات الأسبوع", value: visitsWeek, icon: TrendingUp, color: "amber", sub: `الكل: ${visits.length}` },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white" dir="rtl">
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">لوحة الإدارة</h1>
              <p className="text-xs text-blue-200/50">موقع الأوبن تايب V2</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => fetchData(true)} disabled={refreshing} className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors" title="تحديث">
              <RefreshCw className={`w-4 h-4 text-blue-300 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <Link to="/" className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors" title="الموقع">
              <Globe className="w-4 h-4 text-blue-300" />
            </Link>
            <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-300 text-sm transition-colors">
              <LogOut className="w-4 h-4" /> خروج
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {statCards.map((card, i) => (
            <div key={i} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-blue-200/60">{card.label}</span>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20">
                  <card.icon className="w-4 h-4 text-blue-400" />
                </div>
              </div>
              <div className="text-3xl font-bold text-white mb-1">{card.value.toLocaleString("ar-EG")}</div>
              <div className="text-xs text-blue-200/40">{card.sub}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-6 bg-white/5 p-1 rounded-xl border border-white/10">
          {[
            { id: "overview" as const, label: "نظرة عامة", icon: BarChart3 },
            { id: "uploads" as const, label: "الخطوط المرفوعة", icon: Upload },
            { id: "visits" as const, label: "سجل الزيارات", icon: Eye },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? "bg-blue-600/20 text-blue-300 border border-blue-500/30" : "text-blue-200/50 hover:text-blue-200/80"}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-blue-400" />الزيارات خلال الأسبوع</h3>
                <div className="flex items-end gap-2 h-48">
                  {Array.from({ length: 7 }).map((_, idx) => {
                    const i = 6 - idx;
                    const d = new Date(); d.setDate(d.getDate() - i);
                    const key = d.toISOString().split("T")[0];
                    const dayName = d.toLocaleDateString("ar-EG", { weekday: "short" });
                    const count = dailyVisits[key] || 0;
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                        <span className="text-xs text-blue-200/60 font-mono">{count}</span>
                        <div className="w-full relative" style={{ height: "140px" }}>
                          <div className="absolute bottom-0 w-full bg-gradient-to-t from-blue-600/40 to-blue-400/20 rounded-t-lg border border-blue-500/20 transition-all duration-500" style={{ height: `${Math.max((count / maxVisits) * 100, 4)}%` }} />
                        </div>
                        <span className="text-[10px] text-blue-200/40">{dayName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-400" />الزيارات حسب البلد</h3>
                {topCountries.length === 0 ? (
                  <div className="text-center py-8 text-blue-200/40"><Globe className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>لا توجد بيانات بعد</p></div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {topCountries.map(([country, count], idx) => {
                      const pct = Math.round((count / visits.length) * 100);
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <Flag className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <span className="text-sm text-white flex-1 truncate">{country}</span>
                          <span className="text-xs text-blue-200/60 font-mono w-10 text-left">{count}</span>
                          <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-emerald-500/60 to-emerald-400/40 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-blue-200/40 w-8 text-left">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {uploads.length > 0 && (
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-emerald-400" />آخر الخطوط المرفوعة</h3>
                <div className="space-y-3">
                  {uploads.slice(0, 5).map((u) => (
                    <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0"><FileType className="w-5 h-5 text-emerald-400" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate" dir="ltr">{u.font_name}</p>
                        <div className="flex items-center gap-3 text-xs text-blue-200/40 mt-0.5">
                          <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{formatSize(u.file_size)}</span>
                          <span>{u.features_count} خاصية</span>
                          {u.is_variable && <span className="text-purple-400">متغير ({u.axes_count} محور)</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-left flex-shrink-0">
                          <p className="text-xs text-blue-200/40">{formatDate(u.created_at)}</p>
                          <p className="text-[10px] text-blue-200/30">{formatTime(u.created_at)}</p>
                        </div>
                        {u.storage_path && (
                          <button onClick={() => handleDownloadFont(u.storage_path!, u.font_name)} className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors" title="تحميل الخط">
                            <Download className="w-4 h-4 text-blue-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "uploads" && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Upload className="w-5 h-5 text-emerald-400" />جميع الخطوط ({uploads.length})</h3>
            {uploads.length === 0 ? (
              <div className="text-center py-12 text-blue-200/40"><Upload className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>لا توجد خطوط مرفوعة بعد</p></div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin">
                {uploads.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0"><FileType className="w-5 h-5 text-emerald-400" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate" dir="ltr">{u.font_name}</p>
                      <div className="flex items-center gap-3 text-xs text-blue-200/40 mt-0.5">
                        <span>{formatSize(u.file_size)}</span>
                        <span>{u.features_count} خاصية</span>
                        {u.is_variable && <span className="text-purple-400">متغير ({u.axes_count} محور)</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-left flex-shrink-0">
                        <p className="text-xs text-blue-200/40">{formatDate(u.created_at)}</p>
                        <p className="text-[10px] text-blue-200/30">{formatTime(u.created_at)}</p>
                      </div>
                      {u.storage_path ? (
                        <button onClick={() => handleDownloadFont(u.storage_path!, u.font_name)} className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors" title="تحميل الخط">
                          <Download className="w-4 h-4 text-blue-400" />
                        </button>
                      ) : (
                        <div className="p-2 rounded-lg bg-white/5 border border-white/5"><Download className="w-4 h-4 text-blue-200/20" /></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "visits" && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Eye className="w-5 h-5 text-blue-400" />سجل الزيارات ({visits.length})</h3>
            {visits.length === 0 ? (
              <div className="text-center py-12 text-blue-200/40"><Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>لا توجد زيارات بعد</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-right py-3 px-3 text-blue-200/60 font-medium">التاريخ</th>
                      <th className="text-right py-3 px-3 text-blue-200/60 font-medium">الوقت</th>
                      <th className="text-right py-3 px-3 text-blue-200/60 font-medium">البلد</th>
                      <th className="text-right py-3 px-3 text-blue-200/60 font-medium">الصفحة</th>
                      <th className="text-right py-3 px-3 text-blue-200/60 font-medium">المتصفح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((v) => (
                      <tr key={v.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-2.5 px-3 text-blue-200/80">{formatDate(v.created_at)}</td>
                        <td className="py-2.5 px-3 text-blue-200/60 font-mono text-xs">{formatTime(v.created_at)}</td>
                        <td className="py-2.5 px-3"><span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs"><MapPin className="w-3 h-3" />{v.country || "غير معروف"}</span></td>
                        <td className="py-2.5 px-3 text-blue-200/60" dir="ltr">{v.page}</td>
                        <td className="py-2.5 px-3 text-blue-200/40 text-xs truncate max-w-[200px]" dir="ltr" title={v.user_agent || ""}>{v.user_agent?.substring(0, 60)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
