import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Command Hub Access — MarinaAI",
  description:
    "MarinaAI Command Hub access is currently limited. Request access to get started.",
};

export default function HubAccess() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0d0f12] text-white font-sans selection:bg-[#00f5ff] selection:text-black">
      {/* Header — matches landing page chrome */}
      <header className="border-b border-white/10 px-8 py-5 flex items-center justify-between backdrop-blur-md sticky top-0 z-50 bg-[#0d0f12]/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00f5ff]/20 to-[#ff2d95]/20 border border-[#00f5ff]/50 flex items-center justify-center font-extrabold text-[#00f5ff] shadow-[0_0_15px_rgba(0,245,255,0.3)]">
            M
          </div>
          <div>
            <div className="font-extrabold tracking-wider uppercase text-sm">
              MarinaAI
            </div>
            <div className="text-xs text-zinc-400">Autonomous Growth & Ops</div>
          </div>
        </div>
        <nav className="flex items-center gap-6 text-sm font-medium text-zinc-400">
          <a href="/" className="hover:text-white transition-colors">
            ← Back to Home
          </a>
        </nav>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#ff2d95]/30 bg-[#ff2d95]/10 text-[#ff2d95] text-xs uppercase tracking-widest font-semibold mb-8 shadow-[0_0_10px_rgba(255,45,149,0.2)]">
          Access Limited
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-6">
          The Command Hub is{" "}
          <span className="bg-gradient-to-r from-[#00f5ff] to-[#ff2d95] bg-clip-text text-transparent">
            not publicly open yet
          </span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-xl mb-4 leading-relaxed">
          MarinaAI Command Hub is currently available to authorized operators
          only while we complete security review and workspace provisioning.
        </p>
        <p className="text-sm text-zinc-500 max-w-xl mb-10 leading-relaxed">
          If you already have an operator account, sign in from your provisioned
          Hub URL. Otherwise, request access below and we will follow up.
        </p>

        <a
          href="mailto:access@marinaai.app?subject=Command%20Hub%20access%20request"
          className="px-8 py-4 rounded-xl bg-gradient-to-r from-[#00f5ff]/30 to-[#ff2d95]/30 border border-[#00f5ff]/50 text-white font-bold text-base shadow-[0_0_20px_rgba(0,245,255,0.3)] hover:scale-105 transition-all"
        >
          Request Access →
        </a>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} MarinaAI. Built for high-leverage
        autonomous creators and founders.
      </footer>
    </div>
  );
}