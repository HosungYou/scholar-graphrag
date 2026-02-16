'use client';

import { motion } from 'framer-motion';
import { Activity, Database, Cpu, HardDrive, Terminal } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function HUD({ projectId, nodeCount, edgeCount }: { projectId: string; nodeCount: number; edgeCount: number }) {
  const { data: metrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/metrics/summary`).then(res => res.json()),
    refetchInterval: 5000,
  });

  return (
    <div className="fixed top-20 right-6 flex flex-col gap-3 z-40 pointer-events-none">
      {/* Project Status */}
      <motion.div
        initial={{ x: 100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="bg-surface-1 border border-border p-4 rounded pointer-events-auto min-w-[200px]"
      >
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-teal" />
          <span className="text-[10px] font-medium tracking-widest text-text-tertiary uppercase">System Status</span>
          <div className="ml-auto w-2 h-2 rounded-full bg-teal animate-pulse" />
        </div>

        <div className="space-y-3">
          <StatItem icon={Database} label="Nodes" value={nodeCount.toLocaleString()} color="text-node-concept" />
          <StatItem icon={Activity} label="Edges" value={edgeCount.toLocaleString()} color="text-node-method" />

          <div className="h-px bg-border my-2" />

          <StatItem icon={Cpu} label="CPU" value={`${metrics?.process_cpu_percent || 0}%`} color="text-teal" />
          <StatItem icon={HardDrive} label="RAM" value={`${metrics?.process_memory_mb?.toFixed(0) || 0}MB`} color="text-node-author" />
        </div>
      </motion.div>
    </div>
  );
}

function StatItem({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      </div>
      <span className="text-xs font-mono font-medium text-text-primary">{value}</span>
    </div>
  );
}
