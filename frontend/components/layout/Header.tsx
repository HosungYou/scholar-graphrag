'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FolderOpen,
  Settings,
  Menu,
  X,
  Home,
  ChevronRight,
  Network,
} from 'lucide-react';
import { useState, useCallback } from 'react';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface HeaderProps {
  breadcrumbs?: Breadcrumb[];
  rightContent?: React.ReactNode;
}

export function Header({ breadcrumbs, rightContent }: HeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const navLinks = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/projects', label: 'Projects', icon: Network },
    { href: '/import', label: 'Import', icon: FolderOpen },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface-0/95">
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo — monogram style */}
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 flex-shrink-0"
              aria-label="ScholaRAG Graph Home"
            >
              <span className="font-mono text-sm font-medium text-teal tracking-wider">S·G</span>
              <span className="text-sm text-text-secondary tracking-tight hidden sm:inline">
                ScholaRAG Graph
              </span>
            </Link>

            {/* Breadcrumbs */}
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav aria-label="Breadcrumb" className="hidden md:flex items-center">
                {breadcrumbs.map((crumb, index) => (
                  <div key={index} className="flex items-center">
                    <ChevronRight className="w-3 h-3 text-text-ghost mx-1.5" />
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        className="text-sm text-text-tertiary hover:text-text-primary transition-colors"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-sm text-text-secondary">{crumb.label}</span>
                    )}
                  </div>
                ))}
              </nav>
            )}
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    px-3 py-1.5 rounded text-sm transition-colors duration-150
                    ${active
                      ? 'text-teal'
                      : 'text-text-tertiary hover:text-text-secondary'
                    }
                  `}
                  aria-current={active ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {rightContent && (
              <div className="hidden md:flex items-center">{rightContent}</div>
            )}
            <button
              onClick={toggleMobileMenu}
              className="md:hidden p-2 rounded text-text-tertiary hover:text-text-primary transition-colors"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-surface-1">
          <nav className="px-6 py-3 space-y-1" aria-label="Mobile navigation">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-colors
                    ${active ? 'text-teal' : 'text-text-tertiary hover:text-text-secondary'}
                  `}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {rightContent && <div className="px-6 pb-3">{rightContent}</div>}
        </div>
      )}
    </header>
  );
}
