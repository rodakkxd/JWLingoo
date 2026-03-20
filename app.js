import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, updateDoc, arrayUnion, addDoc, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAEDwba96XeU5xPwHJ8McK6DsP8O3cROWk",
    authDomain: "jwlingo-global.firebaseapp.com",
    projectId: "jwlingo-global",
    storageBucket: "jwlingo-global.firebasestorage.app",
    messagingSenderId: "308314587720",
    appId: "1:308314587720:web:47790414db78c3a8c04e7d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Password hashing using SHA-256 (Web Crypto API)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Current Session
let currentUser = null;

// App State (for current user)
let state = {
    streak: 0,
    lastReadDate: null,
    theme: "light",
    achievements: [],
    friends: []
};

let allMessages = [];
let currentChatFriend = null;
let messagesUnsubscribe = null;
let initialMessagesLoaded = false;
let userDocUnsubscribe = null;

async function setupNotifications() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
        await Notification.requestPermission();
    }
}

function scheduleReadReminder() {
    if (!("Notification" in window)) return;
    
    if (!isToday(state.lastReadDate)) {
        setTimeout(() => {
            if (!isToday(state.lastReadDate) && Notification.permission === "granted") {
                new Notification("JWLingo", {
                    body: "Przeczytaj tekst ;)",
                    icon: "icon.png"
                });
            }
        }, 5000); // 5s after load
        
        setInterval(() => {
            if (!isToday(state.lastReadDate) && Notification.permission === "granted") {
                new Notification("JWLingo", {
                    body: "Przeczytaj tekst ;)",
                    icon: "icon.png"
                });
            }
        }, 3600000); // 1 hour
    }
}

const MILESTONES = [3, 7, 30, 90, 180, 365];
const MILESTONE_NAMES = {
    3: "3 Dni!",
    7: "Tydzień!",
    30: "Miesiąc!",
    90: "3 Miesiące!",
    180: "Pół Roku!",
    365: "ROK!"
};

const FUNNY_MESSAGES = [
    "Serio? Nadal nic nie przeczytałeś? ...",
    "Czytałeś dzisiaj, czy tylko udajesz?",
    "Do roboty!",
    "Mareclinie i Martynie jest smutno bo nadal nie przeczytałeś...",
    "Twój streak płacze, jak nie czytasz.",
    "Bądź jak Dawid, pokonaj lenistwo!"
];

