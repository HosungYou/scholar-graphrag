# ZoteroImporter Component Design Plan
## ScholaRAG_Graph_Review Frontend Implementation

---

## 1. Component Tree Structure

```
ZoteroImporter.tsx (Main Container)
├── ZoteroConnectionStatus.tsx (Connection indicator)
├── CollectionSelector.tsx (Collection dropdown with stats)
├── ImportModeSelector.tsx (Mode selection with cost estimates)
├── ImportProgressTracker.tsx (Progress bar with detailed steps)
├── ZoteroHelpPanel.tsx (Connection instructions)
└── ImportErrorDisplay.tsx (Error handling UI)
```

### 1.1 File Organization

```
frontend/
├── components/
│   ├── import/
│   │   ├── ZoteroImporter.tsx          # Main container
│   │   ├── ZoteroConnectionStatus.tsx  # Connection UI
│   │   ├── CollectionSelector.tsx      # Collection picker
│   │   ├── ImportModeSelector.tsx      # Mode selection
│   │   ├── ImportProgressTracker.tsx   # Progress UI
│   │   ├── ZoteroHelpPanel.tsx         # Help/Instructions
│   │   └── ImportErrorDisplay.tsx      # Error states
│   └── ui/
│       ├── card.tsx                     # shadcn/ui Card (existing)
│       ├── button.tsx                   # shadcn/ui Button (existing)
│       ├── select.tsx                   # shadcn/ui Select (to create)
│       ├── progress.tsx                 # shadcn/ui Progress (to create)
│       ├── badge.tsx                    # shadcn/ui Badge (to create)
│       └── alert.tsx                    # shadcn/ui Alert (to create)
├── hooks/
│   ├── useZoteroConnection.ts          # Connection state hook
│   ├── useZoteroImport.ts              # Import logic hook
│   └── useImportPolling.ts             # Job status polling
├── lib/
│   └── api.ts                           # API client (extend existing)
└── types/
    └── zotero.ts                        # Zotero-specific types
```

---

## 2. State Management Strategy

### 2.1 Zustand Store vs React Query

**Decision: Hybrid Approach**

| Concern | Solution | Tool |
|---------|----------|------|
| Connection status | Client state | Zustand |
| Collections list | Server state | React Query |
| Import job status | Server state | React Query (polling) |
| Selected collection | Client state | Local useState |
| UI state (modals, errors) | Client state | Local useState |

### 2.2 Zustand Store Design

```typescript
// hooks/useZoteroStore.ts
import { create } from 'zustand';

interface ZoteroStore {
  // Connection State
  isConnected: boolean;
  connectionError: string | null;
  lastChecked: Date | null;

  // Import State
  activeImportJob: string | null;
  importHistory: ImportHistoryItem[];

  // Actions
  setConnected: (status: boolean) => void;
  setConnectionError: (error: string | null) => void;
  addImportToHistory: (job: ImportHistoryItem) => void;
  clearImportHistory: () => void;
}

interface ImportHistoryItem {
  jobId: string;
  collectionName: string;
  itemCount: number;
  mode: ImportMode;
  status: ImportStatus;
  startedAt: Date;
  completedAt?: Date;
  projectId?: string;
}

export const useZoteroStore = create<ZoteroStore>((set) => ({
  isConnected: false,
  connectionError: null,
  lastChecked: null,
  activeImportJob: null,
  importHistory: [],

  setConnected: (status) => set({
    isConnected: status,
    lastChecked: new Date(),
    connectionError: status ? null : 'Connection failed'
  }),

  setConnectionError: (error) => set({ connectionError: error }),

  addImportToHistory: (job) => set((state) => ({
    importHistory: [job, ...state.importHistory].slice(0, 10) // Keep last 10
  })),

  clearImportHistory: () => set({ importHistory: [] }),
}));
```

### 2.3 React Query Hooks

