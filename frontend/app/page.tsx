'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  FolderOpen, 
  MessageSquare, 
  Network, 
  Sparkles,
  ArrowRight,
  BookOpen,
  Brain,
  GitBranch,
  Layers
} from 'lucide-react';
import { Header, Footer } from '@/components/layout';
import { ThemeToggle } from '@/components/ui';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0, 0, 0.2, 1] as const },
  },
};

const floatVariants = {
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 6,
      repeat: Infinity,
      ease: 'easeInOut' as const,
    },
  },
};

// Feature card component with 3D tilt effect
function FeatureCard({ 
  href, 
  icon: Icon, 
  title, 
  description, 
  gradient,
  delay = 0 
}: {
  href: string;
  icon: typeof FolderOpen;
  title: string;
  description: string;
  gradient: string;
  delay?: number;
}) {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -8, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <Link
        href={href}
        className="group block h-full"
      >
        <div className="relative h-full glass-card p-6 overflow-hidden">
          {/* Gradient background on hover */}
          <div 
            className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${gradient}`}
          />
          
          {/* Shine effect */}
          <div className="card-shine" />
          
          {/* Content */}
          <div className="relative z-10">
            <div className={`inline-flex p-3 rounded-xl mb-4 ${gradient} shadow-lg`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              {title}
              <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
            </h3>
            
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
              {description}
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// Stats counter component
function StatCounter({ value, label }: { value: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="text-center"
    >
      <div className="text-3xl md:text-4xl font-bold gradient-text">{value}</div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{label}</div>
    </motion.div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Skip Link for Accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Header rightContent={<ThemeToggle variant="dropdown" />} />

      <main id="main-content" className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Animated background elements */}
          <div className="absolute inset-0 pointer-events-none">
            <motion.div
              className="absolute top-20 left-10 w-72 h-72 bg-primary-500/10 rounded-full blur-3xl"
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 8, repeat: Infinity }}
            />
            <motion.div
              className="absolute bottom-20 right-10 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl"
              animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 10, repeat: Infinity }}
            />
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-500/5 rounded-full blur-3xl"
              animate={{ rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
            />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="text-center"
            >
              {/* Badge */}
              <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-6">
                <Sparkles className="w-4 h-4 text-gold-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  AGENTiGraph-style Knowledge Graph Platform
                </span>
              </motion.div>

              {/* Main heading */}
              <motion.h1 
                variants={itemVariants}
                className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6"
              >
                <span className="text-slate-900 dark:text-white">Explore Your</span>
                <br />
                <span className="gradient-text">Research Literature</span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p 
                variants={itemVariants}
                className="text-lg md:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mb-10 text-balance"
              >
                Transform your academic papers into an interactive knowledge graph. 
                Visualize connections, discover insights, and chat with AI about your research.
              </motion.p>

              {/* CTA Buttons */}
              <motion.div 
                variants={itemVariants}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <Link href="/import" className="btn-primary text-base px-8 py-3">
                  <FolderOpen className="w-5 h-5" />
                  Import Research
                </Link>
                <Link href="/projects" className="btn-secondary text-base px-8 py-3">
                  <Network className="w-5 h-5" />
                  View Projects
                </Link>
              </motion.div>
            </motion.div>

            {/* Floating illustration */}
            <motion.div
              variants={floatVariants}
              animate="animate"
              className="mt-16 flex justify-center"
            >
              <div className="relative">
                {/* Abstract graph visualization */}
                <svg
                  viewBox="0 0 400 300"
                  className="w-full max-w-lg h-auto"
                  fill="none"
                >
                  {/* Connection lines */}
                  <motion.path
                    d="M100 150 L200 100 L300 150 L200 200 Z"
                    stroke="url(#gradient1)"
                    strokeWidth="2"
                    strokeDasharray="5 5"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <motion.line
                    x1="200" y1="100" x2="200" y2="200"
                    stroke="url(#gradient2)"
                    strokeWidth="2"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.5, delay: 0.5, repeat: Infinity }}
                  />
                  
                  {/* Nodes */}
                  <motion.circle
                    cx="100" cy="150" r="20"
                    fill="url(#nodeGradient1)"
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <motion.circle
                    cx="200" cy="100" r="25"
                    fill="url(#nodeGradient2)"
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 2.5, repeat: Infinity, delay: 0.3 }}
                  />
                  <motion.circle
                    cx="300" cy="150" r="18"
                    fill="url(#nodeGradient3)"
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
                  />
                  <motion.circle
                    cx="200" cy="200" r="22"
                    fill="url(#nodeGradient4)"
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.12, 1] }}
                    transition={{ duration: 2.2, repeat: Infinity, delay: 0.9 }}
                  />
                  
                  {/* Gradients */}
                  <defs>
                    <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.5" />
                    </linearGradient>
                    <linearGradient id="gradient2" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.5" />
                    </linearGradient>
                    <linearGradient id="nodeGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#1d4ed8" />
                    </linearGradient>
                    <linearGradient id="nodeGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                    <linearGradient id="nodeGradient3" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="nodeGradient4" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 md:py-24">
          <div className="max-w-7xl mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                Powerful Features
              </h2>
              <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
                Everything you need to explore, analyze, and understand your research literature.
              </p>
            </motion.div>

            <motion.div
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <FeatureCard
                href="/import"
                icon={FolderOpen}
                title="Import ScholaRAG"
                description="Import your existing ScholaRAG project folders and automatically build a comprehensive knowledge graph."
                gradient="bg-gradient-to-br from-primary-500 to-primary-600"
              />
              <FeatureCard
                href="/projects"
                icon={Network}
                title="Interactive Graph"
                description="Visualize and explore your knowledge graph with an intuitive React Flow interface. Zoom, pan, and discover connections."
                gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
              />
              <FeatureCard
                href="/projects"
                icon={MessageSquare}
                title="AI-Powered Chat"
                description="Ask questions about your literature and receive graph-grounded responses with accurate citations."
                gradient="bg-gradient-to-br from-violet-500 to-violet-600"
              />
            </motion.div>
          </div>
        </section>

        {/* How it Works Section */}
        <section className="py-16 md:py-24 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="max-w-7xl mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                How It Works
              </h2>
              <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
                Transform your research papers into actionable insights in minutes.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-4 gap-8">
              {[
                { icon: BookOpen, title: 'Import Papers', desc: 'Upload your ScholaRAG folder or individual PDFs' },
                { icon: Brain, title: 'Extract Knowledge', desc: 'AI extracts entities, concepts, and relationships' },
                { icon: GitBranch, title: 'Build Graph', desc: 'Automatic knowledge graph construction' },
                { icon: Layers, title: 'Explore & Chat', desc: 'Interact with your research visually and conversationally' },
              ].map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <div className="relative inline-flex">
                    <div className="p-4 rounded-2xl glass mb-4">
                      <step.icon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    </div>
                    {i < 3 && (
                      <div className="hidden md:block absolute top-1/2 left-full w-full h-0.5 bg-gradient-to-r from-primary-300 to-transparent -translate-y-1/2" />
                    )}
                  </div>
                  <div className="text-sm font-medium text-primary-600 dark:text-primary-400 mb-1">
                    Step {i + 1}
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {step.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="glass-card p-8 md:p-12">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <StatCounter value="6" label="AI Agents" />
                <StatCounter value="5" label="Entity Types" />
                <StatCounter value="7" label="Relationship Types" />
                <StatCounter value="3" label="LLM Providers" />
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 md:py-24">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-6">
                Ready to Explore Your Research?
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-300 mb-8">
                Start by importing your ScholaRAG project or create a new one from scratch.
              </p>
              <Link href="/import" className="btn-primary text-lg px-10 py-4">
                Get Started
                <ArrowRight className="w-5 h-5" />
              </Link>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