// DOM Elements
const elements = {
    viewAuth: document.getElementById('view-auth'),
    mainAppContainer: document.getElementById('main-app-container'),
    authUsername: document.getElementById('auth-username'),
    authDisplayName: document.getElementById('auth-displayname'),
    authPassword: document.getElementById('auth-password'),
    btnAuth: document.getElementById('btn-auth'),
    authError: document.getElementById('auth-error'),
    
    streakCount: document.getElementById('streak-count'),
    btnOpenProfile: document.getElementById('btn-open-profile'),
    greetingDisplayName: document.getElementById('greeting-displayname'),
    greetingUsername: document.getElementById('greeting-username'),
    btnRead: document.getElementById('btn-read'),
    readStatus: document.getElementById('read-status'),
    navItems: document.querySelectorAll('.nav-item'),
    views: document.querySelectorAll('.view'),
    
    friendsList: document.getElementById('friends-list'),
    searchFriendInput: document.getElementById('search-friend-input'),
    btnSearchFriend: document.getElementById('btn-search-friend'),
    btnToggleSearch: document.getElementById('btn-toggle-search'),
    searchFriendModule: document.getElementById('search-friend-module'),
    searchResults: document.getElementById('search-results'),
    
    messagesFriendsList: document.getElementById('messages-friends-list'),
    chatInterface: document.getElementById('chat-interface'),
    btnBackToMessages: document.getElementById('btn-back-to-messages'),
    chatWithName: document.getElementById('chat-with-name'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    btnSendMessage: document.getElementById('btn-send-message'),
    
    profileDisplayNameDisplay: document.getElementById('profile-displayname-display'),
    profileUsernameDisplay: document.getElementById('profile-username-display'),
    profileBioDisplay: document.getElementById('profile-bio-display'),
    
    settingsUsernameDisplay: document.getElementById('settings-username-display'),
    settingsDisplayNameInput: document.getElementById('settings-display-name-input'),
    settingsBioInput: document.getElementById('settings-bio-input'),
    btnSaveBio: document.getElementById('btn-save-bio'),
    btnSaveDisplayName: document.getElementById('btn-save-display-name'),
    btnSetAvatar: document.getElementById('btn-set-avatar'),
    btnLogout: document.getElementById('btn-logout'),
    themeToggle: document.getElementById('theme-toggle'),
    btnReset: document.getElementById('btn-reset'),
    
    modal: document.getElementById('achievement-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalText: document.getElementById('modal-text'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    toastContainer: document.getElementById('toast-container'),
    confettiContainer: document.getElementById('confetti-container')
};

// Utilities
function decodeText(text) {
    return text
        .replace(/©/g, 'ę')
        .replace(/§/g, 'ą')
        .replace(/\s*[\u0301\u00B4]\s*s/g, 'ś')
        .replace(/\s*[\u0301\u00B4]\s*S/g, 'Ś')
        .replace(/\s*[\u0307\u02D9]\s*z/g, 'ż')
        .replace(/\s*[\u0307\u02D9]\s*Z/g, 'Ż')
        .replace(/\s*[\u0301\u00B4]\s*c/g, 'ć')
        .replace(/\s*[\u0301\u00B4]\s*C/g, 'Ć')
        .replace(/\s*[\u0301\u00B4]\s*n/g, 'ń')
        .replace(/\s*[\u0301\u00B4]\s*N/g, 'Ń')
        .replace(/\s*[\u0301\u00B4]\s*o/g, 'ó')
        .replace(/\s*[\u0301\u00B4]\s*O/g, 'Ó')
        .replace(/\s*[\u0301\u00B4]\s*z/g, 'ź')
        .replace(/\s*[\u0301\u00B4]\s*Z/g, 'Ź')
        .replace(/\s+D/g, ' „')
        .replace(/^D/, '„')
        .replace(/’/g, '”')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

async function fetchDailyText() {
    try {
        const response = await fetch('text.json');
        const data = await response.json();
        let fullText = data.filter(d => d.page >= 9).map(d => d.content).join(' ');
        fullText = decodeText(fullText);
        
        const today = new Date();
        const normalMonths = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
        
        const currentTargetRegex = new RegExp(`(?:Niedziela|Poniedziałek|Wtorek|Środa|Czwartek|Piątek|Sobota)\\s+${today.getDate()}\\s+${normalMonths[today.getMonth()]}`, 'i');
        const match = currentTargetRegex.exec(fullText);
        
        if (match) {
            let startIndex = match.index + match[0].length;
            const remainingText = fullText.substring(startIndex);
            const nextDateRegex = new RegExp(`(?:Niedziela|Poniedziałek|Wtorek|Środa|Czwartek|Piątek|Sobota)\\s+\\d{1,2}\\s+(?:${normalMonths.join('|')})`, 'i');
            const nextMatch = nextDateRegex.exec(remainingText);
            
            let rawDaily = "";
            if (nextMatch) {
                rawDaily = remainingText.substring(0, nextMatch.index);
            } else {
                rawDaily = remainingText;
            }
            
            rawDaily = rawDaily.trim();
            // Splitting daily text and source/commentary.
            let splitIndex = rawDaily.indexOf(').');
            if (splitIndex !== -1) {
                document.getElementById('daily-text-quote').textContent = rawDaily.substring(0, splitIndex + 2);
                document.getElementById('daily-text-source').textContent = rawDaily.substring(splitIndex + 2).trim();
            } else {
                document.getElementById('daily-text-quote').textContent = rawDaily;
                document.getElementById('daily-text-source').textContent = "Codzienne badanie Pism";
            }
        } else {
            document.getElementById('daily-text-quote').textContent = "Nie znaleziono tekstu na dziś w pliku text.json.";
            document.getElementById('daily-text-source').textContent = "";
        }
    } catch (e) {
        console.error("Text load error", e);
    }
}

function showInstallPrompt() {
    if (!localStorage.getItem('jwlingo_installed_prompt')) {
        setTimeout(() => {
            showModal("Hej!", "Aby zainstalować aplikacje dodaj ją na stronę główną na twoim telefonie :)");
            localStorage.setItem('jwlingo_installed_prompt', 'true');
        }, 1500);
    }
}

// Initialization
async function init() {
    setupEventListeners();
    
    let session = localStorage.getItem('jwlingo_session');
    if (session) {
        try {
            let docSnap = await getDoc(doc(db, "users", session.toLowerCase()));
            if (docSnap.exists()) {
                handleLoginSuccess(docSnap.data());
            } else {
                localStorage.removeItem('jwlingo_session');
                showAuthView();
            }
        } catch(e) {
            console.error(e);
            showAuthView(); 
        }
    } else {
        showAuthView();
    }
}

function showAuthView() {
    elements.mainAppContainer.classList.add('hidden');
    elements.viewAuth.classList.remove('hidden');
    elements.viewAuth.classList.add('active');
}

function handleLoginSuccess(userData) {
    currentUser = userData.username;
    
    state = { 
        streak: userData.streak || 0,
        lastReadDate: userData.lastReadDate || null,
        theme: userData.theme || "light",
        achievements: userData.achievements || [],
        friends: userData.friends || [],
        displayName: userData.displayName || "",
        bio: userData.bio || ""
    };
    
    if (elements.settingsDisplayNameInput) {
        elements.settingsDisplayNameInput.value = state.displayName;
    }
    if (elements.settingsBioInput) {
        elements.settingsBioInput.value = state.bio;
    }
    
    if (state.theme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        elements.themeToggle.checked = true;
    } else {
        document.body.removeAttribute('data-theme');
        elements.themeToggle.checked = false;
    }
    
    elements.settingsUsernameDisplay.textContent = currentUser;
    
    elements.viewAuth.classList.add('hidden');
    elements.viewAuth.classList.remove('active');
    elements.mainAppContainer.classList.remove('hidden');
    
    updateUI();
    checkStreakReset();
    renderFriends();
    
    setupNotifications();
    scheduleReadReminder();
    
    fetchMessages();
    
    checkIfReadToday();
    
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    const today = new Date().toLocaleDateString('pl-PL', options);
    document.getElementById('daily-text-date').textContent = today;
    
    fetchDailyText();
    showInstallPrompt();
    
    // Listen for ban/deactivate/delete while logged in
    userDocUnsubscribe = onSnapshot(doc(db, "users", currentUser.toLowerCase()), (docSnap) => {
        if (docSnap.exists()) {
            let data = docSnap.data();
            if (data.status === 'banned' || data.status === 'deactivated' || data.status === 'deleted') {
                currentUser = null;
                localStorage.removeItem('jwlingo_session');
                location.reload();
            }
        }
    });
}

async function saveState() {
    if (!currentUser) return;
    try {
        await updateDoc(doc(db, "users", currentUser.toLowerCase()), {
            streak: state.streak,
            lastReadDate: state.lastReadDate,
            theme: state.theme,
            achievements: state.achievements,
            friends: state.friends,
            displayName: state.displayName,
            bio: state.bio
        });
    } catch(e) {
        console.error("Save Error:", e);
    }
}

function updateUI() {
    elements.streakCount.textContent = state.streak;
    
    if (state.displayName) {
        elements.greetingDisplayName.textContent = state.displayName;
        elements.greetingUsername.textContent = `@${currentUser}`;
        elements.greetingUsername.style.display = 'block';
    } else {
        elements.greetingDisplayName.textContent = currentUser;
        elements.greetingUsername.style.display = 'none';
    }
}

// Logic
function isToday(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
}

function isYesterday(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.getDate() === yesterday.getDate() &&
           date.getMonth() === yesterday.getMonth() &&
           date.getFullYear() === yesterday.getFullYear();
}

function checkStreakReset() {
    if (state.lastReadDate && !isToday(state.lastReadDate) && !isYesterday(state.lastReadDate)) {
        state.streak = 0;
        saveState();
        updateUI();
    }
}

function checkIfReadToday() {
    if (isToday(state.lastReadDate)) {
        elements.btnRead.disabled = true;
        elements.btnRead.classList.add('pressed');
        elements.btnRead.querySelector('.btn-text').textContent = "Ukończono";
        elements.readStatus.classList.remove('hidden');
    } else {
        elements.btnRead.disabled = false;
        elements.btnRead.classList.remove('pressed');
        elements.btnRead.querySelector('.btn-text').textContent = "Przeczytano?";
        elements.readStatus.classList.add('hidden');
    }
}

async function handleRead() {
    if (isToday(state.lastReadDate)) return;

    // Phase 1: Button was in "Przeczytano?" state, animate and switch to "Gotowy?"
    if (elements.btnRead.getAttribute('data-phase') !== 'confirm') {
        elements.btnRead.setAttribute('data-phase', 'confirm');
        elements.btnRead.querySelector('.btn-text').textContent = "Gotowy?";
        elements.btnRead.style.transition = 'transform 0.2s';
        elements.btnRead.style.transform = 'scale(1.05)';
        setTimeout(() => { elements.btnRead.style.transform = 'scale(1)'; }, 200);
        return;
    }
    
    // Phase 2: Show quiz before completing reading
    elements.btnRead.setAttribute('data-phase', '');
    await showQuiz();
}

async function completeReading() {
    if (isToday(state.lastReadDate)) return;
    
    if (isYesterday(state.lastReadDate) || state.streak === 0) {
        state.streak += 1;
    } else {
        state.streak = 1;
    }
    
    state.lastReadDate = new Date().toISOString();
    await saveState();
    
    updateUI();
    checkIfReadToday();
    createConfetti();
    
    if (MILESTONES.includes(state.streak)) {
        if (!state.achievements.includes(state.streak)) {
            state.achievements.push(state.streak);
            saveState();
            showModal(`Level Up: ${MILESTONE_NAMES[state.streak]}`, `Gratulacje! Twoja passa wynosi już ${state.streak} dni! Oby tak dalej!`);
        }
    }
}

let quizData = null;

async function loadQuizData() {
    if (quizData) return quizData;
    try {
        const res = await fetch('quiz.json');
        quizData = await res.json();
    } catch(e) { quizData = []; }
    return quizData;
}

async function showQuiz() {
    const data = await loadQuizData();
    const todayStr = new Date().toISOString().slice(0, 10);
    const q = data.find(item => item.date === todayStr);
    
    if (!q) {
        // No quiz for today - just complete reading directly
        closeQuiz();
        completeReading();
        return;
    }
    
    const overlay = document.getElementById('quiz-overlay');
    const questionEl = document.getElementById('quiz-question');
    const answersEl = document.getElementById('quiz-answers');
    const resultBar = document.getElementById('quiz-result-bar');
    const progressBar = document.getElementById('quiz-progress-bar');
    
    overlay.classList.remove('hidden');
    resultBar.classList.add('hidden');
    resultBar.className = 'hidden';
    progressBar.style.width = '0%';
    
    questionEl.textContent = q.question;
    answersEl.innerHTML = '';
    
    const letters = ['A', 'B', 'C', 'D'];
    letters.forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'quiz-answer-btn';
        btn.innerHTML = `<span class="quiz-letter">${letter}</span><span>${q.answers[letter]}</span>`;
        btn.addEventListener('click', () => handleQuizAnswer(letter, q.correct, btn));
        answersEl.appendChild(btn);
    });
}

function handleQuizAnswer(chosen, correct, clickedBtn) {
    const allBtns = document.querySelectorAll('.quiz-answer-btn');
    allBtns.forEach(b => b.disabled = true);
    
    const resultBar = document.getElementById('quiz-result-bar');
    const resultText = document.getElementById('quiz-result-text');
    const progressBar = document.getElementById('quiz-progress-bar');
    
    progressBar.style.width = '100%';
    
    if (chosen === correct) {
        clickedBtn.classList.add('correct');
        resultBar.style.padding = '20px';
        resultBar.style.borderRadius = '16px';
        resultBar.style.marginTop = '20px';
        resultBar.style.textAlign = 'center';
        resultBar.className = 'quiz-result-correct';
        resultText.textContent = 'ŚWIETNIE! Poprawna odpowiedź! 🎉';
    } else {
        clickedBtn.classList.add('wrong');
        // Highlight the correct one
        allBtns.forEach(b => {
            const letter = b.querySelector('.quiz-letter').textContent;
            if (letter === correct) b.classList.add('correct');
        });
        resultBar.style.padding = '20px';
        resultBar.style.borderRadius = '16px';
        resultBar.style.marginTop = '20px';
        resultBar.style.textAlign = 'center';
        resultBar.className = 'quiz-result-wrong';
        resultText.textContent = `Nie tym razem. Poprawna odpowiedź to: ${correct}`;
    }
    
    resultBar.innerHTML = `<p id="quiz-result-text" style="font-size: 1.2rem; font-weight: 900; margin-bottom: 15px;">${resultText.textContent}</p><button id="btn-quiz-continue" class="btn btn-primary btn-chunky">Dalej</button>`;
    document.getElementById('btn-quiz-continue').addEventListener('click', () => {
        closeQuiz();
        completeReading();
    });
}

function closeQuiz() {
    document.getElementById('quiz-overlay').classList.add('hidden');
}

function createConfetti() {
    elements.confettiContainer.innerHTML = '';
    const colors = ['#8e24aa', '#1cb0f6', '#ffc800', '#ff4b4b'];
    
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.classList.add('confetti');
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDuration = (Math.random() * 2 + 1) + 's';
        confetti.style.opacity = Math.random() + 0.5;
        elements.confettiContainer.appendChild(confetti);
    }
    
    setTimeout(() => {
        elements.confettiContainer.innerHTML = '';
    }, 3000);
}