```typescript
// hooks/useZoteroConnection.ts
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useZoteroStore } from './useZoteroStore';

export function useZoteroConnection() {
  const { setConnected, setConnectionError } = useZoteroStore();

  // Auto-check connection on mount
  const connectionQuery = useQuery({
    queryKey: ['zotero', 'connection'],
    queryFn: async () => {
      const status = await api.checkZoteroConnection();
      setConnected(status.connected);
      return status;
    },
    staleTime: 30000, // Recheck every 30s
    retry: 2,
  });

  // Manual reconnect
  const reconnectMutation = useMutation({
    mutationFn: () => api.checkZoteroConnection(),
    onSuccess: (data) => {
      setConnected(data.connected);
      connectionQuery.refetch();
    },
    onError: (error) => {
      setConnectionError(error.message);
    }
  });

  return {
    isConnected: connectionQuery.data?.connected ?? false,
    isChecking: connectionQuery.isLoading,
    checkConnection: reconnectMutation.mutate,
    error: connectionQuery.error,
  };
}

// hooks/useZoteroCollections.ts
export function useZoteroCollections(enabled: boolean) {
  return useQuery({
    queryKey: ['zotero', 'collections'],
    queryFn: () => api.getZoteroCollections(),
    enabled, // Only fetch when connected
    staleTime: 60000, // Cache for 1 minute
  });
}

// hooks/useZoteroImport.ts
export function useZoteroImport() {
  const { addImportToHistory } = useZoteroStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: ImportParams) => {
      const job = await api.startZoteroImport(params);
      return job;
    },
    onSuccess: (job, variables) => {
      addImportToHistory({
        jobId: job.job_id,
        collectionName: variables.collectionName,
        itemCount: variables.itemCount,
        mode: variables.mode,
        status: 'running',
        startedAt: new Date(),
      });

      // Start polling for this job
      queryClient.invalidateQueries(['import', 'status', job.job_id]);
    },
  });
}

// hooks/useImportPolling.ts
export function useImportPolling(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['import', 'status', jobId],
    queryFn: () => api.getImportStatus(jobId!),
    enabled: enabled && !!jobId,
    refetchInterval: (data) => {
      // Poll every 2s while running, stop when completed/failed
      if (data?.status === 'running' || data?.status === 'pending') {
        return 2000;
      }
      return false;
    },
  });
}
```

---

## 3. UI/UX Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     ZoteroImporter                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [1] Connection Check                                       │
│      ┌──────────────────────────────────────┐              │
│      │ ● Connected / ● Disconnected         │              │
│      │ [Retry Button] [Help Link]          │              │
│      └──────────────────────────────────────┘              │
│                         │                                   │
│                         ▼                                   │
│  [2] Collection Selection (if connected)                    │
│      ┌──────────────────────────────────────┐              │
│      │ Select Collection ▼                  │              │
│      │ ├─ My Library (245 items)           │              │
│      │ ├─ AI Research (128 items)          │              │
│      │ └─ Systematic Review (52 items)     │              │
│      └──────────────────────────────────────┘              │
│                         │                                   │
│                         ▼                                   │
│  [3] Import Mode Selection                                  │
│      ┌──────────────────────────────────────┐              │
│      │ ○ Quick Mode (Free)                 │              │
│      │   Metadata only, no LLM calls       │              │
│      │                                      │              │
│      │ ● Recommended Mode (~$0.01/paper)   │              │
│      │   Metadata + Methods + Findings     │              │
│      │   Est. cost: $1.28 for 128 papers   │              │
│      │                                      │              │
│      │ ○ Full Analysis (~$0.02/paper)      │              │
│      │   Complete entity extraction        │              │
│      └──────────────────────────────────────┘              │
│                         │                                   │
│                         ▼                                   │
│  [4] Import Button                                          │
│      ┌──────────────────────────────────────┐              │
│      │ [Start Import] (disabled if none)    │              │
│      └──────────────────────────────────────┘              │
│                         │                                   │
│                         ▼ (on click)                        │
│  [5] Progress Tracking                                      │
│      ┌──────────────────────────────────────┐              │
│      │ Importing: 45 / 128 papers (35%)    │              │
│      │ ████████░░░░░░░░░░░░░░░░ 35%        │              │
│      │                                      │              │
│      │ Current: Extracting concepts from   │              │
│      │          "Transformers in NLP"       │              │
│      │                                      │              │
│      │ ✓ Step 1: Fetch metadata (128/128)  │              │
│      │ ↻ Step 2: Download PDFs (45/128)    │              │
│      │ ⏳ Step 3: Extract entities (0/128) │              │
│      └──────────────────────────────────────┘              │
│                         │                                   │
│                         ▼ (on completion)                   │
│  [6] Success / Error Display                                │
│      ┌──────────────────────────────────────┐              │
│      │ ✅ Import Complete!                  │              │
│      │                                      │              │
│      │ Created: Project "AI Research"      │              │
│      │ - 128 papers imported               │              │
│      │ - 245 concepts extracted            │              │
│      │ - 156 relationships created         │              │
│      │                                      │              │
│      │ [View Project] [Import Another]     │              │
│      └──────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 State Transitions

