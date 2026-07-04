'use client';
import { useState, useEffect, useRef } from 'react';
import { apiFetch, mediaSrc } from '@/lib/api-client';
import { toast } from 'sonner';
import { 
  Sparkles, Send, Mic, MicOff, Volume2, VolumeX, 
  Bot, User, Image as ImageIcon, Video, Calendar, MapPin, 
  Loader2, Play, Heart, Star, Film, Sparkle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ChatPage() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hello! I'm SnapNext AI. I help you search, organize, and understand the photos and videos you've saved — always grounded in your real library.\n\nAsk me anything! Try saying:\n· \"Show my beach photos\"\n· \"Find my favorite memories\"\n· \"Create a story from my recent uploads\"\n· \"What did I save last month?\"",
      createdAt: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeAudio, setActiveAudio] = useState(null);
  
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Init Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        setInput(transcript);
        sendMessage(transcript);
      };

      rec.onerror = (e) => {
        console.error('Speech recognition error', e);
        setIsRecording(false);
        toast.error('Voice input error. Try speaking again.');
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast.error("Voice conversations are not supported in your browser. Try Chrome or Safari.");
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setIsRecording(true);
      recognitionRef.current.start();
    }
  };

  const handlePlayVoice = (base64Audio) => {
    if (!base64Audio) return;
    try {
      if (activeAudio) {
        activeAudio.pause();
      }
      const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
      const audio = new Audio(audioUrl);
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
      audio.onpause = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      audio.play();
      setActiveAudio(audio);
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = async (textToSend) => {
    const queryText = (textToSend || input).trim();
    if (!queryText) return;

    if (!textToSend) setInput('');
    setLoading(true);

    const userMsg = {
      id: Math.random().toString(),
      role: 'user',
      text: queryText,
      createdAt: new Date()
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await apiFetch('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          query: queryText,
          voiceResponse: voiceEnabled
        })
      });

      // Parse matches from response text (e.g. MATCH_DATA: {...})
      let cleanedText = res.reply || "I didn't quite catch that. Let's try searching your photos!";
      let matchedMedia = [];
      let actionType = null;

      const matchIndex = cleanedText.indexOf('MATCH_DATA:');
      if (matchIndex !== -1) {
        try {
          const jsonString = cleanedText.slice(matchIndex + 11).trim();
          cleanedText = cleanedText.slice(0, matchIndex).trim();
          const matchData = JSON.parse(jsonString);
          if (matchData.matchedIds && matchData.matchedIds.length > 0) {
            actionType = matchData.action;
            // Fetch media objects for these IDs
            const mediaRes = await apiFetch('/media');
            if (mediaRes.items) {
              matchedMedia = mediaRes.items.filter(item => matchData.matchedIds.includes(item.id));
            }
          }
        } catch (e) {
          console.error("Failed to parse matched photo block", e);
        }
      }

      const assistantMsg = {
        id: Math.random().toString(),
        role: 'assistant',
        text: cleanedText,
        matchedMedia,
        actionType,
        audio: res.audio,
        createdAt: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (res.audio && voiceEnabled) {
        handlePlayVoice(res.audio);
      }

    } catch (e) {
      toast.error(e.message || "An AI error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleStarter = (q) => {
    sendMessage(q);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden" id="chat-container">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
            <Sparkle className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-md font-semibold text-white flex items-center gap-1.5">
              SnapNext Memory Brain
            </h1>
            <p className="text-xs text-white/50 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
              Core AI Operating System Active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              setVoiceEnabled(!voiceEnabled);
              if (isPlaying && activeAudio) activeAudio.pause();
            }}
            className={`p-2.5 rounded-xl border transition-all ${voiceEnabled ? 'bg-pink-500/20 border-pink-500/30 text-pink-300' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}
            title={voiceEnabled ? "Mute Voice Response" : "Enable Voice Response"}
          >
            {voiceEnabled ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5" />}
          </button>
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div 
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="h-9 w-9 rounded-full bg-purple-950/80 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <Bot className="h-4.5 w-4.5 text-purple-300" />
                </div>
              )}

              <div className={`space-y-3 max-w-[75%] ${m.role === 'user' ? 'order-1' : 'order-2'}`}>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user' 
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-tr-none shadow-md' 
                    : 'bg-white/[0.04] border border-white/10 text-white/90 rounded-tl-none'
                }`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  
                  {m.audio && (
                    <button 
                      onClick={() => handlePlayVoice(m.audio)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-full text-white/90 font-medium transition"
                    >
                      <Volume2 className="h-3.5 w-3.5" /> Hear response
                    </button>
                  )}
                </div>

                {/* Render matched media results inside bubble! */}
                {m.matchedMedia && m.matchedMedia.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2.5 shadow-lg"
                  >
                    <div className="text-xs text-white/60 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-pink-300" /> Matches Found ({m.matchedMedia.length})
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {m.matchedMedia.map((media) => (
                        <div key={media.id} className="relative aspect-square rounded-xl overflow-hidden group bg-white/5 border border-white/10">
                          {media.kind === 'photo' ? (
                            <img src={mediaSrc(media.id)} alt="" className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                          ) : (
                            <video src={mediaSrc(media.id)} className="h-full w-full object-cover" muted />
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            {media.kind === 'video' && <Play className="h-5 w-5 text-white fill-white" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              {m.role === 'user' && (
                <div className="h-9 w-9 rounded-full bg-pink-950/80 border border-pink-500/30 flex items-center justify-center shrink-0 order-3">
                  <User className="h-4.5 w-4.5 text-pink-300" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div className="flex gap-4 justify-start">
            <div className="h-9 w-9 rounded-full bg-purple-950/80 border border-purple-500/30 flex items-center justify-center shrink-0 animate-spin">
              <Bot className="h-4.5 w-4.5 text-purple-300" />
            </div>
            <div className="bg-white/[0.02] border border-white/15 px-4 py-3 rounded-2xl text-sm text-white/60 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing memories...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Interactive starters if conversation has only 1 message */}
      {messages.length === 1 && (
        <div className="px-6 py-3 bg-white/[0.01] border-t border-white/5 flex gap-2 overflow-x-auto select-none no-scrollbar">
          {[
            "Show my beach photos",
            "Find my favorite memories",
            "Create a story from my uploads",
            "What did I save last month?"
          ].map((item, idx) => (
            <button 
              key={idx} 
              onClick={() => handleStarter(item)}
              className="text-xs bg-white/5 border border-white/10 hover:border-pink-500/30 hover:bg-pink-500/5 px-3 py-1.5 rounded-full text-white/80 shrink-0 transition"
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {/* Chat input bar */}
      <div className="p-4 border-t border-white/10 bg-white/[0.01] flex items-center gap-3">
        <button 
          onClick={toggleRecording}
          className={`p-3.5 rounded-full transition-all ${
            isRecording 
              ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' 
              : 'bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10'
          }`}
          title={isRecording ? "Stop Recording" : "Speak Naturally"}
        >
          {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        <div className="flex-1 relative flex items-center">
          <input 
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder={isRecording ? "Listening..." : "Ask SnapNext AI..."}
            disabled={isRecording}
            className="w-full bg-white/5 border border-white/10 focus:border-pink-500/50 rounded-2xl pl-4 pr-12 py-3.5 text-sm outline-none text-white transition placeholder-white/40"
          />
          <button 
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="absolute right-2.5 p-2 rounded-xl bg-pink-500 hover:bg-pink-600 disabled:opacity-30 disabled:hover:bg-pink-500 transition text-white"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
