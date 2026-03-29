import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAEDwba96XeU5xPwHJ8McK6DsP8O3cROWk",
    authDomain: "jwlingo-global.firebaseapp.com",
    projectId: "jwlingo-global",
    storageBucket: "jwlingo-global.firebasestorage.app",
    messagingSenderId: "308314587720",
    appId: "1:308314587720:web:47790414db78c3a8c04e7d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Password hashing for legacy migration
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sanitize user input to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Firebase Auth requires min 6 chars — pad short legacy passwords
function firebasePassword(pass) {
    while (pass.length < 6) pass += '_';
    return pass;
}

const elements = {
    adminUsername: document.getElementById('admin-username'),
    adminPass: document.getElementById('admin-pass'),
    btnAdminLogin: document.getElementById('btn-admin-login'),
    adminError: document.getElementById('admin-error'),
    adminAppContainer: document.getElementById('admin-app-container'),
    viewAdminAuth: document.getElementById('view-admin-auth'),
    navItems: document.querySelectorAll('.nav-item'),
    views: document.querySelectorAll('#admin-content .view'),
    adminUsersList: document.getElementById('admin-users-list'),
    adminStreaksList: document.getElementById('admin-streaks-list'),
    btnAdminLogout: document.getElementById('btn-admin-logout'),
    btnAdminFixXp: document.getElementById('btn-admin-fix-xp'),
    adminModal: document.getElementById('admin-modal'),
    modalUsername: document.getElementById('modal-username'),
    btnActionBan: document.getElementById('btn-action-ban'),
    btnActionDeactivate: document.getElementById('btn-action-deactivate'),
    btnActionActivate: document.getElementById('btn-action-activate'),
    btnActionDelete: document.getElementById('btn-action-delete'),
    btnActionCancel: document.getElementById('btn-action-cancel'),
    toastContainer: document.getElementById('toast-container')
};

let allUsers = [];
let selectedUser = null;

function showToast(message) {
    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
}

// Admin Login - Firebase Auth + role check
elements.btnAdminLogin.addEventListener('click', async () => {
    const username = elements.adminUsername.value.trim();
    const password = elements.adminPass.value.trim();

    if (!username || !password) {
        elements.adminError.textContent = "Wypełnij oba pola!";
        elements.adminError.classList.remove('hidden');
        return;
    }

    elements.btnAdminLogin.disabled = true;
    elements.btnAdminLogin.textContent = "Logowanie...";
    elements.adminError.classList.add('hidden');

    const syntheticEmail = username.toLowerCase() + "@jwlingo.app";

    try {
        // Try Firebase Auth login
        try {
            await signInWithEmailAndPassword(auth, syntheticEmail, firebasePassword(password));
        } catch (authErr) {
            // If user not in Firebase Auth, try legacy migration
            if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
                let docSnap = await getDoc(doc(db, "users", username.toLowerCase()));
                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    if (userData.firebaseAuthMigrated) {
                        throw new Error("Błędne hasło!");
                    }
                    const hashedPass = await hashPassword(password);
                    if (userData.password === hashedPass) {
                        const cred = await createUserWithEmailAndPassword(auth, syntheticEmail, firebasePassword(password));
                        await updateDoc(doc(db, "users", username.toLowerCase()), {
                            authUid: cred.user.uid,
                            firebaseAuthMigrated: true
                        });
                    } else {
                        throw new Error("Błędne hasło!");
                    }
                } else {
                    throw new Error("Konto nie istnieje.");
                }
            } else {
                throw authErr;
            }
        }

        // Auth successful - check admin role
        let docSnap = await getDoc(doc(db, "users", username.toLowerCase()));
        if (docSnap.exists() && docSnap.data().role === 'admin') {
            elements.viewAdminAuth.classList.add('hidden');
            elements.adminAppContainer.classList.remove('hidden');
            loadUsers();
        } else {
            await signOut(auth);
            elements.adminError.textContent = "Brak uprawnień administratora.";
            elements.adminError.classList.remove('hidden');
        }
    } catch (e) {
        elements.adminError.textContent = e.message || "Błąd logowania.";
        elements.adminError.classList.remove('hidden');
    } finally {
        elements.btnAdminLogin.disabled = false;
        elements.btnAdminLogin.textContent = "Zaloguj";
    }
});

elements.btnAdminLogout.addEventListener('click', async () => {
    await signOut(auth);
    elements.viewAdminAuth.classList.remove('hidden');
    elements.adminAppContainer.classList.add('hidden');
    elements.adminPass.value = '';
    if (elements.adminUsername) elements.adminUsername.value = '';
    elements.navItems[0].click();
});

if (elements.btnAdminFixXp) {
    elements.btnAdminFixXp.addEventListener('click', async () => {
        elements.btnAdminFixXp.textContent = "Naprawianie XP...";
        elements.btnAdminFixXp.disabled = true;
        try {
            const snapshot = await getDocs(collection(db, "users"));
            let count = 0;
            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                if (data.xp === undefined) {
                    const calculatedXp = (data.streak || 0) * 20;
                    await updateDoc(doc(db, "users", docSnap.id), { xp: calculatedXp });
                    count++;
                }
            }
            showToast(`Gotowe! Naprawiono XP u ${count} uzytkowników.`);
            loadUsers();
        } catch (e) {
            showToast(`Błąd: ${e.message}`);
        } finally {
            elements.btnAdminFixXp.innerHTML = '<i class="fa-solid fa-star"></i> Napraw XP wszystkim';
            elements.btnAdminFixXp.disabled = false;
        }
    });
}

