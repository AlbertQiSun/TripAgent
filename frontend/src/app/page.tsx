'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import styles from './page.module.css';

const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false,
  loading: () => <p style={{color: '#888', textAlign: 'center', marginTop: '40%'}}>Loading Map...</p>
});

interface ReActStep {
  step_type: 'thought' | 'action' | 'observation' | 'final';
  content: string;
  tool_name?: string;
  tool_input?: string;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{role: 'user' | 'model', content: string}[]>([]);
  const [planHistory, setPlanHistory] = useState<any[]>([]);
  const [currentPlanIndex, setCurrentPlanIndex] = useState(-1);
  const plan = currentPlanIndex >= 0 ? planHistory[currentPlanIndex] : null;
  const [steps, setSteps] = useState<ReActStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const [highlightedActivity, setHighlightedActivity] = useState<string | null>(null);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);

  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profilePreferences, setProfilePreferences] = useState('');
  const [savedSessions, setSavedSessions] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Attachment states
  const [pendingImage, setPendingImage] = useState<{base64: string, mime: string, preview: string} | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [tripNotes, setTripNotes] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Community states
  const [isCommunityOpen, setIsCommunityOpen] = useState(false);
  const [communityTrips, setCommunityTrips] = useState<any[]>([]);
  const [communitySearch, setCommunitySearch] = useState('');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishConsent, setPublishConsent] = useState(false);
  const [publishDestination, setPublishDestination] = useState('');
  const [selectedCommunityTrip, setSelectedCommunityTrip] = useState<any>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [publishSelfRating, setPublishSelfRating] = useState(0);
  const [modelChoice, setModelChoice] = useState('gemini'); // 'gemini' | 'local'

  // Profile onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [profileForm, setProfileForm] = useState({
    budget: '',
    ageRange: '',
    identity: '',
    hobbies: [] as string[],
    wakeUpTime: '',
    pace: '',
    dietary: '',
  });

  // Plan variants (A/B/C)
  const [planVariants, setPlanVariants] = useState<any[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);

  // Separate auth form state so it doesn't pollute the logged-in username
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('tripai_token');
    const savedUser = localStorage.getItem('tripai_username');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUsername(savedUser);
      setIsLoggedIn(true);
      // Load preferences
      fetch(`/api/profile/${savedUser}`, {
        headers: { 'Authorization': `Bearer ${savedToken}` }
      }).then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setProfilePreferences(data.preferences || ''); })
        .catch(() => {});
    }
  }, []);

  // Auto-save conversation in the background (fire-and-forget)
  const autoSaveSession = async (
    latestMessages: {role: string, content: string}[], 
    latestPlanHistory: any[],
    sessionId: number | null,
    userToken: string,
    user: string
  ) => {
    if (!user || !userToken) return;
    // Build a meaningful title from the first user message
    const firstUserMsg = latestMessages.find(m => m.role === 'user')?.content || '';
    let title = 'Trip Chat';
    if (latestPlanHistory.length > 0) {
      const theme = latestPlanHistory[latestPlanHistory.length - 1]?.days?.[0]?.theme;
      if (theme) {
        title = theme;
      } else if (firstUserMsg) {
        title = firstUserMsg.length > 50 ? firstUserMsg.slice(0, 50) + '…' : firstUserMsg;
      }
    } else if (firstUserMsg) {
      title = firstUserMsg.length > 50 ? firstUserMsg.slice(0, 50) + '…' : firstUserMsg;
    }
    const history_json = JSON.stringify({ messages: latestMessages, planHistory: latestPlanHistory });
    try {
      const res = await fetch('/api/sessions/autosave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
        body: JSON.stringify({ username: user, title, history_json, session_id: sessionId })
      });
      if (res.ok) {
        const data = await res.json();
        if (!sessionId) {
          setCurrentSessionId(data.session_id);
        }
      }
    } catch (err) {
      console.error('Auto-save error:', err);
    }
  };

  const handleLogin = async () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      alert('Please enter both username and password.');
      return;
    }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setUsername(authUsername);
        setIsLoggedIn(true);
        setToken(data.token);
        setIsProfileModalOpen(false);
        setAuthUsername('');
        setAuthPassword('');
        // Persist to localStorage
        localStorage.setItem('tripai_token', data.token);
        localStorage.setItem('tripai_username', authUsername);
        // Load preferences in background — don't let it break login
        try {
          const prefRes = await fetch(`/api/profile/${authUsername}`, {
            headers: { 'Authorization': `Bearer ${data.token}` }
          });
          if (prefRes.ok) {
            const prefData = await prefRes.json();
            setProfilePreferences(prefData.preferences || '');
          }
        } catch(prefErr) {
          console.error('Failed to load preferences:', prefErr);
        }
      } else {
        alert(data.message || 'Login failed. Please check your credentials.');
      }
    } catch(err: any) {
      console.error(err);
      alert('Login error: ' + err.message);
    }
  };

  const handleRegister = async () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      alert('Please enter both username and password.');
      return;
    }
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setUsername(authUsername);
        setIsLoggedIn(true);
        setToken(data.token);
        setIsProfileModalOpen(false);
        setAuthUsername('');
        setAuthPassword('');
        // Persist to localStorage
        localStorage.setItem('tripai_token', data.token);
        localStorage.setItem('tripai_username', authUsername);
        // Show onboarding for new users
        setShowOnboarding(true);
      } else {
        alert(data.message);
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handleSaveProfile = async () => {
    if (!username.trim()) return;
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ username, preferences: profilePreferences })
      });
      setIsProfileModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSession = async () => {
    console.log("handleSaveSession called", { username, planHistoryLength: planHistory?.length });
    if (!username || !username.trim()) {
      alert("Cannot save: not logged in.");
      return;
    }
    if (!planHistory || !planHistory.length) {
      alert("Cannot save: no plan generated yet.");
      return;
    }
    const title = planHistory[planHistory.length - 1]?.days?.[0]?.theme || "Saved Trip";
    const history_json = JSON.stringify({ messages, planHistory });
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, title, history_json })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to save trip');
      }
      alert('Trip saved successfully!');
    } catch(err: any) {
      console.error(err);
      alert('Error saving trip: ' + err.message);
    }
  };

  const fetchSessions = async () => {
    if (!username.trim()) return;
    try {
      const res = await fetch(`/api/sessions/${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to fetch trips');
      }
      const data = await res.json();
      setSavedSessions(data.sessions || []);
      setIsSidebarOpen(true);
    } catch(err: any) {
      console.error(err);
      alert('Error fetching saved trips: ' + err.message);
    }
  };

  const loadSession = async (sessionId: number) => {
    try {
      const res = await fetch(`/api/sessions/detail/${sessionId}`);
      const data = await res.json();
      setMessages(data.messages || []);
      setPlanHistory(data.planHistory || []);
      setCurrentPlanIndex((data.planHistory || []).length - 1);
      setCurrentSessionId(sessionId);
      setIsSidebarOpen(false);
      setQuery('');
      setSteps([]);
    } catch(err) {
      console.error(err);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const toggleStep = (idx: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSearch = async (overrideQuery?: string) => {
    const activeQuery = overrideQuery || query;
    if (!activeQuery.trim() || loading) return;
    
    setLoading(true);
    setSteps([]);
    // Only reset plan if it's a completely new query, but keep it for swap/remove to avoid flickering empty state if possible.
    // Actually, it's cleaner to reset for now, but keeping it shows a smoother transition.
    setExpandedSteps(new Set());
    
    // Add user message to chat and clear input
    const newMessages = [...messages, { role: 'user' as const, content: activeQuery }];
    if (!overrideQuery) {
      setMessages(newMessages);
      setQuery('');
    }

    // Track accumulated state in local vars for auto-save
    let accumulatedMessages = [...newMessages];
    let accumulatedPlans = [...planHistory];
    let accumulatedPlanIndex = currentPlanIndex;

    try {
      const response = await fetch('/api/plan/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: activeQuery, 
          history: messages, 
          username,
          current_plan: plan ? JSON.stringify(plan) : null,
          image_base64: pendingImage?.base64 || null,
          image_mime: pendingImage?.mime || null,
          model_choice: modelChoice
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) throw new Error('No reader');
      readerRef.current = reader;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const step: ReActStep = JSON.parse(line.slice(6));
              
              if (step.step_type === 'final') {
                // Parse the plan JSON from the final step
                let content = step.content;
                if (content.startsWith('```json')) content = content.slice(7);
                if (content.startsWith('```')) content = content.slice(3);
                if (content.endsWith('```')) content = content.slice(0, -3);
                try {
                  const parsed = JSON.parse(content.trim());
                  
                  // Detect triple-plan format vs single-plan
                  if (parsed.plans && Array.isArray(parsed.plans)) {
                    // Triple plan (A/B/C) — store all variants, display Plan A
                    setPlanVariants(parsed.plans);
                    setSelectedVariant(0);
                    const planA = parsed.plans[0];
                    const newPlanHistory = accumulatedPlans.slice(0, accumulatedPlanIndex + 1);
                    newPlanHistory.push(planA);
                    accumulatedPlans = newPlanHistory;
                    accumulatedPlanIndex = newPlanHistory.length - 1;
                    setPlanHistory(newPlanHistory);
                    setCurrentPlanIndex(accumulatedPlanIndex);
                    const labels = parsed.plans.map((p: any) => `${p.label} (${p.style})`).join(', ');
                    const modelMsg = { role: 'model' as const, content: `I've generated 3 plan variants: ${labels}. Plan A is shown — switch between them using the tabs above the itinerary!` };
                    accumulatedMessages = [...accumulatedMessages, modelMsg];
                    setMessages(accumulatedMessages);
                  } else {
                    // Single plan (modification or fallback)
                    setPlanVariants([]);
                    const newPlanHistory = accumulatedPlans.slice(0, accumulatedPlanIndex + 1);
                    newPlanHistory.push(parsed);
                    accumulatedPlans = newPlanHistory;
                    accumulatedPlanIndex = newPlanHistory.length - 1;
                    setPlanHistory(newPlanHistory);
                    setCurrentPlanIndex(accumulatedPlanIndex);
                    const modelMsg = { role: 'model' as const, content: "I've generated a detailed itinerary for you! Check it out on the right." };
                    accumulatedMessages = [...accumulatedMessages, modelMsg];
                    setMessages(accumulatedMessages);
                  }
                  setSteps(prev => [...prev, { ...step, is_success: true }]);
                } catch {
                  // If JSON parse fails, it might be a clarifying question
                  if (content.trim()) {
                    const modelMsg = { role: 'model' as const, content: content.trim() };
                    accumulatedMessages = [...accumulatedMessages, modelMsg];
                    setMessages(accumulatedMessages);
                  }
                }
              } else {
                setSteps(prev => [...prev, step]);
              }
            } catch {
              // skip malformed data
            }
          }
        }
      }
    } catch (error: any) {
      // Don't show error for intentional cancellation
      if (error?.name !== 'AbortError' && !String(error).includes('cancel')) {
        console.error('Stream error:', error);
        setSteps(prev => [...prev, { step_type: 'thought', content: `Error: ${error}` }]);
      }
    }
    readerRef.current = null;
    setLoading(false);

    // Auto-save conversation in background
    autoSaveSession(accumulatedMessages, accumulatedPlans, currentSessionId, token, username);
    // Clear pending image after send
    setPendingImage(null);
    setEditingMessageIndex(null);
  };

  const handleStop = () => {
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }
    setLoading(false);
  };

  const handleEditMessage = (msgIndex: number) => {
    // Only edit user messages
    if (messages[msgIndex]?.role !== 'user') return;
    setEditingMessageIndex(msgIndex);
    setQuery(messages[msgIndex].content);
  };

  const handleSubmitEdit = () => {
    if (editingMessageIndex === null || !query.trim()) return;
    // Truncate messages to before the edited message
    const truncated = messages.slice(0, editingMessageIndex);
    setMessages(truncated);
    setSteps([]);
    // Send with the new query — handleSearch will append it as a new user message
    const editQuery = query;
    setEditingMessageIndex(null);
    handleSearch(editQuery);
  };

  const handleRegenerate = (msgIndex: number) => {
    // Find the preceding user message to re-send
    if (messages[msgIndex]?.role !== 'model') return;
    // Find the last user message before this AI message
    let userMsgIndex = -1;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userMsgIndex = i; break; }
    }
    if (userMsgIndex === -1) return;
    // Truncate to just before the user message
    const truncated = messages.slice(0, userMsgIndex);
    const userQuery = messages[userMsgIndex].content;
    setMessages(truncated);
    setSteps([]);
    handleSearch(userQuery);
  };

  const handleSwap = (activityName: string, dayIndex: number) => {
    handleSearch(`Please swap out "${activityName}" on Day ${dayIndex} for something else. Give me an updated plan.`);
  };

  const handleRemove = (activityName: string, dayIndex: number) => {
    handleSearch(`Please remove "${activityName}" on Day ${dayIndex} from the plan and update the rest of the schedule. Give me an updated plan.`);
  };

  // ── Photo Upload ──────────────────────────────────────────
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setPendingImage({ base64, mime: file.type, preview: dataUrl });
    };
    reader.readAsDataURL(file);
    // Reset the input so re-selecting the same file works
    e.target.value = '';
  };

  // ── Link Scraping ─────────────────────────────────────────
  const handleAddLink = async () => {
    if (!linkUrl.trim()) return;
    setLinkLoading(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkUrl })
      });
      const data = await res.json();
      if (data.error) {
        alert('Could not fetch that URL: ' + data.error);
      } else {
        // Inject the scraped content as a user message for the AI
        const contextMsg = `I found this page I'd like to incorporate into my trip:\n**${data.title}**\nURL: ${data.url}\n\nKey info: ${data.content.slice(0, 500)}`;
        handleSearch(contextMsg);
      }
    } catch (err) {
      alert('Failed to scrape URL');
    }
    setLinkLoading(false);
    setShowLinkModal(false);
    setLinkUrl('');
  };

  // ── Trip Notes ────────────────────────────────────────────
  const handleAddNote = () => {
    if (!noteText.trim()) return;
    setTripNotes(prev => [...prev, noteText.trim()]);
    setNoteText('');
    setShowNoteModal(false);
  };

  const handleDeleteNote = (idx: number) => {
    setTripNotes(prev => prev.filter((_, i) => i !== idx));
  };

  const startNewChat = () => {
    setMessages([]);
    setPlanHistory([]);
    setCurrentPlanIndex(-1);
    setCurrentSessionId(null);
    setSteps([]);
    setQuery('');
    setExpandedSteps(new Set());
    setTripNotes([]);
    setPendingImage(null);
  };

  // ── Community Handlers ────────────────────────────────────────
  const fetchCommunityFeed = async (search?: string) => {
    try {
      const url = search ? `/api/community/feed?destination=${encodeURIComponent(search)}` : '/api/community/feed';
      const res = await fetch(url);
      const data = await res.json();
      setCommunityTrips(data.trips || []);
    } catch (err) {
      console.error('Community feed error:', err);
    }
  };

  const handlePublish = async () => {
    if (!publishConsent || !plan || !token) return;
    try {
      const res = await fetch('/api/community/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          destination: publishDestination,
          title: plan.days?.[0]?.theme || 'Trip Plan',
          plan_json: JSON.stringify(plan),
          profile_summary: profilePreferences ? profilePreferences.slice(0, 200) : 'A traveler',
          consent: true,
          self_rating: publishSelfRating
        })
      });
      if (res.ok) {
        setShowPublishModal(false);
        setPublishConsent(false);
        setPublishSelfRating(0);
        alert('🎉 Trip published to the community!');
      } else {
        const data = await res.json();
        alert(data.detail || 'Publish failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleViewCommunityTrip = async (tripId: number) => {
    try {
      const res = await fetch(`/api/community/${tripId}`);
      const data = await res.json();
      setSelectedCommunityTrip(data);
      setReviewRating(0);
      setReviewComment('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedCommunityTrip || reviewRating === 0 || !token) return;
    try {
      const res = await fetch(`/api/community/${selectedCommunityTrip.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment })
      });
      if (res.ok) {
        // Refresh the trip detail
        handleViewCommunityTrip(selectedCommunityTrip.id);
        setReviewRating(0);
        setReviewComment('');
      } else {
        const data = await res.json();
        alert(data.detail || 'Review failed');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ── Profile helpers ────────────────────────────────────────
  const profileFormToText = (form: typeof profileForm) => {
    const parts: string[] = [];
    if (form.budget) parts.push(`Budget: ${form.budget}`);
    if (form.ageRange) parts.push(`Age: ${form.ageRange}`);
    if (form.identity) parts.push(`Traveling: ${form.identity}`);
    if (form.hobbies.length) parts.push(`Interests: ${form.hobbies.join(', ')}`);
    if (form.wakeUpTime) parts.push(`Wake-up: ${form.wakeUpTime}`);
    if (form.pace) parts.push(`Pace: ${form.pace}`);
    if (form.dietary) parts.push(`Dietary: ${form.dietary}`);
    return parts.length ? `[USER SELECTIONS]\n${parts.join(' | ')}` : '';
  };

  const toggleHobby = (hobby: string) => {
    setProfileForm(prev => ({
      ...prev,
      hobbies: prev.hobbies.includes(hobby) 
        ? prev.hobbies.filter(h => h !== hobby) 
        : [...prev.hobbies, hobby]
    }));
  };

  const handleOnboardingSubmit = async () => {
    const text = profileFormToText(profileForm);
    setProfilePreferences(text);
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username, preferences: text })
      });
    } catch (err) { console.error(err); }
    setShowOnboarding(false);
  };

  // ── Plan variant helpers ───────────────────────────────────
  const handleSelectVariant = (idx: number) => {
    setSelectedVariant(idx);
    const variant = planVariants[idx];
    if (variant) {
      // If it's an outline (no coordinates in first activity), ask LLM to expand
      const firstAct = variant.days?.[0]?.activities?.find((a: any) => a.type === 'activity');
      if (firstAct && !firstAct.coordinates) {
        // Expand outline into full plan
        const label = variant.label || String.fromCharCode(65 + idx);
        handleSearch(`I choose Plan ${label} ("${variant.style}"). Please expand it into a fully detailed plan with coordinates, logistics, travel segments, and descriptions.`);
      } else {
        // Already a full plan, set it directly
        const newHistory = [...planHistory];
        newHistory[currentPlanIndex] = variant;
        setPlanHistory(newHistory);
      }
    }
  };

  const scrollToActivity = useCallback((activityName: string) => {
    const id = `activity-${activityName.replace(/\s+/g, '-')}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash highlight
      el.style.transition = 'background 0.3s';
      el.style.background = 'rgba(8, 145, 178, 0.15)';
      setTimeout(() => { el.style.background = ''; }, 1500);
    }
  }, []);

  const getStepIcon = (type: string) => {
    switch(type) {
      case 'thought': return '💭';
      case 'action': return '🔧';
      case 'observation': return '👁️';
      case 'final': return '✅';
      default: return '•';
    }
  };

  const getStepColor = (type: string) => {
    switch(type) {
      case 'thought': return 'var(--accent-cyan)';
      case 'action': return 'var(--accent-orange)';
      case 'observation': return 'var(--accent-teal)';
      case 'final': return '#4ade80';
      default: return 'var(--text-secondary)';
    }
  };

  // Flatten all days' activities for the map
  const allActivities = plan?.days?.flatMap((day: any) => day.activities) || plan?.activities || [];

  return (
    <div className={styles.container}>
      {/* LEFT PANEL: Chat + ReAct Reasoning */}
      <div className={styles.leftPanel}>
        <div className={styles.header}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div className={styles.logo}>TRIP<span className={styles.accent}>AI</span></div>
            <div style={{display: 'flex', gap: '8px'}}>
              <button className={styles.iconBtn} onClick={startNewChat} title="New Chat">✚</button>
              {username && <button className={styles.iconBtn} onClick={fetchSessions} title="Saved Trips">📁</button>}
              <button className={styles.iconBtn} onClick={() => { setIsCommunityOpen(true); fetchCommunityFeed(); }} title="Community">🌍</button>
              <button 
                className={styles.modelToggleBtn}
                onClick={() => setModelChoice(prev => prev === 'gemini' ? 'local' : 'gemini')}
                title={`Switch model. Current: ${modelChoice === 'gemini' ? 'Gemini (Cloud)' : 'Qwen (Local)'}`}
              >
                {modelChoice === 'gemini' ? '☁️ Gemini' : '🖥️ Qwen-Local'}
              </button>
              <button className={styles.iconBtn} onClick={() => setIsProfileModalOpen(true)} title="Profile">👤</button>
            </div>
          </div>
          <div className={styles.subtitle}>AI Travel Agent · ReAct Reasoning · {modelChoice === 'local' ? 'Offline Mode' : 'Cloud Mode'}</div>
        </div>
        
        <div className={styles.chatBox}>
          {/* Welcome message */}
          {messages.length === 0 && (
            <div className={styles.agentMessage}>
              <div className={styles.avatar}>AI</div>
              <div className={styles.messageBubble}>
                Hello! Where would you like to travel? Tell me your destination and any specific preferences (food, pace, interests), and I'll build you a detailed itinerary.
              </div>
            </div>
          )}

          {/* Chat history */}
          {messages.map((msg, idx) => (
            <div key={`msg-${idx}`} className={`${msg.role === 'user' ? styles.userMessage : styles.agentMessage} ${styles.messageRow}`}>
              <div className={styles.avatar}>{msg.role === 'user' ? 'U' : 'AI'}</div>
              <div className={styles.messageBubble}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
              {!loading && (
                <div className={styles.messageActions}>
                  {msg.role === 'user' && (
                    <button 
                      className={styles.msgActionBtn} 
                      onClick={() => handleEditMessage(idx)} 
                      title="Edit & resend"
                    >✏️</button>
                  )}
                  {msg.role === 'model' && (
                    <button 
                      className={styles.msgActionBtn} 
                      onClick={() => handleRegenerate(idx)} 
                      title="Regenerate"
                    >🔄</button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* ReAct reasoning steps */}
          {steps.map((step, idx) => (
            <div key={idx} className={`${styles.stepContainer} ${styles[`step_${step.step_type}`]}`}>
              {step.step_type === 'final' && (step as any).is_success ? (
                <div className={styles.agentMessage}>
                  <div className={styles.avatar}>AI</div>
                  <div className={styles.messageBubble}>
                    ✅ Your itinerary is ready! Check the map and timeline on the right.
                  </div>
                </div>
              ) : step.step_type !== 'final' ? (
                <div className={styles.reasoningStep} onClick={() => toggleStep(idx)}>
                  <div className={styles.stepHeader}>
                    <span className={styles.stepIcon}>{getStepIcon(step.step_type)}</span>
                    <span className={styles.stepLabel} style={{ color: getStepColor(step.step_type) }}>
                      {step.step_type.toUpperCase()}
                      {step.tool_name && ` → ${step.tool_name}`}
                      {step.tool_input && `: "${step.tool_input}"`}
                    </span>
                    <span className={styles.expandToggle}>
                      {expandedSteps.has(idx) ? '▼' : '▶'}
                    </span>
                  </div>
                  {expandedSteps.has(idx) && (
                    <div className={styles.stepContent}>
                      {step.content}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ))}

          {loading && (
            <div className={styles.loadingIndicator}>
              <div className={styles.loadingDot}></div>
              <div className={styles.loadingDot}></div>
              <div className={styles.loadingDot}></div>
              <span>Agent is thinking...</span>
              <button className={styles.stopBtn} onClick={handleStop} title="Stop generating">
                ⏹ Stop
              </button>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        <div className={styles.inputArea}>
          {/* Hidden file input for photos */}
          <input type="file" ref={fileInputRef} accept="image/*" style={{display: 'none'}} onChange={handlePhotoSelect} />
          
          <div style={{position: 'relative'}}>
            <button className={styles.sendButton} style={{background: 'transparent', color: 'var(--accent-cyan)', border: '1px solid var(--border-subtle)', width: '36px', height: '36px', fontSize: '18px'}} onClick={() => setShowAttachMenu(!showAttachMenu)} title="Attach">
              ＋
            </button>
            {showAttachMenu && (
              <div style={{position: 'absolute', bottom: '48px', left: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: '150px', zIndex: 10}}>
                <button style={{display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', borderRadius: '6px'}} onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }}>
                  📷 Add Photo
                </button>
                <button style={{display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', borderRadius: '6px'}} onClick={() => { setShowAttachMenu(false); setShowLinkModal(true); }}>
                  🔗 Add Link
                </button>
                <button style={{display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', borderRadius: '6px'}} onClick={() => { setShowAttachMenu(false); setShowNoteModal(true); }}>
                  📄 Add Note
                </button>
              </div>
            )}
          </div>

          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '6px'}}>
            {/* Image preview strip */}
            {pendingImage && (
              <div style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', background: 'rgba(0,0,0,0.04)', borderRadius: '10px'}}>
                <img src={pendingImage.preview} alt="Attached" style={{width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover'}} />
                <span style={{fontSize: '12px', color: 'var(--text-secondary)', flex: 1}}>Photo attached — send a message to analyze it</span>
                <button onClick={() => setPendingImage(null)} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-secondary)'}}>✕</button>
              </div>
            )}
            {editingMessageIndex !== null && (
              <div style={{display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'rgba(8,145,178,0.08)', borderRadius: '8px', fontSize: '12px', color: 'var(--accent-cyan)'}}>
                ✏️ Editing message — press Enter or click send to re-submit
                <button onClick={() => { setEditingMessageIndex(null); setQuery(''); }} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginLeft: 'auto'}}>Cancel</button>
              </div>
            )}
            <input 
              type="text" 
              placeholder={editingMessageIndex !== null ? "Edit your message..." : pendingImage ? "Describe what you want to do with this photo..." : "Type your message... e.g. Plan a 3-day cultural trip to Tokyo"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={styles.inputField}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (editingMessageIndex !== null) handleSubmitEdit();
                  else handleSearch();
                }
              }}
              disabled={loading}
            />
          </div>
          <button 
            onClick={() => editingMessageIndex !== null ? handleSubmitEdit() : handleSearch()} 
            className={styles.sendButton} 
            disabled={loading}
          >
            {loading ? '⏳' : editingMessageIndex !== null ? '✏️' : '→'}
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: Map & Itinerary */}
      <div className={styles.rightPanel}>
        <div className={styles.mapContainer}>
          {plan ? (
            <MapComponent plan={{ activities: allActivities }} onMarkerClick={scrollToActivity} highlightedActivity={highlightedActivity} />
          ) : (
            <div className={styles.mapPlaceholder}>
              🗺️ Map will render here once a plan is generated
            </div>
          )}
        </div>
        
        <div className={styles.itineraryContainer}>
          <div className={styles.itineraryHeader} style={{ flexWrap: 'wrap', gap: '12px' }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '200px'}}>
              <h2>TRIP ITINERARY</h2>
              {plan && username && (
                <button 
                  className={styles.primaryBtn} 
                  style={{fontSize: '13px', padding: '6px 14px', borderRadius: '20px', marginLeft: 'auto'}}
                  onClick={() => { setShowPublishModal(true); setPublishDestination(''); }}
                >
                  🌍 Share to Community
                </button>
              )}
            </div>
            {planHistory.length > 1 && (
              <div className={styles.historyNav}>
                <button 
                  disabled={currentPlanIndex === 0} 
                  onClick={() => setCurrentPlanIndex(prev => prev - 1)}
                  className={styles.navBtn}
                  style={{whiteSpace: 'nowrap'}}
                >
                  ◀ Prev
                </button>
                <span className={styles.historyCount} style={{whiteSpace: 'nowrap'}}>v{currentPlanIndex + 1}/{planHistory.length}</span>
                <button 
                  disabled={currentPlanIndex === planHistory.length - 1} 
                  onClick={() => setCurrentPlanIndex(prev => prev + 1)}
                  className={styles.navBtn}
                  style={{whiteSpace: 'nowrap'}}
                >
                  Next ▶
                </button>
              </div>
            )}
            {planVariants.length > 1 && (
              <div className={styles.planVariantTabs}>
                {planVariants.map((v: any, i: number) => (
                  <button
                    key={i}
                    className={`${styles.planVariantTab} ${selectedVariant === i ? styles.planVariantTabActive : ''}`}
                    onClick={() => handleSelectVariant(i)}
                  >
                    Plan {v.label || String.fromCharCode(65 + i)}
                    <span style={{fontSize: '10px', opacity: 0.7, marginLeft: '4px'}}>{v.style}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {plan?.days ? (
            <div className={styles.timeline}>
              {plan.days.map((day: any, dayIdx: number) => (
                <div key={dayIdx} className={styles.dayBlock}>
                  <div className={styles.dayHeader}>
                    Day {day.day_index} — {day.date} ({day.theme})
                  </div>
                  {day.activities.map((item: any, idx: number) => (
                    <div key={idx} className={styles.timelineItem} id={`activity-${item.name?.replace(/\s+/g, '-')}`}>
                      {item.type === 'activity' ? (
                        <div 
                          className={`${styles.locationCard} ${highlightedActivity === item.name ? styles.highlightedCard : ''}`}
                          onClick={() => setHighlightedActivity(highlightedActivity === item.name ? null : item.name)}
                          style={{cursor: 'pointer'}}
                        >
                          <div className={styles.timeLabel}>{item.time_start}</div>
                          <div className={styles.cardContent}>
                            <div className={styles.cardHeader}>
                              <h3>{item.name}</h3>
                              {item.rating && <span className={styles.rating}>★ {item.rating}</span>}
                            </div>
                            <p>{item.description}</p>
                            
                            {item.ethical_note && (
                              <div className={styles.warningBox}>
                                <strong>⚠️ Note:</strong> {item.ethical_note}
                              </div>
                            )}

                            {item.logistics && (
                              <table className={styles.logisticsTable}>
                                <tbody>
                                  {item.logistics.ticket_price && (
                                    <tr><td><strong>Price:</strong></td><td>{item.logistics.ticket_price}</td></tr>
                                  )}
                                  {item.logistics.opening_time && item.logistics.closing_time && (
                                    <tr><td><strong>Hours:</strong></td><td>{item.logistics.opening_time} - {item.logistics.closing_time}</td></tr>
                                  )}
                                  {item.logistics.closed_days && (
                                    <tr><td><strong>Closed:</strong></td><td>{item.logistics.closed_days}</td></tr>
                                  )}
                                  {item.logistics.reservation_info && (
                                    <tr><td><strong>Booking:</strong></td><td>{item.logistics.reservation_info}</td></tr>
                                  )}
                                  {item.logistics.official_website && /^https?:\/\/.+/.test(item.logistics.official_website) && (
                                    <tr><td><strong>Link:</strong></td><td><a href={item.logistics.official_website} target="_blank" rel="noreferrer">Official Website</a></td></tr>
                                  )}
                                </tbody>
                              </table>
                            )}

                            <div className={styles.richData}>
                              {!item.logistics && item.official_website && /^https?:\/\/.+/.test(item.official_website) && (
                                <a href={item.official_website} target="_blank" rel="noreferrer">
                                  🌐 Official Website
                                </a>
                              )}
                              {!item.logistics && item.train_schedule && (
                                <span>🚆 {item.train_schedule}</span>
                              )}
                            </div>
                            <div className={styles.cardActions} style={{marginTop: '8px'}}>
                              <button className={styles.swapBtn} onClick={() => handleSwap(item.name, day.day_index)}>⇄ Swap</button>
                              <button className={styles.removeBtn} onClick={() => handleRemove(item.name, day.day_index)}>✕ Remove</button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.travelCard}>
                          <span className={styles.travelIcon}>
                            {item.mode === 'walk' ? '🚶' : item.mode === 'taxi' ? '🚕' : '🚇'}
                          </span>
                          <div>
                            <div>Travel: {item.duration_mins} min ({item.instructions})</div>
                            {item.roadmap_instructions && <div style={{fontSize: '10px', color: 'var(--accent-teal)', marginTop: '2px'}}>{item.roadmap_instructions}</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>Your itinerary will appear here once planned.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── TRIP NOTES PANEL ─────────────────────────── */}
      {tripNotes.length > 0 && (
        <div style={{position: 'fixed', bottom: '12px', right: '12px', width: '280px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 900, maxHeight: '200px', overflowY: 'auto'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
            <span style={{fontWeight: 600, fontSize: '12px', color: 'var(--accent-cyan)', letterSpacing: '1px'}}>📌 TRIP NOTES</span>
          </div>
          {tripNotes.map((note, idx) => (
            <div key={idx} style={{display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px'}}>
              <span style={{flex: 1, color: 'var(--text-primary)', lineHeight: 1.4}}>{note}</span>
              <button onClick={() => handleDeleteNote(idx)} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── LINK MODAL ───────────────────────────────── */}
      {showLinkModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowLinkModal(false); setLinkUrl(''); }}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3>🔗 Add a Link</h3>
            <p style={{fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0 16px'}}>
              Paste a URL (hotel, restaurant, attraction, event page) and the AI will incorporate it into your trip.
            </p>
            <input 
              type="url" 
              placeholder="https://www.example.com/..." 
              value={linkUrl} 
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddLink()}
              className={styles.modalInput}
              style={{width: '100%', marginBottom: '16px'}}
              autoFocus
            />
            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={() => { setShowLinkModal(false); setLinkUrl(''); }}>Cancel</button>
              <button className={styles.primaryBtn} onClick={handleAddLink} disabled={linkLoading || !linkUrl.trim()}>
                {linkLoading ? 'Fetching...' : 'Add to Trip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTE MODAL ───────────────────────────────── */}
      {showNoteModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowNoteModal(false); setNoteText(''); }}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3>📄 Add a Note</h3>
            <p style={{fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0 16px'}}>
              Pin a reminder, hotel info, flight details, or any useful note to your trip.
            </p>
            <textarea 
              placeholder="e.g. Hotel check-in at 3pm, Room #1204. Flight CZ3456 arrives 8:15am."
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              className={styles.modalTextarea}
              style={{width: '100%', minHeight: '80px', marginBottom: '16px'}}
              autoFocus
            />
            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={() => { setShowNoteModal(false); setNoteText(''); }}>Cancel</button>
              <button className={styles.primaryBtn} onClick={handleAddNote} disabled={!noteText.trim()}>Pin Note</button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMMUNITY SIDEBAR ────────────────────────── */}
      {isCommunityOpen && (
        <div className={styles.sidebarOverlay} onClick={() => { setIsCommunityOpen(false); setSelectedCommunityTrip(null); }}>
          <div className={styles.sidebarContent} onClick={e => e.stopPropagation()}>
            <div className={styles.sidebarHeader}>
              {selectedCommunityTrip ? (
                <h3 
                  style={{cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'}} 
                  onClick={() => setSelectedCommunityTrip(null)}
                  title="Back to Feed"
                >
                  <span style={{fontSize: '18px'}}>←</span> Trip Detail
                </h3>
              ) : (
                <h3>🌍 Community Trips</h3>
              )}
              <button className={styles.closeBtn} onClick={() => { setIsCommunityOpen(false); setSelectedCommunityTrip(null); }}>✕</button>
            </div>

            {selectedCommunityTrip ? (
              /* ── Trip Detail View ── */
              <div style={{padding: '16px', overflowY: 'auto', flex: 1}}>
                <div className={styles.communityDestination}>{selectedCommunityTrip.destination}</div>
                <div className={styles.communityTitle} style={{fontSize: '16px', marginBottom: '8px'}}>{selectedCommunityTrip.title}</div>
                <div className={styles.communityMeta}>
                  <span className={styles.communityBadge}>★ {selectedCommunityTrip.avg_rating || 'New'} · {selectedCommunityTrip.review_count} reviews</span>
                </div>
                <div className={styles.communityProfile} style={{marginBottom: '12px'}}>🧳 <ReactMarkdown>{selectedCommunityTrip.profile_summary}</ReactMarkdown></div>
                {selectedCommunityTrip.tags && (
                  <div className={styles.communityTags} style={{marginBottom: '12px'}}>
                    {selectedCommunityTrip.tags.split(',').map((tag: string, i: number) => (
                      <span key={i} className={styles.tagBadge}>{tag.trim()}</span>
                    ))}
                  </div>
                )}

                {/* Plan preview */}
                {selectedCommunityTrip.plan?.days?.map((day: any, idx: number) => (
                  <div key={idx} style={{marginBottom: '12px'}}>
                    <div style={{fontWeight: 600, fontSize: '12px', color: 'var(--accent-cyan)', marginBottom: '4px'}}>Day {day.day_index} — {day.theme}</div>
                    {day.activities?.filter((a: any) => a.type === 'activity').map((a: any, i: number) => (
                      <div key={i} style={{fontSize: '12px', padding: '2px 0', paddingLeft: '12px', borderLeft: '2px solid var(--border-subtle)'}}>
                        {a.time_start} {a.name}
                      </div>
                    ))}
                  </div>
                ))}

                {/* Review section */}
                <div style={{borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: '16px'}}>
                  <div style={{fontWeight: 600, fontSize: '13px', marginBottom: '8px'}}>Reviews</div>
                  
                  {/* Submit review (logged-in users only) */}
                  {username && (
                    <div style={{marginBottom: '12px', padding: '10px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px'}}>
                      <div className={styles.starRating} style={{marginBottom: '6px'}}>
                        {[1,2,3,4,5].map(n => (
                          <button key={n} className={`${styles.star} ${n <= reviewRating ? styles.starActive : ''}`} onClick={() => setReviewRating(n)}>★</button>
                        ))}
                      </div>
                      <textarea 
                        placeholder="Optional comment..." 
                        value={reviewComment} 
                        onChange={e => setReviewComment(e.target.value)}
                        style={{width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', resize: 'vertical', minHeight: '40px', color: 'var(--text-primary)'}}
                      />
                      <button className={styles.primaryBtn} onClick={handleSubmitReview} disabled={reviewRating === 0} style={{marginTop: '6px', fontSize: '12px', padding: '6px 12px'}}>
                        Submit Review
                      </button>
                    </div>
                  )}

                  {selectedCommunityTrip.reviews?.map((r: any) => (
                    <div key={r.id} className={styles.reviewCard}>
                      <div className={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                      {r.comment && <div className={styles.reviewComment}><ReactMarkdown>{r.comment}</ReactMarkdown></div>}
                      <div className={styles.reviewAuthor}>{r.username} · {new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                  ))}
                  {(!selectedCommunityTrip.reviews || selectedCommunityTrip.reviews.length === 0) && (
                    <div style={{color: 'var(--text-secondary)', fontSize: '12px', fontStyle: 'italic'}}>No reviews yet. Be the first!</div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Feed View ── */
              <div style={{padding: '16px', overflowY: 'auto', flex: 1}}>
                <input 
                  className={styles.communitySearch}
                  placeholder="Search by destination..." 
                  value={communitySearch}
                  onChange={e => { setCommunitySearch(e.target.value); fetchCommunityFeed(e.target.value || undefined); }}
                />
                <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                  {communityTrips.map((trip: any) => (
                    <div key={trip.id} className={styles.communityCard} onClick={() => handleViewCommunityTrip(trip.id)}>
                      <div className={styles.communityDestination}>{trip.destination}</div>
                      <div className={styles.communityTitle}>{trip.title}</div>
                      <div className={styles.communityProfile}>🧳 <ReactMarkdown>{trip.profile_summary?.slice(0, 80) || ''}</ReactMarkdown></div>
                      {trip.tags && (
                        <div className={styles.communityTags}>
                          {trip.tags.split(',').map((tag: string, i: number) => (
                            <span key={i} className={styles.tagBadge}>{tag.trim()}</span>
                          ))}
                        </div>
                      )}
                      <div className={styles.communityMeta}>
                        <span className={styles.communityBadge}>★ {trip.avg_rating || 'New'} · {trip.review_count} reviews</span>
                        <span>{new Date(trip.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                  {communityTrips.length === 0 && (
                    <div className={styles.emptyText}>No trips published yet. Be the first to share!</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PUBLISH MODAL ────────────────────────────── */}
      {showPublishModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowPublishModal(false); setPublishConsent(false); }}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{width: '450px'}}>
            <h3>🌍 Share to Community</h3>
            <p style={{fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 16px'}}>
              Share your trip plan anonymously so other travelers can discover and build on it.
            </p>

            <label style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px'}}>Destination</label>
            <input 
              className={styles.modalInput}
              placeholder="e.g. Shanghai, Tokyo, Barcelona" 
              value={publishDestination}
              onChange={e => setPublishDestination(e.target.value)}
              style={{width: '100%', marginBottom: '12px'}}
            />

            <label style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px'}}>What will be shared</label>
            <div className={styles.publishPreview}>
              <strong>Title:</strong> {plan?.days?.[0]?.theme || 'Trip Plan'}<br/>
              <strong>Activities:</strong> {plan?.days?.flatMap((d: any) => d.activities?.filter((a: any) => a.type === 'activity').map((a: any) => a.name)).join(', ')}<br/>
              <strong>Your profile (anonymized):</strong> {profilePreferences ? profilePreferences.slice(0, 100) + '...' : 'A traveler'}
            </div>

            <label style={{fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px'}}>Rate your plan</label>
            <div className={styles.starRating} style={{marginBottom: '12px'}}>
              {[1,2,3,4,5].map(n => (
                <button key={n} className={`${styles.star} ${n <= publishSelfRating ? styles.starActive : ''}`} onClick={() => setPublishSelfRating(n)}>★</button>
              ))}
              <span style={{fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px'}}>{publishSelfRating > 0 ? `${publishSelfRating}/5` : 'Optional'}</span>
            </div>

            <div className={styles.consentBox}>
              <input type="checkbox" id="publishConsent" checked={publishConsent} onChange={e => setPublishConsent(e.target.checked)} />
              <label htmlFor="publishConsent">
                I agree to share this trip plan <strong>anonymously</strong> with the TripAI community. My username and personal details will not be displayed. Other users may view, rate, and use this plan as reference.
              </label>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.secondaryBtn} onClick={() => { setShowPublishModal(false); setPublishConsent(false); }}>Cancel</button>
              <button className={styles.primaryBtn} onClick={handlePublish} disabled={!publishConsent || !publishDestination.trim()}>
                Publish Trip
              </button>
            </div>
          </div>
        </div>
      )}

      {isProfileModalOpen && !isLoggedIn && (
        <div className={styles.authOverlay} onClick={() => setIsProfileModalOpen(false)}>
          <div className={styles.authCard} onClick={e => e.stopPropagation()}>
            <h2 className={styles.authLogo}>TRIP<span className={styles.accent}>AI</span></h2>
            <p className={styles.authSubtitle}>Sign in to save trips and build your profile</p>
            <div className={styles.authInputGroup}>
              <label>Username</label>
              <input 
                className={styles.authInput} 
                type="text" 
                value={authUsername} 
                onChange={e => setAuthUsername(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="e.g. wanderlust99"
                autoComplete="off"
              />
            </div>
            <div className={styles.authInputGroup}>
              <label>Password</label>
              <input 
                className={styles.authInput} 
                type="password" 
                value={authPassword} 
                onChange={e => setAuthPassword(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Enter password"
                autoComplete="off"
              />
            </div>
            <div className={styles.authBtnContainer}>
              <button className={styles.authPrimaryBtn} onClick={handleLogin}>Log In</button>
              <button className={styles.authSecondaryBtn} onClick={handleRegister}>Create Account</button>
            </div>
          </div>
        </div>
      )}

      {isProfileModalOpen && isLoggedIn && (
        <div className={styles.sidebarOverlay} onClick={() => setIsProfileModalOpen(false)}>
          <div className={styles.sidebarContent} onClick={e => e.stopPropagation()} style={{maxWidth: '420px'}}>
            <div className={styles.sidebarHeader}>
              <h3>Profile ({username})</h3>
              <button className={styles.closeBtn} onClick={() => setIsProfileModalOpen(false)}>✕</button>
            </div>
            <div style={{padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px'}}>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>💰 Budget</label>
                <div className={styles.pillGroup}>
                  {['backpacker', 'moderate', 'luxury', 'no-limit'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.budget === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, budget: v}))}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>🎂 Age Range</label>
                <div className={styles.pillGroup}>
                  {['18-24', '25-34', '35-49', '50+'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.ageRange === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, ageRange: v}))}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>👥 Traveling As</label>
                <div className={styles.pillGroup}>
                  {['solo', 'couple', 'family', 'friends'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.identity === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, identity: v}))}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>🎯 Interests</label>
                <div className={styles.pillGroup}>
                  {['food', 'art', 'nightlife', 'nature', 'history', 'adventure', 'shopping', 'photography'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.hobbies.includes(v) ? styles.pillActive : ''}`} onClick={() => toggleHobby(v)}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>⏰ Wake-up Style</label>
                <div className={styles.pillGroup}>
                  {['early-bird', 'normal', 'late-riser'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.wakeUpTime === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, wakeUpTime: v}))}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>🚶 Pace</label>
                <div className={styles.pillGroup}>
                  {['relaxed', 'moderate', 'packed'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.pace === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, pace: v}))}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>🥗 Dietary</label>
                <div className={styles.pillGroup}>
                  {['none', 'vegetarian', 'vegan', 'halal', 'kosher', 'gluten-free'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.dietary === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, dietary: v}))}>{v}</button>
                  ))}
                </div>
              </div>

              {/* AI Learned section */}
              {profilePreferences.includes('[AI LEARNED]') && (
                <div className={styles.profileSection}>
                  <label className={styles.profileLabel}>🤖 AI Learned</label>
                  <div style={{fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-glass)', padding: '10px', borderRadius: '8px', lineHeight: 1.5, border: '1px solid var(--border-subtle)'}}>
                    {profilePreferences.split('[AI LEARNED]')[1]?.trim() || 'Nothing learned yet.'}
                  </div>
                </div>
              )}

              <div style={{display: 'flex', gap: '12px', justifyContent: 'space-between', paddingTop: '8px'}}>
                <button className={styles.secondaryBtn} onClick={() => {setIsLoggedIn(false); setUsername(''); setAuthUsername(''); setAuthPassword(''); setIsProfileModalOpen(false); localStorage.removeItem('tripai_token'); localStorage.removeItem('tripai_username');}}>Logout</button>
                <button onClick={() => { const text = profileFormToText(profileForm); const aiSection = profilePreferences.includes('[AI LEARNED]') ? '\n\n' + profilePreferences.split('[AI LEARNED]').slice(1).map(s => '[AI LEARNED]' + s).join('') : ''; setProfilePreferences(text + aiSection); handleSaveProfile(); }} className={styles.primaryBtn}>Save Profile</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ONBOARDING MODAL ──────────────────────── */}
      {showOnboarding && (
        <div className={styles.authOverlay}>
          <div className={styles.authCard} style={{maxWidth: '480px'}}>
            <h2 className={styles.authLogo}>Welcome to TRIP<span className={styles.accent}>AI</span></h2>
            <p className={styles.authSubtitle}>Tell us about yourself so we can personalize your trips</p>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px', margin: '16px 0'}}>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>💰 Budget</label>
                <div className={styles.pillGroup}>
                  {['backpacker', 'moderate', 'luxury', 'no-limit'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.budget === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, budget: v}))}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>🎂 Age</label>
                <div className={styles.pillGroup}>
                  {['18-24', '25-34', '35-49', '50+'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.ageRange === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, ageRange: v}))}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>👥 Traveling As</label>
                <div className={styles.pillGroup}>
                  {['solo', 'couple', 'family', 'friends'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.identity === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, identity: v}))}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>🎯 Interests</label>
                <div className={styles.pillGroup}>
                  {['food', 'art', 'nightlife', 'nature', 'history', 'adventure', 'shopping', 'photography'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.hobbies.includes(v) ? styles.pillActive : ''}`} onClick={() => toggleHobby(v)}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>⏰ Wake-up</label>
                <div className={styles.pillGroup}>
                  {['early-bird', 'normal', 'late-riser'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.wakeUpTime === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, wakeUpTime: v}))}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>🚶 Pace</label>
                <div className={styles.pillGroup}>
                  {['relaxed', 'moderate', 'packed'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.pace === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, pace: v}))}>{v}</button>
                  ))}
                </div>
              </div>
              <div className={styles.profileSection}>
                <label className={styles.profileLabel}>🥗 Dietary</label>
                <div className={styles.pillGroup}>
                  {['none', 'vegetarian', 'vegan', 'halal', 'kosher', 'gluten-free'].map(v => (
                    <button key={v} className={`${styles.pill} ${profileForm.dietary === v ? styles.pillActive : ''}`} onClick={() => setProfileForm(p => ({...p, dietary: v}))}>{v}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.authBtnContainer}>
              <button className={styles.authSecondaryBtn} onClick={() => setShowOnboarding(false)}>Skip</button>
              <button className={styles.authPrimaryBtn} onClick={handleOnboardingSubmit}>Save & Start</button>
            </div>
          </div>
        </div>
      )}

      {isSidebarOpen && (
        <div className={styles.sidebarOverlay} onClick={() => setIsSidebarOpen(false)}>
          <div className={styles.sidebarContent} onClick={e => e.stopPropagation()}>
            <div className={styles.sidebarHeader}>
              <h3>Saved Trips ({username})</h3>
              <button className={styles.closeBtn} onClick={() => setIsSidebarOpen(false)}>✕</button>
            </div>
            <div className={styles.sessionList}>
              {savedSessions.length === 0 && <p className={styles.emptyText}>No saved trips.</p>}
              {savedSessions.map(session => (
                <div key={session.id} className={styles.sessionCard} onClick={() => loadSession(session.id)}>
                  <div className={styles.sessionTitle}>{session.title}</div>
                  <div className={styles.sessionDate}>{new Date(session.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
