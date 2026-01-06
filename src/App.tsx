/**
 * Plant Selector App - Ticket-Based Auth Edition
 * Magic link authentication with per-user favourites
 */

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Heart, Pencil, Trash2, Plus, X, Search, Copy, Check,
  TreeDeciduous, Flower2, Shrub, Leaf, ChevronDown, Loader2,
  Link as LinkIcon, Users, Library, Lock, UserPlus, Download
} from 'lucide-react';
import jsPDF from 'jspdf';

// ============ SUPABASE CLIENT ============
const supabase = createClient(
  'https://rttcrnrppwgepchjipdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0dGNybnJwcHdnZXBjaGppcGRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MTM4NTYsImV4cCI6MjA4MzA4OTg1Nn0.CXWL1rJjmIVvFb8NjtvLPFloFJrsj-7ko5z5PSlNRcg'
);

// ============ TYPE DEFINITIONS ============
interface Plant {
  id: string;
  commonName: string;
  botanicalName: string;
  category: string;
  subCategory: string;
  height: string;
  width: string;
  imageUrl: string;
  notes: string;
  colourTags: string[];
}

interface DbPlant {
  id: string;
  common_name: string;
  botanical_name: string;
  category: string;
  sub_category: string;
  height: string;
  width: string;
  image_url: string;
  description: string;
  colour_tags: string[];
}

interface Ticket {
  id: string;
  ticket_code: string;
  user_name: string | null;
  is_admin: boolean;
  created_at: string;
}

// ============ HELPERS ============
const dbToPlant = (db: DbPlant): Plant => ({
  id: db.id,
  commonName: db.common_name || '',
  botanicalName: db.botanical_name || '',
  category: db.category || 'Trees',
  subCategory: db.sub_category || '',
  height: db.height || '',
  width: db.width || '',
  imageUrl: db.image_url || '',
  notes: db.description || '',
  colourTags: db.colour_tags || []
});

const plantToDb = (plant: Omit<Plant, 'id'>) => ({
  common_name: plant.commonName,
  botanical_name: plant.botanicalName,
  category: plant.category,
  sub_category: plant.subCategory,
  height: plant.height,
  width: plant.width,
  image_url: plant.imageUrl,
  description: plant.notes,
  colour_tags: plant.colourTags
});

const generateTicketCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// ============ CATEGORY CONFIGURATION ============
const categoryConfig: Record<string, { icon: typeof TreeDeciduous; subCategories: string[] }> = {
  'Trees': { icon: TreeDeciduous, subCategories: ['Deciduous', 'Evergreen', 'Screening', 'Feature'] },
  'Shrubs': { icon: Shrub, subCategories: ['Flowering', 'Foliage', 'Hedging', 'Native'] },
  'Ground Covers': { icon: Leaf, subCategories: ['Strappy Leaf', 'Mass Planting', 'Spreading', 'Native'] },
  'Perennials': { icon: Flower2, subCategories: ['Cut Flower', 'Aromatic', 'Border', 'Native'] },
  'Trees & Shrubs': { icon: TreeDeciduous, subCategories: ['Deciduous', 'Evergreen'] }
};

const colourOptions = ['Red', 'Orange', 'Yellow', 'Pink', 'Purple', 'Blue', 'White'];
const colourHex: Record<string, string> = {
  Red: '#E53E3E', Orange: '#ED8936', Yellow: '#ECC94B',
  Pink: '#ED64A6', Purple: '#9F7AEA', Blue: '#4299E1', White: '#E2E8F0',
  red: '#E53E3E', orange: '#ED8936', yellow: '#ECC94B',
  pink: '#ED64A6', purple: '#9F7AEA', blue: '#4299E1', white: '#E2E8F0',
  green: '#48BB78'
};

