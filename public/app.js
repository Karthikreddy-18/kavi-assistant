const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let listening = false;
let soundEnabled = true;
let history = [];

const micBtn = document.getElementById('micBtn');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const messagesEl = document.getElementById('messages');
const statusText = document.getElementById('statusText');
const soundToggle = document.getElementById('soundToggle');
const soundOn = document.getElementById('soundOn');
const soundOff = document.getElementById('soundOff');
const resetBtn = document.getElementById('resetBtn');
const chatContainer = document.getElementById('chatContainer');

function speak(text) {
  if (!soundEnabled) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Female'));
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}

function addMessage(text, role) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
}

function removeTyping() {
  const typing = messagesEl.querySelector('.typing');
  if (typing) typing.remove();
}

function showTyping() {
  removeTyping();
  const div = document.createElement('div');
  div.className = 'message typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendToKAVI(text) {
  history.push({ role: 'user', content: text });
  showTyping();
  statusText.textContent = 'Thinking...';
  statusText.className = 'processing';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: history.slice(-20) }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    removeTyping();

    const data = await res.json();
    if (data.response) {
      addMessage(data.response, 'assistant');
      history.push({ role: 'assistant', content: data.response });
      speak(data.response);
      scrollToBottom();
    } else {
      addMessage(data.error || 'Hmm, I got nothing. Try again?', 'assistant');
    }
  } catch (err) {
    removeTyping();
    if (err.name === 'AbortError') {
      addMessage('Request timed out. Is your Groq API key set in .env?', 'assistant');
    } else {
      addMessage('Connection error. Is the server running?', 'assistant');
    }
  }
  statusText.textContent = 'Tap to speak';
  statusText.className = '';
}

function startListening() {
  if (!SpeechRecognition) {
    statusText.textContent = 'Speech not supported on this browser';
    return;
  }
  listening = true;
  micBtn.classList.add('listening');
  statusText.textContent = 'Listening...';
  statusText.className = 'listening';

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    micBtn.classList.remove('listening');
    micBtn.classList.remove('active');
    statusText.textContent = 'Got it!';
    listening = false;
    addMessage(transcript, 'user');
    sendToKAVI(transcript);
  };

  recognition.onerror = () => {
    micBtn.classList.remove('listening');
    micBtn.classList.remove('active');
    statusText.textContent = 'Tap to speak';
    statusText.className = '';
    listening = false;
  };

  recognition.onend = () => {
    micBtn.classList.remove('listening');
    micBtn.classList.remove('active');
    if (listening) {
      statusText.textContent = 'Tap to speak';
      statusText.className = '';
    }
    listening = false;
  };

  recognition.start();
}

micBtn.addEventListener('click', () => {
  if (listening) return;
  startListening();
});

function sendText(text) {
  if (!text.trim()) return;
  addMessage(text, 'user');
  textInput.value = '';
  sendToKAVI(text);
}

sendBtn.addEventListener('click', () => sendText(textInput.value));

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendText(textInput.value);
});

soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundOn.style.display = soundEnabled ? 'block' : 'none';
  soundOff.style.display = soundEnabled ? 'none' : 'block';
  if (!soundEnabled) window.speechSynthesis.cancel();
});

resetBtn.addEventListener('click', () => {
  history = [];
  messagesEl.innerHTML = '';
  window.speechSynthesis.cancel();
  statusText.textContent = 'Conversation reset';
  setTimeout(() => { statusText.textContent = 'Tap to speak'; }, 1500);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}

document.addEventListener('touchmove', e => {
  if (e.target === chatContainer) return;
}, { passive: true });
