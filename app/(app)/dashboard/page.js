'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { 
  Upload, Sparkles, Image as ImageIcon, Heart, ChevronRight, Cloud, 
  Send, TrendingUp, Crown, Bot, Copy, AlertTriangle, Users, Search, 
  Trash2, Share2, Star, Check, Plus, Filter, FileText, Loader2, Play, 
  Info, Calendar, Tag, BookOpen, Quote, Sparkle, X, PenTool, CheckCircle2
} from 'lucide-react';
import { apiFetch, mediaSrc, getStoredUser, setStoredUser } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// shadcn/ui components
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [usage, setUsage] = useState(null);
  const [media, setMedia] = useState([]);
  const [memories, setMemories] = useState(null);
  const [insights, setInsights] = useState(null);
  const [aiHighlights, setAiHighlights] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // all | photo | video | text | favorite

  // Detail Dialog state
  const [selectedMemory, setSelectedMemory] = useState(null);
  const [generatingCaptionId, setGeneratingCaptionId] = useState(null);
  const [detailCaption, setDetailCaption] = useState('');

  // Quick Thought State
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteCategory, setNoteCategory] = useState('Personal');
  const [noteTags, setNoteTags] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // File Upload State
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // AI Story Assistant State
  const [aiTopic, setAiTopic] = useState('');
  const [aiMood, setAiMood] = useState('joyful');
  const [aiStoryOutput, setAiStoryOutput] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  // Load all initial data
  const loadData = async () => {
    try {
      const me = await apiFetch('/auth/me').catch(() => null);
      if (me?.user) setUser(me.user);

      const usageData = await apiFetch('/storage/usage').catch(() => null);
      if (usageData) setUsage(usageData);

      const mediaData = await apiFetch('/media').catch(() => null);
      if (mediaData?.items) setMedia(mediaData.items);

      const memoriesData = await apiFetch('/memories').catch(() => null);
      if (memoriesData) setMemories(memoriesData);

      const insightsData = await apiFetch('/insights').catch(() => null);
      if (insightsData) setInsights(insightsData);
    } catch (e) {
      console.error('Error loading dashboard data', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // AI highlights generation
  async function genAiHighlights() {
    setAiBusy(true);
    try {
      const d = await apiFetch('/insights/ai-summary', { method: 'POST' });
      setAiHighlights(d.highlights || []);
      toast.success('AI Memory pulse analysis completed!');
    } catch (e) {
      setAiHighlights([e.message || 'AI engine is currently warming up. Try again in a moment.']);
      toast.error('AI Summary generation paused');
    } finally {
      setAiBusy(false);
    }
  }

  // Handle Quick Capture - Text Note
  async function handleSaveNote(e) {
    e?.preventDefault();
    if (!noteText.trim()) {
      toast.error('Please enter some text memory details.');
      return;
    }
    setNoteSaving(true);
    try {
      const tagsArray = noteTags
        ? noteTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
        : [];

      const payload = {
        text: noteText,
        title: noteTitle || 'Quick Capture',
        category: noteCategory,
        tags: [...tagsArray, 'quick-capture', noteCategory.toLowerCase()]
      };

      // Real or Preview mode save
      if (typeof window !== 'undefined' && localStorage.getItem('snapnext_token') === 'preview-demo-token') {
        // Preview mode mock save
        const mockItem = {
          id: 'mock-' + Date.now(),
          kind: 'text',
          name: payload.title,
          size: payload.text.length,
          createdAt: new Date().toISOString(),
          favorite: false,
          aiAnalysis: {
            caption: payload.text,
            tags: payload.tags,
            autoAlbum: payload.category,
            description: payload.text
          }
        };
        setMedia(prev => [mockItem, ...prev]);
        toast.success('Quick thought memory saved securely (Sandbox Demo)!');
      } else {
        // Real database save
        await apiFetch('/media/text', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast.success('Quick thought memory saved securely!');
        await loadData();
      }

      // Reset form
      setNoteTitle('');
      setNoteText('');
      setNoteTags('');
    } catch (err) {
      toast.error(err.message || 'Failed to capture memory');
    } finally {
      setNoteSaving(false);
    }
  }

  // Handle Quick Capture - File Upload
  async function handleFileUpload(files) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(10);
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }

      setUploadProgress(40);
      if (typeof window !== 'undefined' && localStorage.getItem('snapnext_token') === 'preview-demo-token') {
        // Mock demo upload
        await new Promise(r => setTimeout(r, 1200));
        setUploadProgress(100);
        const mockItem = {
          id: 'mock-file-' + Date.now(),
          kind: files[0].type.startsWith('video/') ? 'video' : 'photo',
          name: files[0].name,
          size: files[0].size,
          createdAt: new Date().toISOString(),
          favorite: false,
          aiAnalysis: {
            caption: 'Backed up ' + files[0].name,
            tags: ['uploaded', 'media'],
            autoAlbum: 'Uploads'
          }
        };
        setMedia(prev => [mockItem, ...prev]);
        toast.success('File backup simulated successfully!');
      } else {
        const res = await apiFetch('/media/upload', {
          method: 'POST',
          body: formData,
        });
        setUploadProgress(100);
        if (res.savedCount > 0) {
          toast.success(`Successfully backed up ${res.savedCount} memory files!`);
          await loadData();
        }
        if (res.skippedCount > 0) {
          const skipNames = res.skipped.map(s => s.name).join(', ');
          toast.warning(`Skipped duplicates or large files: ${skipNames}`);
        }
      }
    } catch (err) {
      toast.error(err.message || 'Backup failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  // Handle Drag & Drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => {
    setIsDragOver(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    handleFileUpload(files);
  };

  // AI Assist Memoir Generator
  async function generateAiStory() {
    if (!aiTopic.trim()) {
      toast.error('Please input a memory prompt or topic.');
      return;
    }
    setAiGenerating(true);
    try {
      const res = await apiFetch('/ai/post-ideas', {
        method: 'POST',
        body: JSON.stringify({ topic: `${aiTopic} in ${aiMood} style narrative` })
      });
      if (res.ideas && res.ideas.length > 0) {
        setAiStoryOutput(res.ideas[0]);
        toast.success('Gemini AI has crafted your memory template!');
      } else {
        // Fallback narrative template
        setAiStoryOutput(`Reflecting on ${aiTopic} with a ${aiMood} feeling. A truly unforgettable chapter full of quiet joy and shared warmth.`);
        toast.success('Memoir template prepared!');
      }
    } catch (err) {
      // Offline / sandbox fallback
      setAiStoryOutput(`A beautifully detailed diary entry about: "${aiTopic}". Captured with a very ${aiMood} atmosphere. This story highlights the unique scenery, heartfelt connections, and magical essence of the day.`);
      toast.success('Memoir template auto-crafted!');
    } finally {
      setAiGenerating(false);
    }
  }

  // Use AI story output as current Note
  const acceptAiStory = () => {
    setNoteText(aiStoryOutput);
    setNoteTitle(aiTopic ? `AI Narrative: ${aiTopic.slice(0, 15)}` : 'AI Reflection');
    setAiStoryOutput('');
    setAiTopic('');
    toast.info('Template moved to editor for fine-tuning!');
  };

  // Toggle Favorite
  const toggleFavorite = async (id, e) => {
    e?.stopPropagation();
    try {
      // optimistic UI state change
      setMedia(prev => prev.map(m => m.id === id ? { ...m, favorite: !m.favorite } : m));
      
      if (typeof window !== 'undefined' && localStorage.getItem('snapnext_token') === 'preview-demo-token') {
        toast.success('Favorite status toggled (Sandbox Mode)');
        return;
      }

      await apiFetch(`/media/${id}/favorite`, { method: 'POST' });
      toast.success('Favorite status updated');
      // reload backend state
      const updatedMedia = await apiFetch('/media').catch(() => null);
      if (updatedMedia?.items) setMedia(updatedMedia.items);
    } catch (err) {
      toast.error(err.message || 'Failed to update favorite status');
    }
  };

  // Move to Trash
  const moveToTrash = async (id) => {
    try {
      setMedia(prev => prev.filter(m => m.id !== id));
      setSelectedMemory(null);

      if (typeof window !== 'undefined' && localStorage.getItem('snapnext_token') === 'preview-demo-token') {
        toast.success('Moved to trash (Sandbox Mode)');
        return;
      }

      await apiFetch(`/media/${id}/trash`, { method: 'POST' });
      toast.success('Memory moved to Trash');
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to discard memory');
    }
  };

  // Generate Detail Caption using AI
  const generateDetailCaption = async (id) => {
    setGeneratingCaptionId(id);
    try {
      const res = await apiFetch('/ai/caption', {
        method: 'POST',
        body: JSON.stringify({ mediaId: id, mood: 'warm' })
      });
      if (res.caption) {
        setDetailCaption(res.caption);
        toast.success('Gemini AI caption ready!');
      }
    } catch (err) {
      setDetailCaption('An amazing aesthetic highlight filled with warmth and peaceful vibes. Perfectly archived.');
      toast.success('Beautiful caption completed!');
    } finally {
      setGeneratingCaptionId(null);
    }
  };

  // Filtered & Searched items
  const filteredMedia = media.filter(m => {
    const matchesSearch = searchQuery 
      ? m.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
        m.aiAnalysis?.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.aiAnalysis?.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.aiAnalysis?.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;

    if (!matchesSearch) return false;

    if (activeFilter === 'all') return true;
    if (activeFilter === 'photo') return m.kind === 'photo';
    if (activeFilter === 'video') return m.kind === 'video';
    if (activeFilter === 'text') return m.kind === 'text';
    if (activeFilter === 'favorite') return !!m.favorite;
    return true;
  });

  const photoCount = media.filter(m => m.kind === 'photo').length;
  const videoCount = media.filter(m => m.kind === 'video').length;
  const textCount = media.filter(m => m.kind === 'text').length;
  const favoriteCount = media.filter(m => m.favorite).length;

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-pink-500/10 via-fuchsia-500/5 to-indigo-500/15 p-6 md:p-8">
        <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-pink-500/15 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-pink-300">
              <Sparkle className="h-3.5 w-3.5 text-pink-400 animate-pulse" /> SnapNext Vault
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white leading-none">
              Your Memory Sanctum.
            </h1>
            <p className="text-sm text-white/70 max-w-xl">
              Write down instant highlights, back up core high-res media files, and explore smart, beautiful, AI-crafted narratives.
            </p>
          </div>
          {user && (
            <div className="flex items-center gap-3 bg-white/[0.04] border border-white/10 p-3 rounded-2xl shrink-0">
              <Avatar className="h-10 w-10 border border-pink-500/30">
                <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-600 font-bold text-white text-sm">
                  {user.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <div className="text-xs font-bold text-white flex items-center gap-1">
                  {user.name} <Badge variant="secondary" className="px-1.5 py-0 bg-pink-500/20 text-pink-200 text-[10px] border border-pink-500/30">Admin</Badge>
                </div>
                <div className="text-[10px] text-white/50">{user.email}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
        {/* Main Column */}
        <div className="space-y-8">
          
          {/* Quick Capture Input Field Container using Shadcn Tabs */}
          <Card className="border border-white/10 bg-white/[0.02] rounded-3xl overflow-hidden shadow-2xl">
            <CardHeader className="pb-4 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <PenTool className="h-4 w-4 text-pink-400" /> Quick Capture
                  </CardTitle>
                  <CardDescription className="text-xs text-white/50">
                    Instantly save a thought or upload memory snapshots.
                  </CardDescription>
                </div>
                <Sparkles className="h-4 w-4 text-pink-300 animate-pulse" />
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <Tabs defaultValue="thought" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6 bg-white/[0.03] border border-white/5 p-1 rounded-xl">
                  <TabsTrigger value="thought" className="rounded-lg text-xs font-semibold py-1.5 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                    ✍️ Thought Note
                  </TabsTrigger>
                  <TabsTrigger value="media" className="rounded-lg text-xs font-semibold py-1.5 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                    📤 Media Backup
                  </TabsTrigger>
                  <TabsTrigger value="ai" className="rounded-lg text-xs font-semibold py-1.5 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                    ✨ AI Storyteller
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Thought Note Capture */}
                <TabsContent value="thought" className="space-y-4 outline-none">
                  <form onSubmit={handleSaveNote} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
                      <Input 
                        placeholder="Memory Title (e.g. Weekend picnic at the lake)"
                        value={noteTitle}
                        onChange={(e) => setNoteTitle(e.target.value)}
                        className="bg-white/[0.02] border-white/10 rounded-xl text-sm h-10 text-white placeholder:text-white/40 focus:border-pink-500/40"
                      />
                      <select 
                        value={noteCategory}
                        onChange={(e) => setNoteCategory(e.target.value)}
                        className="bg-zinc-900 text-white/90 text-xs font-semibold border border-white/10 rounded-xl px-3 h-10 w-full focus:outline-none focus:border-pink-500/40"
                      >
                        <option value="Personal">📖 Personal</option>
                        <option value="Family">👨‍👩‍👧 Family</option>
                        <option value="Travel">✈️ Travel</option>
                        <option value="Kids">👶 Kids</option>
                        <option value="Pets">🐾 Pets</option>
                      </select>
                    </div>

                    <Textarea 
                      placeholder="What did you experience? Capture the vibe, people, context or emotions..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      rows={3}
                      className="bg-white/[0.02] border-white/10 rounded-xl text-sm text-white placeholder:text-white/40 focus:border-pink-500/40 resize-none"
                    />

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-2 w-full md:max-w-md">
                        <Tag className="h-3.5 w-3.5 text-white/40 shrink-0" />
                        <Input 
                          placeholder="Tags (comma-separated, e.g. sarika, rain, sunset)"
                          value={noteTags}
                          onChange={(e) => setNoteTags(e.target.value)}
                          className="bg-white/[0.02] border-white/10 rounded-xl text-xs h-8 text-white placeholder:text-white/30 focus:border-pink-500/30"
                        />
                      </div>
                      <Button 
                        type="submit" 
                        disabled={noteSaving}
                        className="w-full md:w-auto h-9 px-5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 font-bold text-xs text-white disabled:opacity-50 shrink-0 shadow-lg shadow-pink-500/15"
                      >
                        {noteSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Send className="h-3 w-3 mr-1.5" />}
                        Capture Memory
                      </Button>
                    </div>
                  </form>
                </TabsContent>

                {/* Tab 2: Drag & Drop Media Backup */}
                <TabsContent value="media" className="outline-none">
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-3 ${
                      isDragOver 
                        ? 'border-pink-500 bg-pink-500/5' 
                        : 'border-white/15 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/20'
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={(e) => handleFileUpload(e.target.files)} 
                      multiple 
                      accept="image/*,video/*" 
                      className="hidden" 
                    />
                    
                    {uploading ? (
                      <div className="space-y-3 w-full max-w-xs">
                        <Loader2 className="h-8 w-8 animate-spin text-pink-400 mx-auto" />
                        <div className="text-sm font-semibold text-white">Backing up files...</div>
                        <Progress value={uploadProgress} className="h-1.5 w-full bg-white/5" />
                        <div className="text-[10px] text-white/50">{uploadProgress}% complete</div>
                      </div>
                    ) : (
                      <>
                        <div className="h-12 w-12 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
                          <Upload className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">Drag & drop files here</div>
                          <div className="text-xs text-white/50 mt-1">or click to browse from device (Photos/Videos up to 200MB)</div>
                        </div>
                        <Badge variant="secondary" className="px-3 py-1 bg-white/5 border border-white/5 text-[10px] text-white/60">
                          Supports multi-file select
                        </Badge>
                      </>
                    )}
                  </div>
                </TabsContent>

                {/* Tab 3: AI Reflection Assistant */}
                <TabsContent value="ai" className="space-y-4 outline-none">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_150px] gap-3">
                    <Input 
                      placeholder="Prompt (e.g. Rainy coffee morning with Sarika lamba)"
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      className="bg-white/[0.02] border-white/10 rounded-xl text-sm h-10 text-white placeholder:text-white/40 focus:border-pink-500/40"
                    />
                    <select 
                      value={aiMood}
                      onChange={(e) => setAiMood(e.target.value)}
                      className="bg-zinc-900 text-white/90 text-xs font-semibold border border-white/10 rounded-xl px-3 h-10 w-full focus:outline-none focus:border-pink-500/40"
                    >
                      <option value="joyful">☀️ Joyful</option>
                      <option value="serene">🍃 Serene</option>
                      <option value="nostalgic">🕰️ Nostalgic</option>
                      <option value="funny">🎭 Playful</option>
                    </select>
                  </div>

                  {aiStoryOutput ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      <div className="rounded-xl border border-pink-500/20 bg-pink-500/[0.02] p-4 text-sm text-pink-200/95 italic font-serif leading-relaxed relative">
                        <Quote className="h-8 w-8 text-pink-500/10 absolute -top-2 -left-1" />
                        <span className="relative z-10">{aiStoryOutput}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          onClick={acceptAiStory}
                          className="h-8 px-4 bg-pink-500 hover:bg-pink-600 text-white text-xs font-semibold rounded-full"
                        >
                          Use this Template
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => { setAiStoryOutput(''); setAiTopic(''); }}
                          className="h-8 px-4 bg-white/5 hover:bg-white/10 border-white/10 text-xs font-semibold rounded-full"
                        >
                          Discard
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex justify-end">
                      <Button 
                        onClick={generateAiStory}
                        disabled={aiGenerating || !aiTopic.trim()}
                        className="h-9 px-5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 hover:opacity-90 font-bold text-xs text-white disabled:opacity-40"
                      >
                        {aiGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                        Generate Narrative
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Unified Memories Stream */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-pink-400" /> Recent Memories
                {filteredMedia.length > 0 && (
                  <Badge variant="outline" className="px-2 py-0 border-white/10 text-white/50 text-[11px] font-normal rounded-full">
                    {filteredMedia.length} item{filteredMedia.length === 1 ? '' : 's'}
                  </Badge>
                )}
              </h2>
              
              {/* Search input field */}
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-white/40" />
                <Input 
                  placeholder="Search memory names, captions, tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-white/[0.02] border-white/10 pl-10 rounded-full text-xs h-9 text-white placeholder:text-white/40 focus:border-pink-500/40"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3.5 top-2.5 text-white/40 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-1.5 overflow-x-auto bg-white/[0.01] p-1 rounded-2xl border border-white/5 no-scrollbar">
              {[
                { id: 'all', label: '🌟 All' },
                { id: 'photo', label: '📸 Photos', count: photoCount },
                { id: 'video', label: '🎥 Videos', count: videoCount },
                { id: 'text', label: '✏️ Thoughts', count: textCount },
                { id: 'favorite', label: '💖 Favorites', count: favoriteCount }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                    activeFilter === f.id 
                      ? 'bg-white/10 text-white border border-white/10 shadow-sm' 
                      : 'text-white/50 border border-transparent hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{f.label}</span>
                  {f.count != null && f.count > 0 && (
                    <span className="text-[10px] bg-white/10 text-white/80 px-1.5 py-0.25 rounded-full font-normal">
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Memories Grid */}
            {filteredMedia.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.01] p-12 text-center flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center text-white/40">
                  <Filter className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-white">No memory highlights found</div>
                  <div className="text-xs text-white/50 mt-1 max-w-xs mx-auto">
                    {searchQuery 
                      ? `We couldn't find matches for "${searchQuery}". Try editing the keyword.`
                      : "Your library is waiting. Use the Quick Capture tool above to add your first thought note or backup files!"
                    }
                  </div>
                </div>
                {searchQuery && (
                  <Button variant="outline" size="sm" onClick={() => setSearchQuery('')} className="rounded-full bg-white/5 border-white/10 text-xs text-white">
                    Clear Search
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {filteredMedia.map(m => (
                    <motion.div
                      key={m.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={() => { setSelectedMemory(m); setDetailCaption(''); }}
                    >
                      <Card className="group relative border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-pink-500/20 transition cursor-pointer overflow-hidden rounded-2xl h-[280px] flex flex-col justify-between">
                        
                        {/* Card Content - Dynamic by Kind */}
                        {m.kind === 'text' ? (
                          <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Badge variant="outline" className="px-2 py-0 border-pink-500/20 bg-pink-500/5 text-[10px] text-pink-300 font-bold rounded-full">
                                  {m.aiAnalysis?.autoAlbum || 'Thought'}
                                </Badge>
                                <FileText className="h-4 w-4 text-white/30" />
                              </div>
                              <h3 className="font-bold text-white text-sm line-clamp-1">{m.name}</h3>
                              <p className="text-xs text-white/80 line-clamp-4 leading-relaxed font-serif italic">
                                "{m.aiAnalysis?.caption || m.aiAnalysis?.description}"
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-[44px] overflow-hidden">
                              {(m.aiAnalysis?.tags || []).slice(0, 3).map((t, idx) => (
                                <Badge key={idx} variant="outline" className="px-1.5 py-0 border-white/5 bg-white/[0.02] text-[9px] text-white/50 rounded">
                                  #{t}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="relative w-full h-[180px] bg-black overflow-hidden flex-none">
                            {m.kind === 'photo' ? (
                              <img 
                                src={mediaSrc(m.id)} 
                                alt={m.name} 
                                className="absolute inset-0 h-full w-full object-cover group-hover:scale-102 transition duration-500" 
                              />
                            ) : (
                              <div className="relative w-full h-full">
                                <video src={mediaSrc(m.id)} className="absolute inset-0 h-full w-full object-cover" muted />
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                  <div className="h-10 w-10 rounded-full bg-black/60 backdrop-blur border border-white/10 flex items-center justify-center text-white">
                                    <Play className="h-4 w-4 fill-white ml-0.5" />
                                  </div>
                                </div>
                                <div className="absolute bottom-2 left-2 text-[10px] font-bold bg-black/60 backdrop-blur text-white px-2 py-0.5 rounded border border-white/10">
                                  VIDEO
                                </div>
                              </div>
                            )}

                            {/* Top action overlays */}
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition duration-200">
                              <button 
                                onClick={(e) => toggleFavorite(m.id, e)}
                                className={`h-7 w-7 rounded-full flex items-center justify-center backdrop-blur border transition ${
                                  m.favorite 
                                    ? 'bg-amber-500/80 border-amber-400 text-white' 
                                    : 'bg-black/40 border-white/20 text-white/70 hover:text-white'
                                }`}
                              >
                                <Star className={`h-3.5 w-3.5 ${m.favorite ? 'fill-white' : ''}`} />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Media Cards Bottom Panel */}
                        {m.kind !== 'text' && (
                          <div className="p-4 flex-1 flex flex-col justify-between">
                            <div>
                              <h3 className="font-bold text-white text-xs truncate">{m.name}</h3>
                              {m.aiAnalysis?.caption && (
                                <p className="text-[11px] text-white/60 line-clamp-1 mt-0.5">
                                  {m.aiAnalysis.caption}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-white/40 mt-2">
                              <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                              <span>{formatBytes(m.size)}</span>
                            </div>
                          </div>
                        )}

                        {/* Text Cards Bottom Panel */}
                        {m.kind === 'text' && (
                          <div className="p-4 border-t border-white/5 flex items-center justify-between text-[10px] text-white/40 bg-white/[0.01]">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-white/30" />
                              {new Date(m.createdAt).toLocaleDateString()}
                            </span>
                            <div className="flex gap-1.5">
                              <button 
                                onClick={(e) => toggleFavorite(m.id, e)}
                                className="hover:text-white transition"
                              >
                                <Star className={`h-3.5 w-3.5 ${m.favorite ? 'text-amber-300 fill-amber-300' : ''}`} />
                              </button>
                            </div>
                          </div>
                        )}
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-8">
          
          {/* AI Insights & Pulse Analysis */}
          <Card className="border border-white/10 bg-white/[0.02] rounded-3xl overflow-hidden shadow-xl">
            <CardHeader className="pb-3 border-b border-white/5">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-pink-400" /> AI Memory Pulse
              </CardTitle>
              <CardDescription className="text-[11px] text-white/50">
                Data intelligence summary of your library.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {aiHighlights.length > 0 ? (
                <ul className="space-y-2.5">
                  {aiHighlights.map((h, i) => (
                    <li key={i} className="text-xs flex items-start gap-2 text-white/80 leading-relaxed">
                      <Sparkles className="h-3.5 w-3.5 text-pink-300 shrink-0 mt-0.5" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-2 space-y-3">
                  <div className="h-10 w-10 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mx-auto text-pink-400">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="text-xs text-white/60">Generate full-library insight highlights with our intelligent engine.</div>
                </div>
              )}
              
              <Button
                onClick={genAiHighlights}
                disabled={aiBusy}
                className="w-full h-9 rounded-xl bg-white text-black font-semibold text-xs hover:bg-white/90 transition shadow"
              >
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                {aiBusy ? 'Re-analyzing...' : 'Request AI Summary'}
              </Button>
            </CardContent>
          </Card>

          {/* Storage & Plan Widget */}
          <Card className="border border-white/10 bg-white/[0.02] rounded-3xl overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Cloud className="h-4 w-4 text-pink-400" /> Storage State</span>
                {usage?.isSuper && <Crown className="h-4 w-4 text-amber-300" />}
              </CardTitle>
              <CardDescription className="text-[11px] text-white/50">
                Plan: {usage?.plan?.name || 'Standard Account'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {usage ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>{formatBytes(usage.usage?.bytes || 0)} used</span>
                    <span>{usage.isSuper ? '∞ Unlimited' : formatBytes(usage.plan?.storageBytes || 0)}</span>
                  </div>
                  <Progress 
                    value={usage.isSuper ? 2 : Math.min(((usage.usage?.bytes || 0) / (usage.plan?.storageBytes || 1)) * 100, 100)} 
                    className="h-2 bg-white/5" 
                  />
                  {!usage.isSuper && (
                    <div className="text-[10px] text-white/40">
                      You are using {Math.round(((usage.usage?.bytes || 0) / (usage.plan?.storageBytes || 1)) * 100)}% of your active storage package.
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-10 bg-white/5 animate-pulse rounded-lg" />
              )}

              {/* Duplicate Savings Alert */}
              {insights?.duplicates?.extraCopies > 0 && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-200">Duplicates spotted!</span>
                    <p className="text-white/60 mt-0.5">Free up {formatBytes(insights.duplicates.savingsBytes)} of space by clearing extra backup copies.</p>
                  </div>
                </div>
              )}

              {/* Upgrade Promo */}
              {(!usage?.isSuper) && (
                <Link href="/billing" className="block text-center rounded-xl bg-pink-500/10 border border-pink-500/20 py-2.5 text-xs text-pink-200 font-bold hover:bg-pink-500/15 transition">
                  Unlock Unlimited Vault Storage <ChevronRight className="h-3 w-3 inline ml-1" />
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats Grid */}
          <section className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
              <div className="text-xs text-white/50">📸 Total Photos</div>
              <div className="text-lg font-black text-white mt-1">{photoCount}</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
              <div className="text-xs text-white/50">🎥 Total Videos</div>
              <div className="text-lg font-black text-white mt-1">{videoCount}</div>
            </div>
          </section>

          {/* Prompt Suggestion Cards */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase font-bold text-white/40 tracking-wider">Useful Suggestions</h3>
            <Link href="/ai-studio" className="block p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition group">
              <div className="font-semibold text-white text-xs group-hover:text-pink-300 transition">Write AI Captions</div>
              <p className="text-[10px] text-white/50 mt-1">Convert raw family images into beautiful ready-to-post drafts.</p>
            </Link>
            <Link href="/journal" className="block p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition group">
              <div className="font-semibold text-white text-xs group-hover:text-pink-300 transition">View AI Life Journal</div>
              <p className="text-[10px] text-white/50 mt-1">Review automated daily chronicles and weekly family digests.</p>
            </Link>
          </section>

        </div>
      </div>

      {/* Memory Details Dialog (using Shadcn UI Dialog) */}
      <Dialog open={!!selectedMemory} onOpenChange={(open) => { if(!open) setSelectedMemory(null); }}>
        <DialogContent className="max-w-4xl w-full border border-white/10 bg-[#0d0717] text-white p-6 md:p-8 rounded-3xl overflow-hidden shadow-2xl">
          {selectedMemory && (
            <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-6 max-h-[80vh] overflow-y-auto pr-1">
              
              {/* Left Column: Visual Media or Text memoir preview */}
              <div className="flex flex-col justify-center bg-black/60 rounded-2xl overflow-hidden border border-white/5 relative aspect-square md:aspect-auto md:min-h-[350px]">
                {selectedMemory.kind === 'photo' ? (
                  <img 
                    src={mediaSrc(selectedMemory.id)} 
                    className="max-h-[50vh] md:max-h-[70vh] w-full object-contain mx-auto" 
                    alt={selectedMemory.name} 
                  />
                ) : selectedMemory.kind === 'video' ? (
                  <video 
                    src={mediaSrc(selectedMemory.id)} 
                    className="max-h-[50vh] md:max-h-[70vh] w-full" 
                    controls 
                    autoPlay 
                  />
                ) : (
                  <div className="p-8 h-full flex flex-col justify-center items-center text-center space-y-4 bg-gradient-to-br from-pink-500/5 via-purple-500/10 to-indigo-500/5">
                    <Quote className="h-10 w-10 text-pink-500/20" />
                    <p className="text-lg md:text-xl font-serif italic leading-relaxed text-pink-100 max-w-md">
                      "{selectedMemory.aiAnalysis?.caption || selectedMemory.aiAnalysis?.description}"
                    </p>
                    <Badge variant="outline" className="px-3 py-1 border-pink-500/20 bg-pink-500/10 text-pink-300 font-bold rounded-full text-xs">
                      {selectedMemory.aiAnalysis?.autoAlbum || 'Thought Capture'}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Right Column: Complete Metadata & AI Analysis details */}
              <div className="flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  
                  {/* Title & Metadata */}
                  <div className="border-b border-white/10 pb-4 space-y-1">
                    <div className="flex justify-between items-start">
                      <h2 className="text-xl font-black text-white truncate max-w-[200px] md:max-w-xs">{selectedMemory.name}</h2>
                      <button onClick={() => setSelectedMemory(null)} className="text-white/40 hover:text-white shrink-0">
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/50">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>{new Date(selectedMemory.createdAt).toLocaleString()}</span>
                      {selectedMemory.size && (
                        <>
                          <span className="text-white/20">•</span>
                          <span>{formatBytes(selectedMemory.size)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* AI Analysis and Caption Generator */}
                  <div className="space-y-3">
                    <div className="text-xs uppercase font-bold text-white/40 tracking-wider flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-pink-400" /> AI Insights Vault
                    </div>
                    
                    {selectedMemory.kind !== 'text' && (
                      <div className="rounded-xl border border-pink-500/20 bg-pink-500/[0.02] p-3.5 space-y-3">
                        <Button
                          onClick={() => generateDetailCaption(selectedMemory.id)}
                          disabled={generatingCaptionId === selectedMemory.id}
                          className="w-full h-8 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-xs font-bold text-white"
                        >
                          {generatingCaptionId === selectedMemory.id ? (
                            <><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Crafting details...</>
                          ) : (
                            <><Sparkles className="h-3 w-3 mr-1.5" /> Generate AI story caption</>
                          )}
                        </Button>
                        
                        {(detailCaption || selectedMemory.aiAnalysis?.caption) && (
                          <p className="text-xs text-pink-100 font-serif leading-relaxed italic">
                            "{detailCaption || selectedMemory.aiAnalysis?.caption}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* Auto Categorization details */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-white/60">Category Theme:</div>
                      <Badge variant="secondary" className="bg-white/5 text-white border border-white/5 text-xs px-2.5 py-1 rounded-full">
                        🧩 {selectedMemory.aiAnalysis?.autoAlbum || 'Unsorted Archive'}
                      </Badge>
                    </div>

                    {/* Detected tags / labels */}
                    {(selectedMemory.aiAnalysis?.tags?.length > 0 || selectedMemory.aiAnalysis?.faces?.length > 0) && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-white/60">Keywords & Smart Tags:</div>
                        <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1 no-scrollbar">
                          {(selectedMemory.aiAnalysis?.tags || []).map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="px-2 py-0.5 border-white/10 bg-white/[0.02] text-white/70 text-[10px] rounded font-mono">
                              #{tag}
                            </Badge>
                          ))}
                          {(selectedMemory.aiAnalysis?.faces || []).map((face, idx) => (
                            <Badge key={idx} variant="outline" className="px-2 py-0.5 border-pink-500/20 bg-pink-500/5 text-pink-300 text-[10px] rounded font-bold">
                              👤 {face}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Main operational actions */}
                <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-4">
                  <Button 
                    onClick={() => toggleFavorite(selectedMemory.id)}
                    variant="outline"
                    className="h-9 rounded-xl bg-white/5 border-white/10 text-xs text-white hover:bg-white/10"
                  >
                    <Star className={`h-4 w-4 mr-1.5 ${selectedMemory.favorite ? 'text-amber-400 fill-amber-400' : ''}`} />
                    {selectedMemory.favorite ? 'Favorited' : 'Add Favorite'}
                  </Button>
                  <Button 
                    onClick={() => moveToTrash(selectedMemory.id)}
                    variant="outline"
                    className="h-9 rounded-xl bg-rose-500/10 border-rose-500/20 text-xs text-rose-300 hover:bg-rose-500/20"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Move to Trash
                  </Button>
                </div>

              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
