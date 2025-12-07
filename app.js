// Scoop Lovers - Distributor Portal
// Main Application Logic

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged,
    signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    addDoc,
    serverTimestamp,
    query,
    where,
    setDoc,
    doc,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Configuration
const appId = typeof __app_id !== 'undefined' ? __app_id : 'scoop-lovers-distributor-portal';
const firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : {
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_AUTH_DOMAIN",
        projectId: "YOUR_PROJECT_ID"
    };

// Global State
let db, auth, userId;
let productsData = [];
let cart = {};
let currentLang = 'en';

// Import translations and categories
import { translations, categoryTranslations } from './translations.js';
import { productCategories } from './products.js';

// Language Switching
window.switchLanguage = function(lang) {
    currentLang = lang;
    document.getElementById('lang-selector-mobile').value = lang;
    document.getElementById('lang-selector-desktop').value = lang;
    
    if (lang === 'mr') {
        document.body.classList.add('lang-mr');
    } else {
        document.body.classList.remove('lang-mr');
    }
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            el.textContent = translations[currentLang][key];
        }
    });
    
    renderGroupedProducts();
    fetchOrderHistory();
    updateOrderButton();
};

function t(key) {
    return translations[currentLang][key] || key;
}

// Image Modal
window.openImageModal = (name) => {
    const imgUrl = `https://placehold.co/600x600/FFF8F0/EC4899?text=${encodeURIComponent(name)}&font=roboto`;
    document.getElementById('product-image-preview').src = imgUrl;
    document.getElementById('image-modal-title').textContent = name;
    
    const modal = document.getElementById('image-modal');
    modal.classList.remove('hidden');
    modal.firstElementChild.classList.remove('scale-95', 'opacity-0');
    modal.firstElementChild.classList.add('scale-100', 'opacity-100');
};

window.closeImageModal = () => {
    const modal = document.getElementById('image-modal');
    modal.classList.add('hidden');
};

// Initialize Application
async function initialize() {
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                document.getElementById('distributor-id').textContent = userId;
                await onUserAuthenticated();
            } else if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
        });
    } catch (error) {
        console.error(error);
        showErrorModal(t('errorTitle'), 'Connection failed');
    }
}

async function onUserAuthenticated() {
    try {
        const ref = collection(db, `/artifacts/${appId}/public/data/products`);
        const snap = await getDocs(ref);
        
        if (snap.docs.length < 100) {
            await seedInitialProducts();
        }
        
        document.getElementById('loading-state').classList.add('hidden');
        ['app-header', 'main-content', 'order-footer'].forEach(id => {
            document.getElementById(id).classList.remove('hidden');
        });
        
        updateOrderButton();
        
        // Hide instruction text after 7 seconds
        setTimeout(() => {
            const instructionText = document.getElementById('instruction-text');
            instructionText.style.opacity = '0';
            setTimeout(() => {
                instructionText.style.display = 'none';
            }, 1000);
        }, 7000);
        
        fetchProducts();
        fetchOrderHistory();
    } catch (error) {
        document.getElementById('loading-state').classList.add('hidden');
        showErrorModal(t('errorTitle'), 'Init Failed');
    }
}

// Fetch Products
function fetchProducts() {
    onSnapshot(collection(db, `/artifacts/${appId}/public/data/products`), (snapshot) => {
        productsData = [];
        snapshot.forEach(doc => {
            productsData.push({ id: doc.id, ...doc.data() });
        });
        renderGroupedProducts();
    });
}

// Fetch Order History
function fetchOrderHistory() {
    if (!userId) return;
    
    const ordersQuery = query(
        collection(db, `/artifacts/${appId}/users/${userId}/orders`),
        where("distributorId", "==", userId)
    );
    
    onSnapshot(ordersQuery, (snapshot) => {
        const list = document.getElementById('past-orders-list');
        
        if (snapshot.empty) {
            list.innerHTML = `<p class="text-gray-500 text-center py-8">${t('noOrdersMsg')}</p>`;
            return;
        }
        
        const orders = [];
        snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
        orders.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        
        list.innerHTML = '';
        orders.forEach(order => list.appendChild(createOrderHistoryCard(order)));
    });
}

