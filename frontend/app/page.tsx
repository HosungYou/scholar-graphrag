'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Header, Footer } from '@/components/layout';
import { ThemeToggle } from '@/components/ui';

const fade = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.12,
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  }),
};

const features = [
  { title: 'Import from ScholaRAG', description: 'Point to your existing project folder. We parse your config, extract papers, authors, and reuse your embeddings to build a knowledge graph automatically.', color: 'bg-node-paper' },
  { title: 'Six specialized AI agents', description: 'Intent classification, concept extraction, task planning, query execution, chain-of-thought reasoning, and response generation — working together.', color: 'bg-node-concept' },
  { title: 'Graph-grounded responses', description: 'Every response links directly to nodes in your knowledge graph. Click any citation to navigate to the source paper or related concepts.', color: 'bg-node-finding' },
  { title: 'Dual-mode interface', description: 'Switch between conversational exploration and visual graph analysis. Chat when you need answers, explore when you need perspective.', color: 'bg-node-method' },
  { title: 'Multi-provider LLM support', description: 'Claude for nuanced analysis, GPT-4 for broad knowledge, or Gemini for speed. Switch providers per project based on your needs.', color: 'bg-node-author' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-0">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Header rightContent={<ThemeToggle variant="dropdown" />} />

      <main id="main-content" className="flex-1">
        {/* Hero — celestial coordinate grid background */}
        <section className="relative min-h-[85vh] flex items-center celestial-grid overflow-hidden">
          {/* Coordinate labels on the arcs — positioned absolutely */}
          <span className="coordinate-label" style={{ right: '18%', top: '38%' }}>α 12h</span>
          <span className="coordinate-label" style={{ right: '32%', top: '12%' }}>δ +45°</span>
          <span className="coordinate-label" style={{ right: '8%', top: '58%' }}>α 18h</span>
          <span className="coordinate-label" style={{ right: '45%', top: '6%' }}>δ +60°</span>

          <div className="relative z-10 max-w-3xl mx-auto px-6 py-32">
            <motion.div
              custom={0}
              variants={fade}
              initial="hidden"
              animate="visible"
              className="mb-10"
            >
              <div className="double-rule w-16 mb-6" />
              <p className="font-mono text-[11px] text-copper tracking-[0.15em] uppercase">
                Catalogue No. 01 — Knowledge Graph Platform
              </p>
            </motion.div>

            <motion.h1
              custom={1}
              variants={fade}
              initial="hidden"
              animate="visible"
              className="text-4xl sm:text-5xl md:text-[3.25rem] font-medium text-text-primary leading-[1.15] tracking-[-0.03em] mb-6"
            >
              Transform your literature
              <br />
              into a living knowledge graph
            </motion.h1>

            <motion.p
              custom={2}
              variants={fade}
              initial="hidden"
              animate="visible"
              className="text-base text-text-secondary max-w-lg leading-relaxed mb-10"
            >
              Import papers, extract concepts, and explore connections
              across your entire research corpus.
            </motion.p>

            <motion.div
              custom={3}
              variants={fade}
              initial="hidden"
              animate="visible"
              className="flex items-center gap-6"
            >
              <Link href="/import" className="btn-primary">
                Get started
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link href="/projects" className="btn-ghost">
                View projects
                <ArrowRight className="w-3 h-3" />
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Features — legend box style */}
        <section className="max-w-3xl mx-auto px-6 py-24">
          <motion.div
            custom={0}
            variants={fade}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="legend-box"
          >
            <div className="legend-title">Catalogue · Features</div>

            <div className="space-y-0">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  custom={index}
                  variants={fade}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: '-20px' }}
                  className="group"
                >
                  {index > 0 && <div className="divider-dotted" />}
                  <div className="flex gap-4 py-6">
                    <div className="flex items-start gap-3 flex-shrink-0 pt-1">
                      <div className={`catalogue-marker ${feature.color}`} />
                      <span className="font-mono text-xs text-copper tabular-nums w-5">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-text-primary mb-1.5 group-hover:text-teal transition-colors duration-200">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-text-tertiary leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Stats — instrument readout */}
        <section className="max-w-3xl mx-auto px-6 pb-24">
          <motion.div
            custom={0}
            variants={fade}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <p className="font-mono text-[11px] text-copper tracking-[0.15em] uppercase mb-6">
              Specifications
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0">
              {[
                { value: '6', label: 'AI agents' },
                { value: '5', label: 'Entity types' },
                { value: '7', label: 'Relationships' },
                { value: '3', label: 'LLM providers' },
              ].map((stat, i) => (
                <div key={i} className="stat-cell">
                  <div className="text-xl text-teal tabular-nums">{stat.value}</div>
                  <div className="text-[10px] text-text-ghost mt-1 uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <div className="divider max-w-4xl mx-auto" />

        {/* CTA */}
        <section className="max-w-3xl mx-auto px-6 py-24">
          <motion.div
            custom={0}
            variants={fade}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <div className="double-rule w-12 mb-6" />
            <h2 className="text-2xl font-medium text-text-primary tracking-[-0.02em] mb-3">
              Ready to explore your research?
            </h2>
            <p className="text-sm text-text-tertiary mb-8">
              Import your ScholaRAG project and see connections you never knew existed.
            </p>
            <Link href="/import" className="btn-primary">
              Start importing
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