```
Initial → CheckingConnection
           │
           ├─ Connected → LoadingCollections
           │              │
           │              ├─ CollectionsFetched → SelectingCollection
           │              │                       │
           │              │                       ├─ CollectionSelected → SelectingMode
           │              │                       │                      │
           │              │                       │                      ├─ ModeSelected → ReadyToImport
           │              │                       │                      │                │
           │              │                       │                      │                ├─ Importing → Polling
           │              │                       │                      │                │             │
           │              │                       │                      │                │             ├─ Completed → Success
           │              │                       │                      │                │             └─ Failed → Error
           │              └─ Error → ShowError
           │
           └─ Disconnected → ShowConnectionHelp
```

---

## 4. API Calls Required

### 4.1 Extend lib/api.ts

```typescript
// Add to existing ApiClient class in lib/api.ts

class ApiClient {
  // ... existing methods ...

  /**
   * Zotero Integration APIs
   */

  // Check Zotero connection status
  async checkZoteroConnection(): Promise<{
    connected: boolean;
    version?: string;
    error?: string;
  }> {
    return this.request('/api/import/zotero/status');
  }

  // Get available collections
  async getZoteroCollections(): Promise<ZoteroCollection[]> {
    return this.request('/api/import/zotero/collections');
  }

  // Get items in a collection (for preview)
  async getCollectionItems(
    collectionKey: string,
    limit: number = 10
  ): Promise<ZoteroItem[]> {
    return this.request(
      `/api/import/zotero/collections/${collectionKey}/items?limit=${limit}`
    );
  }

  // Start import job
  async startZoteroImport(params: {
    collectionKey: string;
    projectName?: string;
    mode: 'zotero_only' | 'selective' | 'full';
    extractConcepts?: boolean;
  }): Promise<{ job_id: string }> {
    return this.request('/api/import/zotero/import', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Get import job status (reuse existing getImportStatus)
  // async getImportStatus(jobId: string): Promise<ImportJob> { ... }
}
```

### 4.2 Type Definitions

```typescript
// types/zotero.ts
export interface ZoteroCollection {
  key: string;
  name: string;
  parentCollection?: string;
  itemCount: number;
  version: number;
}

export interface ZoteroItem {
  key: string;
  itemType: string;
  title: string;
  creators: Array<{
    firstName?: string;
    lastName?: string;
    name?: string;
    creatorType: string;
  }>;
  abstractNote?: string;
  date?: string;
  DOI?: string;
  url?: string;
  tags: Array<{ tag: string }>;
  collections: string[];
  version: number;
}

export type ImportMode = 'zotero_only' | 'selective' | 'full';

export interface ImportModeOption {
  value: ImportMode;
  label: string;
  description: string;
  costPerPaper: number;
  features: string[];
  recommended?: boolean;
}

export interface ImportJobProgress {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  current_step: string;
  total_steps: number;
  completed_steps: number;
  current_paper?: string;
  error?: string;
  result?: {
    project_id: string;
    nodes_created: number;
    edges_created: number;
    papers_imported: number;
    concepts_extracted: number;
    relationships_created: number;
  };
}
```

---

## 5. Component Implementation Details

### 5.1 Main Container: ZoteroImporter.tsx

