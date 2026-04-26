'use client';

import { useState } from 'react';
import styles from './page.module.css';

export default function Home() {
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      if (data.plan) {
        setPlan(data.plan);
      }
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <div className={styles.container}>
      {/* LEFT PANEL: Chat Interface */}
      <div className={styles.leftPanel}>
        <div className={styles.header}>
          <h1 className={styles.logo}>TRIP<span className={styles.accent}>AI</span></h1>
          <p>AI Travel Agent</p>
        </div>
        
        <div className={styles.chatBox}>
          <div className={styles.agentMessage}>
            <div className={styles.avatar}>AI</div>
            <div className={styles.messageBubble}>
              Hello! Where would you like to travel today? I can help plan a detailed day-by-day itinerary.
            </div>
          </div>
          
          {plan && (
            <div className={styles.agentMessage}>
              <div className={styles.avatar}>AI</div>
              <div className={styles.messageBubble}>
                Here is a draft for your adventure. I've focused on {plan.theme} for Day {plan.day_index}.
              </div>
            </div>
          )}
        </div>

        <div className={styles.inputArea}>
          <input 
            type="text" 
            placeholder="e.g. Plan a 3-day cultural trip to Kyoto" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.inputField}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} className={styles.sendButton} disabled={loading}>
            {loading ? '...' : '→'}
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: Map & Itinerary */}
      <div className={styles.rightPanel}>
        <div className={styles.mapContainer}>
          {/* Mock Map View */}
          <div className={styles.mapPlaceholder}>
             Map Integration will render here
          </div>
        </div>
        
        <div className={styles.itineraryContainer}>
          <h2>TRIP ITINERARY</h2>
          {plan ? (
            <div className={styles.timeline}>
              <div className={styles.dayHeader}>
                Day {plan.day_index} - {plan.date} ({plan.theme})
              </div>
              
              {plan.activities.map((item: any, idx: number) => (
                <div key={idx} className={styles.timelineItem}>
                  {item.type === 'activity' ? (
                    <div className={styles.locationCard}>
                      <div className={styles.timeLabel}>{item.time_start}</div>
                      <div className={styles.cardContent}>
                        <div className={styles.cardHeader}>
                          <h3>{item.name}</h3>
                          <span className={styles.rating}>★ {item.rating}</span>
                        </div>
                        <p>{item.description}</p>
                        <div className={styles.cardActions}>
                           <button className={styles.swapBtn}>⇄ Swap</button>
                           <button className={styles.removeBtn}>✕ Remove</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.travelCard}>
                      <span className={styles.travelIcon}>🚗</span>
                      Travel: {item.duration_mins} min ({item.instructions})
                    </div>
                  )}
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
    </div>
  );
}
