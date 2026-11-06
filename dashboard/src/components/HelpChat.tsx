import { useState, useRef, useEffect } from 'react';
import { MessageCircleQuestion, X, Send, Languages, Loader, Sparkles } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  lang: string;
  timestamp: string;
}

const LANG_OPTIONS = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'gu', label: 'ગુજરાતી', flag: '🇮🇳' },
];

const FAQ_SUGGESTIONS: Record<string, { q: string; emoji: string }[]> = {
  en: [
    { q: 'What is NETRA and how does it work?', emoji: '🔍' },
    { q: 'How does threat classification work?', emoji: '🛡️' },
    { q: 'How to use the Alert Center?', emoji: '🚨' },
    { q: 'What platforms does NETRA monitor?', emoji: '📡' },
    { q: 'How does the Geo Map work?', emoji: '🗺️' },
    { q: 'What is Z-Score in Trends?', emoji: '📈' },
  ],
  hi: [
    { q: 'NETRA क्या है और यह कैसे काम करता है?', emoji: '🔍' },
    { q: 'खतरे का वर्गीकरण कैसे काम करता है?', emoji: '🛡️' },
    { q: 'अलर्ट सेंटर का उपयोग कैसे करें?', emoji: '🚨' },
    { q: 'NETRA कौन से प्लेटफॉर्म की निगरानी करता है?', emoji: '📡' },
    { q: 'जियो मैप कैसे काम करता है?', emoji: '🗺️' },
    { q: 'ट्रेंड्स में Z-Score क्या है?', emoji: '📈' },
  ],
  gu: [
    { q: 'NETRA શું છે અને તે કેવી રીતે કામ કરે છે?', emoji: '🔍' },
    { q: 'ખતરાનું વર્ગીકરણ કેવી રીતે કામ કરે છે?', emoji: '🛡️' },
    { q: 'એલર્ટ સેન્ટરનો ઉપયોગ કેવી રીતે કરવો?', emoji: '🚨' },
    { q: 'NETRA કયા પ્લેટફોર્મનું નિરીક્ષણ કરે છે?', emoji: '📡' },
    { q: 'જીઓ મેપ કેવી રીતે કામ કરે છે?', emoji: '🗺️' },
    { q: 'ટ્રેન્ડ્સમાં Z-Score શું છે?', emoji: '📈' },
  ],
};