// Render Products
function renderGroupedProducts() {
    const container = document.getElementById('product-list-container');
    container.innerHTML = '';
    
    const groups = {};
    productCategories.forEach(cat => groups[cat.category] = []);
    productsData.forEach(product => {
        if (groups[product.description]) {
            groups[product.description].push(product);
        }
    });
    
    let isFirst = true;
    
    for (const [category, products] of Object.entries(groups)) {
        if (products.length === 0) continue;
        
        const details = document.createElement('details');
        details.className = 'bg-white/50 rounded-xl transition-all shadow-lg group ring-1 ring-black ring-opacity-5 mb-3';
        details.open = isFirst;
        
        const displayCategory = (currentLang === 'mr' && categoryTranslations[category]) 
            ? categoryTranslations[category] 
            : category;
        
        details.innerHTML = `
            <summary class="p-4 flex justify-between items-center cursor-pointer hover:bg-amber-50 rounded-t-xl">
                <h3 class="font-bold text-lg text-gray-800">${displayCategory}</h3>
                <svg class="w-5 h-5 text-gray-500 transition-transform group-open:rotate-90" 
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6" stroke-width="2.5" 
                              stroke-linecap="round" stroke-linejoin="round"></polyline>
                </svg>
            </summary>
            <div class="accordion-content p-4 grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200"></div>
        `;
        
        const content = details.querySelector('.accordion-content');
        products.forEach(product => content.appendChild(createProductCard(product)));
        
        container.appendChild(details);
        isFirst = false;
    }
}

// Create Product Card
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg p-3 flex items-center justify-between shadow-sm';
    
    const quantity = cart[product.id] || 0;
    
    card.innerHTML = `
        <div class="flex items-center">
            <h4 class="font-semibold text-md text-gray-700 mr-2 cursor-pointer"
                onclick="openImageModal('${product.name}')">${product.name}</h4>
            <button onclick="openImageModal('${product.name}')" 
                    class="text-pink-300 hover:text-pink-500 focus:outline-none transition-colors p-1" 
                    title="View Image">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor" 
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
            </button>
        </div>
        <div class="flex items-center space-x-2">
            <button class="minus-btn bg-gray-200 text-gray-700 w-8 h-8 rounded-full font-bold hover:bg-gray-300">-</button>
            <input type="number" value="${quantity}" min="0" 
                   class="qty-input font-bold text-lg text-pink-500 w-16 text-center bg-gray-50 border border-gray-200 rounded-md focus:ring-pink-500 focus:border-pink-500">
            <button class="plus-btn bg-gray-200 text-gray-700 w-8 h-8 rounded-full font-bold hover:bg-gray-300">+</button>
        </div>
    `;
    
    const input = card.querySelector('.qty-input');
    const updateQuantity = (value) => {
        value = parseInt(value) || 0;
        if (value < 0) value = 0;
        cart[product.id] = value;
        input.value = value;
        updateOrderButton();
    };
    
    card.querySelector('.minus-btn').onclick = () => updateQuantity(parseInt(input.value) - 1);
    card.querySelector('.plus-btn').onclick = () => updateQuantity(parseInt(input.value) + 1);
    input.oninput = () => updateQuantity(input.value);
    
    return card;
}

// Update Order Button
function updateOrderButton() {
    const total = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
    const button = document.getElementById('place-order-button');
    button.disabled = total === 0;
    
    const summaryText = total > 0 
        ? `${t('btnPlaceOrder')} (${total} ${t('items')})` 
        : t('btnAddItems');
    document.getElementById('order-summary-text').textContent = summaryText;
}

// Create Order History Card
function createOrderHistoryCard(order) {
    const details = document.createElement('details');
    details.className = 'bg-white/50 rounded-xl border border-gray-200/50 shadow-lg group transition-all';
    
    const date = order.createdAt?.toDate().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }) || '';
    
    const status = getStatus(order.tracking);
    const displayId = order.customOrderId || order.id.substring(0, 6);
    
    details.innerHTML = `
        <summary class="p-4 flex flex-wrap justify-between items-center cursor-pointer hover:bg-amber-50/50 rounded-t-xl">
            <div class="mb-2">
                <p class="font-semibold text-gray-800">Order ${displayId}</p>
                <p class="text-sm text-gray-500">${date}</p>
            </div>
            <div class="flex items-center space-x-4">
                <span class="text-sm font-semibold px-3 py-1 rounded-full ${status.cls}">${status.txt}</span>
                <svg class="w-5 h-5 text-gray-500 transition-transform group-open:rotate-90" 
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6" stroke-width="2.5" 
                              stroke-linecap="round" stroke-linejoin="round"></polyline>
                </svg>
            </div>
        </summary>
        <div class="p-4 border-t border-gray-200/80">
            <h4 class="font-bold text-md mb-4 text-gray-800">${t('detailsTitle')}</h4>
            <div class="mb-4">${createTimeline(order.tracking)}</div>
            <h5 class="font-semibold text-gray-700 mb-2">${t('itemsOrdered')}:</h5>
            <ul class="space-y-1 text-sm mb-4">
                ${order.items.map(item => `
                    <li class="flex justify-between">
                        <span class="text-gray-600">${item.name}</span>
                        <span class="font-medium text-gray-800">${item.quantity} ${t('units')}</span>
                    </li>
                `).join('')}
            </ul>
            <button class="rpt-btn w-full flex items-center justify-center bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg shadow hover:bg-blue-600 active:scale-95">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M17 2.1a9 9 0 0 1 4.9 4.9"/>
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M3 21.9a9.02 9.02 0 0 1-1.9-4.9"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" 
                          stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                ${t('repeatOrder')}
            </button>
        </div>
    `;
    
    details.querySelector('.rpt-btn').onclick = () => handleRepeat(order);
    return details;
}