function showModal(title, text) {
    elements.modalTitle.textContent = title;
    elements.modalText.textContent = text;
    elements.modal.classList.remove('hidden');
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3000);
}

async function renderFriends() {
    elements.friendsList.innerHTML = '<p style="text-align:center; color:var(--text-light);">Odświeżanie znajomych z chmury...</p>';
    if (!state.friends || state.friends.length === 0) {
        elements.friendsList.innerHTML = '<p style="text-align:center; color:var(--text-light); font-weight:700;">Nie masz jeszcze znajomych. Wyszukaj kogoś powyżej!</p>';
        return;
    }
    
    let fetchedFriends = [];
    for (let friendUsername of state.friends) {
        try {
            let docSnap = await getDoc(doc(db, "users", friendUsername.toLowerCase()));
            if (docSnap.exists()) {
                fetchedFriends.push(docSnap.data());
            }
        } catch(e) {
            console.error(e);
        }
    }
    
    elements.friendsList.innerHTML = '';
    
    fetchedFriends.forEach(f => {
        const card = document.createElement('div');
        card.classList.add('friend-grid-card');
        
        let dName = f.displayName || f.username;
        
        card.innerHTML = `
            <div class="friend-grid-avatar btn-view-profile" data-username="${f.username}"><i class="fa-solid fa-user"></i></div>
            <div class="friend-grid-name">${dName}</div>
            <div class="friend-grid-streak"><i class="fa-solid fa-fire"></i> ${f.streak || 0} dni</div>
            <div class="friend-grid-actions">
                <button class="btn btn-secondary btn-small btn-motivate" data-name="${f.username}" style="background-color: var(--secondary-color);">MOTYWUJ</button>
                <button class="btn btn-secondary btn-small btn-chat" data-name="${f.username}" style="background-color: var(--secondary-color);">czatuj</button>
            </div>
        `;
        
        elements.friendsList.appendChild(card);
    });
    
    document.querySelectorAll('.btn-motivate').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const name = e.target.getAttribute('data-name');
            const msg = FUNNY_MESSAGES[Math.floor(Math.random() * FUNNY_MESSAGES.length)];
            showToast(`Wysłano motywację do ${name}: "${msg}"`);
            
            // Send as a message
            try {
                await addDoc(collection(db, "messages"), {
                    participants: [currentUser, name],
                    sender: currentUser,
                    text: msg,
                    timestamp: Date.now()
                });
            } catch (err) {
                console.error("Motivate message error:", err);
            }
        });
    });

    document.querySelectorAll('.btn-chat').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const name = e.target.getAttribute('data-name');
            
            elements.navItems.forEach(nav => nav.classList.remove('active'));
            const msgNav = document.querySelector('.nav-item[data-target="view-messages"]');
            if (msgNav) msgNav.classList.add('active');
            
            document.querySelectorAll('#main-app-container .view').forEach(view => {
                view.classList.remove('active');
                view.classList.add('hidden');
            });
            const msgView = document.getElementById('view-messages');
            msgView.classList.remove('hidden');
            msgView.classList.add('active');
            
            elements.messagesFriendsList.classList.add('hidden');
            elements.chatInterface.classList.remove('hidden');
            currentChatFriend = name;
            elements.chatWithName.textContent = name;
            renderChat(name);
            
            setTimeout(() => {
                elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
            }, 50);
        });
    });

    document.querySelectorAll('.btn-view-profile').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const name = e.currentTarget.getAttribute('data-username');
            
            elements.navItems.forEach(n => n.classList.remove('active'));
            document.querySelectorAll('#main-app-container .view').forEach(view => {
                view.classList.remove('active');
                setTimeout(() => view.classList.add('hidden'), 50);
            });
            setTimeout(() => {
                const profileView = document.getElementById('view-profile');
                profileView.classList.remove('hidden');
                setTimeout(() => profileView.classList.add('active'), 10);
            }, 50);
            
            if (name === currentUser) {
                elements.profileDisplayNameDisplay.textContent = state.displayName || currentUser;
                elements.profileUsernameDisplay.textContent = `@${currentUser}`;
                elements.profileBioDisplay.textContent = state.bio || "Brak biografii...";
            } else {
                elements.profileDisplayNameDisplay.textContent = "Ładowanie...";
                elements.profileUsernameDisplay.textContent = `@${name}`;
                elements.profileBioDisplay.textContent = "";
                
                try {
                    let docSnap = await getDoc(doc(db, "users", name.toLowerCase()));
                    if (docSnap.exists()) {
                        let uData = docSnap.data();
                        elements.profileDisplayNameDisplay.textContent = uData.displayName || name;
                        elements.profileBioDisplay.textContent = uData.bio || "Brak biografii...";
                    }
                } catch(err) {
                    elements.profileDisplayNameDisplay.textContent = name;
                    elements.profileBioDisplay.textContent = "Błąd.";
                }
            }
        });
    });
}

