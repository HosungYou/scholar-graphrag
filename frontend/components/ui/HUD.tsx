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
        className="glass-nexus p-4 rounded-2xl pointer-events-auto min-w-[200px]"
      >
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-nexus-cyan" />
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">System Status</span>
          <div className="ml-auto w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        <div className="space-y-3">
          <StatItem icon={Database} label="Nodes" value={nodeCount.toLocaleString()} color="text-nexus-indigo" />
          <StatItem icon={Activity} label="Edges" value={edgeCount.toLocaleString()} color="text-nexus-violet" />
          
          <div className="h-px bg-white/5 my-2" />
          
          <StatItem icon={Cpu} label="CPU" value={`${metrics?.process_cpu_percent || 0}%`} color="text-nexus-cyan" />
          <StatItem icon={HardDrive} label="RAM" value={`${metrics?.process_memory_mb?.toFixed(0) || 0}MB`} color="text-nexus-pink" />
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
        <span className="text-xs font-medium text-slate-400">{label}</span>
      </div>
      <span className="text-xs font-mono font-bold text-slate-200">{value}</span>
    </div>
  );
}