export default function HelpChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [lang, setLang] = useState('en');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(question: string) {
    if (!question.trim()) return;
    setHasUnread(false);
    const userMsg: ChatMessage = { role: 'user', text: question, lang, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const systemPrompts: Record<string, string> = {
        en: `You are NETRA Help Assistant — an AI helper for the NETRA Threat Intelligence platform. Answer user questions about NETRA features clearly and concisely in English. NETRA is a real-time social media threat monitoring system built for Indian law enforcement. It monitors YouTube, Twitter/X, Telegram, and Facebook. Features include: 1) Live Data Feed with keyword search, 2) AI-powered threat classification (IncitementToViolence, Inflammatory, FakeNews, Neutral), 3) Alert Center with severity-based filtering, 4) Geo Map with state/city drill-down, 5) Trend Monitor with Z-score spike detection, 6) Network Graph for relationship analysis, 7) Incident Reports, 8) AI Deepfake Detection, 9) Viral Spread Graph Analyzer, 10) Bhashini Government Translator for 12 Indian languages, 11) Watchlist Manager, 12) Model Performance Dashboard. Classification uses Groq LLM (qwen3.8-27b) with heuristic fallback. Keep answers under 150 words.`,
        hi: `आप NETRA हेल्प असिस्टेंट हैं — NETRA थ्रेट इंटेलिजेंस प्लेटफॉर्म के लिए एक AI सहायक। उपयोगकर्ता के सवालों का जवाब हिंदी में स्पष्ट और संक्षिप्त रूप से दें। NETRA भारतीय कानून प्रवर्तन के लिए बनाया गया रियल-टाइम सोशल मीडिया खतरा निगरानी प्रणाली है। यह YouTube, Twitter/X, Telegram और Facebook की निगरानी करता है। विशेषताएं: 1) लाइव डेटा फीड, 2) AI-संचालित खतरा वर्गीकरण (हिंसा, भड़काऊ, फेक न्यूज, तटस्थ), 3) अलर्ट सेंटर, 4) जियो मैप, 5) ट्रेंड मॉनिटर, 6) नेटवर्क ग्राफ, 7) इंसिडेंट रिपोर्ट, 8) AI डीपफेक डिटेक्शन, 9) वायरल स्प्रेड ग्राफ, 10) भाषिनी अनुवादक, 11) वॉचलिस्ट मैनेजर। उत्तर 150 शब्दों से कम रखें।`,
        gu: `તમે NETRA હેલ્પ આસિસ્ટન્ટ છો — NETRA થ્રેટ ઇન્ટેલિજન્સ પ્લેટફોર્મ માટે AI સહાયક। વપરાશકર્તાના પ્રશ્નોના જવાબ ગુજરાતીમાં સ્પષ્ટ અને સંક્ષિપ્તમાં આપો। NETRA ભારતીય કાયદા અમલીકરણ માટે બનાવવામાં આવેલ રીયલ-ટાઇમ સોશિયલ મીડિયા ખતરા નિરીક્ષણ સિસ્ટમ છે। તે YouTube, Twitter/X, Telegram અને Facebook નું નિરીક્ષણ કરે છે। વિશેષતાઓ: 1) લાઇવ ડેટા ફીડ, 2) AI-સંચાલિત ખતરા વર્ગીકરણ, 3) એલર્ટ સેન્ટર, 4) જીઓ મેપ, 5) ટ્રેન્ડ મોનિટર, 6) નેટવર્ક ગ્રાફ, 7) ઇન્સિડેન્ટ રિપોર્ટ, 8) AI ડીપફેક ડિટેક્શન, 9) વાયરલ સ્પ્રેડ ગ્રાફ, 10) ભાષિણી અનુવાદક, 11) વૉચલિસ્ટ મેનેજર। જવાબ 150 શબ્દોથી ઓછા રાખો।`,
      };

      const res = await fetch('/api/ai/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_prompt: true,
          system_prompt: systemPrompts[lang] || systemPrompts.en,
          user_prompt: question,
        }),
      });

      let answer = '';
      if (res.ok) {
        const data = await res.json();
        // If server returned fallback (Groq rate-limited), use client-side built-in answers
        if (data.model === 'fallback' || data.model === 'none') {
          answer = getBuiltInAnswer(question, lang);
        } else {
          answer = data.summary || data.answer || getBuiltInAnswer(question, lang);
        }
      } else {
        // Network error: use built-in answers
        answer = getBuiltInAnswer(question, lang);
      }

      setMessages(prev => [...prev, { role: 'assistant', text: answer, lang, timestamp: new Date().toISOString() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: getBuiltInAnswer(question, lang), lang, timestamp: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  }

  function getBuiltInAnswer(question: string, language: string): string {
    const q = question.toLowerCase();
    const answers: Record<string, Record<string, string>> = {
      netra: {
        en: 'NETRA (Network Threat Recognition & Analysis) is a real-time social media intelligence platform built for Indian law enforcement. It monitors YouTube, Twitter/X, Telegram, and Facebook for threats like incitement to violence, inflammatory content, and fake news. It uses AI-powered classification with Groq LLM and a multilingual heuristic fallback system supporting Hindi, Gujarati, and English.',
        hi: 'NETRA (नेटवर्क थ्रेट रिकग्निशन एंड एनालिसिस) भारतीय कानून प्रवर्तन के लिए बनाया गया एक रियल-टाइम सोशल मीडिया इंटेलिजेंस प्लेटफॉर्म है। यह YouTube, Twitter/X, Telegram और Facebook पर हिंसा के लिए उकसावे, भड़काऊ सामग्री और फेक न्यूज जैसे खतरों की निगरानी करता है।',
        gu: 'NETRA (નેટવર્ક થ્રેટ રેકગ્નિશન એન્ડ એનાલિસિસ) ભારતીય કાયદા અમલીકરણ માટે બનાવવામાં આવેલ રીયલ-ટાઇમ સોશિયલ મીડિયા ઇન્ટેલિજન્સ પ્લેટફોર્મ છે। તે YouTube, Twitter/X, Telegram અને Facebook પર હિંસા, ભડકાઉ સામગ્રી અને ફેક ન્યૂઝ જેવા ખતરાઓનું નિરીક્ષણ કરે છે।',
      },
      classification: {
        en: 'NETRA classifies posts into 4 categories: IncitementToViolence (calls for physical harm), Inflammatory (hate speech, communal targeting), FakeNews (misinformation, unverified claims), and Neutral (safe content). It uses Groq AI (qwen3.8-27b) as the primary classifier. When the API is rate-limited, it falls back to a robust multilingual keyword-based heuristic classifier covering English, Hindi, Gujarati, and Hinglish.',
        hi: 'NETRA पोस्ट को 4 श्रेणियों में वर्गीकृत करता है: हिंसा के लिए उकसावा, भड़काऊ, फेक न्यूज, और तटस्थ। यह Groq AI (qwen3.8-27b) का प्राथमिक वर्गीकरण के लिए उपयोग करता है। जब API सीमित होता है, तो यह हिंदी, गुजराती और अंग्रेजी में कीवर्ड-आधारित ह्यूरिस्टिक वर्गीकरण का उपयोग करता है।',
        gu: 'NETRA પોસ્ટને 4 શ્રેણીઓમાં વર્ગીકૃત કરે છે: હિંસા માટે ઉશ્કેરણી, ભડકાઉ, ફેક ન્યૂઝ, અને તટસ્થ। તે Groq AI (qwen3.8-27b) નો પ્રાથમિક વર્ગીકરણ માટે ઉપયોગ કરે છે।',
      },
      alert: {
        en: 'The Alert Center shows real-time threat alerts from classified posts. It includes both watchlist matches and AI-detected threats. You can filter by severity (1-5), category (Violence, Inflammatory, FakeNews, WatchlistMatch), and platform. Each alert card shows the post content preview, confidence score, and threat category badge.',
        hi: 'अलर्ट सेंटर वर्गीकृत पोस्ट से रियल-टाइम खतरा अलर्ट दिखाता है। इसमें वॉचलिस्ट मिलान और AI-पहचाने गए खतरे दोनों शामिल हैं। आप गंभीरता, श्रेणी और प्लेटफॉर्म के अनुसार फ़िल्टर कर सकते हैं।',
        gu: 'એલર્ટ સેન્ટર વર્ગીકૃત પોસ્ટમાંથી રીયલ-ટાઇમ ખતરા એલર્ટ બતાવે છે। તેમાં વૉચલિસ્ટ મેચ અને AI-શોધાયેલ ખતરા બંને સામેલ છે।',
      },
      platform: {
        en: 'NETRA monitors 4 major platforms: YouTube (via Data API v3 — transcript and metadata extraction), Twitter/X (API v2 — requires authentication), Telegram (public channel scraping + Bot API from 35+ Gujarat/India focused channels), and Facebook (Meta Graph API). Posts are fetched in real-time using the "Fetch Live Data" button on the Dashboard.',
        hi: 'NETRA 4 प्रमुख प्लेटफॉर्म की निगरानी करता है: YouTube (Data API v3), Twitter/X (API v2), Telegram (35+ चैनल), और Facebook (Meta Graph API)।',
        gu: 'NETRA 4 મુખ્ય પ્લેટફોર્મનું નિરીક્ષણ કરે છે: YouTube, Twitter/X, Telegram (35+ ચેનલ), અને Facebook.',
      },
      geo: {
        en: 'The Geo Map provides a 4-level drill-down: World → Country → State → City. It shows post density heatmaps and lets you click through to see individual posts at each location. Post locations are extracted from metadata, text mentions, and author profiles.',
        hi: 'जियो मैप 4-स्तरीय ड्रिल-डाउन प्रदान करता है: विश्व → देश → राज्य → शहर। यह पोस्ट घनत्व हीटमैप दिखाता है।',
        gu: 'જીઓ મેપ 4-સ્તરીય ડ્રિલ-ડાઉન પ્રદાન કરે છે: વિશ્વ → દેશ → રાજ્ય → શહેર.',
      },
      zscore: {
        en: 'Z-Score measures how abnormal a keyword spike is compared to its normal frequency. Z-Score ≥ 6 = Critical (extremely unusual spike), ≥ 4 = High, ≥ 3 = Medium. For example, if the word "riot" normally appears 5 times/hour but suddenly appears 50 times, that would generate a high Z-score, triggering a trend alert.',
        hi: 'Z-Score मापता है कि कोई कीवर्ड स्पाइक सामान्य आवृत्ति की तुलना में कितना असामान्य है। Z-Score ≥ 6 = गंभीर, ≥ 4 = उच्च, ≥ 3 = मध्यम।',
        gu: 'Z-Score માપે છે કે કોઈ કીવર્ડ સ્પાઇક સામાન્ય ફ્રિક્વન્સી ​​ની સરખામણીમાં કેટલો અસામાન્ય છે।',
      },
    };

    // Match question to topic
    for (const [topic, langs] of Object.entries(answers)) {
      if (q.includes(topic) || q.includes('netra') || q.includes('what is') || q.includes('क्या') || q.includes('શું')) {
        if (topic === 'netra' && (q.includes('netra') || q.includes('what') || q.includes('क्या') || q.includes('શું'))) {
          return langs[language] || langs.en;
        }
      }
      if (topic === 'classification' && (q.includes('classif') || q.includes('threat') || q.includes('वर्गीकरण') || q.includes('ખતરા') || q.includes('खतर'))) {
        return langs[language] || langs.en;
      }
      if (topic === 'alert' && (q.includes('alert') || q.includes('अलर्ट') || q.includes('એલર્ટ'))) {
        return langs[language] || langs.en;
      }
      if (topic === 'platform' && (q.includes('platform') || q.includes('monitor') || q.includes('प्लेटफॉर्म') || q.includes('પ્લેટફોર્મ'))) {
        return langs[language] || langs.en;
      }
      if (topic === 'geo' && (q.includes('geo') || q.includes('map') || q.includes('मैप') || q.includes('મેપ'))) {
        return langs[language] || langs.en;
      }
      if (topic === 'zscore' && (q.includes('z-score') || q.includes('zscore') || q.includes('trend') || q.includes('ट्रेंड') || q.includes('ટ્રેન્ડ'))) {
        return langs[language] || langs.en;
      }
    }

    // Default answer
    const defaults: Record<string, string> = {
      en: 'NETRA is a comprehensive threat intelligence platform. Please try asking about specific features like classification, alerts, geo map, trends, deepfake detection, or Bhashini translation.',
      hi: 'NETRA एक व्यापक खतरा इंटेलिजेंस प्लेटफॉर्म है। कृपया वर्गीकरण, अलर्ट, जियो मैप, ट्रेंड्स, डीपफेक डिटेक्शन या भाषिनी अनुवाद जैसी विशिष्ट सुविधाओं के बारे में पूछने का प्रयास करें।',
      gu: 'NETRA એક વ્યાપક ખતરા ઇન્ટેલિજન્સ પ્લેટફોર્મ છે। કૃપા કરીને વર્ગીકરણ, એલર્ટ, જીઓ મેપ, ટ્રેન્ડ્સ, ડીપફેક ડિટેક્શન અથવા ભાષિણી અનુવાદ જેવી ચોક્કસ સુવિધાઓ વિશે પૂછવાનો પ્રયાસ કરો.',
    };
    return defaults[language] || defaults.en;
  }

  const currentLangObj = LANG_OPTIONS.find(l => l.code === lang)!;

  return (
    <>
      {/* Floating Red Dot Button */}
      <button
        onClick={() => { setIsOpen(!isOpen); setHasUnread(false); }}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000,
          width: '56px', height: '56px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(239,68,68,0.5)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        title="NETRA Help Assistant"
      >
        {isOpen ? (
          <X size={24} color="white" />
        ) : (
          <MessageCircleQuestion size={24} color="white" />
        )}
        {/* Pulse animation */}
        {hasUnread && !isOpen && (
          <span style={{
            position: 'absolute', top: '-2px', right: '-2px',
            width: '16px', height: '16px', borderRadius: '50%',
            background: '#facc15', border: '2px solid #1a1a2e',
            animation: 'helpPulse 1.5s ease-in-out infinite',
          }} />
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: '92px', right: '24px', zIndex: 10000,
          width: '400px', maxHeight: '560px',
          background: 'var(--bg-primary, #0f0f23)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '16px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'helpSlideUp 0.3s ease-out',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.05))',
            borderBottom: '1px solid rgba(239,68,68,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={18} color="#ef4444" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #e8eaf0)' }}>
                  NETRA Help Assistant
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted, #6b7280)' }}>
                  AI-powered · Multilingual
                </div>
              </div>
            </div>

            {/* Language Selector */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {LANG_OPTIONS.map(l => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  style={{
                    padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '11px', fontWeight: 600, border: 'none',
                    background: lang === l.code ? 'rgba(239,68,68,0.2)' : 'transparent',
                    color: lang === l.code ? '#ef4444' : 'var(--text-muted, #6b7280)',
                    transition: 'all 0.15s',
                  }}
                >
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '16px',
            maxHeight: '360px', minHeight: '200px',
          }}>
            {messages.length === 0 ? (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛡️</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary, #9ca3af)', lineHeight: 1.6 }}>
                    {lang === 'hi' ? 'NETRA के बारे में कुछ भी पूछें!' :
                     lang === 'gu' ? 'NETRA વિશે કંઈપણ પૂછો!' :
                     'Ask me anything about NETRA!'}
                  </div>
                </div>

                {/* FAQ Suggestions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(FAQ_SUGGESTIONS[lang] || FAQ_SUGGESTIONS.en).map((faq, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(faq.q)}
                      style={{
                        padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                        background: 'var(--bg-secondary, rgba(255,255,255,0.05))',
                        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                        color: 'var(--text-secondary, #9ca3af)',
                        fontSize: '12px', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
                        e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
                        e.currentTarget.style.color = 'var(--text-primary, #e8eaf0)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--bg-secondary, rgba(255,255,255,0.05))';
                        e.currentTarget.style.borderColor = 'var(--border-subtle, rgba(255,255,255,0.08))';
                        e.currentTarget.style.color = 'var(--text-secondary, #9ca3af)';
                      }}
                    >
                      <span>{faq.emoji}</span>
                      <span>{faq.q}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: '10px',
                }}>
                  <div style={{
                    maxWidth: '85%', padding: '10px 14px', borderRadius: '12px',
                    fontSize: '13px', lineHeight: 1.6,
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                      : 'var(--bg-secondary, rgba(255,255,255,0.05))',
                    color: msg.role === 'user' ? 'white' : 'var(--text-primary, #e8eaf0)',
                    border: msg.role === 'assistant' ? '1px solid var(--border-subtle, rgba(255,255,255,0.08))' : 'none',
                  }}>
                    {msg.text}
                    <div style={{
                      fontSize: '10px', marginTop: '4px',
                      color: msg.role === 'user' ? 'rgba(255,255,255,0.6)' : 'var(--text-muted, #6b7280)',
                      textAlign: 'right',
                    }}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.role === 'assistant' && ` · ${LANG_OPTIONS.find(l => l.code === msg.lang)?.flag || ''}`}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Loading indicator */}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '10px' }}>
                <div style={{
                  padding: '12px 16px', borderRadius: '12px',
                  background: 'var(--bg-secondary, rgba(255,255,255,0.05))',
                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '13px', color: 'var(--text-muted, #6b7280)',
                }}>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  {lang === 'hi' ? 'सोच रहा हूँ...' : lang === 'gu' ? 'વિચારી રહ્યો છું...' : 'Thinking...'}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
            display: 'flex', gap: '8px', alignItems: 'center',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '4px 8px', borderRadius: '6px',
              background: 'rgba(239,68,68,0.08)', fontSize: '11px',
              color: '#ef4444', fontWeight: 600,
            }}>
              {currentLangObj.flag}
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) sendMessage(input); }}
              placeholder={lang === 'hi' ? 'अपना सवाल पूछें...' : lang === 'gu' ? 'તમારો પ્રશ્ન પૂછો...' : 'Ask your question...'}
              disabled={loading}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: '10px',
                border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                background: 'var(--bg-tertiary, rgba(0,0,0,0.2))',
                color: 'var(--text-primary, #e8eaf0)',
                fontSize: '13px', outline: 'none',
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                width: '38px', height: '38px', borderRadius: '10px',
                background: input.trim() ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'var(--bg-tertiary, rgba(0,0,0,0.2))',
                border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <Send size={16} color={input.trim() ? 'white' : '#6b7280'} />
            </button>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes helpPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.5; }
        }
        @keyframes helpSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
