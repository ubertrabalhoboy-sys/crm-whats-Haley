export const metadata = {
  title: "CRM Whats",
  description: "Sistema CRM WhatsApp",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <style>{`
          html, body {
            height: 100%;
            margin: 0;
            padding: 0;
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
          body {
            overflow: hidden; /* ✅ remove o scroll externo */
            font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
            background: #f6f7f9; /* ✅ dá um visual melhor */
            color: #111827;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}