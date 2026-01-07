'use client';

import Link from 'next/link';
import { FolderOpen, MessageSquare, Network, Settings, Plus } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Network className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">ScholaRAG Graph</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/projects"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Projects
            </Link>
            <Link
              href="/import"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Import
            </Link>
            <Link
              href="/settings"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Explore Your Research Literature
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            AGENTiGraph-style Knowledge Graph platform for visualizing and
            exploring academic literature from ScholaRAG.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Link
            href="/import"
            className="group p-6 bg-white rounded-xl shadow-sm border hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                <FolderOpen className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Import ScholaRAG
              </h3>
            </div>
            <p className="text-gray-600">
              Import your existing ScholaRAG project folders and build a
              knowledge graph automatically.
            </p>
          </Link>

          <Link
            href="/projects"
            className="group p-6 bg-white rounded-xl shadow-sm border hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                <Network className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Explore Graphs
              </h3>
            </div>
            <p className="text-gray-600">
              Visualize and explore your knowledge graphs with interactive
              React Flow interface.
            </p>
          </Link>

          <Link
            href="/projects"
            className="group p-6 bg-white rounded-xl shadow-sm border hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                <MessageSquare className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Chat with AI
              </h3>
            </div>
            <p className="text-gray-600">
              Ask questions about your literature and get graph-grounded
              responses with citations.
            </p>
          </Link>
        </div>

        {/* Features */}
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Features</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-bold">1</span>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Dual-Mode Interface</h4>
                <p className="text-gray-600">
                  Switch between Chatbot Mode and Exploration Mode seamlessly.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-bold">2</span>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Multi-Agent System</h4>
                <p className="text-gray-600">
                  6-agent pipeline for intelligent query processing and reasoning.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-bold">3</span>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Graph-Grounded Responses</h4>
                <p className="text-gray-600">
                  Every AI response is linked to actual nodes in your knowledge graph.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 font-bold">4</span>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Multi-Provider LLM</h4>
                <p className="text-gray-600">
                  Choose between Claude, GPT-4, or Gemini for your AI interactions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-600">
          <p>
            ScholaRAG Graph - AGENTiGraph-style Knowledge Graph Platform
          </p>
          <p className="text-sm mt-2">
            Built with Next.js, React Flow, FastAPI, and PostgreSQL
          </p>
        </div>
      </footer>
    </div>
  );
}