elements.navItems.forEach(item => {
    item.addEventListener('click', () => {
        elements.navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        const targetView = item.getAttribute('data-target');
        elements.views.forEach(view => {
            if (view.id === targetView) {
                view.classList.remove('hidden');
                view.classList.add('active');
            } else {
                view.classList.add('hidden');
                view.classList.remove('active');
            }
        });
        if(targetView === 'tab-konta' || targetView === 'tab-streaks') loadUsers();
    });
});

async function loadUsers() {
    try {
        let snapshot = await getDocs(collection(db, "users"));
        allUsers = [];
        snapshot.forEach(docSnap => {
            allUsers.push({ id: docSnap.id, ...docSnap.data() });
        });
        renderUsersList();
        renderStreaksList();
    } catch(e) {
        showToast("Błąd ładowania: " + e.message);
    }
}

function renderUsersList() {
    elements.adminUsersList.innerHTML = '';
    allUsers.forEach(u => {
        const wrap = document.createElement('div');
        wrap.className = 'user-row';
        let statusText = u.status ? u.status : 'Aktywne';
        let migrated = u.firebaseAuthMigrated ? '✓ Firebase' : '⚠ Legacy';
        wrap.innerHTML = `
            <div>
                <strong>${escapeHtml(u.username)}</strong>
                <div style="font-size: 0.8rem; color: var(--text-light);">Status: ${escapeHtml(statusText)} | ${migrated}</div>
            </div>
            ${u.status !== 'deleted' ? `<button class="btn btn-primary btn-small edit-user-btn" data-username="${escapeHtml(u.username)}">Zarządzaj</button>` : `<span style="font-size: 0.8rem; color: var(--danger-color); font-weight: bold;">Usunięte</span>`}
        `;
        elements.adminUsersList.appendChild(wrap);
    });
    
    document.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            selectedUser = e.target.getAttribute('data-username');
            elements.modalUsername.textContent = selectedUser;
            elements.adminModal.classList.remove('hidden');
        });
    });
}

function renderStreaksList() {
    elements.adminStreaksList.innerHTML = '';
    allUsers.forEach(u => {
        if(u.status === 'deleted') return;
        const wrap = document.createElement('div');
        wrap.className = 'user-row';
        wrap.innerHTML = `
            <div style="flex: 1;">
                <strong>${escapeHtml(u.username)}</strong>
                <div style="font-size: 0.8rem; color: var(--text-light);">Bieżący Streak: ${u.streak || 0}</div>
            </div>
            <div style="display: flex; gap: 5px; align-items: center;">
                <input type="number" id="streak-input-${escapeHtml(u.username)}" value="${u.streak || 0}" class="input-field" style="width: 70px; padding: 5px; text-align: center;">
                <button class="btn btn-secondary btn-small save-streak-btn" data-username="${escapeHtml(u.username)}">Zapisz</button>
            </div>
        `;
        elements.adminStreaksList.appendChild(wrap);
    });
    
    document.querySelectorAll('.save-streak-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const username = e.target.getAttribute('data-username');
            const newStreak = parseInt(document.getElementById(`streak-input-${username}`).value, 10);
            try {
                await updateDoc(doc(db, "users", username.toLowerCase()), { streak: newStreak });
                showToast(`Zaktualizowano streak dla ${username}`);
                loadUsers();
            } catch(err) {
                showToast("Błąd: " + err.message);
            }
        });
    });
}

elements.btnActionCancel.addEventListener('click', () => {
    elements.adminModal.classList.add('hidden');
    selectedUser = null;
});

async function updateUserStatus(statusMsg, successToast) {
    if (!selectedUser) return;
    try {
        let updateData = { status: statusMsg };
        if (statusMsg === 'deleted') {
            updateData.bio = "";
            updateData.friends = [];
            updateData.displayName = "";
            updateData.streak = 0;
            updateData.password = Math.random().toString(36).slice(-8);
        }
        await updateDoc(doc(db, "users", selectedUser.toLowerCase()), updateData);
        showToast(successToast);
        elements.adminModal.classList.add('hidden');
        loadUsers();
    } catch(e) {
        showToast("Błąd: " + e.message);
    }
}

elements.btnActionBan.addEventListener('click', () => updateUserStatus('banned', 'Zbanowano użytkownika.'));
elements.btnActionDeactivate.addEventListener('click', () => updateUserStatus('deactivated', 'Dezaktywowano użytkownika.'));
elements.btnActionActivate.addEventListener('click', () => updateUserStatus('active', 'Konto aktywowane pomyślnie.'));
elements.btnActionDelete.addEventListener('click', () => {
    if (confirm("Na pewno usunąć zawartość konta? Tego nie da się cofnąć! (Login zostanie zablokowany)")) {
        updateUserStatus('deleted', 'Usunięto konto użytkownika.');
    }
});
