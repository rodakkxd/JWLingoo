import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getFirestore, doc, collection, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

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

const elements = {
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

elements.btnAdminLogin.addEventListener('click', () => {
    if (elements.adminPass.value === "maslo") {
        elements.viewAdminAuth.classList.add('hidden');
        elements.adminAppContainer.classList.remove('hidden');
        loadUsers();
    } else {
        elements.adminError.classList.remove('hidden');
    }
});

elements.btnAdminLogout.addEventListener('click', () => {
    elements.viewAdminAuth.classList.remove('hidden');
    elements.adminAppContainer.classList.add('hidden');
    elements.adminPass.value = '';
    elements.navItems[0].click(); // reset to first tab
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
        wrap.innerHTML = `
            <div>
                <strong>${u.username}</strong>
                <div style="font-size: 0.8rem; color: var(--text-light);">Status: ${statusText}</div>
            </div>
            ${u.status !== 'deleted' ? `<button class="btn btn-primary btn-small edit-user-btn" data-username="${u.username}">Zarządzaj</button>` : `<span style="font-size: 0.8rem; color: var(--danger-color); font-weight: bold;">Usunięte</span>`}
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
                <strong>${u.username}</strong>
                <div style="font-size: 0.8rem; color: var(--text-light);">Bieżący Streak: ${u.streak || 0}</div>
            </div>
            <div style="display: flex; gap: 5px; align-items: center;">
                <input type="number" id="streak-input-${u.username}" value="${u.streak || 0}" class="input-field" style="width: 70px; padding: 5px; text-align: center;">
                <button class="btn btn-secondary btn-small save-streak-btn" data-username="${u.username}">Zapisz</button>
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
            updateData.password = Math.random().toString(36).slice(-8); // Randomize password
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
