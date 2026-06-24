'use client';
import { useState, useEffect } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { 
  Sparkles, Network, Heart, Users, MapPin, Calendar, 
  Bot, Award, UserCheck, Shield, ChevronRight, Plus, 
  Trash2, Search, Play, FileText, Share2, Info, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LifeGraphPage() {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('graph'); // graph, relationships, family_vault
  const [selectedNode, setSelectedNode] = useState('Sarika');
  const [loading, setLoading] = useState(true);
  
  // Family Vault state
  const [familyMembers, setFamilyMembers] = useState([
    { name: 'Sarika (Partner)', role: 'Partner', avatar: '👩‍❤️‍👨', memories: '2,345', status: 'Active' },
    { name: 'Mom & Dad', role: 'Parents', avatar: '👴👵', memories: '840', status: 'Active' },
    { name: 'Aarav (Son)', role: 'Child', avatar: '👶', memories: '1,420', status: 'Active' }
  ]);
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('Partner');

  useEffect(() => {
    // Warm up the context by checking favorites API or mocking database details
    apiFetch('/favorites/ai')
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleAddFamilyMember = (e) => {
    e.preventDefault();
    if (!inviteName.trim()) return;
    setFamilyMembers(prev => [
      ...prev,
      { name: inviteName, role: inviteRole, avatar: '👤', memories: '0', status: 'Pending Invite' }
    ]);
    toast.success(`Invitation sent to ${inviteName}!`);
    setInviteName('');
  };

  const relationshipGraph = {
    user: { name: 'Vipin', role: 'You (Owner)' },
    nodes: [
      { name: 'Sarika', label: 'Partner', memories: 2345, trips: 15, anniversaries: 6, score: 98, color: '#f43f5e', x: 250, y: 150 },
      { name: 'Mom & Dad', label: 'Parents', memories: 840, trips: 4, anniversaries: 12, score: 92, color: '#a855f7', x: 100, y: 220 },
      { name: 'Aarav', label: 'Son', memories: 1420, trips: 8, anniversaries: 4, score: 95, color: '#ec4899', x: 400, y: 220 },
      { name: 'Goa Trip', label: 'Travel landmark', memories: 312, trips: 2, anniversaries: 0, score: 85, color: '#3b82f6', x: 120, y: 80 },
      { name: 'Dubai', label: 'Travel landmark', memories: 180, trips: 1, anniversaries: 0, score: 80, color: '#06b6d4', x: 380, y: 80 },
    ]
  };

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
          AI Life Graph & Relationship Dashboard
        </h1>
        <p className="text-white/60 mt-1">
          A multi-dimensional semantic map charting the emotional bonds, shared journeys, and landmarks in your life.
        </p>
      </div>

      {/* Navigation tabs */}
      <div className="flex gap-2 overflow-x-auto bg-white/[0.02] p-1.5 rounded-2xl border border-white/5 no-scrollbar">
        {[
          { id: 'graph', label: '🕸️ Semantic Life Graph' },
          { id: 'relationships', label: '❤️ Relationship Intelligence' },
          { id: 'family_vault', label: '🔒 AI Family Vault' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
              activeTab === t.id 
                ? 'bg-gradient-to-r from-pink-500/20 to-purple-600/25 border border-pink-500/30 text-white shadow-sm' 
                : 'text-white/60 border border-transparent hover:text-white hover:bg-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'graph' && (
          <motion.div 
            key="graph"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="grid md:grid-cols-[1fr_320px] gap-8"
          >
            {/* Visual interactive graph canvas */}
            <div className="relative rounded-3xl border border-white/10 bg-black/40 overflow-hidden min-h-[420px] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-radial-gradient from-fuchsia-500/5 to-transparent pointer-events-none" />
              <div className="absolute top-4 left-4 text-xs text-white/50 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-pink-300 animate-pulse" /> Tap nodes to trace memory connections
              </div>

              {/* Dynamic SVG Connection Network */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {relationshipGraph.nodes.map((node, i) => (
                  <line 
                    key={i}
                    x1="250" 
                    y1="250" 
                    x2={node.x} 
                    y2={node.y} 
                    stroke={node.name === selectedNode ? 'url(#active-line)' : 'rgba(255,255,255,0.08)'} 
                    strokeWidth={node.name === selectedNode ? '2.5' : '1.5'}
                    strokeDasharray={node.name === selectedNode ? "6, 4" : "none"}
                    className={node.name === selectedNode ? 'animate-[dash_2s_linear_infinite]' : ''}
                  />
                ))}
                {/* SVG Gradients */}
                <defs>
                  <linearGradient id="active-line" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Central VIPIN Node */}
              <div className="absolute left-[225px] top-[225px] z-10">
                <div className="h-14 w-14 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 flex flex-col items-center justify-center border-2 border-white shadow-xl shadow-pink-500/20 cursor-default">
                  <span className="text-sm font-black text-white">Vipin</span>
                  <span className="text-[8px] font-bold text-white/80">Owner</span>
                </div>
              </div>

              {/* Surrounding Connected Nodes */}
              {relationshipGraph.nodes.map((node, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedNode(node.name)}
                  style={{ left: `${node.x - 45}px`, top: `${node.y - 25}px` }}
                  className={`absolute z-10 px-4.5 py-2.5 rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center shadow-lg ${
                    selectedNode === node.name 
                      ? 'bg-white/10 border-white/40 scale-110 ring-4 ring-pink-500/20' 
                      : 'bg-white/[0.02] border-white/5 hover:border-white/15'
                  }`}
                >
                  <span className="text-xs font-bold text-white flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: node.color }}></span>
                    {node.name}
                  </span>
                  <span className="text-[9px] text-white/40 font-semibold">{node.label}</span>
                </button>
              ))}
            </div>

            {/* Sidebar Details for Selected Node */}
            <div className="space-y-6">
              {(() => {
                const node = relationshipGraph.nodes.find(n => n.name === selectedNode) || relationshipGraph.nodes[0];
                return (
                  <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-6">
                    <div className="space-y-2">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-lg" style={{ backgroundColor: `${node.color}20`, color: node.color }}>
                        {node.name.slice(0, 2)}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">{node.name}</h3>
                        <p className="text-xs text-white/50">{node.label} Connection</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
                        <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider block">Memories</span>
                        <span className="text-md font-bold text-white">{node.memories.toLocaleString()}</span>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
                        <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider block">Travel Landmark</span>
                        <span className="text-md font-bold text-white">{node.trips} trips</span>
                      </div>
                    </div>

                    {/* Relationship Affinity Score progress bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-white/60 font-semibold">AI Affinity Score</span>
                        <span className="font-bold text-pink-300">{node.score}% affinity</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-pink-500 to-purple-600 transition-all duration-500" 
                          style={{ width: `${node.score}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-white/40 italic">
                        Calculated from photo co-occurrence, facial happiness detection, and physical geographic landmarks.
                      </p>
                    </div>

                    {/* Action Items */}
                    <div className="space-y-2.5 pt-2">
                      <span className="text-[10px] text-white/45 font-bold uppercase tracking-wider block">Automatic suggestions</span>
                      <button className="w-full py-2.5 rounded-xl border border-white/10 hover:border-pink-500/30 hover:bg-pink-500/5 text-xs text-white font-medium transition flex items-center justify-center gap-1.5">
                        <Star className="h-3.5 w-3.5 text-pink-300" /> Auto-generate Joint Story
                      </button>
                      <button className="w-full py-2.5 rounded-xl border border-white/10 hover:border-purple-500/30 hover:bg-purple-500/5 text-xs text-white font-medium transition flex items-center justify-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-purple-300" /> Plan Reunion Anniversary
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}

        {activeTab === 'relationships' && (
          <motion.div 
            key="relationships"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Relationship summary panel */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 space-y-2">
                <span className="text-xs text-pink-300 font-semibold uppercase tracking-wider">👩‍❤️‍👨 Partner Connection</span>
                <h3 className="text-xl font-bold">Sarika</h3>
                <p className="text-xs text-white/60 leading-relaxed">
                  You created 412 beautiful memories with Sarika this year, spanning 15 travel landmarks & 8 holidays. 
                </p>
                <div className="text-xs font-bold text-white/90 pt-1">Relationship Duration: 6+ Years</div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 space-y-2">
                <span className="text-xs text-purple-300 font-semibold uppercase tracking-wider">🍼 Child Growth</span>
                <h3 className="text-xl font-bold">Aarav</h3>
                <p className="text-xs text-white/60 leading-relaxed">
                  Core brain has indexed 1,420 child landmarks, tracking height, facial features, and happy events automatically.
                </p>
                <div className="text-xs font-bold text-white/90 pt-1">Milestones Identified: 24 active</div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 space-y-2">
                <span className="text-xs text-blue-300 font-semibold uppercase tracking-wider">✈️ Frequent Travel Partners</span>
                <h3 className="text-xl font-bold">Goa, Dubai & Mumbai</h3>
                <p className="text-xs text-white/60 leading-relaxed">
                  Geographic tag tracking identified Dubai as your premium emotional highlight location.
                </p>
                <div className="text-xs font-bold text-white/90 pt-1">Travel Memory Map: Complete</div>
              </div>
            </div>

            {/* Simulated Memory Maps illustration */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
              <div>
                <h3 className="text-md font-bold text-white">Visual Memory Map</h3>
                <p className="text-xs text-white/60">An automated geographic trace of memories mapped across locations with loved ones.</p>
              </div>

              <div className="relative h-48 rounded-2xl overflow-hidden bg-black/40 flex items-center justify-center border border-white/5">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
                
                {/* Simulated coordinate points */}
                <div className="absolute left-[20%] top-[30%] flex items-center gap-2">
                  <div className="h-3 w-3 bg-pink-500 rounded-full animate-ping" />
                  <div className="h-2 w-2 bg-pink-500 rounded-full" />
                  <span className="text-[10px] bg-black/80 px-2 py-0.5 rounded-md border border-white/10 text-white font-semibold">Goa (312 memories)</span>
                </div>

                <div className="absolute left-[65%] top-[60%] flex items-center gap-2">
                  <div className="h-3 w-3 bg-blue-500 rounded-full animate-ping" />
                  <div className="h-2 w-2 bg-blue-500 rounded-full" />
                  <span className="text-[10px] bg-black/80 px-2 py-0.5 rounded-md border border-white/10 text-white font-semibold">Dubai (180 memories)</span>
                </div>

                <div className="absolute left-[45%] top-[45%] flex items-center gap-2">
                  <div className="h-3 w-3 bg-purple-500 rounded-full animate-ping" />
                  <div className="h-2 w-2 bg-purple-500 rounded-full" />
                  <span className="text-[10px] bg-black/80 px-2 py-0.5 rounded-md border border-white/10 text-white font-semibold">Mumbai (520 memories)</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'family_vault' && (
          <motion.div 
            key="family_vault"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid md:grid-cols-2 gap-8"
          >
            {/* Left: Active Family Members & Invitation */}
            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
                <h3 className="text-md font-bold text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-pink-400" /> Active Family Vault Members
                </h3>
                <p className="text-xs text-white/60">
                  Shared vault utilizes multi-user permission systems. Only verified loved ones can query or view private folders.
                </p>

                <div className="space-y-3">
                  {familyMembers.map((member, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-lg">
                          {member.avatar}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">{member.name}</p>
                          <p className="text-[10px] text-white/45">{member.role}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white font-medium">
                          {member.memories} memories
                        </span>
                        <p className="text-[9px] text-emerald-400 mt-1">{member.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Family Member Form */}
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
                <h4 className="text-xs uppercase font-bold text-white/40 tracking-wider">Invite Family Member</h4>
                <form onSubmit={handleAddFamilyMember} className="space-y-3">
                  <div>
                    <label className="text-[10px] text-white/50 font-bold block mb-1">Email / Full Name</label>
                    <input 
                      type="text" 
                      value={inviteName}
                      onChange={e => setInviteName(e.target.value)}
                      placeholder="e.g. Sarika lamba"
                      className="w-full bg-white/5 border border-white/10 focus:border-pink-500/40 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 font-bold block mb-1">Vault Permissions</label>
                    <select 
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 focus:border-pink-500/40 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    >
                      <option value="Partner" className="bg-neutral-900">Partner (Full Read/Write)</option>
                      <option value="Parents" className="bg-neutral-900">Parents (Selective Access)</option>
                      <option value="Child" className="bg-neutral-900">Child (Read-only Gallery)</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full py-2.5 bg-pink-500 hover:bg-pink-600 transition font-semibold text-xs rounded-xl flex items-center justify-center gap-1">
                    <Plus className="h-4 w-4" /> Send Access Invite
                  </button>
                </form>
              </div>
            </div>

            {/* Right: Family shared calendar/timeline items */}
            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-md font-bold text-white flex items-center gap-1.5">
                    <Calendar className="h-5 w-5 text-purple-400" /> Auto-discovered Family Events
                  </h3>
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 font-semibold px-2 py-0.5 rounded-full">
                    AI Calendar
                  </span>
                </div>

                <div className="space-y-3">
                  {[
                    { title: "Aarav's 5th Birthday Event", date: "June 28, 2026", details: "Discovered inside photo analysis of birthday decorations & cake text." },
                    { title: "Annual Dubai Vacation Trip", date: "August 12, 2026", details: "Discovered from flight tickets in memory inbox and booking details." },
                    { title: "Wedding Anniversary Anniversary", date: "September 04, 2026", details: "Discovered from favorite relationship highlights database pattern." }
                  ].map((evt, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1.5">
                      <div className="flex justify-between items-start">
                        <h4 className="text-xs font-bold text-white">{evt.title}</h4>
                        <span className="text-[9px] text-pink-300 font-semibold bg-pink-500/10 px-1.5 py-0.5 rounded-md shrink-0">
                          {evt.date}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/50 leading-relaxed">{evt.details}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Family AI Companion advice */}
              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-transparent p-5 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">Family Vault Smart Assistant advice:</span>
                <p className="text-xs text-white/85 leading-relaxed italic">
                  “I've identified 12 duplicates and blurred screenshots uploaded in the joint vault. You can save 41.5 MB instantly from our joint storage quota. Shall we start cleanup?”
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