// Handle Repeat Order
function handleRepeat(order) {
    cart = {};
    order.items.forEach(item => {
        const product = productsData.find(p => 
            p.name === item.name && p.description === item.description
        );
        if (product) {
            cart[product.id] = item.quantity;
        }
    });
    
    document.getElementById('new-order-tab').click();
    renderGroupedProducts();
    updateOrderButton();
    showToast(t('toastCartLoaded'));
}

// Get Order Status
function getStatus(trackingData) {
    const statusMap = {
        'Pending': 'pending',
        'Order Placed': 'orderPlaced',
        'Vehicle Assigned': 'vehicleAssigned',
        'Loaded': 'loaded',
        'Dispatched': 'dispatched'
    };
    
    const classMap = {
        'Pending': 'bg-gray-200 text-gray-800',
        'Order Placed': 'bg-blue-100 text-blue-800',
        'Vehicle Assigned': 'bg-indigo-100 text-indigo-800',
        'Loaded': 'bg-purple-100 text-purple-800',
        'Dispatched': 'bg-green-100 text-green-800'
    };
    
    let status = 'Pending';
    
    if (trackingData?.dispatched?.status === 'Completed') {
        status = 'Dispatched';
    } else if (trackingData?.loaded?.status === 'Completed') {
        status = 'Loaded';
    } else if (trackingData?.assigned?.status === 'Completed') {
        status = 'Vehicle Assigned';
    } else if (trackingData?.placed?.status === 'Completed') {
        status = 'Order Placed';
    }
    
    return {
        txt: t(statusMap[status]),
        cls: classMap[status]
    };
}

// Create Timeline
function createTimeline(trackingData) {
    if (!trackingData) return '';
    
    const steps = [
        { id: 'placed', k: 'orderPlaced' },
        { id: 'assigned', k: 'vehicleAssigned' },
        { id: 'loaded', k: 'loaded' },
        { id: 'dispatched', k: 'dispatched' }
    ];
    
    let html = '';
    
    steps.forEach(step => {
        const data = trackingData[step.id];
        const isDone = data?.status === 'Completed';
        const timestamp = isDone && data.timestamp
            ? data.timestamp.toDate().toLocaleString('en-IN', {
                timeStyle: 'short',
                dateStyle: 'short'
            })
            : t('pending');
        
        html += `
            <div class="flex tracking-item">
                <div class="flex flex-col items-center mr-4">
                    <div class="flex items-center justify-center w-10 h-10 rounded-full ${isDone ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'} shadow-md">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path d="M5 13l4 4L19 7"/>
                        </svg>
                    </div>
                    <div class="w-1 h-16 ${isDone ? 'bg-green-500' : 'bg-gray-200'} tracking-line hidden"></div>
                </div>
                <div class="pt-1 pb-8">
                    <p class="${isDone ? 'text-gray-800 font-semibold' : 'text-gray-500'}">${t(step.k)}</p>
                    <p class="text-sm text-gray-500">${timestamp}</p>
                </div>
            </div>
        `;
    });
    
    return html;
}

// Place Order
async function handlePlaceOrder() {
    document.getElementById('place-order-button').disabled = true;
    
    const items = Object.entries(cart)
        .filter(([, quantity]) => quantity > 0)
        .map(([id, quantity]) => {
            const product = productsData.find(p => p.id === id);
            return {
                productId: id,
                name: product.name,
                description: product.description,
                quantity: quantity
            };
        });
    
    if (items.length === 0) {
        showErrorModal(t('emptyOrderTitle'), t('emptyOrderMsg'));
        updateOrderButton();
        return;
    }
    
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const todayOrdersQuery = query(
            collection(db, `/artifacts/${appId}/users/${userId}/orders`),
            where("createdAt", ">=", startOfDay)
        );
        
        const querySnapshot = await getDocs(todayOrdersQuery);
        
        const customOrderId = `CMP${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}-${String(querySnapshot.size + 1).padStart(3, '0')}`;
        
        const timestamp = serverTimestamp();
        
        const docRef = await addDoc(
            collection(db, `/artifacts/${appId}/users/${userId}/orders`),
            {
                distributorId: userId,
                customOrderId: customOrderId,
                items: items,
                createdAt: timestamp,
                tracking: {
                    placed: { status: 'Completed', timestamp: timestamp },
                    assigned: { status: 'Pending' },
                    loaded: { status: 'Pending' },
                    dispatched: { status: 'Pending' }
                }
            }
        );
        
        showConfirm({
            id: docRef.id,
            customOrderId: customOrderId,
            items: items,
            createdAt: now
        });
    } catch (error) {
        console.error(error);
        showErrorModal(t('errorTitle'), 'Order Failed');
        updateOrderButton();
    }
}

