'use client';

import Link from 'next/link';
import { Github } from 'lucide-react';

interface FooterProps {
  minimal?: boolean;
}

export function Footer({ minimal = false }: FooterProps) {
  if (minimal) {
    return (
      <footer>
        <div className="divider" />
        <div className="max-w-4xl mx-auto px-6 py-4 text-center text-xs text-text-ghost font-mono">
          S·G &copy; {new Date().getFullYear()}
        </div>
      </footer>
    );
  }

  return (
    <footer className="mt-auto">
      <div className="divider" />
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="font-mono text-sm text-teal tracking-wider">S·G</p>
            <p className="text-xs text-text-ghost mt-1">
              Knowledge graph platform for academic literature
            </p>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/projects"
              className="text-xs text-text-tertiary hover:text-teal transition-colors"
            >
              Projects
            </Link>
            <Link
              href="/import"
              className="text-xs text-text-tertiary hover:text-teal transition-colors"
            >
              Import
            </Link>
            <Link
              href="/settings"
              className="text-xs text-text-tertiary hover:text-teal transition-colors"
            >
              Settings
            </Link>
            <a
              href="https://github.com/HosungYou/ScholaRAG"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-ghost hover:text-teal transition-colors"
              aria-label="GitHub"
            >
              <Github className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <div className="divider-dotted mt-6 mb-4" />
        <div className="flex items-center justify-between text-[11px] text-text-ghost font-mono">
          <span>&copy; {new Date().getFullYear()} ScholaRAG Graph</span>
          <span>v1.0</span>
        </div>
      </div>
    </footer>
  );
}
