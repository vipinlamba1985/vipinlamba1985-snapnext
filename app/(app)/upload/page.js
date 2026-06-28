'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileImage, Loader2, AlertCircle, CheckCircle2, 
  FolderPlus, Cloud, Wifi, Trash2, Play, RefreshCw, Check, 
  Lock, Sparkles, MapPin, Calendar, User, ShieldAlert,
  ChevronRight, ArrowUpRight, Ban
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import axios from 'axios';

export default function UploadPage() {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // Storage info
  const [usage, setUsage] = useState(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  // Queue state: each item = { id, file, name, size, type, status, progress, reason, checked }
  const [queue, setQueue] = useState([]);
  const [previews, setPreviews] = useState({}); // id -> blob url
  const [uploading, setUploading] = useState(false);
  const [currentFilter, setCurrentFilter] = useState('all');


const FAILURE_COPY = {
  duplicate: {
    label: 'Already backed up',
    detail: 'This file is already safely stored in SnapNext.',
    retry: 'No retry needed.',
    safe: true,
  },
  storage_full: {
    label: 'Storage quota exceeded',
    detail: 'This file does not fit in your current plan.',
    retry: 'Upgrade your plan or remove files, then retry.',
    safe: true,
  },
  too_large: {
    label: 'File too large',
    detail: 'This file is larger than the single-upload limit.',
    retry: 'Use a smaller file or wait for resumable upload support.',
    safe: true,
  },
  cloud_storage_unavailable: {
    label: 'Cloud storage unavailable',
    detail: 'SnapNext could not connect to the configured cloud storage service.',
    retry: 'Retry after storage configuration is restored.',
    safe: true,
  },
  storage_permission_denied: {
    label: 'Cloud permissions blocked upload',
    detail: 'The storage bucket rejected this upload.',
    retry: 'Retry will help after bucket permissions are fixed.',
    safe: true,
  },
  authentication_expired: {
    label: 'Authentication expired',
    detail: 'Your sign-in session expired before SnapNext could upload this file.',
    retry: 'Sign in again, then retry the upload.',
    safe: true,
  },

  bucket_unavailable: {
    label: 'Storage bucket unavailable',
    detail: 'The configured bucket could not be reached.',
    retry: 'Retry after the bucket is restored or corrected.',
    safe: true,
  },
  connection_lost: {
    label: 'Connection lost',
    detail: 'The upload connection dropped before SnapNext could save the file.',
    retry: 'Retry should help on a stable connection.',
    safe: true,
  },
  storage_unavailable: {
    label: 'Upload service unavailable',
    detail: 'SnapNext could not save this file right now.',
    retry: 'Retry after a moment. If it continues, contact support.',
    safe: true,
  },
  unrecognized_status: {
    label: 'Upload status unclear',
    detail: 'SnapNext did not receive a clear saved/failed response.',
    retry: 'Retry this file.',
    safe: true,
  },
};

function explainFailure(reason, message) {
  const base = FAILURE_COPY[reason] || FAILURE_COPY.storage_unavailable;
  return { ...base, detail: message || base.detail };
}

  // Stats
  const [uploadSpeed, setUploadSpeed] = useState(0); // bytes/sec
  const [estimatedTime, setEstimatedTime] = useState(null); // seconds
  const [overallProgress, setOverallProgress] = useState(0);

  // Summary state for the finished batch
  const [showSummary, setShowSummary] = useState(false);
  const [batchSummary, setBatchSummary] = useState(null);

  // Premium Options (locked for non-super users)
  const [premiumOptions, setPremiumOptions] = useState({
    faceDetection: false,
    favoritePerson: '',
    locationTag: '',
    dateRangeOverride: false,
    startDate: '',
    endDate: ''
  });

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Fetch storage usage details on mount
  useEffect(() => {
    fetchStorageUsage();
  }, []);

  async function fetchStorageUsage() {
    try {
      const data = await apiFetch('/storage/usage');
      setUsage(data);
    } catch (e) {
      console.error('Failed to load storage usage:', e);
    } finally {
      setLoadingUsage(false);
    }
  }

  // Clean up object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      Object.values(previews).forEach(url => {
        try { URL.revokeObjectURL(url); } catch (e) { console.warn('Preview cleanup failed:', e?.message); }
      });
    };
  }, [previews]);

  // Alert before leaving page during active upload
  useEffect(() => {
    if (uploading) {
      const handleBeforeUnload = (e) => {
        e.preventDefault();
        e.returnValue = 'Upload in progress. Leaving this page will cancel active backups. Are you sure?';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [uploading]);

  const isSuper = usage?.isSuper || usage?.plan?.id === 'super_user' || usage?.plan?.id === 'admin';

  // Helper to add files to the queue
  function addFilesToQueue(filesList) {
    const newItems = [];
    const newPreviews = { ...previews };

    filesList.forEach(file => {
      // Avoid duplicate file objects in current queue
      if (queue.some(q => q.name === file.name && q.size === file.size)) return;

      const id = Math.random().toString(36).substring(2, 11);
      
      // Generate thumbnail preview for images
      if (file && file.type && file.type.startsWith('image/')) {
        try {
          const url = URL.createObjectURL(file);
          newPreviews[id] = url;
        } catch (e) {
          console.error('Failed to create preview URL:', e);
        }
      }

      newItems.push({
        id,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'queued', // queued, uploading, done, skipped, error
        progress: 0,
        reason: null,
        checked: true
      });
    });

    if (newItems.length > 0) {
      setQueue(prev => [...prev, ...newItems]);
      setPreviews(newPreviews);
      setShowSummary(false);
      toast.success(`Added ${newItems.length} files to the queue`);
    }
  }

  // File Select Handlers
  function handleFileSelect(e) {
    const list = Array.from(e.target.files || []);
    addFilesToQueue(list);
    e.target.value = '';
  }

  function handleFolderSelect(e) {
    const list = Array.from(e.target.files || []);
    addFilesToQueue(list);
    e.target.value = '';
  }

  // Drag and Drop Handlers
  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    
    const items = e.dataTransfer.items;
    const files = [];
    
    if (items) {
      // Support nested folders when possible or fallback to standard file extraction
      const filePromises = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry && entry.isDirectory) {
            // It's a directory, traverse it
            filePromises.push(traverseDirectory(entry));
          } else {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
      }

      if (filePromises.length > 0) {
        Promise.all(filePromises).then(results => {
          const flatFiles = results.flat();
          addFilesToQueue([...files, ...flatFiles]);
        });
        return;
      }
    } else {
      files.push(...Array.from(e.dataTransfer.files || []));
    }
    
    addFilesToQueue(files);
  }

  // Traverses directory entries recursively
  async function traverseDirectory(entry) {
    const files = [];
    const readEntries = (dirReader) => {
      return new Promise((resolve) => {
        dirReader.readEntries((entries) => {
          resolve(entries);
        });
      });
    };

    const traverse = async (item) => {
      if (item.isFile) {
        const file = await new Promise((resolve) => item.file(resolve));
        files.push(file);
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        let entries = await readEntries(dirReader);
        // readEntries might need to be called multiple times in some browsers
        while (entries.length > 0) {
          for (const ent of entries) {
            await traverse(ent);
          }
          entries = await readEntries(dirReader);
        }
      }
    };

    await traverse(entry);
    return files;
  }

  // Trigger Pickers
  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  function triggerFolderPicker() {
    folderInputRef.current?.click();
  }

  // Queue Item Actions
  function toggleCheckItem(id) {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  }

  function removeItem(id) {
    setQueue(prev => prev.filter(item => item.id !== id));
    if (previews[id]) {
      try { URL.revokeObjectURL(previews[id]); } catch (e) { console.warn('Preview cleanup failed:', e?.message); }
      const newPreviews = { ...previews };
      delete newPreviews[id];
      setPreviews(newPreviews);
    }
  }

  function clearQueue() {
    if (uploading) return;
    Object.values(previews).forEach(url => {
      try { URL.revokeObjectURL(url); } catch (e) { console.warn('Preview cleanup failed:', e?.message); }
    });
    setQueue([]);
    setPreviews({});
    setUploadSpeed(0);
    setEstimatedTime(null);
    setOverallProgress(0);
    setShowSummary(false);
  }

  function selectAllItems(checkedValue) {
    setQueue(prev => prev.map(item => item.status === 'queued' ? { ...item, checked: checkedValue } : item));
  }

  // Main Upload Queue Runner with Max 3 Concurrency
  async function runBackup() {
    if (uploading) return;
    
    const itemsToUpload = queue.filter(item => item.checked && (item.status === 'queued' || item.status === 'error'));
    if (itemsToUpload.length === 0) {
      toast.error('No queued files are selected for upload');
      return;
    }

    // Verify remaining storage quota beforehand
    const totalSizeToUpload = itemsToUpload.reduce((acc, item) => acc + item.size, 0);
    if (!isSuper && usage?.plan) {
      const remainingBytes = usage.plan.storageBytes - usage.usage.bytes;
      if (totalSizeToUpload > remainingBytes) {
        toast.error('Storage limit exceeded. Upgrade your plan or deselect some files to fit within your quota.', {
          duration: 5000,
          action: {
            label: 'Upgrade Plan',
            onClick: () => window.location.href = '/billing'
          }
        });
        return;
      }
    }

    setUploading(true);
    setUploadSpeed(0);
    setEstimatedTime(null);
    setOverallProgress(0);
    setShowSummary(false);

    // Track state of each file's uploaded size for dynamic aggregate speed computing
    const loadedProgressMap = {};
    itemsToUpload.forEach(it => { loadedProgressMap[it.id] = 0; });

    let index = 0;
    const startTime = Date.now();
    const activeWorkers = [];
    
    // Summary counter
    let savedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let quotaExceededCount = 0;

    // Helper to update progress state
    const updateProgress = (itemId, updates) => {
      setQueue(prev => prev.map(item => item.id === itemId ? { ...item, ...updates } : item));
    };

    // Worker function
    const uploadWorker = async (item) => {
      updateProgress(item.id, { status: 'uploading', progress: 0, reason: null });

      const fd = new FormData();
      fd.append('files', item.file, item.name);

      // Append premium meta instructions if premium plan is active
      if (isSuper) {
        if (premiumOptions.faceDetection) fd.append('faceDetection', 'true');
        if (premiumOptions.favoritePerson) fd.append('favoritePerson', premiumOptions.favoritePerson);
        if (premiumOptions.locationTag) fd.append('location', premiumOptions.locationTag);
        if (premiumOptions.dateRangeOverride && premiumOptions.startDate) {
          fd.append('creationDate', premiumOptions.startDate);
        }
      }

      try {
        const token = localStorage.getItem('snapnext_token');
        const response = await axios.post('/api/media/upload', fd, {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
          },
          onUploadProgress: (progressEvent) => {
            const loaded = progressEvent.loaded || 0;
            const total = progressEvent.total || item.size;
            const pct = Math.round((loaded * 100) / total);
            
            updateProgress(item.id, { progress: pct });
            
            // Speed and ETA calculation
            loadedProgressMap[item.id] = loaded;
            const currentTotalLoaded = Object.values(loadedProgressMap).reduce((a, b) => a + b, 0);
            const elapsed = (Date.now() - startTime) / 1000;

            if (elapsed > 0.5) {
              const speed = currentTotalLoaded / elapsed; // bytes per sec
              setUploadSpeed(speed);
              const remaining = totalSizeToUpload - currentTotalLoaded;
              setEstimatedTime(speed > 0 ? remaining / speed : 0);
            }

            setOverallProgress(Math.min(99, Math.round((currentTotalLoaded * 100) / totalSizeToUpload)));
          }
        });

        const res = response.data;
        const savedNames = new Set((res.saved || []).map(s => s.name));
        const skippedMap = new Map((res.skipped || []).map(s => [s.name, s]));

        if (savedNames.has(item.name)) {
          updateProgress(item.id, { status: 'done', progress: 100 });
          savedCount++;
          loadedProgressMap[item.id] = item.size;
        } else if (skippedMap.has(item.name)) {
          const failure = skippedMap.get(item.name);
          const reason = failure?.reason || 'storage_unavailable';
          updateProgress(item.id, {
            status: reason === 'duplicate' ? 'skipped' : 'error',
            progress: 100,
            reason,
            message: failure?.message,
            retryable: failure?.retryable !== false,
            failedAt: failure?.timestamp || new Date().toISOString(),
          });
          if (reason === 'duplicate') skippedCount++;
          else if (reason === 'storage_full') quotaExceededCount++;
          else failedCount++;
          loadedProgressMap[item.id] = item.size;
        } else {
          updateProgress(item.id, { status: 'error', progress: 0, reason: 'unrecognized_status' });
          failedCount++;
          loadedProgressMap[item.id] = 0;
        }
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message || 'Upload failed';
        const reason = err.response?.status === 401 ? 'authentication_expired' : 'storage_unavailable';
        updateProgress(item.id, { status: 'error', progress: 0, reason, message: errMsg, retryable: err.response?.status !== 401, failedAt: new Date().toISOString() });
        failedCount++;
        loadedProgressMap[item.id] = 0;
      }
    };

    // Parallel execution supervisor
    const nextTask = async () => {
      while (index < itemsToUpload.length) {
        const nextItem = itemsToUpload[index++];
        if (!nextItem) break;
        await uploadWorker(nextItem);
      }
    };

    // Launch exactly up to 3 concurrent worker processes
    const concurrencyLimit = Math.min(3, itemsToUpload.length);
    for (let i = 0; i < concurrencyLimit; i++) {
      activeWorkers.push(nextTask());
    }

    await Promise.all(activeWorkers);

    setUploading(false);
    setOverallProgress(100);
    setUploadSpeed(0);
    setEstimatedTime(null);

    // Save final batch outcomes for dashboard statistics
    setBatchSummary({
      total: itemsToUpload.length,
      saved: savedCount,
      skipped: skippedCount,
      quotaExceeded: quotaExceededCount,
      failed: failedCount
    });
    setShowSummary(true);

    toast.success(`Completed backup: ${savedCount} saved, ${skippedCount} duplicate skipped, ${failedCount} failed.`);
    
    // Refresh storage data dynamically
    fetchStorageUsage();
  }

  function retryFailedUploads() {
    setQueue(prev => prev.map(item => item.status === 'error' && item.retryable !== false ? { ...item, status: 'queued', checked: true, reason: null, message: null, failedAt: null, progress: 0 } : item));
    setTimeout(() => runBackup(), 200);
  }

  // Filtered queue items
  const filteredQueue = queue.filter(item => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'uploading') return item.status === 'uploading';
    if (currentFilter === 'done') return item.status === 'done';
    if (currentFilter === 'failed') return item.status === 'error';
    if (currentFilter === 'skipped') return item.status === 'skipped';
    return true;
  });

  const checkedCount = queue.filter(q => q.checked && q.status === 'queued').length;

  function retryItem(id) {
    setQueue(prev => prev.map(item => item.id === id && item.retryable !== false ? {
      ...item,
      status: 'queued',
      checked: true,
      reason: null,
      message: null,
      failedAt: null,
      progress: 0,
    } : item));
  }

  const totalQueuedSize = queue.filter(q => q.checked && q.status === 'queued').reduce((a, b) => a + b.size, 0);
  const failedItems = queue.filter(q => q.status === 'error');
  const primaryFailure = failedItems[0] ? explainFailure(failedItems[0].reason, failedItems[0].message) : null;
  const disabledUploadReason = uploading
    ? 'Upload is already running.'
    : queue.length === 0
      ? 'Add files to begin uploading.'
      : checkedCount === 0
        ? 'Select at least one queued file to upload.'
        : null;

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
            Smart Backup Center
          </h1>
          <p className="text-white/60 mt-1">
            Back up your gallery in pristine, original quality. Effortless synchronization powered by AI.
          </p>
        </div>

        {/* Real-Time Storage Quota Bar */}
        <div className="w-full md:w-80 bg-white/[0.02] border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-md">
          {loadingUsage ? (
            <div className="flex items-center gap-2 justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
              <span className="text-xs text-white/40">Calculating remaining storage…</span>
            </div>
          ) : usage ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white/80">
                  {isSuper ? 'Family Cloud Storage' : 'Cloud Storage Quota'}
                </span>
                <span className="text-purple-300 font-medium">
                  {isSuper ? 'Unlimited' : `${formatBytes(usage.usage.bytes)} / ${formatBytes(usage.plan.storageBytes)}`}
                </span>
              </div>
              
              {!isSuper && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 transition-all duration-500" 
                      style={{ width: `${Math.min(100, Math.round((usage.usage.bytes / usage.plan.storageBytes) * 100))}%` }} 
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-white/40">
                    <span>{Math.round((usage.usage.bytes / usage.plan.storageBytes) * 100)}% Used</span>
                    <span>{formatBytes(usage.plan.storageBytes - usage.usage.bytes)} remaining</span>
                  </div>
                </div>
              )}

              {isSuper ? (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
                  <Sparkles className="h-3 w-3" />
                  <span>Premium Active · Safe Cloud Preservation</span>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-white/40">{usage.plan.name} Tier</span>
                  <Link href="/billing" className="text-[11px] text-pink-400 hover:text-pink-300 font-medium flex items-center gap-0.5">
                    Upgrade Account <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Main Drag & Drop Stage + Premium Features */}
      <div className="grid lg:grid-cols-3 gap-6">
        
        {/* Left/Middle Dropzone area */}
        <div className="lg:col-span-2 space-y-4">
          <input 
            ref={fileInputRef} 
            type="file" 
            multiple 
            accept="image/*,video/*" 
            onChange={handleFileSelect} 
            className="hidden" 
          />
          <input 
            ref={folderInputRef} 
            type="file" 
            multiple 
            webkitdirectory="true" 
            onChange={handleFolderSelect} 
            className="hidden" 
          />

          <div 
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative rounded-3xl border-2 border-dashed p-10 text-center transition-all duration-300 flex flex-col items-center justify-center min-h-[300px] overflow-hidden ${
              isDragging 
                ? 'border-pink-500 bg-pink-500/10 shadow-[0_0_25px_rgba(236,72,153,0.2)]' 
                : 'border-white/10 hover:border-white/20 bg-white/[0.01] hover:bg-white/[0.02]'
            }`}
          >
            <div className="absolute inset-0 bg-radial-gradient from-purple-500/5 to-transparent pointer-events-none" />

            <div className="relative z-10 space-y-6 max-w-md">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                {uploading ? (
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                ) : (
                  <Cloud className="h-8 w-8 text-white" />
                )}
              </div>

              <div>
                <h3 className="text-xl font-bold text-white">
                  Drag & Drop Photos, Videos, or Folders
                </h3>
                <p className="text-white/50 text-sm mt-1.5 leading-relaxed">
                  Drop any files or folder structures directly in this container. SnapNext automatically scans files, builds folders, and skips duplicates.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 justify-center">
                <button 
                  onClick={triggerFilePicker} 
                  disabled={uploading}
                  className="px-5 py-2.5 rounded-full bg-white hover:bg-white/90 text-black font-semibold text-xs flex items-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-md"
                >
                  <FileImage className="h-4 w-4 text-purple-600" />
                  Select Files
                </button>
                <button 
                  onClick={triggerFolderPicker} 
                  disabled={uploading}
                  className="px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white border border-white/10 font-semibold text-xs flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  <FolderPlus className="h-4 w-4 text-pink-400" />
                  Upload Folder
                </button>
              </div>

              <div className="text-[11px] text-white/30 flex items-center justify-center gap-4">
                <span className="flex items-center gap-1"><Wifi className="h-3.5 w-3.5" /> High-Speed Channels</span>
                <span>•</span>
                <span>Safe S3 Storage</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Premium Classifier controls */}
        <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-5 relative overflow-hidden backdrop-blur-md flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">Smart Backup Filters</h3>
              </div>
              {!isSuper && (
                <span className="px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 text-[10px] font-bold flex items-center gap-1">
                  <Lock className="h-2.5 w-2.5" /> PRO
                </span>
              )}
            </div>

            <div className={`space-y-4 relative ${!isSuper ? 'opacity-40 select-none pointer-events-none' : ''}`}>
              {/* Option 1: AI Face Detection */}
              <div className="flex items-start justify-between gap-3 bg-white/[0.01] p-3 rounded-2xl border border-white/5">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-white/80 block">Detect Faces</span>
                  <span className="text-[10px] text-white/40 block">Enable automatic people grouping on backup</span>
                </div>
                <input 
                  type="checkbox" 
                  checked={premiumOptions.faceDetection}
                  onChange={(e) => setPremiumOptions(prev => ({ ...prev, faceDetection: e.target.checked }))}
                  className="rounded border-white/10 bg-white/5 text-purple-600 focus:ring-purple-600 mt-1" 
                />
              </div>

              {/* Option 2: Favorite Person tagging */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-white/80 block">Associate to Person</span>
                <select 
                  value={premiumOptions.favoritePerson}
                  onChange={(e) => setPremiumOptions(prev => ({ ...prev, favoritePerson: e.target.value }))}
                  className="w-full text-xs bg-white/5 rounded-xl border border-white/10 px-3 py-2 text-white/80 focus:outline-none focus:border-purple-500"
                >
                  <option value="" className="bg-[#0b0414] text-white">None (Auto-classify)</option>
                  <option value="Mom" className="bg-[#0b0414] text-white">Mom</option>
                  <option value="Dad" className="bg-[#0b0414] text-white">Dad</option>
                  <option value="Wife" className="bg-[#0b0414] text-white">Wife</option>
                  <option value="Kids" className="bg-[#0b0414] text-white">Kids</option>
                </select>
              </div>

              {/* Option 3: Location tag */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-white/80 block flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-white/40" /> Associate to Location
                </span>
                <input 
                  type="text" 
                  placeholder="e.g. Paris Trip, Home"
                  value={premiumOptions.locationTag}
                  onChange={(e) => setPremiumOptions(prev => ({ ...prev, locationTag: e.target.value }))}
                  className="w-full text-xs bg-white/5 rounded-xl border border-white/10 px-3 py-2 text-white/80 placeholder:text-white/20 focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Option 4: Date Range Override */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/80 flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-white/40" /> Override Captured Date
                  </span>
                  <input 
                    type="checkbox" 
                    checked={premiumOptions.dateRangeOverride}
                    onChange={(e) => setPremiumOptions(prev => ({ ...prev, dateRangeOverride: e.target.checked }))}
                    className="rounded border-white/10 bg-white/5 text-purple-600 focus:ring-purple-600" 
                  />
                </div>
                {premiumOptions.dateRangeOverride && (
                  <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-1 duration-200">
                    <div className="space-y-1">
                      <span className="text-[9px] text-white/40 block">From Date</span>
                      <input 
                        type="date" 
                        value={premiumOptions.startDate}
                        onChange={(e) => setPremiumOptions(prev => ({ ...prev, startDate: e.target.value }))}
                        className="w-full text-[10px] bg-white/5 rounded-lg border border-white/10 px-2 py-1.5 text-white/80 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-white/40 block">To Date</span>
                      <input 
                        type="date" 
                        value={premiumOptions.endDate}
                        onChange={(e) => setPremiumOptions(prev => ({ ...prev, endDate: e.target.value }))}
                        className="w-full text-[10px] bg-white/5 rounded-lg border border-white/10 px-2 py-1.5 text-white/80 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Locked screen blurred glass if not premium */}
            {!isSuper && (
              <div className="absolute inset-x-0 bottom-0 top-[52px] bg-[#0b0414]/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-300">
                <div className="p-3 bg-amber-400/10 border border-amber-400/20 rounded-full mb-3 text-amber-300 animate-pulse">
                  <Lock className="h-5 w-5" />
                </div>
                <h4 className="text-xs font-bold text-white">Premium Backup Intelligence</h4>
                <p className="text-[10px] text-white/50 max-w-[200px] mt-1 mb-3">
                  Upload files directly categorized by detected face timelines, GPS locations, and custom dates.
                </p>
                <Link href="/billing" className="px-4 py-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-black font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 hover:brightness-110 transition shadow-lg shadow-amber-500/20">
                  Upgrade Account <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>

          <div className="text-[10px] text-white/30 text-center border-t border-white/5 pt-4 mt-4">
            🔒 Fully encrypted TLS channels protect all files.
          </div>
        </div>
      </div>

      {/* Upload Success/Status Summary Modal */}
      {showSummary && batchSummary && (
        <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-5 shadow-xl animate-in fade-in zoom-in-95 duration-300 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-500/20 rounded-lg text-purple-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Backup Batch Completed</h3>
              <p className="text-xs text-white/60">Your files were cataloged and stored safely.</p>
            </div>
          </div>


      {primaryFailure && (
        <div className="rounded-3xl border border-rose-500/20 bg-gradient-to-br from-rose-500/10 via-purple-500/10 to-white/[0.02] p-5 shadow-2xl shadow-rose-950/20">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-500/15 text-rose-200 border border-rose-400/20">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200">AI Upload Assistant</div>
                <h3 className="mt-1 text-lg font-black text-white">{primaryFailure.label}</h3>
                <p className="mt-2 text-sm leading-6 text-white/65">{primaryFailure.detail}</p>
                <div className="mt-3 grid gap-2 text-xs text-white/55 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/[0.04] p-3"><span className="block font-bold text-white/80">Photo safety</span>{primaryFailure.safe ? 'Your local file is safe. It was not deleted.' : 'Please keep your original file.'}</div>
                  <div className="rounded-2xl bg-white/[0.04] p-3"><span className="block font-bold text-white/80">Retry</span>{primaryFailure.retry}</div>
                  <div className="rounded-2xl bg-white/[0.04] p-3"><span className="block font-bold text-white/80">Next step</span>{failedItems[0]?.retryable === false ? 'Configuration needs attention.' : 'Retry this file when ready.'}</div>
                </div>
              </div>
            </div>
            {failedItems.some(item => item.retryable !== false) && (
              <button onClick={retryFailedUploads} disabled={uploading} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-xs font-black text-black transition hover:bg-white/90 disabled:opacity-50">
                <RefreshCw className="h-3.5 w-3.5" /> Retry failed
              </button>
            )}
          </div>
        </div>
      )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-center">
              <span className="text-[10px] text-white/40 block font-medium uppercase tracking-wider">Total Evaluated</span>
              <span className="text-lg font-extrabold text-white">{batchSummary.total}</span>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 text-center">
              <span className="text-[10px] text-emerald-400/60 block font-medium uppercase tracking-wider">Saved Successfully</span>
              <span className="text-lg font-extrabold text-emerald-400">{batchSummary.saved}</span>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 text-center">
              <span className="text-[10px] text-amber-400/60 block font-medium uppercase tracking-wider">Duplicates Skipped</span>
              <span className="text-lg font-extrabold text-amber-300">{batchSummary.skipped}</span>
            </div>
            <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-3 text-center">
              <span className="text-[10px] text-rose-400/60 block font-medium uppercase tracking-wider">Failed / Full</span>
              <span className="text-lg font-extrabold text-rose-400">{batchSummary.failed + batchSummary.quotaExceeded}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 items-center justify-between pt-2 border-t border-white/5">
            <div className="text-xs text-white/50">
              {batchSummary.quotaExceeded > 0 && (
                <span className="text-rose-300 font-medium flex items-center gap-1">
                  <ShieldAlert className="h-4 w-4" /> Storage capacity exceeded for {batchSummary.quotaExceeded} files.
                </span>
              )}
              {batchSummary.quotaExceeded === 0 && batchSummary.failed === 0 && (
                <span className="text-emerald-300 flex items-center gap-1">
                  <Check className="h-4 w-4" /> 100% of non-duplicate backup files successfully secured!
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {batchSummary.failed > 0 && (
                <button 
                  onClick={retryFailedUploads} 
                  className="px-3 py-1.5 rounded-full bg-white text-black font-semibold text-xs hover:bg-white/90 transition flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" /> Retry Failed ({batchSummary.failed})
                </button>
              )}
              <button 
                onClick={() => setShowSummary(false)} 
                className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white font-medium text-xs transition"
              >
                Dismiss Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Queue Interface */}
      {queue.length > 0 && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] shadow-2xl overflow-hidden backdrop-blur-md animate-in slide-in-from-bottom-2 duration-300">
          
          {/* Active Uploading Header (Speed & ETA) */}
          {uploading && (
            <div className="bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 border-b border-white/10 px-6 py-4 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 text-pink-400 animate-spin" />
                  <span className="text-sm font-semibold text-white">Backing up photos...</span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-white/60 font-mono">
                  {uploadSpeed > 0 && (
                    <span className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                      Speed: <span className="text-pink-300 font-bold">{formatBytes(uploadSpeed)}/s</span>
                    </span>
                  )}
                  {estimatedTime !== null && (
                    <span className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                      Remaining: <span className="text-indigo-300 font-bold">{estimatedTime > 60 ? `${Math.round(estimatedTime / 60)}m` : `${Math.round(estimatedTime)}s`}</span>
                    </span>
                  )}
                  <span className="bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                    Limit: <span className="text-purple-300 font-bold">Max 3 concurrent</span>
                  </span>
                </div>
              </div>

              {/* Aggregated Progress Bar */}
              <div className="space-y-1">
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 transition-all duration-300" 
                    style={{ width: `${overallProgress}%` }} 
                  />
                </div>
                <div className="flex justify-between text-[10px] text-white/40">
                  <span>Batch Progress</span>
                  <span>{overallProgress}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Queue Toolbar Controls */}
          <div className="px-6 py-4 border-b border-white/5 bg-white/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Left: Queue Select State */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={queue.length > 0 && queue.every(q => q.status !== 'queued' || q.checked)}
                  ref={el => {
                    if (el) {
                      const allQueued = queue.filter(q => q.status === 'queued');
                      const someChecked = allQueued.some(q => q.checked);
                      const allChecked = allQueued.every(q => q.checked);
                      el.indeterminate = someChecked && !allChecked;
                    }
                  }}
                  onChange={(e) => selectAllItems(e.target.checked)}
                  disabled={uploading}
                  className="rounded border-white/10 bg-white/5 text-purple-600 focus:ring-purple-600 h-4 w-4" 
                />
                <span className="text-sm font-semibold text-white/90">Select All Photos</span>
              </div>
              <div className="text-xs text-white/50 bg-white/5 px-2.5 py-1 rounded-full">
                {checkedCount} / {queue.filter(q => q.status === 'queued').length} files selected ({formatBytes(totalQueuedSize)})
              </div>
            </div>

            {/* Right: Master Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button 
                onClick={clearQueue} 
                disabled={uploading}
                className="px-3.5 py-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-medium text-xs flex items-center gap-1 transition disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear Queue
              </button>
              <button 
                onClick={runBackup} 
                disabled={uploading || checkedCount === 0}
                className="px-4 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 hover:brightness-110 text-white font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50 disabled:brightness-100 shadow-md shadow-purple-500/10"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Backing Up...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Upload Selected
                  </>
                )}
              </button>
            </div>
          </div>
              {disabledUploadReason && (
                <div className="basis-full text-[11px] text-white/45 text-right">
                  Upload Selected is disabled because {disabledUploadReason}
                </div>
              )}


          {/* Queue Filter Tabs */}
          <div className="px-6 py-2 bg-white/[0.005] border-b border-white/5 flex gap-2 overflow-x-auto">
            {[
              { id: 'all', label: 'All Items', count: queue.length },
              { id: 'uploading', label: 'Active', count: queue.filter(q => q.status === 'uploading').length },
              { id: 'done', label: 'Secured', count: queue.filter(q => q.status === 'done').length },
              { id: 'failed', label: 'Failed', count: queue.filter(q => q.status === 'error').length },
              { id: 'skipped', label: 'Skipped', count: queue.filter(q => q.status === 'skipped').length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentFilter(tab.id)}
                className={`text-xs px-3 py-1.5 rounded-lg transition shrink-0 ${
                  currentFilter === tab.id 
                    ? 'bg-white/10 text-white font-medium' 
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {tab.label} <span className="opacity-60 font-mono">({tab.count})</span>
              </button>
            ))}
          </div>

          {/* Queue List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-white/5">
            {filteredQueue.length === 0 ? (
              <div className="py-12 text-center text-white/40 flex flex-col items-center justify-center gap-2">
                <Ban className="h-8 w-8 text-white/20 animate-pulse" />
                <span className="text-xs">No files match the selected filter</span>
              </div>
            ) : (
              filteredQueue.map((item) => (
                <div key={item.id} className="flex items-center gap-4 px-6 py-3.5 text-sm hover:bg-white/[0.01] transition-colors duration-150">
                  
                  {/* Item check status */}
                  <input 
                    type="checkbox" 
                    checked={item.checked}
                    onChange={() => toggleCheckItem(item.id)}
                    disabled={uploading || item.status !== 'queued'}
                    className="rounded border-white/10 bg-white/5 text-purple-600 focus:ring-purple-600 h-4 w-4 disabled:opacity-40" 
                  />

                  {/* Thumbnail / File Type representation */}
                  <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 flex-shrink-0 overflow-hidden flex items-center justify-center relative">
                    {previews[item.id] ? (
                      <img 
                        src={previews[item.id]} 
                        alt="Thumbnail" 
                        className="h-full w-full object-cover animate-in fade-in duration-200" 
                      />
                    ) : (
                      <FileImage className="h-5 w-5 text-white/30" />
                    )}
                  </div>

                  {/* Name and Size */}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium text-white/95">{item.name}</div>
                    <div className="text-xs text-white/40 font-mono mt-0.5">{formatBytes(item.size)}</div>
                  </div>

                  {/* Individual Progress & Status Badges */}
                  <div className="flex items-center gap-4">
                    {item.status === 'uploading' && (
                      <div className="w-24 sm:w-36 space-y-1.5 animate-in fade-in duration-150">
                        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-150" style={{ width: `${item.progress}%` }} />
                        </div>
                        <div className="flex justify-between text-[9px] text-pink-300 font-mono">
                          <span className="flex items-center gap-1"><Loader2 className="h-2 w-2 animate-spin"/> Backup...</span>
                          <span>{item.progress}%</span>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-right min-w-[70px]">
                      {item.status === 'queued' && (
                        <span className="text-white/40 bg-white/5 px-2 py-0.5 rounded-full border border-white/5 font-medium">Queued</span>
                      )}
                      {item.status === 'done' && (
                        <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/10 font-semibold text-[10px]">
                          <CheckCircle2 className="h-3 w-3" /> SECURED
                        </span>
                      )}
                      {item.status === 'skipped' && (
                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center gap-1 text-amber-300 bg-amber-500/5 px-2 py-0.5 rounded-full border border-amber-500/10 text-[10px]">
                            {explainFailure(item.reason, item.message).label}
                          </span>
                          {item.failedAt && <span className="text-[9px] text-white/35">{new Date(item.failedAt).toLocaleTimeString()}</span>}
                        </div>
                      )}
                      {item.status === 'error' && (
                        <div className="flex flex-col items-end gap-1 max-w-[210px]">
                          <span className="text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/10 font-semibold text-[10px]">
                            {explainFailure(item.reason, item.message).label}
                          </span>
                          <span className="text-[9px] text-rose-200/70 block text-right" title={item.message || item.reason}>
                            {explainFailure(item.reason, item.message).detail}
                          </span>
                          {item.failedAt && <span className="text-[9px] text-white/35">Failed at {new Date(item.failedAt).toLocaleTimeString()}</span>}
                          {item.retryable !== false && !uploading && (
                            <button onClick={() => retryItem(item.id)} className="text-[10px] text-white bg-white/10 hover:bg-white/15 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <RefreshCw className="h-2.5 w-2.5" /> Queue retry
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Individual deletion button (only allowed when not uploading) */}
                    <button
                      onClick={() => removeItem(item.id)}
                      disabled={uploading}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 text-white/30 hover:text-rose-400 transition disabled:opacity-20 disabled:hover:bg-transparent"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                </div>
              ))
            )}
          </div>

        </div>
      )}

      {/* Upload tips block */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.01] p-4 flex gap-3 text-xs text-white/50 leading-relaxed">
        <Wifi className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold text-white/70 block mb-0.5">High-Performance Upload Guidelines</span>
          For optimum performance, please run backups connected to Wi-Fi. SnapNext maintains active websocket connections to balance concurrency, and leaving or minimizing this tab during large operations may trigger browser throttling.
        </div>
      </div>

    </div>
  );
}