```typescript
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ZoteroConnectionStatus } from './ZoteroConnectionStatus';
import { CollectionSelector } from './CollectionSelector';
import { ImportModeSelector } from './ImportModeSelector';
import { ImportProgressTracker } from './ImportProgressTracker';
import { ZoteroHelpPanel } from './ZoteroHelpPanel';

import { useZoteroConnection } from '@/hooks/useZoteroConnection';
import { useZoteroCollections } from '@/hooks/useZoteroCollections';
import { useZoteroImport } from '@/hooks/useZoteroImport';
import { useImportPolling } from '@/hooks/useImportPolling';

import type { ImportMode, ZoteroCollection } from '@/types/zotero';

export function ZoteroImporter() {
  // Connection state
  const { isConnected, isChecking, checkConnection, error: connectionError } =
    useZoteroConnection();

  // Collections state
  const {
    data: collections,
    isLoading: isLoadingCollections
  } = useZoteroCollections(isConnected);

  // Import state
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('selective');
  const [showHelp, setShowHelp] = useState(false);

  const importMutation = useZoteroImport();
  const activeJobId = importMutation.data?.job_id || null;

  // Poll for import progress
  const { data: importStatus } = useImportPolling(
    activeJobId,
    importMutation.isSuccess
  );

  // Handlers
  const handleStartImport = async () => {
    if (!selectedCollection) return;

    const collection = collections?.find(c => c.key === selectedCollection);
    if (!collection) return;

    await importMutation.mutateAsync({
      collectionKey: selectedCollection,
      projectName: collection.name,
      mode: importMode,
      extractConcepts: importMode !== 'zotero_only',
    });
  };

  const isImporting = importStatus?.status === 'running' ||
                      importStatus?.status === 'pending';
  const isCompleted = importStatus?.status === 'completed';
  const isFailed = importStatus?.status === 'failed';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ZoteroIcon className="w-6 h-6" />
              Import from Zotero
            </span>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showHelp ? 'Hide Help' : 'Need Help?'}
            </button>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Help Panel (collapsible) */}
          {showHelp && <ZoteroHelpPanel />}

          {/* Step 1: Connection Status */}
          <ZoteroConnectionStatus
            isConnected={isConnected}
            isChecking={isChecking}
            error={connectionError}
            onRetry={checkConnection}
          />

          {/* Step 2: Collection Selection (only when connected) */}
          {isConnected && (
            <CollectionSelector
              collections={collections || []}
              isLoading={isLoadingCollections}
              selectedCollection={selectedCollection}
              onSelect={setSelectedCollection}
              disabled={isImporting}
            />
          )}

          {/* Step 3: Import Mode (only when collection selected) */}
          {isConnected && selectedCollection && (
            <ImportModeSelector
              mode={importMode}
              onModeChange={setImportMode}
              itemCount={
                collections?.find(c => c.key === selectedCollection)?.itemCount || 0
              }
              disabled={isImporting}
            />
          )}

          {/* Step 4: Start Import Button */}
          {isConnected && selectedCollection && !isImporting && !isCompleted && (
            <div className="flex justify-end">
              <Button
                onClick={handleStartImport}
                disabled={!selectedCollection || importMutation.isLoading}
                size="lg"
                className="w-full sm:w-auto"
              >
                {importMutation.isLoading ? 'Starting...' : 'Start Import'}
              </Button>
            </div>
          )}

          {/* Step 5: Progress Tracker (when importing) */}
          {(isImporting || isCompleted || isFailed) && importStatus && (
            <ImportProgressTracker
              status={importStatus}
              onViewProject={() => {
                if (importStatus.result?.project_id) {
                  window.location.href = `/projects/${importStatus.result.project_id}`;
                }
              }}
              onImportAnother={() => {
                importMutation.reset();
                setSelectedCollection(null);
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Zotero icon component (from lucide-react or custom SVG)
function ZoteroIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      {/* Zotero logo SVG path */}
      <path d="M4 4h16v16H4z" />
    </svg>
  );
}
```

### 5.2 Sub-Components

```typescript
// components/import/ZoteroConnectionStatus.tsx
interface ZoteroConnectionStatusProps {
  isConnected: boolean;
  isChecking: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function ZoteroConnectionStatus({
  isConnected,
  isChecking,
  error,
  onRetry,
}: ZoteroConnectionStatusProps) {
  if (isChecking) {
    return (
      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        <span className="text-sm text-gray-700">Checking Zotero connection...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Connection Error</AlertTitle>
        <AlertDescription>
          {error.message}
          <Button variant="link" onClick={onRetry} className="ml-2 p-0">
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`} />
        <span className="text-sm font-medium">
          {isConnected ? 'Connected to Zotero' : 'Not connected to Zotero'}
        </span>
      </div>

      {!isConnected && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry Connection
        </Button>
      )}
    </div>
  );
}

