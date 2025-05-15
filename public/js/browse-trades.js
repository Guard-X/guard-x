import { auth, db } from "./auth/firebase-init.js";
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
            tradePostsList.innerHTML = '<p>No trade posts available from other users.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const tradeData = doc.data();
            const tradeElement = document.createElement("div");
            tradeElement.classList.add("trade-item");

            const postDate = tradeData.createdAt 
                ? tradeData.createdAt.toDate().toLocaleString() 
                : 'Recently';

            tradeElement.innerHTML = `
                <div class="trade-header">
                    <h3>${tradeData.gameName || 'Unknown Game'}: ${tradeData.itemName}</h3>
                    <div class="trade-meta">
                        <span class="condition">${tradeData.condition || 'Condition not specified'}</span>
                        ${tradeData.price ? `<span class="price">$${tradeData.price}</span>` : ''}
                    </div>
                </div>
                <p class="trade-description">${tradeData.description}</p>
                <div class="trade-footer">
                    <small>Posted by: ${tradeData.userEmail || 'Anonymous'}</small>
                    <small>Posted: ${postDate}</small>
                </div>
                <div class="trade-actions">
                    <button class="contact-btn" data-email="${tradeData.userEmail}">
                        <i class="fas fa-envelope"></i> Contact
                    </button>
                    <button class="comments-btn" data-tradeid="${doc.id}">
                        <i class="fas fa-comments"></i> Comments
                    </button>
                </div>
            `;
            tradePostsList.appendChild(tradeElement);
        });

        setupTradeButtons();
    } catch (error) {
        console.error("Error fetching trade posts:", error);
        document.getElementById("trade-posts-list").innerHTML = 
            '<p>Error loading trade posts. Please try again.</p>';
    }
};


// Setup trade action buttons
const setupTradeButtons = () => {
    // Contact buttons
    document.querySelectorAll('.contact-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const email = e.currentTarget.dataset.email;
            if (email) {
                window.location.href = `mailto:${email}?subject=Regarding your trade post`;
            }
        });
    });

    // Comments buttons
    document.querySelectorAll('.comments-btn').forEach(btn => {
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
    commentsContainer.innerHTML = '<p>Loading comments...</p>';

    const q = query(
        commentsCollectionRef,
        where("tradeId", "==", tradeId),
        orderBy("createdAt", "desc")
    );

    onSnapshot(q, (snapshot) => {
        commentsContainer.innerHTML = '';

        if (snapshot.empty) {
            commentsContainer.innerHTML = '<p>No comments yet. Be the first to comment!</p>';
            return;
        }

        snapshot.forEach(doc => {
            const comment = doc.data();
            const commentId = doc.id;
            const commentElement = document.createElement('div');
            commentElement.classList.add('comment');

            const commentDate = comment.createdAt 
                ? comment.createdAt.toDate().toLocaleString() 
                : 'Recently';

            commentElement.innerHTML = `
                <div class="comment-header">
                    <strong>${comment.userEmail || 'Anonymous'}</strong>
                    <small>${commentDate}</small>
                </div>
                <p>${comment.text}</p>
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

                // After successfully adding a reply
                if (comment.userId !== user.uid) { // Don't notify yourself
                    await addDoc(collection(db, "notifications"), {
                        userId: comment.userId, // The owner of the comment
                        type: "reply",
                        tradeId: currentTradeId,
                        commentId: commentId,
                        replyText: replyText,
                        fromUser: user.email,
                        createdAt: serverTimestamp(),
                        read: false
                    });
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