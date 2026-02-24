import { Inter } from "next/font/google";
import NexbotAuraBackground from "../../components/public/NexbotAuraBackground";

const inter = Inter({ subsets: ["latin"] });

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.className} public-scope relative min-h-screen bg-[#05060a] text-zinc-100`}>
      <NexbotAuraBackground />

      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-black/10 via-black/15 to-black/35" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30 bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20200%20200%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.65%22%20numOctaves%3D%223%22%20stitchTiles%3D%22stitch%22/%3E%3C/filter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%20opacity%3D%220.05%22/%3E%3C/svg%3E')]" />

      <div className="relative z-0">{children}</div>
    </div>
  );
}