// components/import/CollectionSelector.tsx
interface CollectionSelectorProps {
  collections: ZoteroCollection[];
  isLoading: boolean;
  selectedCollection: string | null;
  onSelect: (key: string) => void;
  disabled?: boolean;
}

export function CollectionSelector({
  collections,
  isLoading,
  selectedCollection,
  onSelect,
  disabled,
}: CollectionSelectorProps) {
  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (collections.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>No collections found</AlertTitle>
        <AlertDescription>
          Your Zotero library appears to be empty. Add some items to Zotero first.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Select Collection</label>
      <Select
        value={selectedCollection || ''}
        onValueChange={onSelect}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Choose a collection..." />
        </SelectTrigger>
        <SelectContent>
          {collections.map((collection) => (
            <SelectItem key={collection.key} value={collection.key}>
              <div className="flex items-center justify-between w-full">
                <span>{collection.name}</span>
                <Badge variant="secondary" className="ml-2">
                  {collection.itemCount} items
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// components/import/ImportModeSelector.tsx
interface ImportModeSelectorProps {
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  itemCount: number;
  disabled?: boolean;
}

const IMPORT_MODES: ImportModeOption[] = [
  {
    value: 'zotero_only',
    label: 'Quick Mode',
    description: 'Import metadata only (title, authors, year, abstract)',
    costPerPaper: 0,
    features: ['Fast import', 'No LLM calls', 'Basic graph structure'],
  },
  {
    value: 'selective',
    label: 'Recommended Mode',
    description: 'Metadata + methods, findings, and key concepts',
    costPerPaper: 0.01,
    features: ['Balanced cost/quality', 'Extract methods & findings', 'Rich graph'],
    recommended: true,
  },
  {
    value: 'full',
    label: 'Full Analysis',
    description: 'Complete entity extraction with all relationships',
    costPerPaper: 0.02,
    features: ['Highest quality', 'All entity types', 'Dense graph'],
  },
];

export function ImportModeSelector({
  mode,
  onModeChange,
  itemCount,
  disabled,
}: ImportModeSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Import Mode</label>

      {IMPORT_MODES.map((option) => {
        const estimatedCost = option.costPerPaper * itemCount;
        const isSelected = mode === option.value;

        return (
          <div
            key={option.value}
            className={`relative border rounded-lg p-4 cursor-pointer transition-all ${
              isSelected
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                : 'border-gray-200 hover:border-gray-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onModeChange(option.value)}
          >
            {option.recommended && (
              <Badge className="absolute -top-2 right-4 bg-blue-600">
                Recommended
              </Badge>
            )}

            <div className="flex items-start gap-3">
              <input
                type="radio"
                checked={isSelected}
                onChange={() => onModeChange(option.value)}
                disabled={disabled}
                className="mt-1"
              />

              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium">{option.label}</h4>
                  {option.costPerPaper > 0 && (
                    <span className="text-sm text-gray-600">
                      Est. ${estimatedCost.toFixed(2)} for {itemCount} papers
                    </span>
                  )}
                  {option.costPerPaper === 0 && (
                    <span className="text-sm font-medium text-green-600">Free</span>
                  )}
                </div>

                <p className="text-sm text-gray-600 mb-2">{option.description}</p>

                <ul className="text-xs text-gray-500 space-y-0.5">
                  {option.features.map((feature, i) => (
                    <li key={i}>✓ {feature}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// components/import/ImportProgressTracker.tsx
interface ImportProgressTrackerProps {
  status: ImportJobProgress;
  onViewProject?: () => void;
  onImportAnother?: () => void;
}

export function ImportProgressTracker({
  status,
  onViewProject,
  onImportAnother,
}: ImportProgressTrackerProps) {
  const isRunning = status.status === 'running' || status.status === 'pending';
  const isCompleted = status.status === 'completed';
  const isFailed = status.status === 'failed';

  if (isCompleted && status.result) {
    return (
      <Alert className="bg-green-50 border-green-200">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-800">Import Complete!</AlertTitle>
        <AlertDescription className="space-y-3">
          <div className="text-sm text-green-700">
            <p className="font-medium mb-2">Successfully created project</p>
            <ul className="space-y-1">
              <li>• {status.result.papers_imported} papers imported</li>
              <li>• {status.result.concepts_extracted} concepts extracted</li>
              <li>• {status.result.relationships_created} relationships created</li>
              <li>• {status.result.nodes_created} total nodes</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button onClick={onViewProject} size="sm">
              View Project
            </Button>
            <Button onClick={onImportAnother} variant="outline" size="sm">
              Import Another Collection
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (isFailed) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertTitle>Import Failed</AlertTitle>
        <AlertDescription>
          <p className="mb-2">{status.error || 'An unexpected error occurred'}</p>
          <Button onClick={onImportAnother} variant="outline" size="sm">
            Try Again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Running state
  return (
    <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-blue-900">
          Importing: {status.completed_steps} / {status.total_steps} steps
        </h4>
        <span className="text-sm text-blue-700">{status.progress}%</span>
      </div>

      <Progress value={status.progress} className="h-2" />

      <div className="text-sm text-blue-700">
        <p className="font-medium mb-1">Current step:</p>
        <p>{status.current_step}</p>
        {status.current_paper && (
          <p className="text-xs mt-1 opacity-75">Processing: {status.current_paper}</p>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-blue-600">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>This may take several minutes...</span>
      </div>
    </div>
  );
}

// components/import/ZoteroHelpPanel.tsx
export function ZoteroHelpPanel() {
  return (
    <Alert className="bg-blue-50 border-blue-200">
      <Info className="h-4 w-4 text-blue-600" />
      <AlertTitle className="text-blue-900">How to connect Zotero</AlertTitle>
      <AlertDescription className="space-y-2 text-sm text-blue-800">
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the Zotero desktop application</li>
          <li>Go to Edit → Preferences (or Zotero → Settings on Mac)</li>
          <li>Click the "Advanced" tab</li>
          <li>Under "General", enable "Allow other applications on this computer to communicate with Zotero"</li>
          <li>Refresh this page</li>
        </ol>

        <p className="mt-3 pt-3 border-t border-blue-200">
          <strong>Don't have Zotero?</strong> Download it for free at{' '}
          <a
            href="https://www.zotero.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-600"
          >
            zotero.org
          </a>
        </p>
      </AlertDescription>
    </Alert>
  );
}
```

---

## 6. shadcn/ui Components to Install

```bash
# In frontend/ directory
npx shadcn-ui@latest add select
npx shadcn-ui@latest add progress
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add alert
npx shadcn-ui@latest add skeleton
```

These will be installed to `components/ui/` and automatically configured with Tailwind CSS.

---

## 7. Implementation Checklist

### Phase 1: Core UI Components (Day 1)
- [ ] Install shadcn/ui components (select, progress, badge, alert, skeleton)
- [ ] Create type definitions in `types/zotero.ts`
- [ ] Extend `lib/api.ts` with Zotero methods
- [ ] Create Zustand store `hooks/useZoteroStore.ts`

### Phase 2: React Query Hooks (Day 2)
- [ ] Implement `hooks/useZoteroConnection.ts`
- [ ] Implement `hooks/useZoteroCollections.ts`
- [ ] Implement `hooks/useZoteroImport.ts`
- [ ] Implement `hooks/useImportPolling.ts`

### Phase 3: Sub-Components (Day 3)
- [ ] Build `ZoteroConnectionStatus.tsx`
- [ ] Build `CollectionSelector.tsx`
- [ ] Build `ImportModeSelector.tsx`
- [ ] Build `ImportProgressTracker.tsx`
- [ ] Build `ZoteroHelpPanel.tsx`

### Phase 4: Main Container (Day 4)
- [ ] Build `ZoteroImporter.tsx` main component
- [ ] Wire up all sub-components
- [ ] Test state transitions
- [ ] Handle error cases

### Phase 5: Integration (Day 5)
- [ ] Add route in Next.js app router (`app/import/zotero/page.tsx`)
- [ ] Add navigation link in header/sidebar
- [ ] Test with actual Zotero connection
- [ ] Test all import modes

### Phase 6: Polish (Day 6)
- [ ] Add loading skeletons
- [ ] Improve error messages
- [ ] Add animations/transitions
- [ ] Responsive design testing
- [ ] Accessibility audit (ARIA labels, keyboard navigation)

---

## 8. Testing Strategy

### Unit Tests (Vitest)
```typescript
// __tests__/ZoteroImporter.test.tsx
describe('ZoteroImporter', () => {
  it('shows connection status on mount', () => {
    render(<ZoteroImporter />);
    expect(screen.getByText(/checking zotero connection/i)).toBeInTheDocument();
  });

  it('displays collections when connected', async () => {
    server.use(
      rest.get('/api/import/zotero/status', (req, res, ctx) => {
        return res(ctx.json({ connected: true }));
      }),
      rest.get('/api/import/zotero/collections', (req, res, ctx) => {
        return res(ctx.json([
          { key: '1', name: 'Test Collection', itemCount: 10 }
        ]));
      })
    );

    render(<ZoteroImporter />);

    await waitFor(() => {
      expect(screen.getByText('Test Collection')).toBeInTheDocument();
    });
  });

  it('calculates cost estimate correctly', () => {
    // Test cost calculation for each mode
  });
});
```

### Integration Tests (Playwright)
```typescript
// e2e/zotero-import.spec.ts
test('complete import flow', async ({ page }) => {
  await page.goto('/import/zotero');

  // Should show connection check
  await expect(page.locator('text=Checking Zotero connection')).toBeVisible();

  // Mock connected state
  await page.route('**/api/import/zotero/status', route => {
    route.fulfill({ json: { connected: true } });
  });

  // Select collection
  await page.click('text=Select Collection');
  await page.click('text=Test Collection');

  // Select mode
  await page.click('text=Recommended Mode');

  // Start import
  await page.click('text=Start Import');

  // Should show progress
  await expect(page.locator('text=Importing')).toBeVisible();

  // Wait for completion
  await expect(page.locator('text=Import Complete')).toBeVisible({
    timeout: 30000
  });
});
```

---

## 9. Performance Considerations

### Optimization Strategies

1. **Lazy Loading**: Collections only fetch when connected
2. **Polling Optimization**: Stop polling when job completes
3. **Debounced Retry**: Prevent excessive retry attempts
4. **React Query Caching**: Collections cached for 1 minute
5. **Optimistic Updates**: Show local state changes immediately
6. **Virtual Scrolling**: If collections list is very long (use `react-window`)

### Bundle Size Impact

| Component | Size Estimate |
|-----------|---------------|
| Zustand store | ~2KB |
| React Query hooks | ~3KB |
| Sub-components | ~8KB |
| Main container | ~5KB |
| **Total** | **~18KB** (gzipped) |

---

## 10. Accessibility (a11y) Requirements

- [ ] All form inputs have associated labels
- [ ] Error messages linked to inputs with `aria-describedby`
- [ ] Progress bar has `role="progressbar"` and `aria-valuenow`
- [ ] Alert dialogs use `role="alert"` for screen readers
- [ ] Keyboard navigation works for all interactive elements
- [ ] Focus visible styles for keyboard users
- [ ] Color contrast meets WCAG AA standards (4.5:1 minimum)
- [ ] Loading states announced to screen readers

---

## Summary

This design plan provides:

1. **Complete component hierarchy** with 7 specialized sub-components
2. **Hybrid state management** using Zustand (client state) + React Query (server state)
3. **Detailed UI/UX flow** with 6 distinct user states
4. **Full API integration** with 4 new endpoints in existing ApiClient
5. **Implementation roadmap** with 6-day phased approach
6. **Testing strategy** covering unit, integration, and e2e tests
7. **Performance optimizations** to minimize bundle size and API calls
8. **Accessibility compliance** following WCAG guidelines

The ZoteroImporter component leverages existing patterns from ChatInterface.tsx and useGraphStore.ts while introducing specialized functionality for research reference management integration.