// Messages Logic
function fetchMessages() {
    if (!currentUser) return;
    
    if (messagesUnsubscribe) {
        messagesUnsubscribe();
    }
    
    let q = query(
        collection(db, "messages"),
        where("participants", "array-contains", currentUser)
    );
    
    initialMessagesLoaded = false;
    
    messagesUnsubscribe = onSnapshot(q, (snapshot) => {
        let msgs = [];
        snapshot.forEach(docSnap => {
            msgs.push({ id: docSnap.id, ...docSnap.data() });
        });
        msgs.sort((a, b) => a.timestamp - b.timestamp);
        allMessages = msgs;
        
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" && initialMessagesLoaded) {
                let m = change.doc.data();
                if (m.sender !== currentUser && "Notification" in window && Notification.permission === "granted") {
                    new Notification("Nowa wiadomość", {
                        body: `${m.sender} napisał do Ciebie wiadomość`,
                        icon: "icon.png"
                    });
                }
            }
        });
        
        initialMessagesLoaded = true;
        
        if (currentChatFriend) {
            renderChat(currentChatFriend);
        }
        renderMessagesFriendsList();
    }, (error) => {
        console.error("Fetch messages error:", error);
    });
}

function renderMessagesFriendsList() {
    elements.messagesFriendsList.innerHTML = '';
    
    if (!state.friends || state.friends.length === 0) {
        elements.messagesFriendsList.innerHTML = '<p style="text-align:center; color:var(--text-light); font-weight:700;">Nie masz jeszcze znajomych, do których mógłbyś napisać.</p>';
        return;
    }
    
    state.friends.forEach(friendUsername => {
        const card = document.createElement('div');
        card.classList.add('friend-card');
        card.style.cursor = 'pointer';
        
        // Find last message
        let friendMsgs = allMessages.filter(m => m.participants.includes(friendUsername));
        let lastMsg = friendMsgs.length > 0 ? friendMsgs[friendMsgs.length - 1].text : "Kliknij, aby napisać...";
        
        card.innerHTML = `
            <div class="friend-info">
                <div class="friend-avatar"><i class="fa-solid fa-envelope"></i></div>
                <div class="friend-details">
                    <span class="friend-name">${friendUsername}</span>
                    <span class="message-preview">${lastMsg}</span>
                </div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color: var(--text-light);"></i>
        `;
        
        card.addEventListener('click', () => {
            elements.messagesFriendsList.classList.add('hidden');
            elements.chatInterface.classList.remove('hidden');
            currentChatFriend = friendUsername;
            elements.chatWithName.textContent = friendUsername;
            renderChat(friendUsername);
            
            // Auto scroll to bottom
            setTimeout(() => {
                elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
            }, 50);
        });
        
        elements.messagesFriendsList.appendChild(card);
    });
}

