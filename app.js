import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, updateDoc, arrayUnion, addDoc, query, where, orderBy, limit, onSnapshot, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

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
let friendAvatarCache = {};
let pendingAvatar = null;
let cropDragState = { dragging: false, startX: 0, startY: 0, imgX: 0, imgY: 0 };

async function setupNotifications() {
    if (!("Notification" in window)) return;
    if (state.pushEnabled && Notification.permission === "default") {
        await Notification.requestPermission();
    }
}

function scheduleReadReminder() {
    if (!("Notification" in window)) return;
    
    if (!isToday(state.lastReadDate)) {
        setTimeout(() => {
            if (!isToday(state.lastReadDate) && state.pushEnabled && Notification.permission === "granted") {
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
    authLoginForm: document.getElementById('auth-login-form'),
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    btnLogin: document.getElementById('btn-login'),
    loginError: document.getElementById('login-error'),
    linkToRegister: document.getElementById('link-to-register'),
    
    authRegisterForm: document.getElementById('auth-register-form'),
    registerUsername: document.getElementById('register-username'),
    registerDisplayname: document.getElementById('register-displayname'),
    registerPassword: document.getElementById('register-password'),
    btnRegister: document.getElementById('btn-register'),
    registerError: document.getElementById('register-error'),
    linkToLogin: document.getElementById('link-to-login'),
    
    streakCount: document.getElementById('streak-count'),
    xpCount: document.getElementById('xp-count'),
    btnOpenProfile: document.getElementById('btn-open-profile'),
    greetingDisplayName: document.getElementById('greeting-displayname'),
    greetingUsername: document.getElementById('greeting-username'),
    btnRead: document.getElementById('btn-read'),
    readStatus: document.getElementById('read-status'),
    navItems: document.querySelectorAll('.nav-item'),
    views: document.querySelectorAll('.view'),
    
    viewCommunity: document.getElementById('view-community'),
    viewRanking: document.getElementById('view-ranking'),
    btnOpenRanking: document.getElementById('btn-open-ranking'),
    btnOpenFriends: document.getElementById('btn-open-friends'),
    btnInviteFriend: document.getElementById('btn-invite-friend'),
    btnBackFromRanking: document.getElementById('btn-back-from-ranking'),
    btnBackFromFriends: document.getElementById('btn-back-from-friends'),
    rankingList: document.getElementById('ranking-list'),
    
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
    profileAvatarContainer: document.getElementById('profile-avatar-container'),
    profileEditControls: document.getElementById('profile-edit-controls'),
    
    settingsUsernameDisplay: document.getElementById('settings-username-display'),
    settingsDisplayNameInput: document.getElementById('settings-display-name-input'),
    settingsBioInput: document.getElementById('settings-bio-input'),
    btnSaveBio: document.getElementById('btn-save-bio'),
    btnSaveDisplayName: document.getElementById('btn-save-display-name'),
    btnSetAvatar: document.getElementById('btn-set-avatar'),
    btnLogout: document.getElementById('btn-logout'),
    themeToggle: document.getElementById('theme-toggle'),
    pushToggle: document.getElementById('push-toggle'),
    btnReset: document.getElementById('btn-reset'),
    
    avatarModal: document.getElementById('avatar-modal'),
    btnCloseAvatarModal: document.getElementById('btn-close-avatar-modal'),
    
    avatarCropModal: document.getElementById('avatar-crop-modal'),
    cropContainer: document.getElementById('crop-container'),
    cropImage: document.getElementById('crop-image'),
    btnCropSave: document.getElementById('btn-crop-save'),
    btnCropCancel: document.getElementById('btn-crop-cancel'),
    
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
        .replace(/([a-zA-ZąćęłńóśżźĄĆĘŁŃÓŚŻŹ©§])-\s+([a-zA-ZąćęłńóśżźĄĆĘŁŃÓŚŻŹ©§])/g, '$1$2')
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
        bio: userData.bio || "",
        avatar: userData.avatar || "",
        avatarPos: userData.avatarPos || { x: 50, y: 50 },
        pushEnabled: userData.pushEnabled || false,
        xp: userData.xp !== undefined ? userData.xp : (userData.streak || 0) * 20
    };
    
    // Retroactive migration for existing users
    if (userData.xp === undefined) {
        updateDoc(doc(db, "users", currentUser.toLowerCase()), { xp: state.xp }).catch(console.error);
    }
    
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
    
    if (elements.pushToggle) {
        // Only show as checked if both state is true AND browser permits it (or hasn't denied it completely)
        elements.pushToggle.checked = state.pushEnabled && Notification.permission !== 'denied';
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
            bio: state.bio,
            avatar: state.avatar,
            avatarPos: state.avatarPos,
            pushEnabled: state.pushEnabled,
            xp: state.xp
        });
    } catch(e) {
        console.error("Save Error:", e);
    }
}

function updateUI() {
    elements.streakCount.textContent = state.streak;
    if (elements.xpCount) elements.xpCount.textContent = state.xp || 0;
    
    if (state.displayName) {
        elements.greetingDisplayName.textContent = state.displayName;
        elements.greetingUsername.textContent = `@${currentUser}`;
        elements.greetingUsername.style.display = 'block';
    } else {
        elements.greetingDisplayName.textContent = currentUser;
        elements.greetingUsername.style.display = 'none';
    }
    
    // Update profile avatar
    updateProfileAvatar();
}

function getAvatarHTML(avatarName, size = 40, avatarPos = null) {
    const AVATAR_MAP = {
        'lina': 'lina.PNG',
        'kuba': 'kuba.PNG',
        'tosia': 'tosia.PNG',
        'gabrys': 'gabrys.PNG'
    };
    if (avatarName && AVATAR_MAP[avatarName]) {
        const pos = avatarPos || { x: 50, y: 50 };
        return `<img src="${AVATAR_MAP[avatarName]}" alt="${avatarName}" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover; object-position: ${pos.x}% ${pos.y}%;">`;
    }
    return `<i class="fa-solid fa-user" style="font-size: ${size * 0.5}px;"></i>`;
}

function updateProfileAvatar() {
    if (!elements.profileAvatarContainer) return;
    const AVATAR_MAP = {
        'lina': 'lina.PNG',
        'kuba': 'kuba.PNG',
        'tosia': 'tosia.PNG',
        'gabrys': 'gabrys.PNG'
    };
    if (state.avatar && AVATAR_MAP[state.avatar]) {
        const pos = state.avatarPos || { x: 50, y: 50 };
        elements.profileAvatarContainer.innerHTML = `<img src="${AVATAR_MAP[state.avatar]}" alt="${state.avatar}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; object-position: ${pos.x}% ${pos.y}%;">`;
        elements.profileAvatarContainer.style.overflow = 'hidden';
    } else {
        elements.profileAvatarContainer.innerHTML = '<i class="fa-solid fa-user"></i>';
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
    state.xp = (state.xp || 0) + 20;
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
    
    // Cache friend avatars for messages list
    fetchedFriends.forEach(f => {
        friendAvatarCache[f.username] = { avatar: f.avatar || '', avatarPos: f.avatarPos || { x: 50, y: 50 } };
    });
    
    fetchedFriends.forEach(f => {
        const card = document.createElement('div');
        card.classList.add('friend-grid-card');
        
        let dName = f.displayName || f.username;
        
        card.innerHTML = `
            <div class="friend-grid-avatar btn-view-profile" data-username="${f.username}" style="${f.avatar ? 'padding: 0; overflow: hidden;' : ''}">${getAvatarHTML(f.avatar, 50, f.avatarPos)}</div>
            <div class="friend-grid-name">${dName}</div>
            <div class="friend-grid-streak" style="display: flex; gap: 8px; justify-content: flex-end;">
                <span title="Passa (dni)"><i class="fa-solid fa-fire" style="color: var(--danger-color);"></i> ${f.streak || 0}</span>
                <span title="Punkty Doświadczenia"><i class="fa-solid fa-star" style="color: #f1c40f;"></i> ${f.xp || 0} XP</span>
            </div>
            <div class="friend-grid-actions">
                <button class="btn btn-secondary btn-small btn-motivate" data-name="${f.username}" style="background-color: var(--secondary-color);">MOTYWUJ</button>
                <button class="btn btn-secondary btn-small btn-chat" data-name="${f.username}" style="background-color: var(--secondary-color);">czatuj</button>
            </div>
        `;
        
        elements.friendsList.appendChild(card);
    });
    
    document.querySelectorAll('#friends-list .btn-motivate').forEach(btn => {
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

    document.querySelectorAll('#friends-list .btn-view-profile').forEach(btn => {
        btn.addEventListener('click', handleProfileViewClick);
    });

    // Sub-view navigation for Community -> Ranking / Friends
    if (elements.btnOpenRanking) {
        elements.btnOpenRanking.addEventListener('click', () => {
            elements.viewCommunity.classList.remove('active');
            setTimeout(() => {
                elements.viewCommunity.classList.add('hidden');
                elements.viewRanking.classList.remove('hidden');
                setTimeout(() => elements.viewRanking.classList.add('active'), 10);
                renderRanking();
            }, 50);
        });
    }
    
    if (elements.btnOpenFriends) {
        elements.btnOpenFriends.addEventListener('click', () => {
            elements.viewCommunity.classList.remove('active');
            setTimeout(() => {
                elements.viewCommunity.classList.add('hidden');
                document.getElementById('view-friends').classList.remove('hidden');
                setTimeout(() => document.getElementById('view-friends').classList.add('active'), 10);
            }, 50);
        });
    }
    
    if (elements.btnBackFromRanking) {
        elements.btnBackFromRanking.addEventListener('click', () => {
            elements.viewRanking.classList.remove('active');
            setTimeout(() => {
                elements.viewRanking.classList.add('hidden');
                elements.viewCommunity.classList.remove('hidden');
                setTimeout(() => elements.viewCommunity.classList.add('active'), 10);
            }, 50);
        });
    }
    
    if (elements.btnBackFromFriends) {
        elements.btnBackFromFriends.addEventListener('click', () => {
            const friendsView = document.getElementById('view-friends');
            friendsView.classList.remove('active');
            setTimeout(() => {
                friendsView.classList.add('hidden');
                elements.viewCommunity.classList.remove('hidden');
                setTimeout(() => elements.viewCommunity.classList.add('active'), 10);
            }, 50);
        });
    }
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

async function renderRanking() {
    elements.rankingList.innerHTML = '<p style="text-align:center; color:var(--text-light);">Odświeżanie rankingu...</p>';
    
    try {
        const q = query(collection(db, "users"), where("xp", ">", 0), orderBy("xp", "desc"), limit(100));
        const querySnapshot = await getDocs(q);
        
        elements.rankingList.innerHTML = '';
        let rank = 1;
        
        querySnapshot.forEach((docSnap) => {
            const f = docSnap.data();
            const card = document.createElement('div');
            card.classList.add('friend-grid-card');
            
            let dName = f.displayName || f.username;
            
            // Medals for top 3
            let rankDisplay = `${rank}.`;
            if (rank === 1) rankDisplay = '<i class="fa-solid fa-medal" style="color: #ffd700; font-size: 1.5rem;"></i>';
            else if (rank === 2) rankDisplay = '<i class="fa-solid fa-medal" style="color: #c0c0c0; font-size: 1.5rem;"></i>';
            else if (rank === 3) rankDisplay = '<i class="fa-solid fa-medal" style="color: #cd7f32; font-size: 1.5rem;"></i>';
            
            card.innerHTML = `
                <div style="font-size: 1.2rem; font-weight: 900; color: var(--text-light); width: 30px; text-align: center;">${rankDisplay}</div>
                <div class="friend-grid-avatar btn-view-profile" data-username="${f.username}" style="${f.avatar ? 'padding: 0; overflow: hidden;' : ''}">${getAvatarHTML(f.avatar, 50, f.avatarPos)}</div>
                <div class="friend-grid-name">${dName}</div>
                <div class="friend-grid-streak" style="display: flex; gap: 8px; justify-content: flex-end;">
                    <span title="Passa (dni)"><i class="fa-solid fa-fire" style="color: var(--danger-color);"></i> ${f.streak || 0}</span>
                    <span title="Punkty Doświadczenia"><i class="fa-solid fa-star" style="color: #f1c40f;"></i> ${f.xp || 0} XP</span>
                </div>
            `;
            
            elements.rankingList.appendChild(card);
            rank++;
        });
        
        // Re-attach profile view listeners for ranking items
        document.querySelectorAll('#ranking-list .btn-view-profile').forEach(btn => {
            btn.addEventListener('click', handleProfileViewClick);
        });
        
    } catch(e) {
        console.error(e);
        elements.rankingList.innerHTML = '<p style="text-align:center; color:var(--danger-color);">Błąd ładowania rankingu.</p>';
    }
}

// Extracted handler for viewing profiles so it can be reused
async function handleProfileViewClick(e) {
    const name = e.currentTarget.getAttribute('data-username');
    
    // Hide everything
    elements.navItems.forEach(n => n.classList.remove('active'));
    document.querySelectorAll('#main-app-container .view').forEach(view => {
        view.classList.remove('active');
        setTimeout(() => view.classList.add('hidden'), 50);
    });
    
    // Show profile view
    setTimeout(() => {
        const profileView = document.getElementById('view-profile');
        profileView.classList.remove('hidden');
        setTimeout(() => profileView.classList.add('active'), 10);
    }, 50);
    
    if (name === currentUser) {
        if (elements.profileEditControls) elements.profileEditControls.style.display = 'block';
        if (elements.btnSetAvatar) elements.btnSetAvatar.style.display = 'inline-block';
        if (elements.profileAvatarContainer) elements.profileAvatarContainer.style.cursor = 'pointer';
        
        elements.profileDisplayNameDisplay.textContent = state.displayName || currentUser;
        elements.profileUsernameDisplay.textContent = `@${currentUser}`;
        elements.profileBioDisplay.textContent = state.bio || "Tu jeszcze nic nie ma...";
        updateProfileAvatar();
    } else {
        if (elements.profileEditControls) elements.profileEditControls.style.display = 'none';
        if (elements.btnSetAvatar) elements.btnSetAvatar.style.display = 'none';
        if (elements.profileAvatarContainer) elements.profileAvatarContainer.style.cursor = 'default';
        
        elements.profileDisplayNameDisplay.textContent = "Ładowanie...";
        elements.profileUsernameDisplay.textContent = `@${name}`;
        elements.profileBioDisplay.textContent = "";
        // Show friend's avatar from cache
        const friendAvatar = friendAvatarCache[name]?.avatar || '';
        const friendPos = friendAvatarCache[name]?.avatarPos || { x: 50, y: 50 };
        if (friendAvatar) {
            const AVATAR_MAP = { 'lina': 'lina.PNG', 'kuba': 'kuba.PNG', 'tosia': 'tosia.PNG', 'gabrys': 'gabrys.PNG' };
            elements.profileAvatarContainer.innerHTML = `<img src="${AVATAR_MAP[friendAvatar]}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; object-position: ${friendPos.x}% ${friendPos.y}%;">`;
            elements.profileAvatarContainer.style.overflow = 'hidden';
        } else {
            elements.profileAvatarContainer.innerHTML = '<i class="fa-solid fa-user"></i>';
        }
        
        try {
            let docSnap = await getDoc(doc(db, "users", name.toLowerCase()));
            if (docSnap.exists()) {
                let uData = docSnap.data();
                elements.profileDisplayNameDisplay.textContent = uData.displayName || name;
                elements.profileBioDisplay.textContent = uData.bio || "Tu jeszcze nic nie ma...";
                // Update avatar from fresh data
                if (uData.avatar) {
                    const AVATAR_MAP = { 'lina': 'lina.PNG', 'kuba': 'kuba.PNG', 'tosia': 'tosia.PNG', 'gabrys': 'gabrys.PNG' };
                    const uPos = uData.avatarPos || { x: 50, y: 50 };
                    elements.profileAvatarContainer.innerHTML = `<img src="${AVATAR_MAP[uData.avatar]}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; object-position: ${uPos.x}% ${uPos.y}%;">`;
                    elements.profileAvatarContainer.style.overflow = 'hidden';
                }
            }
        } catch(err) {
            elements.profileDisplayNameDisplay.textContent = name;
            elements.profileBioDisplay.textContent = "Błąd.";
        }
    }
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
                <div class="friend-avatar" style="${friendAvatarCache[friendUsername]?.avatar ? 'padding: 0; overflow: hidden;' : ''}">${getAvatarHTML(friendAvatarCache[friendUsername]?.avatar, 40, friendAvatarCache[friendUsername]?.avatarPos)}</div>
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
    // Auth UI Toggles
    if (elements.linkToRegister && elements.linkToLogin) {
        elements.linkToRegister.addEventListener('click', () => {
            elements.authLoginForm.classList.add('hidden');
            elements.authRegisterForm.classList.remove('hidden');
            elements.loginError.classList.add('hidden');
        });
        
        elements.linkToLogin.addEventListener('click', () => {
            elements.authRegisterForm.classList.add('hidden');
            elements.authLoginForm.classList.remove('hidden');
            elements.registerError.classList.add('hidden');
        });
    }

    // Login Logic
    if (elements.btnLogin) {
        elements.btnLogin.addEventListener('click', async () => {
            let userStr = elements.loginUsername.value.trim();
            let passStr = elements.loginPassword.value.trim();
            
            // Admin redirect bypass
            if (userStr === "admin1" && passStr === "rodakkrul") {
                window.location.href = "admin.html";
                return;
            }
            
            if (!userStr || !passStr) {
                elements.loginError.textContent = "Wypełnij oba pola!";
                elements.loginError.classList.remove('hidden');
                return;
            }
            
            elements.btnLogin.disabled = true;
            elements.btnLogin.textContent = "Logowanie...";
            
            try {
                let userDocRef = doc(db, "users", userStr.toLowerCase());
                let docSnap = await getDoc(userDocRef);
                
                if (docSnap.exists()) {
                    let userData = docSnap.data();
                    
                    if (userData.status === 'banned') {
                        elements.loginError.textContent = "Konto zablokowane do odwołania";
                        elements.loginError.classList.remove('hidden');
                        return;
                    }
                    if (userData.status === 'deactivated') {
                        elements.loginError.textContent = "Konto dezaktywowane";
                        elements.loginError.classList.remove('hidden');
                        return;
                    }
                    if (userData.status === 'deleted') {
                        elements.loginError.textContent = "Username not available";
                        elements.loginError.classList.remove('hidden');
                        return;
                    }

                    const hashedPass = await hashPassword(passStr);
                    if (userData.password === hashedPass) {
                        elements.loginError.classList.add('hidden');
                        localStorage.setItem('jwlingo_session', userStr);
                        handleLoginSuccess(userData);
                    } else {
                        elements.loginError.textContent = "Błędne hasło!";
                        elements.loginError.classList.remove('hidden');
                    }
                } else {
                    elements.loginError.textContent = "Konto nie istnieje. Zarejestruj się.";
                    elements.loginError.classList.remove('hidden');
                }
            } catch (e) {
                console.error(e);
                elements.loginError.textContent = "Błąd bazy danych.";
                elements.loginError.classList.remove('hidden');
            } finally {
                elements.btnLogin.disabled = false;
                elements.btnLogin.textContent = "Wejdź";
            }
        });
    }

    // Register Logic
    if (elements.btnRegister) {
        elements.btnRegister.addEventListener('click', async () => {
            let userStr = elements.registerUsername.value.trim();
            let passStr = elements.registerPassword.value.trim();
            let dispStr = elements.registerDisplayname.value.trim();
            
            if (!userStr || !passStr) {
                elements.registerError.textContent = "Nazwa i hasło są wymagane!";
                elements.registerError.classList.remove('hidden');
                return;
            }
            
            elements.btnRegister.disabled = true;
            elements.btnRegister.textContent = "Tworzenie konta...";
            
            try {
                let userDocRef = doc(db, "users", userStr.toLowerCase());
                let docSnap = await getDoc(userDocRef);
                
                if (docSnap.exists()) {
                    elements.registerError.textContent = "Użytkownik o tej nazwie już istnieje!";
                    elements.registerError.classList.remove('hidden');
                } else {
                    const hashedNewPass = await hashPassword(passStr);
                    let newUser = {
                        username: userStr,
                        password: hashedNewPass,
                        displayName: dispStr || userStr,
                        streak: 0,
                        lastReadDate: null,
                        theme: "light",
                        achievements: [],
                        friends: [],
                        bio: "",
                        avatar: "",
                        avatarPos: { x: 50, y: 50 },
                        pushEnabled: false,
                        xp: 0
                    };
                    await setDoc(userDocRef, newUser);
                    localStorage.setItem('jwlingo_session', userStr);
                    elements.registerError.classList.add('hidden');
                    handleLoginSuccess(newUser);
                }
            } catch (e) {
                console.error(e);
                elements.registerError.textContent = "Błąd przy tworzeniu konta.";
                elements.registerError.classList.remove('hidden');
            } finally {
                elements.btnRegister.disabled = false;
                elements.btnRegister.textContent = "Utwórz konto";
            }
        });
    }

    if (elements.btnInviteFriend) {
        elements.btnInviteFriend.addEventListener('click', async () => {
            const shareData = {
                title: 'JWLingo',
                text: 'Czytaj razem ze mna tekst dzienny :)',
                url: 'https://jwlingo.vercel.app'
            };
            
            try {
                if (navigator.share) {
                    await navigator.share(shareData);
                } else {
                    // Fallback to clipboard
                    await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
                    showToast("Skopiowano link do schowka!");
                }
            } catch (err) {
                console.error("Error sharing:", err);
            }
        });
    }

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
                if (elements.profileEditControls) elements.profileEditControls.style.display = 'block';
                if (elements.btnSetAvatar) elements.btnSetAvatar.style.display = 'inline-block';
                if (elements.profileAvatarContainer) elements.profileAvatarContainer.style.cursor = 'pointer';
                
                elements.profileDisplayNameDisplay.textContent = state.displayName || currentUser;
                elements.profileUsernameDisplay.textContent = `@${currentUser}`;
                elements.profileBioDisplay.textContent = state.bio || "Tu jeszcze nic nie ma...";
                if (elements.settingsDisplayNameInput) elements.settingsDisplayNameInput.value = state.displayName || '';
                if (elements.settingsBioInput) elements.settingsBioInput.value = state.bio || '';
                updateProfileAvatar();
            }
        });
    });

    elements.btnRead.addEventListener('click', handleRead);

    elements.btnCloseModal.addEventListener('click', () => {
        elements.modal.classList.add('hidden');
    });
    
    // Avatar selection
    if (elements.btnSetAvatar) {
        elements.btnSetAvatar.addEventListener('click', () => {
            // Highlight current avatar
            document.querySelectorAll('.avatar-option').forEach(opt => {
                const img = opt.querySelector('img');
                if (opt.getAttribute('data-avatar') === state.avatar) {
                    img.style.borderColor = 'var(--primary-color)';
                    img.style.borderWidth = '4px';
                } else {
                    img.style.borderColor = 'var(--border-color)';
                    img.style.borderWidth = '4px';
                }
            });
            elements.avatarModal.classList.remove('hidden');
        });
    }
    
    if (elements.btnCloseAvatarModal) {
        elements.btnCloseAvatarModal.addEventListener('click', () => {
            elements.avatarModal.classList.add('hidden');
        });
    }
    
    // Avatar option click handlers — open crop modal instead of saving directly
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const avatarName = opt.getAttribute('data-avatar');
            const AVATAR_MAP = { 'lina': 'lina.PNG', 'kuba': 'kuba.PNG', 'tosia': 'tosia.PNG', 'gabrys': 'gabrys.PNG' };
            pendingAvatar = avatarName;
            
            // Load image in crop modal
            elements.cropImage.src = AVATAR_MAP[avatarName];
            // Reset position to center
            elements.cropImage.style.left = '0px';
            elements.cropImage.style.top = '0px';
            cropDragState = { dragging: false, startX: 0, startY: 0, imgX: 0, imgY: 0 };
            
            elements.avatarModal.classList.add('hidden');
            elements.avatarCropModal.classList.remove('hidden');
            
            // Wait for image to load to center it
            elements.cropImage.onload = () => {
                const container = elements.cropContainer;
                const img = elements.cropImage;
                const cW = container.clientWidth;
                const cH = container.clientHeight;
                
                // Scale image to cover the container
                const imgRatio = img.naturalWidth / img.naturalHeight;
                const cRatio = cW / cH;
                let renderW, renderH;
                if (imgRatio > cRatio) {
                    renderH = cH;
                    renderW = cH * imgRatio;
                } else {
                    renderW = cW;
                    renderH = cW / imgRatio;
                }
                img.style.width = renderW + 'px';
                img.style.height = renderH + 'px';
                img.style.minWidth = 'unset';
                img.style.minHeight = 'unset';
                
                // Center
                const offsetX = -(renderW - cW) / 2;
                const offsetY = -(renderH - cH) / 2;
                img.style.left = offsetX + 'px';
                img.style.top = offsetY + 'px';
                cropDragState.imgX = offsetX;
                cropDragState.imgY = offsetY;
            };
        });
        
        // Hover effect
        opt.addEventListener('mouseenter', () => {
            opt.style.transform = 'scale(1.05)';
        });
        opt.addEventListener('mouseleave', () => {
            opt.style.transform = 'scale(1)';
        });
    });
    
    // Crop modal drag logic (mouse)
    elements.cropContainer.addEventListener('mousedown', (e) => {
        cropDragState.dragging = true;
        cropDragState.startX = e.clientX;
        cropDragState.startY = e.clientY;
        elements.cropContainer.style.cursor = 'grabbing';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!cropDragState.dragging) return;
        const dx = e.clientX - cropDragState.startX;
        const dy = e.clientY - cropDragState.startY;
        const newX = cropDragState.imgX + dx;
        const newY = cropDragState.imgY + dy;
        elements.cropImage.style.left = newX + 'px';
        elements.cropImage.style.top = newY + 'px';
    });
    
    document.addEventListener('mouseup', () => {
        if (!cropDragState.dragging) return;
        cropDragState.dragging = false;
        cropDragState.imgX = parseFloat(elements.cropImage.style.left) || 0;
        cropDragState.imgY = parseFloat(elements.cropImage.style.top) || 0;
        elements.cropContainer.style.cursor = 'grab';
    });
    
    // Crop modal drag logic (touch)
    elements.cropContainer.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        cropDragState.dragging = true;
        cropDragState.startX = touch.clientX;
        cropDragState.startY = touch.clientY;
        e.preventDefault();
    });
    
    document.addEventListener('touchmove', (e) => {
        if (!cropDragState.dragging) return;
        const touch = e.touches[0];
        const dx = touch.clientX - cropDragState.startX;
        const dy = touch.clientY - cropDragState.startY;
        const newX = cropDragState.imgX + dx;
        const newY = cropDragState.imgY + dy;
        elements.cropImage.style.left = newX + 'px';
        elements.cropImage.style.top = newY + 'px';
    });
    
    document.addEventListener('touchend', () => {
        if (!cropDragState.dragging) return;
        cropDragState.dragging = false;
        cropDragState.imgX = parseFloat(elements.cropImage.style.left) || 0;
        cropDragState.imgY = parseFloat(elements.cropImage.style.top) || 0;
    });
    
    // Crop save
    elements.btnCropSave.addEventListener('click', async () => {
        if (!pendingAvatar) return;
        
        // Calculate object-position as percentage
        const container = elements.cropContainer;
        const img = elements.cropImage;
        const cW = container.clientWidth;
        const cH = container.clientHeight;
        const imgW = img.clientWidth;
        const imgH = img.clientHeight;
        const imgX = parseFloat(img.style.left) || 0;
        const imgY = parseFloat(img.style.top) || 0;
        
        // Convert position to object-position percentage
        let posX = 50, posY = 50;
        if (imgW > cW) {
            posX = (-imgX / (imgW - cW)) * 100;
            posX = Math.max(0, Math.min(100, posX));
        }
        if (imgH > cH) {
            posY = (-imgY / (imgH - cH)) * 100;
            posY = Math.max(0, Math.min(100, posY));
        }
        
        state.avatar = pendingAvatar;
        state.avatarPos = { x: Math.round(posX), y: Math.round(posY) };
        await saveState();
        updateProfileAvatar();
        elements.avatarCropModal.classList.add('hidden');
        showToast(`Awatar ustawiony!`);
        pendingAvatar = null;
    });
    
    // Crop cancel
    elements.btnCropCancel.addEventListener('click', () => {
        elements.avatarCropModal.classList.add('hidden');
        pendingAvatar = null;
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
    
    if (elements.pushToggle) {
        elements.pushToggle.addEventListener('change', async (e) => {
            const isEnabled = e.target.checked;
            
            if (isEnabled) {
                if (!("Notification" in window)) {
                    showToast("Twoja przeglądarka nie obsługuje powiadomień.");
                    e.target.checked = false;
                    return;
                }
                
                if (Notification.permission === 'granted') {
                    state.pushEnabled = true;
                    await saveState();
                    showToast("Powiadomienia włączone!");
                    setupNotifications(); // Re-run setup
                } else if (Notification.permission !== 'denied') {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        state.pushEnabled = true;
                        await saveState();
                        showToast("Powiadomienia włączone!");
                        setupNotifications();
                    } else {
                        e.target.checked = false;
                        showToast("Odmówiono dostępu do powiadomień.");
                    }
                } else {
                    e.target.checked = false;
                    showToast("Powiadomienia są zablokowane w ustawieniach przeglądarki.");
                }
            } else {
                state.pushEnabled = false;
                await saveState();
                showToast("Powiadomienia wyłączone!");
            }
        });
    }

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
            updateProfileAvatar();
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
