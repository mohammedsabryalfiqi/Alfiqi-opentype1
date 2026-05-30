import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            العودة للصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "موقع الأوبن تايب V2 — تفعيل خصائص الخطوط العربية" },
      { name: "description", content: "أداة لتفعيل خصائص الخطوط (OpenType Features) ومحاور الخطوط المتغيرة محلياً في المتصفح." },
      { name: "author", content: "د. محمد الفقي" },
      { property: "og:title", content: "موقع الأوبن تايب V2 — تفعيل خصائص الخطوط العربية" },
      { property: "og:description", content: "أداة لتفعيل خصائص الخطوط (OpenType Features) ومحاور الخطوط المتغيرة محلياً في المتصفح." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "موقع الأوبن تايب V2 — تفعيل خصائص الخطوط العربية" },
      { name: "twitter:description", content: "أداة لتفعيل خصائص الخطوط (OpenType Features) ومحاور الخطوط المتغيرة محلياً في المتصفح." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f6aff789-1c50-4d76-8806-027d0698c97c/id-preview-e47be434--90f2da8c-2916-4dde-9417-b236486ceb75.lovable.app-1776942903312.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f6aff789-1c50-4d76-8806-027d0698c97c/id-preview-e47be434--90f2da8c-2916-4dde-9417-b236486ceb75.lovable.app-1776942903312.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <Outlet />;
}