function renderChat(friendUsername) {
    elements.chatMessages.innerHTML = '';
    let friendMsgs = allMessages.filter(m => m.participants.includes(friendUsername));
    
    if (friendMsgs.length === 0) {
        elements.chatMessages.innerHTML = '<p style="text-align:center; color:var(--text-light); font-weight:600; margin-top: 20px;">Brak wiadomości. Napisz coś!</p>';
        return;
    }
    
    friendMsgs.forEach(m => {
        const bubble = document.createElement('div');
        const isSent = m.sender === currentUser;
        bubble.classList.add('chat-bubble', isSent ? 'sent' : 'received');
        
        const date = new Date(m.timestamp);
        const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        
        bubble.innerHTML = `
            <div>${m.text}</div>
            <div class="chat-timestamp">${timeStr}</div>
        `;
        
        elements.chatMessages.appendChild(bubble);
    });
    
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

async function sendChatMessage() {
    let text = elements.chatInput.value.trim();
    if (!text || !currentChatFriend) return;
    
    elements.btnSendMessage.disabled = true;
    
    try {
        let newMsg = {
            participants: [currentUser, currentChatFriend],
            sender: currentUser,
            text: text,
            timestamp: Date.now()
        };
        
        let docRef = await addDoc(collection(db, "messages"), newMsg);
        // onSnapshot will handle UI rendering!
        
        elements.chatInput.value = '';
    } catch(err) {
        console.error("Send message error:", err);
        showToast("Nie udało się wysłać.");
    } finally {
        elements.btnSendMessage.disabled = false;
        elements.chatInput.focus();
    }
}

async function searchFriends() {
    let q = elements.searchFriendInput.value.trim().toLowerCase();
    elements.searchResults.innerHTML = '';
    if (!q) return;
    
    elements.searchResults.innerHTML = '<p style="color:var(--text-light);">Szukanie w chmurze...</p>';
    
    try {
        let snapshot = await getDocs(collection(db, "users"));
        let found = [];
        snapshot.forEach(docSnap => {
            let u = docSnap.data();
            if (u.username.toLowerCase().includes(q) && u.username.toLowerCase() !== currentUser.toLowerCase()) {
                if (u.status === 'banned' || u.status === 'deactivated' || u.status === 'deleted') return;
                found.push(u);
            }
        });
        
        elements.searchResults.innerHTML = '';
        if (found.length === 0) {
            elements.searchResults.innerHTML = '<p style="font-weight:700; color:var(--text-light);">Nie znaleziono użytkownika.</p>';
            return;
        }
        
        found.forEach(f => {
            let isFriend = state.friends && state.friends.includes(f.username);
            let div = document.createElement('div');
            div.className = 'friend-card';
            div.innerHTML = `
                <div class="friend-info">
                    <div class="friend-details">
                        <span class="friend-name">${f.username}</span>
                    </div>
                </div>
                ${isFriend ? '<span style="color:var(--text-light); font-weight:bold;">Znajomy ✓</span>' : `<button class="btn btn-primary btn-small btn-add-friend" data-name="${f.username}">Dodaj</button>`}
            `;
            elements.searchResults.appendChild(div);
        });
        
        document.querySelectorAll('.btn-add-friend').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                let name = e.target.getAttribute('data-name');
                btn.disabled = true;
                btn.textContent = "...";
                
                if(!state.friends) state.friends = [];
                state.friends.push(name);
                await saveState();
                
                try {
                    await updateDoc(doc(db, "users", name.toLowerCase()), {
                        friends: arrayUnion(currentUser)
                    });
                } catch(err) {
                    console.log("Friend update err:", err);
                }
                
                showToast(`Dodano ${name} do znajomych!`);
                renderFriends();
                searchFriends();
            });
        });
    } catch(err) {
        console.error(err);
        elements.searchResults.innerHTML = '<p style="color:var(--danger-color);">Błąd pobierania danych.</p>';
    }
}

