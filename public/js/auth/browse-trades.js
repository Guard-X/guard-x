import { auth, db } from "./firebase-init.js";
import { 
    collection, 
    getDocs,
    query,
    where,
    doc,
    getDoc,
    addDoc,
    serverTimestamp,
    onSnapshot,
    orderBy
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { 
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

const tradeCollectionRef = collection(db, "trades");
const commentsCollectionRef = collection(db, "comments");

let currentTradeId = null;
let currentUserId = null;

// Display all trade posts except current user's
const displayAllTradePosts = async (userId) => {
    try {
        const q = query(tradeCollectionRef, where("userId", "!=", userId), orderBy("userId"));
        const querySnapshot = await getDocs(q);

        const tradePostsList = document.getElementById("trade-posts-list");
        tradePostsList.innerHTML = '';

        if (querySnapshot.empty) {
            tradePostsList.innerHTML = '<div class="no-trades"><i class="fas fa-info-circle"></i> No trade posts available from other users.</div>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const tradeData = docSnap.data();
            const tradeElement = document.createElement("div");
            tradeElement.classList.add("trade-post");

            const priceDisplay = tradeData.price
                ? `<div class="price-tag">${tradeData.price}</div>`
                : '';

            const createdAt = tradeData.createdAt?.toDate ? tradeData.createdAt.toDate() : new Date();

            tradeElement.innerHTML = `
                <h3>${tradeData.gameName || 'Unknown Game'}</h3>
                <div class="game-name">${tradeData.itemName || ''}</div>
                ${priceDisplay}
                <div class="description">${tradeData.description || ''}</div>
                <div class="trade-meta">
                    <span class="user"><i class="fas fa-user"></i> ${tradeData.userEmail || 'Anonymous'}</span>
                    <span class="date"><i class="fas fa-clock"></i> ${createdAt.toLocaleString()}</span>
                </div>
                <button class="comment-btn" data-tradeid="${docSnap.id}">
                    <i class="fas fa-comments"></i> Comments
                </button>
            `;
            tradePostsList.appendChild(tradeElement);
        });

        setupTradeButtons();
    } catch (error) {
        console.error("Error fetching trade posts:", error);
        document.getElementById("trade-posts-list").innerHTML =
            '<div class="no-trades"><i class="fas fa-exclamation-triangle"></i> Error loading trade posts. Please try again.</div>';
    }
};

// Setup trade action buttons
const setupTradeButtons = () => {
    // Only Comments buttons now
    document.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentTradeId = e.currentTarget.dataset.tradeid;
            openCommentsModal(currentTradeId);
        });
    });
};

// Open comments modal and load comments
const openCommentsModal = async (tradeId) => {
    const modal = document.getElementById('comment-modal');
    try {
        const tradeDoc = await getDoc(doc(db, "trades", tradeId));
        if (tradeDoc.exists()) {
            const tradeData = tradeDoc.data();
            document.getElementById('trade-item-title').textContent = 
                `${tradeData.gameName || 'Game'}: ${tradeData.itemName || 'Item'}`;
            
            modal.style.display = 'block';
            loadComments(tradeId);
        }
    } catch (error) {
        console.error("Error opening comments:", error);
        alert("Could not load comments for this trade.");
    }
};