// ============ MAIN APP COMPONENT ============
export default function App() {
  // === AUTH STATE ===
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // === DATA STATE ===
  const [plants, setPlants] = useState<Plant[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [selectedColours, setSelectedColours] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'browse' | 'favorites'>('browse');
  
  // Modal states
  const [detailPlant, setDetailPlant] = useState<Plant | null>(null);
  const [editPlant, setEditPlant] = useState<Plant | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Admin mode state
  const [isAdminView, setIsAdminView] = useState(false);
  
  // Stats for admin dashboard
  const [totalStudents, setTotalStudents] = useState(0);
  const [students, setStudents] = useState<Ticket[]>([]);
  const [editingStudent, setEditingStudent] = useState<Ticket | null>(null);
  const [editStudentName, setEditStudentName] = useState('');
  
  // Invite link state
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  
  // Clipboard feedback
  const [copied, setCopied] = useState(false);

  // === CHECK TICKET ON LOAD ===
  useEffect(() => {
    const checkAuth = async () => {
      setAuthLoading(true);
      
      // Check URL for ticket param
      const urlParams = new URLSearchParams(window.location.search);
      const ticketParam = urlParams.get('ticket');
      
      // Check localStorage for saved ticket
      const savedTicket = localStorage.getItem('plant_selector_ticket');
      
      const ticketCode = ticketParam || savedTicket;
      
      if (ticketCode) {
        const { data: ticket } = await supabase
          .from('tickets')
          .select('*')
          .eq('ticket_code', ticketCode)
          .maybeSingle();
        
        if (ticket) {
          setCurrentTicket(ticket);
          localStorage.setItem('plant_selector_ticket', ticketCode);
          
          // Clean URL if ticket was in URL
          if (ticketParam) {
            window.history.replaceState({}, '', window.location.pathname);
          }
          
          // Check if name needs to be set
          if (!ticket.user_name) {
            setShowNameModal(true);
          }
        } else {
          localStorage.removeItem('plant_selector_ticket');
        }
      }
      
      setAuthLoading(false);
    };
    
    checkAuth();
  }, []);

  // === LOAD DATA FROM SUPABASE ===
  useEffect(() => {
    if (!currentTicket) return;
    
    const loadData = async () => {
      setLoading(true);
      
      // Load plants
      const { data: plantsData } = await supabase
        .from('plants')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (plantsData) {
        setPlants(plantsData.map(dbToPlant));
      }
      
      // Load favourites for this user
      const { data: favsData } = await supabase
        .from('favourites')
        .select('plant_id')
        .eq('ticket_id', currentTicket.id);
      
      if (favsData) {
        setFavorites(new Set(favsData.map(f => f.plant_id)));
      }
      
      // Load students for admin
      if (currentTicket.is_admin) {
        const { data: studentsData, count } = await supabase
          .from('tickets')
          .select('*', { count: 'exact' })
          .eq('is_admin', false)
          .order('created_at', { ascending: false });
        if (studentsData) {
          setStudents(studentsData);
          setTotalStudents(studentsData.filter(s => s.user_name).length);
        }
      }
      
      setLoading(false);
    };
    
    loadData();
  }, [currentTicket]);

  // === CLAIM TICKET (set name) ===
  const claimTicket = async () => {
    if (!nameInput.trim() || !currentTicket) return;
    
    const { error } = await supabase
      .from('tickets')
      .update({ user_name: nameInput.trim() })
      .eq('id', currentTicket.id);
    
    if (!error) {
      setCurrentTicket({ ...currentTicket, user_name: nameInput.trim() });
      setShowNameModal(false);
    }
  };

  // === GENERATE INVITE LINK ===
  const generateInviteLink = async () => {
    const code = generateTicketCode();
    
    const { data, error } = await supabase
      .from('tickets')
      .insert({ ticket_code: code, is_admin: false })
      .select()
      .single();
    
    if (!error && data) {
      const link = `${window.location.origin}${window.location.pathname}?ticket=${code}`;
      setGeneratedLink(link);
      setStudents(prev => [data, ...prev]);
    }
  };

  const copyInviteLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  // === STUDENT MANAGEMENT ===
  const updateStudentName = async () => {
    if (!editingStudent || !editStudentName.trim()) return;
    const { error } = await supabase
      .from('tickets')
      .update({ user_name: editStudentName.trim() })
      .eq('id', editingStudent.id);
    if (!error) {
      setStudents(prev => prev.map(s => 
        s.id === editingStudent.id ? { ...s, user_name: editStudentName.trim() } : s
      ));
      setEditingStudent(null);
    }
  };

  const deleteStudent = async (student: Ticket) => {
    if (!confirm(`Remove ${student.user_name || 'this student'}? Their favourites will also be deleted.`)) return;
    
    // Delete favourites first (cascade)
    const { error: favError } = await supabase.from('favourites').delete().eq('ticket_id', student.id);
    if (favError) console.error('Failed to delete favourites:', favError);
    
    // Delete ticket
    const { error } = await supabase.from('tickets').delete().eq('id', student.id);
    if (error) {
      console.error('Failed to delete student:', error);
      alert('Failed to delete student. Please try again.');
      return;
    }
    
    setStudents(prev => prev.filter(s => s.id !== student.id));
    if (student.user_name) setTotalStudents(prev => prev - 1);
  };

  // === CRUD OPERATIONS (Supabase) ===
  const addPlant = async (plant: Omit<Plant, 'id'>) => {
    const { data, error } = await supabase
      .from('plants')
      .insert(plantToDb(plant))
      .select()
      .maybeSingle();
    
    if (data && !error) {
      setPlants(prev => [dbToPlant(data), ...prev]);
    }
    setShowAddModal(false);
  };

  const updatePlant = async (updated: Plant) => {
    const { error } = await supabase
      .from('plants')
      .update(plantToDb(updated))
      .eq('id', updated.id);
    
    if (!error) {
      setPlants(prev => prev.map(p => p.id === updated.id ? updated : p));
    }
    setEditPlant(null);
  };

  const deletePlant = async (id: string) => {
    if (confirm('Delete this plant?')) {
      const { error } = await supabase
        .from('plants')
        .delete()
        .eq('id', id);
      
      if (!error) {
        setPlants(prev => prev.filter(p => p.id !== id));
        await supabase.from('favourites').delete().eq('plant_id', id);
        setFavorites(prev => { prev.delete(id); return new Set(prev); });
      }
    }
  };

  const toggleFavorite = async (id: string) => {
    if (!currentTicket) return;
    
    const isFav = favorites.has(id);
    
    if (isFav) {
      await supabase.from('favourites').delete()
        .eq('plant_id', id)
        .eq('ticket_id', currentTicket.id);
      setFavorites(prev => { prev.delete(id); return new Set(prev); });
    } else {
      await supabase.from('favourites').insert({ 
        plant_id: id,
        ticket_id: currentTicket.id 
      });
      setFavorites(prev => new Set(prev).add(id));
    }
  };

  // === FILTERING LOGIC ===
  const filteredPlants = useMemo(() => {
    let result = plants;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.commonName.toLowerCase().includes(term) ||
        p.botanicalName.toLowerCase().includes(term)
      );
    }
    
    if (selectedCategory) {
      result = result.filter(p => p.category === selectedCategory);
    }
    
    if (selectedSubCategory) {
      result = result.filter(p => p.subCategory === selectedSubCategory);
    }
    
    if (selectedCategory === 'Perennials' && selectedColours.size > 0) {
      result = result.filter(p => 
        p.colourTags.some(c => selectedColours.has(c) || selectedColours.has(c.toLowerCase()))
      );
    }
    
    return result;
  }, [plants, searchTerm, selectedCategory, selectedSubCategory, selectedColours]);

  const displayPlants = activeTab === 'favorites' 
    ? plants.filter(p => favorites.has(p.id))
    : filteredPlants;

  // === COPY FAVORITES TO CLIPBOARD ===
  const copyFavorites = () => {
    const favPlants = plants.filter(p => favorites.has(p.id));
    const text = favPlants.map(p => 
      `${p.commonName} (${p.botanicalName}) - ${p.height} H x ${p.width} W`
    ).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isAdmin = currentTicket?.is_admin || false;
  const showAdminFeatures = isAdmin && isAdminView;

  // === RENDER: LOADING ===
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#84A98C] animate-spin" />
      </div>
    );
  }

  // === RENDER: LOCKED PAGE (No Ticket) ===
  if (!currentTicket) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
          .font-display { font-family: 'Playfair Display', serif; }
          .font-body { font-family: 'Inter', sans-serif; }
        `}</style>
        
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-[#84A98C]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-[#84A98C]" />
          </div>
          <h1 className="font-display text-3xl text-[#1F2937] mb-3">Invitation Only</h1>
          <p className="font-body text-[#1F2937]/60 mb-6">
            This plant library is private. You'll need an invite link to access it.
          </p>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#84A98C]/10">
            <p className="font-body text-sm text-[#1F2937]/50">
              If you have an invite link, paste it in your browser's address bar to gain access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // === RENDER: MAIN APP ===
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#84A98C] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
        .font-display { font-family: 'Playfair Display', serif; }
        .font-body { font-family: 'Inter', sans-serif; }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
      `}</style>

      {/* ADMIN DASHBOARD */}
      {isAdmin && isAdminView && (
        <div className="bg-gradient-to-r from-[#84A98C]/10 to-[#E76F51]/10 border-b border-[#84A98C]/20">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Student Management */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-[#84A98C]/20">
                <div className="flex items-center gap-2 mb-3">
                  <UserPlus size={18} className="text-[#84A98C]" />
                  <h3 className="font-body font-medium text-[#1F2937]">Student Management</h3>
                </div>
                
                {generatedLink ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={generatedLink}
                        readOnly
                        className="flex-1 px-3 py-2 bg-[#FDFBF7] rounded-lg font-body text-xs border border-[#84A98C]/20 truncate"
                      />
                      <button
                        onClick={copyInviteLink}
                        className="px-3 py-2 bg-[#84A98C] text-white rounded-lg font-body text-xs font-medium hover:bg-[#6b8a73] transition-colors flex items-center gap-1"
                      >
                        {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                        {linkCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <button
                      onClick={() => setGeneratedLink(null)}
                      className="text-xs font-body text-[#1F2937]/50 hover:text-[#1F2937]"
                    >
                      Generate another
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={generateInviteLink}
                    className="w-full px-4 py-2.5 bg-[#84A98C] text-white rounded-lg font-body text-sm font-medium hover:bg-[#6b8a73] transition-colors flex items-center justify-center gap-2"
                  >
                    <LinkIcon size={16} />
                    Generate Invite Link
                  </button>
                )}
              </div>
              
              {/* Quick Stats */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-[#84A98C]/20">
                <h3 className="font-body font-medium text-[#1F2937] mb-3">Quick Stats</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#FDFBF7] rounded-lg p-3">
                    <div className="flex items-center gap-2 text-[#84A98C]">
                      <Library size={16} />
                      <span className="font-body text-xs">Total Plants</span>
                    </div>
                    <p className="font-display text-2xl text-[#1F2937] mt-1">{plants.length}</p>
                  </div>
                  <div className="bg-[#FDFBF7] rounded-lg p-3">
                    <div className="flex items-center gap-2 text-[#E76F51]">
                      <Users size={16} />
                      <span className="font-body text-xs">Active Students</span>
                    </div>
                    <p className="font-display text-2xl text-[#1F2937] mt-1">{totalStudents}</p>
                  </div>
                </div>
              </div>
            </div>

              {/* Manage Students Panel */}
              <div className="md:col-span-2 bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-[#84A98C]/20">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Users size={18} className="text-[#E76F51]" />
                    <h3 className="font-body font-medium text-[#1F2937]">Manage Students</h3>
                  </div>
                  <span className="font-body text-xs text-[#1F2937]/50">{students.length} total</span>
                </div>
                
                {students.length === 0 ? (
                  <p className="font-body text-sm text-[#1F2937]/40 text-center py-4">No students yet</p>
                ) : (
                  <div className="max-h-48 overflow-auto space-y-2">
                    {students.map(student => (
                      <div key={student.id} className="flex items-center justify-between bg-[#FDFBF7] rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm text-[#1F2937] truncate">
                            {student.user_name || <span className="italic text-[#1F2937]/40">Unclaimed</span>}
                          </p>
                          <p className="font-body text-xs text-[#1F2937]/40 font-mono">{student.ticket_code}</p>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <button
                            onClick={() => { setEditingStudent(student); setEditStudentName(student.user_name || ''); }}
                            className="p-1.5 rounded-lg hover:bg-[#84A98C]/10 text-[#1F2937]/50 hover:text-[#84A98C] transition-colors"
                            title="Edit name"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => deleteStudent(student)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-[#1F2937]/50 hover:text-red-500 transition-colors"
                            title="Remove student"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-[#FDFBF7]/90 backdrop-blur-md border-b border-[#84A98C]/10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="/logo.avif" 
                alt="Kathleen Murphy Landscape Design" 
                className="h-12 md:h-14 w-auto"
              />
              <div>
              <h1 className="font-display text-2xl md:text-3xl text-[#1F2937]">
                Plant Selector
              </h1>
              {currentTicket.user_name && (
                <p className="font-body text-sm text-[#1F2937]/50">
                  Welcome, {currentTicket.user_name}
                </p>
              )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {isAdmin && (
                <button
                  onClick={() => setIsAdminView(!isAdminView)}
                  className={`px-3 py-1.5 text-xs font-body font-medium rounded-full transition-colors ${
                    isAdminView 
                      ? 'bg-[#E76F51] text-white' 
                      : 'bg-[#84A98C]/10 text-[#84A98C] hover:bg-[#84A98C]/20'
                  }`}
                >
                  {isAdminView ? 'Student View' : 'Admin Mode'}
                </button>
              )}
              
              {showAdminFeatures && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#84A98C] text-white rounded-full font-body text-sm font-medium hover:bg-[#6b8a73] transition-colors"
                >
                  <Plus size={16} /> Add Plant
                </button>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1F2937]/40" size={18} />
            <input
              type="text"
              placeholder="Search plants..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-[#84A98C]/20 font-body text-sm focus:outline-none focus:border-[#84A98C] transition-colors"
            />
          </div>
        </div>
      </header>

      {/* TABS */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="flex gap-1 bg-white rounded-full p-1 w-fit">
          {(['browse', 'favorites'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-full font-body text-sm font-medium transition-colors ${
                activeTab === tab 
                  ? 'bg-[#84A98C] text-white' 
                  : 'text-[#1F2937]/60 hover:text-[#1F2937]'
              }`}
            >
              {tab === 'browse' ? 'Browse' : `Favourites (${favorites.size})`}
            </button>
          ))}
        </div>
      </div>

      {/* FILTERS (Browse tab only) */}
      {activeTab === 'browse' && (
        <div className="max-w-7xl mx-auto px-4 py-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryConfig).map(([cat, { icon: Icon }]) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(selectedCategory === cat ? null : cat);
                  setSelectedSubCategory(null);
                  setSelectedColours(new Set());
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-body text-sm transition-all ${
                  selectedCategory === cat
                    ? 'bg-[#84A98C] text-white'
                    : 'bg-white text-[#1F2937]/70 hover:bg-[#84A98C]/10'
                }`}
              >
                <Icon size={16} /> {cat}
              </button>
            ))}
          </div>

          {selectedCategory && categoryConfig[selectedCategory] && (
            <div className="flex flex-wrap gap-2">
              {categoryConfig[selectedCategory].subCategories.map(sub => (
                <button
                  key={sub}
                  onClick={() => setSelectedSubCategory(selectedSubCategory === sub ? null : sub)}
                  className={`px-3 py-1.5 rounded-full font-body text-xs transition-all ${
                    selectedSubCategory === sub
                      ? 'bg-[#E76F51] text-white'
                      : 'bg-[#E76F51]/10 text-[#E76F51] hover:bg-[#E76F51]/20'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}

          {selectedCategory === 'Perennials' && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-body text-xs text-[#1F2937]/50">Colours:</span>
              {colourOptions.map(colour => (
                <button
                  key={colour}
                  onClick={() => {
                    setSelectedColours(prev => {
                      const next = new Set(prev);
                      next.has(colour) ? next.delete(colour) : next.add(colour);
                      return next;
                    });
                  }}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    selectedColours.has(colour) ? 'scale-125 border-[#1F2937]' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: colourHex[colour] }}
                  title={colour}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* FAVORITES HEADER with Copy & Download Buttons */}
      {activeTab === 'favorites' && favorites.size > 0 && (
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <p className="font-body text-sm text-[#1F2937]/60">Your plant palette</p>
          <div className="flex gap-2">
            <button
              onClick={copyFavorites}
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-full font-body text-sm text-[#1F2937]/70 hover:bg-[#84A98C]/10 transition-colors"
            >
              {copied ? <Check size={16} className="text-[#84A98C]" /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy List'}
            </button>
            <button
              onClick={() => downloadFavoritesPDF(plants.filter(p => favorites.has(p.id)))}
              className="flex items-center gap-2 px-4 py-2 bg-[#84A98C] text-white rounded-full font-body text-sm font-medium hover:bg-[#6b8a73] transition-colors"
            >
              <Download size={16} />
              Download PDF
            </button>
          </div>
        </div>
      )}

      {/* PLANT CARDS GRID */}
      <main className="max-w-7xl mx-auto px-4 pb-8">
        {displayPlants.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-body text-[#1F2937]/40">
              {activeTab === 'favorites' ? 'No favourites yet' : 'No plants found'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {displayPlants.map(plant => (
              <PlantCard
                key={plant.id}
                plant={plant}
                isFavorite={favorites.has(plant.id)}
                isAdmin={showAdminFeatures}
                onToggleFavorite={() => toggleFavorite(plant.id)}
                onView={() => setDetailPlant(plant)}
                onEdit={() => setEditPlant(plant)}
                onDelete={() => deletePlant(plant.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* MODALS */}
      {detailPlant && (
        <DetailModal 
          plant={detailPlant} 
          onClose={() => setDetailPlant(null)}
          isFavorite={favorites.has(detailPlant.id)}
          onToggleFavorite={() => toggleFavorite(detailPlant.id)}
        />
      )}

      {editPlant && showAdminFeatures && (
        <PlantFormModal
          plant={editPlant}
          onSave={updatePlant}
          onClose={() => setEditPlant(null)}
        />
      )}

      {showAddModal && showAdminFeatures && (
        <PlantFormModal
          onSave={addPlant}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* EDIT STUDENT NAME MODAL */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setEditingStudent(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-slideUp" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-lg text-[#1F2937]">Edit Student Name</h3>
              <button onClick={() => setEditingStudent(null)} className="p-1 text-[#1F2937]/40 hover:text-[#1F2937]"><X size={18} /></button>
            </div>
            <p className="font-body text-xs text-[#1F2937]/50 mb-2">Ticket: {editingStudent.ticket_code}</p>
            <input
              type="text"
              placeholder="Student name"
              value={editStudentName}
              onChange={e => setEditStudentName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && updateStudentName()}
              className="w-full px-4 py-3 border border-[#84A98C]/30 rounded-xl font-body text-sm focus:outline-none focus:border-[#84A98C]"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => setEditingStudent(null)} className="flex-1 py-2.5 rounded-full font-body text-sm text-[#1F2937]/60 hover:bg-gray-100">Cancel</button>
              <button onClick={updateStudentName} className="flex-1 py-2.5 bg-[#84A98C] text-white rounded-full font-body text-sm font-medium hover:bg-[#6b8a73]">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* NAME CLAIM MODAL */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-slideUp">
            <h3 className="font-display text-xl text-center text-[#1F2937] mb-2">Welcome!</h3>
            <p className="font-body text-sm text-center text-[#1F2937]/60 mb-4">
              Please enter your name to claim this ticket
            </p>
            <input
              type="text"
              placeholder="Your name"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && claimTicket()}
              className="w-full px-4 py-3 border border-[#84A98C]/30 rounded-xl font-body text-sm focus:outline-none focus:border-[#84A98C]"
              autoFocus
            />
            <button
              onClick={claimTicket}
              disabled={!nameInput.trim()}
              className="w-full mt-4 py-3 bg-[#84A98C] text-white rounded-full font-body text-sm font-medium hover:bg-[#6b8a73] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ PLANT CARD COMPONENT ============
function PlantCard({
  plant,
  isFavorite,
  isAdmin,
  onToggleFavorite,
  onView,
  onEdit,
  onDelete
}: {
  plant: Plant;
  isFavorite: boolean;
  isAdmin: boolean;
  onToggleFavorite: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div 
      className="bg-white rounded-2xl overflow-hidden hover:shadow-lg transition-shadow duration-300 cursor-pointer group"
      onClick={onView}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img 
          src={plant.imageUrl} 
          alt={plant.commonName}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=400&fit=crop'; }}
        />
        
        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
            className={`p-2 rounded-full backdrop-blur-md transition-colors ${
              isFavorite 
                ? 'bg-[#E76F51] text-white' 
                : 'bg-white/80 text-[#1F2937]/50 hover:text-[#E76F51]'
            }`}
          >
            <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>

        {isAdmin && (
          <div className="absolute top-3 left-3 flex gap-2">
            <button
              onClick={e => { e.stopPropagation(); onEdit(); }}
              className="p-2 rounded-full bg-white/80 backdrop-blur-md text-[#1F2937]/60 hover:text-[#84A98C] transition-colors"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="p-2 rounded-full bg-white/80 backdrop-blur-md text-[#1F2937]/60 hover:text-red-500 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-display text-lg text-[#1F2937]">{plant.commonName}</h3>
        <p className="font-body text-sm text-[#1F2937]/50 italic">{plant.botanicalName}</p>
        <p className="font-body text-xs text-[#84A98C] mt-2">
          {plant.height} H x {plant.width} W
        </p>
      </div>
    </div>
  );
}

// ============ DOWNLOAD FAVORITES PDF ============
const loadImageAsDataURL = (url: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

const downloadFavoritesPDF = async (favPlants: Plant[]) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const imgSize = 30;
  const textX = 20 + imgSize + 8;
  
  // Load all plant images in parallel
  const plantImages = await Promise.all(
    favPlants.map(p => loadImageAsDataURL(p.imageUrl))
  );
  
  // Add logo
  try {
    const logoData = await loadImageAsDataURL('/logo.avif');
    if (logoData) {
      const logoWidth = 50;
      const logoHeight = 15;
      const logoX = (pageWidth - logoWidth) / 2;
      const logoY = 10;
      // Draw background rectangle behind logo to handle transparency
      doc.setFillColor(253, 251, 247); // #FDFBF7
      doc.rect(logoX, logoY, logoWidth, logoHeight, 'F');
      doc.addImage(logoData, 'PNG', logoX, logoY, logoWidth, logoHeight);
    }
  } catch { /* continue without logo */ }
  
  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(31, 41, 55);
  doc.text('Plant Palette', pageWidth / 2, 38, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(132, 169, 140);
  doc.text(`Generated ${new Date().toLocaleDateString()}`, pageWidth / 2, 45, { align: 'center' });
  
  // Plants list with images
  let y = 55;
  
  for (let i = 0; i < favPlants.length; i++) {
    const plant = favPlants[i];
    const rowHeight = imgSize + 5;
    
    if (y + rowHeight > 280) {
      doc.addPage();
      y = 20;
    }
    
    // Plant image
    if (plantImages[i]) {
      try {
        doc.addImage(plantImages[i]!, 'JPEG', 15, y, imgSize, imgSize);
      } catch { /* skip image */ }
    } else {
      doc.setFillColor(240, 240, 240);
      doc.rect(15, y, imgSize, imgSize, 'F');
    }
    
    // Plant details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(31, 41, 55);
    doc.text(`${i + 1}. ${plant.commonName}`, textX, y + 8);
    
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(plant.botanicalName, textX, y + 14);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(132, 169, 140);
    doc.text(`${plant.height} H × ${plant.width} W`, textX, y + 20);
    
    doc.setTextColor(180, 100, 80);
    doc.text(plant.category + (plant.subCategory ? ` • ${plant.subCategory}` : ''), textX, y + 26);
    
    y += rowHeight;
  }
  
  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Kathleen Murphy Landscape Design', pageWidth / 2, 290, { align: 'center' });
  
  doc.save('plant-palette.pdf');
};

// ============ DETAIL MODAL COMPONENT ============
function DetailModal({ plant, onClose, isFavorite, onToggleFavorite }: { 
  plant: Plant; 
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl max-h-[90vh] overflow-auto shadow-2xl animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative aspect-video">
          <img src={plant.imageUrl} alt={plant.commonName} className="w-full h-full object-cover" />
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={onToggleFavorite}
              className={`p-2 rounded-full backdrop-blur-md transition-colors ${
                isFavorite 
                  ? 'bg-[#E76F51] text-white' 
                  : 'bg-white/80 text-[#1F2937]/50 hover:text-[#E76F51]'
              }`}
            >
              <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/80 backdrop-blur-md text-[#1F2937]/60 hover:text-[#1F2937]"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <h2 className="font-display text-2xl text-[#1F2937]">{plant.commonName}</h2>
          <p className="font-body text-base text-[#1F2937]/50 italic">{plant.botanicalName}</p>
          
          <div className="flex gap-4 mt-4">
            <div className="px-3 py-1.5 bg-[#84A98C]/10 rounded-lg">
              <p className="font-body text-xs text-[#84A98C]">Height</p>
              <p className="font-body text-sm text-[#1F2937] font-medium">{plant.height}</p>
            </div>
            <div className="px-3 py-1.5 bg-[#84A98C]/10 rounded-lg">
              <p className="font-body text-xs text-[#84A98C]">Width</p>
              <p className="font-body text-sm text-[#1F2937] font-medium">{plant.width}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <span className="px-3 py-1 bg-[#E76F51]/10 text-[#E76F51] rounded-full font-body text-xs">
              {plant.category}
            </span>
            <span className="px-3 py-1 bg-[#84A98C]/10 text-[#84A98C] rounded-full font-body text-xs">
              {plant.subCategory}
            </span>
            {plant.colourTags.map(c => (
              <span 
                key={c} 
                className="px-3 py-1 rounded-full font-body text-xs text-white"
                style={{ backgroundColor: colourHex[c] || colourHex[c.toLowerCase()] || '#84A98C' }}
              >
                {c}
              </span>
            ))}
          </div>

          {plant.notes && (
            <div className="mt-5 pt-5 border-t border-[#84A98C]/10">
              <h4 className="font-display text-sm text-[#1F2937] mb-2">Notes</h4>
              <p className="font-body text-sm text-[#1F2937]/70 leading-relaxed">{plant.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ PLANT FORM MODAL (Add/Edit) ============
function PlantFormModal({
  plant,
  onSave,
  onClose
}: {
  plant?: Plant;
  onSave: (plant: any) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    commonName: plant?.commonName || '',
    botanicalName: plant?.botanicalName || '',
    category: plant?.category || 'Trees',
    subCategory: plant?.subCategory || categoryConfig['Trees'].subCategories[0],
    height: plant?.height || '',
    width: plant?.width || '',
    imageUrl: plant?.imageUrl || '',
    notes: plant?.notes || '',
    colourTags: plant?.colourTags || [] as string[]
  });

  const handleCategoryChange = (cat: string) => {
    const config = categoryConfig[cat] || categoryConfig['Trees'];
    setForm(prev => ({
      ...prev,
      category: cat,
      subCategory: config.subCategories[0]
    }));
  };

  const toggleColour = (colour: string) => {
    setForm(prev => ({
      ...prev,
      colourTags: prev.colourTags.includes(colour)
        ? prev.colourTags.filter(c => c !== colour)
        : [...prev.colourTags, colour]
    }));
  };

  const handleSubmit = () => {
    if (!form.commonName || !form.botanicalName) return;
    if (plant) {
      onSave({ ...plant, ...form });
    } else {
      onSave(form);
    }
  };

  const currentConfig = categoryConfig[form.category] || categoryConfig['Trees'];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl max-h-[90vh] overflow-auto shadow-2xl animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-display text-xl text-[#1F2937]">
              {plant ? 'Edit Plant' : 'Add New Plant'}
            </h2>
            <button onClick={onClose} className="p-2 text-[#1F2937]/40 hover:text-[#1F2937]">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="font-body text-xs text-[#1F2937]/60 block mb-1">Common Name *</label>
              <input
                type="text"
                value={form.commonName}
                onChange={e => setForm(prev => ({ ...prev, commonName: e.target.value }))}
                className="w-full px-4 py-2.5 border border-[#84A98C]/20 rounded-xl font-body text-sm focus:outline-none focus:border-[#84A98C]"
              />
            </div>

            <div>
              <label className="font-body text-xs text-[#1F2937]/60 block mb-1">Botanical Name *</label>
              <input
                type="text"
                value={form.botanicalName}
                onChange={e => setForm(prev => ({ ...prev, botanicalName: e.target.value }))}
                className="w-full px-4 py-2.5 border border-[#84A98C]/20 rounded-xl font-body text-sm focus:outline-none focus:border-[#84A98C] italic"
              />
            </div>

            <div>
              <label className="font-body text-xs text-[#1F2937]/60 block mb-1">Category</label>
              <div className="relative">
                <select
                  value={form.category}
                  onChange={e => handleCategoryChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-[#84A98C]/20 rounded-xl font-body text-sm focus:outline-none focus:border-[#84A98C] appearance-none bg-white"
                >
                  {Object.keys(categoryConfig).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1F2937]/40 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="font-body text-xs text-[#1F2937]/60 block mb-1">Sub-Category</label>
              <div className="relative">
                <select
                  value={form.subCategory}
                  onChange={e => setForm(prev => ({ ...prev, subCategory: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-[#84A98C]/20 rounded-xl font-body text-sm focus:outline-none focus:border-[#84A98C] appearance-none bg-white"
                >
                  {currentConfig.subCategories.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1F2937]/40 pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs text-[#1F2937]/60 block mb-1">Height</label>
                <input
                  type="text"
                  placeholder="e.g. 2m"
                  value={form.height}
                  onChange={e => setForm(prev => ({ ...prev, height: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-[#84A98C]/20 rounded-xl font-body text-sm focus:outline-none focus:border-[#84A98C]"
                />
              </div>
              <div>
                <label className="font-body text-xs text-[#1F2937]/60 block mb-1">Width</label>
                <input
                  type="text"
                  placeholder="e.g. 1.5m"
                  value={form.width}
                  onChange={e => setForm(prev => ({ ...prev, width: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-[#84A98C]/20 rounded-xl font-body text-sm focus:outline-none focus:border-[#84A98C]"
                />
              </div>
            </div>

            <div>
              <label className="font-body text-xs text-[#1F2937]/60 block mb-1">Image URL</label>
              <input
                type="url"
                placeholder="https://..."
                value={form.imageUrl}
                onChange={e => setForm(prev => ({ ...prev, imageUrl: e.target.value }))}
                className="w-full px-4 py-2.5 border border-[#84A98C]/20 rounded-xl font-body text-sm focus:outline-none focus:border-[#84A98C]"
              />
            </div>

            <div>
              <label className="font-body text-xs text-[#1F2937]/60 block mb-1">Description / Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-4 py-2.5 border border-[#84A98C]/20 rounded-xl font-body text-sm focus:outline-none focus:border-[#84A98C] resize-none"
              />
            </div>

            <div>
              <label className="font-body text-xs text-[#1F2937]/60 block mb-2">Colour Tags</label>
              <div className="flex flex-wrap gap-2">
                {colourOptions.map(colour => (
                  <button
                    key={colour}
                    type="button"
                    onClick={() => toggleColour(colour)}
                    className={`px-3 py-1.5 rounded-full font-body text-xs transition-all ${
                      form.colourTags.includes(colour)
                        ? 'text-white'
                        : 'bg-gray-100 text-[#1F2937]/60'
                    }`}
                    style={form.colourTags.includes(colour) ? { backgroundColor: colourHex[colour] } : {}}
                  >
                    {colour}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-full font-body text-sm text-[#1F2937]/60 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 py-3 bg-[#84A98C] text-white rounded-full font-body text-sm font-medium hover:bg-[#6b8a73] transition-colors"
            >
              {plant ? 'Save Changes' : 'Add Plant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