// Tab Navigation
document.getElementById('new-order-tab').onclick = () => {
    document.getElementById('new-order-section').classList.remove('hidden');
    document.getElementById('order-footer').classList.remove('hidden');
    document.getElementById('order-history-section').classList.add('hidden');
};

document.getElementById('history-tab').onclick = () => {
    document.getElementById('new-order-section').classList.add('hidden');
    document.getElementById('order-footer').classList.add('hidden');
    document.getElementById('order-history-section').classList.remove('hidden');
};

// Place Order Button
document.getElementById('place-order-button').onclick = handlePlaceOrder;

// Show Confirmation Modal
function showConfirm(order) {
    const summary = `
        <strong>${t('confirmHeader')}</strong>
        <ul class="list-disc pl-5 mt-1 text-left">
            ${order.items.map(item => `<li>${item.name} - <strong>${item.quantity}</strong></li>`).join('')}
        </ul>
    `;
    
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = t('orderPlacedTitle');
    document.getElementById('modal-message').textContent = t('orderPlacedMsg');
    document.getElementById('modal-icon').className = 'mx-auto mb-4 w-16 h-16 flex items-center justify-center rounded-full shadow-lg bg-green-500';
    document.getElementById('modal-icon').innerHTML = `
        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" stroke-width="2"/>
        </svg>
    `;
    
    document.getElementById('modal-order-summary').innerHTML = summary;
    document.getElementById('modal-order-summary').classList.remove('hidden');
    
    const buttons = document.getElementById('modal-buttons');
    buttons.innerHTML = '';
    
    const pdfButton = document.createElement('button');
    pdfButton.textContent = t('viewSharePDF');
    pdfButton.className = "w-full sm:w-auto bg-green-500 text-white font-semibold py-2 px-6 rounded-lg shadow hover:bg-green-600 mb-2 sm:mb-0";
    pdfButton.onclick = () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(20);
        doc.text("Scoop Lovers", 105, 20, null, null, 'center');
        doc.setFontSize(12);
        doc.text(`Distributor: ${userId}`, 15, 40);
        doc.text(`Order: ${order.customOrderId}`, 15, 47);
        doc.text(`Date: ${order.createdAt.toLocaleString()}`, 15, 54);
        
        doc.autoTable({
            head: [['Item', 'Category', 'Qty']],
            body: order.items.map(item => [item.name, item.description, item.quantity]),
            startY: 65,
            headStyles: { fillColor: [236, 72, 153] }
        });
        
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Order_${order.customOrderId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };
    
    const closeButton = document.createElement('button');
    closeButton.textContent = t('close');
    closeButton.className = "w-full sm:w-auto bg-gray-500 text-white font-semibold py-2 px-6 rounded-lg shadow hover:bg-gray-600";
    closeButton.onclick = () => {
        modal.classList.add('hidden');
        resetOrderForm();
    };
    
    buttons.append(pdfButton, closeButton);
    modal.classList.remove('hidden');
}

// Reset Order Form
function resetOrderForm() {
    cart = {};
    renderGroupedProducts();
    updateOrderButton();
}

// Show Error Modal
function showErrorModal(title, message) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal').classList.remove('hidden');
}

// Show Toast Notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.className = 'bg-gray-800 text-white py-2 px-5 rounded-full shadow-lg fixed bottom-24 left-1/2 -translate-x-1/2 z-50 transition-all';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Seed Initial Products
async function seedInitialProducts() {
    const ref = collection(db, `/artifacts/${appId}/public/data/products`);
    const promises = [];
    
    for (const category of productCategories) {
        for (const product of category.products) {
            const docId = `${category.category}-${product.name}`
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-');
            
            promises.push(
                setDoc(doc(ref, docId), {
                    name: product.name,
                    description: category.category
                })
            );
        }
    }
    
    await Promise.all(promises);
}

// Initialize on page load
initialize();
