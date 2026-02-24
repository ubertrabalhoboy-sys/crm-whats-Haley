import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}