function setupEventListeners() {
    // Auth
    elements.btnAuth.addEventListener('click', async () => {
        let userStr = elements.authUsername.value.trim();
        let passStr = elements.authPassword.value.trim();
        if (!userStr || !passStr) {
            elements.authError.textContent = "Wypełnij oba pola!";
            elements.authError.classList.remove('hidden');
            return;
        }
        
        elements.btnAuth.disabled = true;
        elements.btnAuth.textContent = "Łączenie z chmurą...";
        
        try {
            let userDocRef = doc(db, "users", userStr.toLowerCase());
            let docSnap = await getDoc(userDocRef);
            
            if (docSnap.exists()) {
                let userData = docSnap.data();
                
                if (userData.status === 'banned') {
                    elements.authError.textContent = "Konto zablokowane do odwołania";
                    elements.authError.classList.remove('hidden');
                    return;
                }
                if (userData.status === 'deactivated') {
                    elements.authError.textContent = "Konto dezaktywowane";
                    elements.authError.classList.remove('hidden');
                    return;
                }
                if (userData.status === 'deleted') {
                    elements.authError.textContent = "Username not available";
                    elements.authError.classList.remove('hidden');
                    return;
                }

                const hashedPass = await hashPassword(passStr);
                if (userData.password === hashedPass) {
                    elements.authError.classList.add('hidden');
                    localStorage.setItem('jwlingo_session', userStr);
                    handleLoginSuccess(userData);
                } else {
                    elements.authError.textContent = "Błędne hasło!";
                    elements.authError.classList.remove('hidden');
                }
            } else {
                const hashedNewPass = await hashPassword(passStr);
                let newUser = {
                    username: userStr,
                    password: hashedNewPass,
                    displayName: elements.authDisplayName.value.trim(),
                    streak: 0,
                    lastReadDate: null,
                    theme: "light",
                    achievements: [],
                    friends: [],
                    bio: ""
                };
                await setDoc(userDocRef, newUser);
                localStorage.setItem('jwlingo_session', userStr);
                handleLoginSuccess(newUser);
            }
        } catch (e) {
            console.error(e);
            let msg = e.message || "Błąd sieci lub bazy.";
            if (msg.includes("permissions")) msg = "Odmowa dostępu w Firebase (Test Mode niezaznaczony).";
            elements.authError.textContent = "Błąd: " + msg;
            elements.authError.classList.remove('hidden');
        } finally {
            elements.btnAuth.disabled = false;
            elements.btnAuth.textContent = "Wejdź";
        }
    });

    // Navigation
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            elements.navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            const targetView = item.getAttribute('data-target');
            document.querySelectorAll('#main-app-container .view').forEach(view => {
                view.classList.remove('active');
                setTimeout(() => {
                    if (view.id === targetView) {
                        view.classList.remove('hidden');
                        view.classList.add('active');
                    } else {
                        view.classList.add('hidden');
                    }
                }, 50);
            });
            
            // Populate profile data when Profile tab is opened
            if (targetView === 'view-profile' && currentUser) {
                elements.profileDisplayNameDisplay.textContent = state.displayName || currentUser;
                elements.profileUsernameDisplay.textContent = `@${currentUser}`;
                elements.profileBioDisplay.textContent = state.bio || "Tu jeszcze nic nie ma...";
                if (elements.settingsDisplayNameInput) elements.settingsDisplayNameInput.value = state.displayName || '';
                if (elements.settingsBioInput) elements.settingsBioInput.value = state.bio || '';
            }
        });
    });

    elements.btnRead.addEventListener('click', handleRead);

    elements.btnCloseModal.addEventListener('click', () => {
        elements.modal.classList.add('hidden');
    });

    elements.themeToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.body.setAttribute('data-theme', 'dark');
            state.theme = 'dark';
        } else {
            document.body.removeAttribute('data-theme');
            state.theme = 'light';
        }
        saveState();
    });

    elements.btnReset.addEventListener('click', () => {
        if (confirm("Czy na pewno chcesz zresetować całą swoją passę i osiągnięcia z bazy chmurowej?")) {
            state.streak = 0;
            state.lastReadDate = null;
            state.achievements = [];
            saveState();
            loadState();
            updateUI();
            checkIfReadToday();
            showToast("Zresetowano postęp.");
        }
    });
    
    // Logout
    elements.btnLogout.addEventListener('click', () => {
        currentUser = null;
        localStorage.removeItem('jwlingo_session');
        location.reload();
    });
    
    // Friends
    if (elements.btnToggleSearch) {
        elements.btnToggleSearch.addEventListener('click', () => {
            elements.searchFriendModule.classList.toggle('hidden');
        });
    }
    elements.btnSearchFriend.addEventListener('click', searchFriends);
    elements.searchFriendInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchFriends();
    });
    
    // Personalize account
    if (elements.btnSaveDisplayName) {
        elements.btnSaveDisplayName.addEventListener('click', async () => {
            let newName = elements.settingsDisplayNameInput.value.trim();
            elements.btnSaveDisplayName.disabled = true;
            elements.btnSaveDisplayName.textContent = "...";
            
            try {
                state.displayName = newName;
                await saveState();
                updateUI();
                elements.profileDisplayNameDisplay.textContent = newName || currentUser;
                showToast("Zaktualizowano display name!");
            } catch(e) {
                console.error("Error saving display name:", e);
                showToast("Błąd zapisu!");
            } finally {
                elements.btnSaveDisplayName.disabled = false;
                elements.btnSaveDisplayName.textContent = "Zapisz";
            }
        });
    }
    
    if (elements.btnSaveBio) {
        elements.btnSaveBio.addEventListener('click', async () => {
            let newBio = elements.settingsBioInput.value.trim();
            elements.btnSaveBio.disabled = true;
            elements.btnSaveBio.textContent = "...";
            try {
                state.bio = newBio;
                await saveState();
                elements.profileBioDisplay.textContent = newBio || "Tu jeszcze nic nie ma...";
                showToast("Zaktualizowano biografię!");
            } catch(e) { 
                showToast("Błąd zapisu!"); 
            } finally {
                elements.btnSaveBio.disabled = false;
                elements.btnSaveBio.textContent = "Zapisz biografię";
            }
        });
    }
    
    // Profile
    if (elements.btnOpenProfile) {
        elements.btnOpenProfile.addEventListener('click', () => {
            elements.navItems.forEach(n => n.classList.remove('active'));
            document.querySelectorAll('#main-app-container .view').forEach(view => {
                view.classList.remove('active');
                setTimeout(() => {
                    if (view.id === 'view-profile') {
                        view.classList.remove('hidden');
                        setTimeout(() => view.classList.add('active'), 10);
                    } else {
                        view.classList.add('hidden');
                    }
                }, 50);
            });
            
            elements.profileDisplayNameDisplay.textContent = state.displayName || currentUser;
            elements.profileUsernameDisplay.textContent = `@${currentUser}`;
            elements.profileBioDisplay.textContent = state.bio || "Tu jeszcze nic nie ma...";
        });
    }
    
    // Messages
    elements.btnBackToMessages.addEventListener('click', () => {
        currentChatFriend = null;
        elements.chatInterface.classList.add('hidden');
        elements.messagesFriendsList.classList.remove('hidden');
        renderMessagesFriendsList();
    });
    
    elements.btnSendMessage.addEventListener('click', sendChatMessage);
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    // Refresh messages when clicking the Messages tab
    const msgTabBtn = document.querySelector('.nav-item[data-target="view-messages"]');
    if (msgTabBtn) {
        msgTabBtn.addEventListener('click', () => {
            renderMessagesFriendsList();
        });
    }
}

document.addEventListener('DOMContentLoaded', init);
