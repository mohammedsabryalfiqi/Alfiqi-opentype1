import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Eye, EyeOff, LogIn, ArrowRight, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/01011020928/")({
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr || !data.user) {
        setError("بيانات الدخول غير صحيحة");
        setLoading(false);
        return;
      }
      // Check admin role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        await supabase.auth.signOut();
        setError("هذا الحساب غير مصرح له بالدخول");
        setLoading(false);
        return;
      }
      navigate({ to: "/01011020928/dashboard" });
    } catch {
      setError("حدث خطأ في الاتصال");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4">
            <Lock className="w-10 h-10 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">لوحة الإدارة</h1>
          <p className="text-blue-200/60">موقع الأوبن تايب V2</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="mb-4">
            <label className="block text-sm font-medium text-blue-200/80 mb-2">البريد الإلكتروني</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="أدخل البريد الإلكتروني"
                autoFocus
                dir="ltr"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-blue-200/80 mb-2">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="أدخل كلمة المرور"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password || !email}
            className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/30"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <LogIn className="w-5 h-5" />
            )}
            {loading ? "جاري الدخول..." : "تسجيل الدخول"}
          </button>
        </form>

        <div className="text-center mt-6">
          <Link
            to="/"
            className="text-blue-300/50 hover:text-blue-300 text-sm flex items-center justify-center gap-1 mx-auto transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            العودة للموقع
          </Link>
        </div>
      </div>
    </div>
  );
}
