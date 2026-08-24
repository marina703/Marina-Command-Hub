import { COMMAND_HUB_HREF } from "@/lib/commandHub";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0d0f12] text-white font-sans selection:bg-[#00f5ff] selection:text-black">
      {/* Header */}
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
          <a href="#features" className="hover:text-white transition-colors">
            Features
          </a>
          <a
            href="#architecture"
            className="hover:text-white transition-colors"
          >
            Architecture
          </a>
          <a
            href={COMMAND_HUB_HREF}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00f5ff]/20 to-[#ff2d95]/20 border border-[#00f5ff]/40 text-white font-semibold hover:shadow-[0_0_15px_rgba(0,245,255,0.4)] transition-all"
          >
            Launch Command Hub
          </a>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#00f5ff]/30 bg-[#00f5ff]/10 text-[#00f5ff] text-xs uppercase tracking-widest font-semibold mb-8 shadow-[0_0_10px_rgba(0,245,255,0.2)]">
          Autonomous AI Operations Hub
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-tight mb-6">
          Scale Your Business with{" "}
          <span className="bg-gradient-to-r from-[#00f5ff] to-[#ff2d95] bg-clip-text text-transparent">
            Autonomous AI Teams
          </span>
        </h1>
        <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mb-10 leading-relaxed">
          Local-first autonomous agents that manage your deployment pipeline,
          orchestrate multi-model LLMs (Gemini, Ollama, Copilot), and capture
          live strategy brainstorms in real time.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <a
            href={COMMAND_HUB_HREF}
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-[#00f5ff]/30 to-[#ff2d95]/30 border border-[#00f5ff]/50 text-white font-bold text-base shadow-[0_0_20px_rgba(0,245,255,0.3)] hover:scale-105 transition-all"
          >
            Open Command Hub →
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 rounded-xl border border-white/10 bg-white/[0.02] text-zinc-300 hover:text-white hover:bg-white/[0.05] font-semibold text-base transition-all"
          >
            View Architecture Docs
          </a>
        </div>

        {/* Live Metrics Showcase */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full mt-20"
          id="features"
        >
          <div className="p-6 rounded-2xl border border-white/10 bg-[#111318]/90 text-left">
            <div className="text-3xl font-extrabold text-[#00f5ff] mb-1">
              Local-First
            </div>
            <div className="text-xs uppercase tracking-wider text-zinc-400">
              Zero Leakage Architecture
            </div>
          </div>
          <div className="p-6 rounded-2xl border border-white/10 bg-[#111318]/90 text-left">
            <div className="text-3xl font-extrabold text-[#ff2d95] mb-1">
              3+ LLMs
            </div>
            <div className="text-xs uppercase tracking-wider text-zinc-400">
              Gemini, Ollama, Copilot
            </div>
          </div>
          <div className="p-6 rounded-2xl border border-white/10 bg-[#111318]/90 text-left">
            <div className="text-3xl font-extrabold text-[#00f5ff] mb-1">
              Autonomous
            </div>
            <div className="text-xs uppercase tracking-wider text-zinc-400">
              Scheduled Loops & Standups
            </div>
          </div>
          <div className="p-6 rounded-2xl border border-white/10 bg-[#111318]/90 text-left">
            <div className="text-3xl font-extrabold text-[#ff2d95] mb-1">
              100%
            </div>
            <div className="text-xs uppercase tracking-wider text-zinc-400">
              Test Passing Rate
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} MarinaAI. Built for high-leverage
        autonomous creators and founders.
      </footer>
    </div>
  );
}
