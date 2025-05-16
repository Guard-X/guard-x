import { auth, db } from './firebase-init.js';
import {
    collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, onSnapshot, serverTimestamp, updateDoc, query, where
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

const midmanOnlineList = document.getElementById('midman-online-list');
const queueList = document.getElementById('queue-list');
const queueInfo = document.getElementById('queue-info');
const requestBtn = document.getElementById('request-midman-btn');
const adminControls = document.getElementById('midman-admin-controls');
const adminQueueList = document.getElementById('admin-queue-list');

let currentUser = null;
let currentUserRole = "user";
let queueUnsub = null;
let midmanUnsub = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    currentUser = user;
    // Get user role
    const userDoc = await getDoc(doc(db, "users", user.uid));
    currentUserRole = userDoc.exists() ? userDoc.data().role : "user";
    if (currentUserRole === "midman") {
        adminControls.style.display = "block";
        listenToAdminQueue();
    }
    listenToQueue();
    listenToMidmen();
    updateQueueInfo();
});

function listenToMidmen() {
    // Assume midmen are users with { role: "midman", online: true }
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("role", "==", "midman"), where("online", "==", true));
    if (midmanUnsub) midmanUnsub();
    midmanUnsub = onSnapshot(q, (snap) => {
        midmanOnlineList.innerHTML = "";
        if (snap.empty) {
            midmanOnlineList.innerHTML = "<span class='loading'>No midmen are online right now.</span>";
        } else {
            snap.forEach(docSnap => {
                const m = docSnap.data();
                midmanOnlineList.innerHTML += `
                    <div class="midman-online">
                        <i class="fas fa-user-shield"></i>
                        <span>${m.username || m.email || docSnap.id}</span>
                    </div>
                `;
            });
        }
    });
}

function listenToQueue() {
    // Queue is a collection: midmanQueue, each doc: { userId, username, requestedAt }
    const queueRef = collection(db, "midmanQueue");
    const q = query(queueRef, where("status", "==", "waiting"));
    if (queueUnsub) queueUnsub();
    queueUnsub = onSnapshot(q, (snap) => {
        queueList.innerHTML = "";
        let position = 1;
        let myPosition = null;
        if (snap.empty) {
            queueList.innerHTML = "<span class='loading'>No one is in the queue.</span>";
        } else {
            snap.forEach(docSnap => {
                const qd = docSnap.data();
                const isMe = qd.userId === currentUser?.uid;
                if (isMe) myPosition = position;
                queueList.innerHTML += `
                    <div class="queue-user${isMe ? " me" : ""}">
                        <span class="queue-position">${position}</span>
                        <span>${qd.username || qd.userEmail || qd.userId}</span>
                        ${isMe ? "<span>(You)</span>" : ""}
                    </div>
                `;
                position++;
            });
        }
        updateQueueInfo(myPosition, position - 1);
    });
}

async function updateQueueInfo(myPosition = null, total = null) {
    if (myPosition !== null && total !== null) {
        if (myPosition) {
            queueInfo.innerHTML = `You are <b>#${myPosition}</b> in line. ${total - myPosition} ahead of you.`;
        } else {
            queueInfo.innerHTML = `You are not in the queue.`;
        }
        return;
    }
    // fallback: recalculate from Firestore
    const queueRef = collection(db, "midmanQueue");
    const q = query(queueRef, where("status", "==", "waiting"));
    const snap = await getDocs(q);
    let pos = null, count = 0;
    snap.forEach((docSnap, idx) => {
        count++;
        if (docSnap.data().userId === currentUser?.uid) pos = idx + 1;
    });
    if (pos) {
        queueInfo.innerHTML = `You are <b>#${pos}</b> in line. ${count - pos} ahead of you.`;
    } else {
        queueInfo.innerHTML = `You are not in the queue.`;
    }
}

if (requestBtn) {
    requestBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        // Check if already in queue
        const queueRef = collection(db, "midmanQueue");
        const q = query(queueRef, where("userId", "==", currentUser.uid), where("status", "==", "waiting"));
        const snap = await getDocs(q);
        if (!snap.empty) {
            alert("You are already in the queue.");
            return;
        }
        await addDoc(queueRef, {
            userId: currentUser.uid,
            username: currentUser.displayName || "",
            userEmail: currentUser.email,
            requestedAt: serverTimestamp(),
            status: "waiting"
        });
        updateQueueInfo();
    });
}

// ADMIN: Listen to full queue for midman controls
function listenToAdminQueue() {
    const queueRef = collection(db, "midmanQueue");
    const q = query(queueRef, where("status", "==", "waiting"));
    onSnapshot(q, (snap) => {
        adminQueueList.innerHTML = "";
        if (snap.empty) {
            adminQueueList.innerHTML = "<span class='loading'>No pending requests.</span>";
        } else {
            snap.forEach(docSnap => {
                const qd = docSnap.data();
                adminQueueList.innerHTML += `
                    <div class="queue-user">
                        <span class="queue-position"></span>
                        <span>${qd.username || qd.userEmail || qd.userId}</span>
                        <input type="text" class="add-user-input" placeholder="Other User UID or Email" style="margin-left:1em; width: 180px;">
                        <button class="accept-btn" data-id="${docSnap.id}"><i class="fas fa-check"></i> Accept</button>
                        <button class="cancel-btn" data-id="${docSnap.id}"><i class="fas fa-times"></i> Cancel</button>
                    </div>
                `;
            });
            // Add event listeners for accept/cancel
            adminQueueList.querySelectorAll('.accept-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    const queueId = btn.getAttribute('data-id');
                    const queueUserDiv = btn.closest('.queue-user');
                    const input = queueUserDiv.querySelector('.add-user-input');
                    const otherUserIdentifier = input ? input.value.trim() : "";

                    if (!otherUserIdentifier) {
                        alert("Please enter the other user's UID or email.");
                        return;
                    }

                    // Find the other user by username
                    let otherUserUid = null, otherUserName = "";
                    const usersRef = collection(db, "users");
                    const q = query(usersRef, where("username", "==", otherUserIdentifier));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const docSnap = snap.docs[0];
                        otherUserUid = docSnap.id;
                        otherUserName = docSnap.data().username;
                    }
                    if (!otherUserUid) {
                        alert("Other user not found.");
                        return;
                    }

                    // Accept: update queue status and create trade room
                    await updateDoc(doc(db, "midmanQueue", queueId), {
                        status: "accepted",
                        midmanId: currentUser.uid,
                        acceptedAt: serverTimestamp()
                    });
                    // Get queue data for trade room creation
                    const queueSnap = await getDoc(doc(db, "midmanQueue", queueId));
                    const qd = queueSnap.data();

                    // Create trade room with requester, other user, and midman
                    await addDoc(collection(db, "tradeRooms"), {
                        participants: [qd.userId, otherUserUid, currentUser.uid],
                        traders: [
                            { uid: qd.userId, username: qd.username || qd.userEmail || qd.userId, items: [] },
                            { uid: otherUserUid, username: otherUserName, items: [] }
                        ],
                        midman: { uid: currentUser.uid, username: currentUser.displayName || currentUser.email },
                        status: "active",
                        createdAt: serverTimestamp()
                    });
                    alert("Trade room created!");
                };
            });
            adminQueueList.querySelectorAll('.cancel-btn').forEach(btn => {
                btn.onclick = async () => {
                    const queueId = btn.getAttribute('data-id');
                    if (confirm("Cancel this request?")) {
                        await updateDoc(doc(db, "midmanQueue", queueId), {
                            status: "cancelled",
                            cancelledAt: serverTimestamp()
                        });
                    }
                };
            });
        }
    });
}