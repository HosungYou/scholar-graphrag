'use client';

import Link from 'next/link';
import { ArrowRight, Hexagon, Network, MessageSquare, FolderOpen } from 'lucide-react';
import { Header, Footer } from '@/components/layout';
import { ThemeToggle } from '@/components/ui';
import { HeroBackground } from '@/components/home';

/* ============================================================
   ScholaRAG Graph - Landing Page
   VS Design Diverge: Direction B (T-Score 0.4) "Editorial Research"

   Design Principles:
   - Solid dark backgrounds (no gradients)
   - Asymmetric 70/30 hero layout
   - Serif headlines + Sans-serif body
   - Number indicators instead of colored icons
   - Line-based hierarchy (no card shadows)
   - Minimal border-radius (0, 2px, 4px)
   ============================================================ */

export default function HomePage() {
  return (
    <div className="min-h-screen bg-paper dark:bg-ink flex flex-col">
      {/* Skip Link for Accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Header rightContent={<ThemeToggle variant="dropdown" />} />

      {/* Hero Section - Asymmetric 70/30 Layout */}
      <main id="main-content" className="flex-1">
        <section className="hero-section relative overflow-hidden min-h-[600px]">
          {/* Dynamic Knowledge Graph Background */}
          <div className="absolute inset-0">
            <HeroBackground />
          </div>

          <div className="max-w-7xl mx-auto px-6 py-20 md:py-32 relative z-10">
            <div className="max-w-3xl">
              {/* Hero Content - Full impact with dynamic background */}
              <div className="space-y-8">
                <div className="space-y-4">
                  <span className="inline-flex items-center gap-2 text-accent-teal font-mono text-sm tracking-widest uppercase">
                    <span className="w-8 h-px bg-accent-teal" />
                    Knowledge Graph Platform
                  </span>
                  <h1 className="font-display text-4xl md:text-5xl lg:text-6xl xl:text-7xl text-ink dark:text-paper leading-[1.1]">
                    Transform Research
                    <br />
                    into <span className="text-accent-teal">Connected</span>
                    <br />
                    <span className="italic">Insights</span>
                  </h1>
                </div>

                <p className="text-muted text-lg md:text-xl max-w-xl leading-relaxed">
                  A concept-centric knowledge graph platform for systematic
                  literature review. Watch your papers transform into
                  interconnected knowledge — <span className="text-ink dark:text-paper">in real-time</span>.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-wrap gap-4 pt-4">
                  <Link
                    href="/import"
                    className="btn btn--primary group"
                  >
                    <span>Start Importing</span>
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    href="/projects"
                    className="btn btn--secondary"
                  >
                    View Projects
                  </Link>
                </div>

                {/* Stats Row - With polygon indicators */}
                <div className="flex gap-12 pt-8 border-t border-ink/10 dark:border-paper/10">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-accent-teal rotate-45" />
                    <div>
                      <div className="font-mono text-2xl text-ink dark:text-paper">6</div>
                      <div className="text-muted text-xs uppercase tracking-wider">AI Agents</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Hexagon className="w-3 h-3 text-accent-amber" strokeWidth={2} />
                    <div>
                      <div className="font-mono text-2xl text-ink dark:text-paper">8</div>
                      <div className="text-muted text-xs uppercase tracking-wider">Entity Types</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 border border-accent-red" />
                    <div>
                      <div className="font-mono text-2xl text-ink dark:text-paper">∞</div>
                      <div className="text-muted text-xs uppercase tracking-wider">Connections</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Actions - Horizontal Bar */}
        <section className="border-y border-ink/10 dark:border-paper/10 bg-surface/5">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-ink/10 dark:divide-paper/10">
              {/* Action 1: Import */}
              <Link
                href="/import"
                className="action-bar-item group p-6 md:p-8 flex items-center gap-6 hover:bg-surface/10 transition-colors"
              >
                <div className="flex-shrink-0">
                  <FolderOpen className="w-8 h-8 text-accent-teal" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-xl text-ink dark:text-paper group-hover:text-accent-teal transition-colors">
                    Import ScholaRAG
                  </h3>
                  <p className="text-muted text-sm mt-1 truncate">
                    Build knowledge graph from existing projects
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>

              {/* Action 2: Explore */}
              <Link
                href="/projects"
                className="action-bar-item group p-6 md:p-8 flex items-center gap-6 hover:bg-surface/10 transition-colors"
              >
                <div className="flex-shrink-0">
                  <Network className="w-8 h-8 text-accent-amber" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-xl text-ink dark:text-paper group-hover:text-accent-amber transition-colors">
                    Explore Graphs
                  </h3>
                  <p className="text-muted text-sm mt-1 truncate">
                    Interactive visualization with React Flow
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>

              {/* Action 3: Chat */}
              <Link
                href="/projects"
                className="action-bar-item group p-6 md:p-8 flex items-center gap-6 hover:bg-surface/10 transition-colors"
              >
                <div className="flex-shrink-0">
                  <MessageSquare className="w-8 h-8 text-accent-red" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-xl text-ink dark:text-paper group-hover:text-accent-red transition-colors">
                    Chat with AI
                  </h3>
                  <p className="text-muted text-sm mt-1 truncate">
                    Graph-grounded responses with citations
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section - Number Indicators */}
        <section className="py-16 md:py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="mb-12">
              <span className="text-accent-teal font-mono text-sm tracking-widest uppercase">
                Capabilities
              </span>
              <h2 className="font-display text-3xl md:text-4xl text-ink dark:text-paper mt-2">
                Designed for Researchers
              </h2>
            </div>

            {/* Feature Grid - Alternating Layout */}
            <div className="space-y-0 divide-y divide-ink/10 dark:divide-paper/10">
              {/* Feature 01 */}
              <div className="feature-row grid md:grid-cols-asymmetric-70-30 gap-8 py-8 md:py-12">
                <div className="order-2 md:order-1">
                  <h3 className="font-display text-2xl text-ink dark:text-paper mb-3">
                    Dual-Mode Interface
                  </h3>
                  <p className="text-muted leading-relaxed">
                    Switch seamlessly between Chatbot Mode for conversational exploration
                    and Graph Mode for visual analysis. The interface adapts to your
                    research workflow.
                  </p>
                </div>
                <div className="order-1 md:order-2 flex items-start">
                  <span className="font-mono text-6xl text-accent-teal/20">01</span>
                </div>
              </div>

              {/* Feature 02 */}
              <div className="feature-row grid md:grid-cols-asymmetric-30-70 gap-8 py-8 md:py-12">
                <div className="flex items-start justify-end">
                  <span className="font-mono text-6xl text-accent-amber/20">02</span>
                </div>
                <div>
                  <h3 className="font-display text-2xl text-ink dark:text-paper mb-3">
                    Multi-Agent System
                  </h3>
                  <p className="text-muted leading-relaxed">
                    Six specialized AI agents work together: Intent classification,
                    Concept extraction, Task planning, Query execution,
                    Chain-of-thought reasoning, and Response generation.
                  </p>
                </div>
              </div>

              {/* Feature 03 */}
              <div className="feature-row grid md:grid-cols-asymmetric-70-30 gap-8 py-8 md:py-12">
                <div className="order-2 md:order-1">
                  <h3 className="font-display text-2xl text-ink dark:text-paper mb-3">
                    Graph-Grounded Responses
                  </h3>
                  <p className="text-muted leading-relaxed">
                    Every AI response links to actual nodes in your knowledge graph.
                    Click citations to navigate directly to source papers and
                    related concepts.
                  </p>
                </div>
                <div className="order-1 md:order-2 flex items-start">
                  <span className="font-mono text-6xl text-accent-red/20">03</span>
                </div>
              </div>

              {/* Feature 04 */}
              <div className="feature-row grid md:grid-cols-asymmetric-30-70 gap-8 py-8 md:py-12">
                <div className="flex items-start justify-end">
                  <span className="font-mono text-6xl text-surface/30">04</span>
                </div>
                <div>
                  <h3 className="font-display text-2xl text-ink dark:text-paper mb-3">
                    Multi-Provider LLM
                  </h3>
                  <p className="text-muted leading-relaxed">
                    Choose your preferred AI model: Claude for nuanced analysis,
                    GPT-4 for broad knowledge, or Gemini for speed.
                    Switch providers per project.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-surface py-16 md:py-24">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <h2 className="font-display text-3xl md:text-4xl text-paper mb-6">
              Ready to Transform Your Research?
            </h2>
            <p className="text-paper/60 text-lg max-w-2xl mx-auto mb-8">
              Import your ScholaRAG project and start exploring connections
              you never knew existed.
            </p>
            <Link
              href="/import"
              className="inline-flex items-center gap-2 px-8 py-4 bg-accent-teal text-ink font-medium hover:bg-accent-teal/90 transition-colors"
            >
              <span>Get Started</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
