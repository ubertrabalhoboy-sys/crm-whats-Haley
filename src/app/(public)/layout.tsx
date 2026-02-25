import { Inter } from "next/font/google";
import ParticleBg from "../../components/shared/ParticleBg";

const inter = Inter({ subsets: ["latin"] });

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.className} public-scope relative min-h-screen text-slate-900`}>
      <ParticleBg />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-white/55 via-white/25 to-[#ECE5DD]/55" />
      <div className="relative z-0">{children}</div>
    </div>
  );
}