// Load comments for a trade
const loadComments = (tradeId) => {
    const commentsContainer = document.getElementById('comments-container');
    commentsContainer.innerHTML = '<div class="no-trades"><i class="fas fa-spinner fa-spin"></i> Loading comments...</div>';

    const q = query(
        commentsCollectionRef,
        where("tradeId", "==", tradeId),
        orderBy("createdAt", "desc")
    );

    onSnapshot(q, (snapshot) => {
        commentsContainer.innerHTML = '';

        if (snapshot.empty) {
            commentsContainer.innerHTML = '<div class="no-trades">No comments yet.</div>';
            return;
        }

        snapshot.forEach(doc => {
            const comment = doc.data();
            const commentId = doc.id;
            const commentElement = document.createElement('div');
            commentElement.classList.add('comment');
            commentElement.innerHTML = `
                <span class="comment-user">${comment.userEmail || 'Anonymous'}:</span>
                <span>${comment.text}</span>
                <small>${comment.createdAt ? comment.createdAt.toDate().toLocaleString() : 'Recently'}</small>
                <button class="reply-btn" data-commentid="${commentId}"><i class="fas fa-reply"></i> Reply</button>
                <div class="replies" id="replies-${commentId}"></div>
                <form class="reply-form" id="reply-form-${commentId}" style="display:none; margin-top:0.5rem;">
                    <textarea class="reply-text" rows="2" placeholder="Write a reply..." required></textarea>
                    <button type="submit" class="reply-submit-btn"><i class="fas fa-paper-plane"></i> Reply</button>
                </form>
            `;
            commentsContainer.appendChild(commentElement);

            // Load replies for this comment
            loadReplies(commentId);

            // Reply button logic
            commentElement.querySelector('.reply-btn').onclick = () => {
                // Hide all other reply forms
                document.querySelectorAll('.reply-form').forEach(f => f.style.display = 'none');
                // Show this one
                commentElement.querySelector('.reply-form').style.display = 'block';
            };

            // Reply form submit logic
            commentElement.querySelector('.reply-form').onsubmit = async (e) => {
                e.preventDefault();
                const user = auth.currentUser;
                if (!user) return;
                const replyText = commentElement.querySelector('.reply-text').value.trim();
                if (!replyText) return;
                const repliesRef = collection(db, "comments", commentId, "replies");
                await addDoc(repliesRef, {
                    userId: user.uid,
                    userEmail: user.email,
                    text: replyText,
                    createdAt: serverTimestamp()
                });
                commentElement.querySelector('.reply-text').value = '';
                commentElement.querySelector('.reply-form').style.display = 'none';

                // Notify the parent comment owner
                const parentCommentDoc = await getDoc(doc(db, "comments", commentId));
                if (parentCommentDoc.exists()) {
                    const parentCommentData = parentCommentDoc.data();
                    const parentCommentOwnerId = parentCommentData.userId;
                    if (parentCommentOwnerId !== user.uid) {
                        await addDoc(collection(db, "notifications"), {
                            userId: parentCommentOwnerId,
                            type: "reply",
                            tradeId: currentTradeId,
                            commentId: commentId,
                            replyText: replyText,
                            fromUser: user.email,
                            createdAt: serverTimestamp(),
                            read: false
                        });
                    }
                }
            };
        });
    });
};

// Helper to load replies for a comment
function loadReplies(commentId) {
    const repliesContainer = document.getElementById(`replies-${commentId}`);
    const repliesRef = collection(db, "comments", commentId, "replies");
    const q = query(repliesRef, orderBy("createdAt", "asc"));
    onSnapshot(q, (snapshot) => {
        repliesContainer.innerHTML = '';
        snapshot.forEach(docSnap => {
            const reply = docSnap.data();
            repliesContainer.innerHTML += `
                <div class="reply">
                    <span class="reply-user">${reply.userEmail || 'Anonymous'}:</span>
                    <span>${reply.text}</span>
                    <small>${reply.createdAt ? reply.createdAt.toDate().toLocaleString() : 'Recently'}</small>
                </div>
            `;
        });
    });
}

// Handle comment submission
const setupCommentForm = () => {
    const commentForm = document.getElementById('comment-form');
    
    commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const commentText = document.getElementById('comment-text').value.trim();
        const user = auth.currentUser;
        
        if (!commentText || !currentTradeId || !user) return;
        
        try {
            // Add the comment
            const commentDocRef = await addDoc(commentsCollectionRef, {
                tradeId: currentTradeId,
                userId: user.uid,
                userEmail: user.email,
                text: commentText,
                createdAt: serverTimestamp()
            });
            
            document.getElementById('comment-text').value = '';

            // Fetch the trade to get the owner
            const tradeDoc = await getDoc(doc(db, "trades", currentTradeId));
            if (tradeDoc.exists()) {
                const tradeData = tradeDoc.data();
                if (tradeData.userId !== user.uid) { // Don't notify yourself
                    await addDoc(collection(db, "notifications"), {
                        userId: tradeData.userId, // The owner of the trade
                        type: "comment",
                        tradeId: currentTradeId,
                        commentId: commentDocRef.id,
                        commentText: commentText,
                        fromUser: user.email,
                        createdAt: serverTimestamp(),
                        read: false
                    });
                }
            }
        } catch (error) {
            console.error("Error posting comment:", error);
            alert("Failed to post comment. Please try again.");
        }
    });
};

// Close modal
const setupModalClose = () => {
    const modal = document.getElementById('comment-modal');
    const closeBtn = document.querySelector('.close-modal');
    
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
};

// Initialize the browse trades page
document.addEventListener("DOMContentLoaded", () => {
    setupCommentForm();
    setupModalClose();
    
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = "index.html";
            return;
        }
        
        currentUserId = user.uid;
        displayAllTradePosts(user.uid);
    });
});