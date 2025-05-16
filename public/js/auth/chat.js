import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import {
    collection, doc, getDoc, getDocs, setDoc, addDoc, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

let currentUser = null;
let selectedFriend = null;
let unsubscribeChat = null;

// Load friends and set up UI
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    currentUser = user;
    await loadFriends();
});

async function loadFriends() {
    const friendsUl = document.getElementById("friends-ul");
    friendsUl.innerHTML = "<li>Loading...</li>";
    const friendsRef = collection(db, "users", currentUser.uid, "friends");
    const snap = await getDocs(friendsRef);
    friendsUl.innerHTML = "";
    if (snap.empty) {
        friendsUl.innerHTML = "<li>No friends yet.</li>";
        return;
    }
    snap.forEach(docSnap => {
        const friend = docSnap.data();
        const li = document.createElement("li");
        li.textContent = friend.username || friend.email || friend.id;
        li.onclick = () => selectFriend(friend);
        li.dataset.uid = friend.id;
        friendsUl.appendChild(li);
    });
}

function selectFriend(friend) {
    selectedFriend = friend;
    document.getElementById("chat-with").textContent = `Chat with ${friend.username || friend.email || friend.id}`;
    document.querySelectorAll("#friends-ul li").forEach(li => {
        li.classList.toggle("active", li.dataset.uid === friend.id);
    });
    loadChatMessages(friend.id);
}

function getChatId(uid1, uid2) {
    // Always order UIDs to ensure both users use the same chatId
    return [uid1, uid2].sort().join("_");
}

function loadChatMessages(friendUid) {
    const chatId = getChatId(currentUser.uid, friendUid);
    const messagesRef = collection(db, "chats", chatId, "messages");
    const chatMessagesDiv = document.getElementById("chat-messages");
    chatMessagesDiv.innerHTML = "<div>Loading...</div>";

    // Unsubscribe previous listener
    if (unsubscribeChat) unsubscribeChat();

    const q = query(messagesRef, orderBy("createdAt", "asc"));
    unsubscribeChat = onSnapshot(q, (snap) => {
        chatMessagesDiv.innerHTML = "";
        snap.forEach(docSnap => {
            const msg = docSnap.data();
            const div = document.createElement("div");
            div.className = "message " + (msg.from === currentUser.uid ? "me" : "them");
            div.textContent = msg.text;
            chatMessagesDiv.appendChild(div);
        });
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    });
}

// Send message
document.getElementById("chat-form").onsubmit = async (e) => {
    e.preventDefault();
    if (!selectedFriend) return;
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const chatId = getChatId(currentUser.uid, selectedFriend.id);
    const messagesRef = collection(db, "chats", chatId, "messages");
    await addDoc(messagesRef, {
        from: currentUser.uid,
        to: selectedFriend.id,
        text,
        createdAt: new Date()
    });
};