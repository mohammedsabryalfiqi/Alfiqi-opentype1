import { supabase } from "@/integrations/supabase/client";

async function getCountry(): Promise<{ country: string; ip: string | null }> {
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) throw new Error("geo failed");
    const data = await res.json();
    return {
      country: data.country_name || data.country || "غير معروف",
      ip: data.ip || null,
    };
  } catch {
    try {
      const res = await fetch("https://ipwho.is/", { cache: "no-store" });
      const data = await res.json();
      return {
        country: data.country || "غير معروف",
        ip: data.ip || null,
      };
    } catch {
      return { country: "غير معروف", ip: null };
    }
  }
}

export async function trackVisit(page: string = "/") {
  try {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const { country, ip } = await getCountry();
    await supabase.from("visits").insert({ page, user_agent: userAgent, country, ip });
    await supabase.rpc("bump_counter", { _kind: "visit" });
  } catch {
    // silent
  }
}

export async function trackUpload(args: {
  fontName: string;
  fileSize: number;
  featuresCount?: number;
  isVariable?: boolean;
  axesCount?: number;
  file?: File;
}) {
  try {
    let storage_path: string | null = null;
    if (args.file) {
      const ext = args.file.name.split(".").pop() || "ttf";
      const id = crypto.randomUUID();
      const path = `${new Date().toISOString().slice(0, 10)}/${id}.${ext}`;
      const { error } = await supabase.storage.from("fonts").upload(path, args.file, {
        contentType: "application/octet-stream",
        upsert: false,
      });
      if (!error) storage_path = path;
    }
    await supabase.from("uploads").insert({
      font_name: args.fontName,
      file_size: args.fileSize,
      features_count: args.featuresCount ?? 0,
      is_variable: args.isVariable ?? false,
      axes_count: args.axesCount ?? 0,
      storage_path,
    });
    await supabase.rpc("bump_counter", { _kind: "upload" });
  } catch {
    // silent
  }
}

export async function trackDownload() {
  try {
    await supabase.rpc("bump_counter", { _kind: "download" });
  } catch {
    // silent
  }
}
