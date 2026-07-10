/* ============================================================
   BudgetVis — Expense & Budget Visualizer
   Features:
   - Add / delete transactions (name, amount, category)
   - LocalStorage persistence
   - Pie/doughnut chart (Chart.js) — auto-updates
   - Sort by date, amount, category
   - High-expense warning flag (configurable limit)
   - Dark / light mode toggle
   - Custom categories
   - Monthly summary with navigation & breakdown bar
   ============================================================ */

'use strict';

/* ── DOM References ────────────────────────────────────────── */
const body            = document.body;
const themeToggleBtn  = document.getElementById('theme-toggle');
const moonIcon        = document.getElementById('moon-icon');
const sunIcon         = document.getElementById('sun-icon');

const form            = document.getElementById('expense-form');
const nameInput       = document.getElementById('expense-name');
const amountInput     = document.getElementById('expense-amount');
const categoryInput   = document.getElementById('expense-category');

const transactionList = document.getElementById('transaction-list');
const emptyState      = document.getElementById('empty-state');
const totalBalanceEl  = document.getElementById('total-balance');
const sortSelect      = document.getElementById('sort-select');

// Monthly tab
const prevMonthBtn        = document.getElementById('prev-month');
const nextMonthBtn        = document.getElementById('next-month');
const currentMonthLabel   = document.getElementById('current-month-label');
const monthlyTotalEl      = document.getElementById('monthly-total');
const monthlyTxList       = document.getElementById('monthly-transaction-list');
const monthlyEmptyState   = document.getElementById('monthly-empty-state');
const monthlyCategoryBreakdown = document.getElementById('monthly-category-breakdown');

// Settings tab
const categoryForm        = document.getElementById('category-form');
const newCategoryInput    = document.getElementById('new-category-name');
const customCategoryList  = document.getElementById('custom-category-list');
const expenseLimitInput   = document.getElementById('expense-limit-input');
const saveLimitBtn        = document.getElementById('save-limit-btn');

/* ── State ──────────────────────────────────────────────────── */
let transactions    = JSON.parse(localStorage.getItem('transactions'))    || [];
let customCategories = JSON.parse(localStorage.getItem('customCategories')) || [];
let HIGH_EXPENSE_LIMIT = parseInt(localStorage.getItem('expenseLimit'), 10) || 1000000;

// Chart instances
let mainChart    = null;
let monthlyChart = null;

// Month navigator state (Date object pointing to 1st of displayed month)
let viewMonth = new Date();
viewMonth.setDate(1);
viewMonth.setHours(0,0,0,0);

/* ── Colour palette for custom categories ───────────────────── */
const CUSTOM_COLORS = [
    '#8b5cf6','#06b6d4','#f97316','#84cc16',
    '#e879f9','#38bdf8','#fb923c','#a3e635',
    '#c084fc','#22d3ee'
];

function getCustomCategoryColor(name) {
    // Deterministic color from name string
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return CUSTOM_COLORS[Math.abs(hash) % CUSTOM_COLORS.length];
}

/* ── Category helpers ───────────────────────────────────────── */
const BASE_CATEGORIES = ['Makanan', 'Transportasi', 'Hiburan'];

const BASE_COLORS = {
    'Makanan'      : '#10b981',
    'Transportasi' : '#f59e0b',
    'Hiburan'      : '#ec4899',
};

function getCategoryColor(name) {
    if (BASE_COLORS[name]) return BASE_COLORS[name];
    return getCustomCategoryColor(name);
}

function getCategoryBorderClass(name) {
    if (name === 'Makanan')      return 'food-border';
    if (name === 'Transportasi') return 'transport-border';
    if (name === 'Hiburan')      return 'entertainment-border';
    return 'custom-border';
}

function getAllCategories() {
    return [...BASE_CATEGORIES, ...customCategories];
}

/* ── Persistence ────────────────────────────────────────────── */
function saveTransactions()    { localStorage.setItem('transactions',     JSON.stringify(transactions)); }
function saveCustomCategories(){ localStorage.setItem('customCategories', JSON.stringify(customCategories)); }
function saveExpenseLimit()    { localStorage.setItem('expenseLimit',     HIGH_EXPENSE_LIMIT); }

/* ── Utility ────────────────────────────────────────────────── */
function generateID() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency', currency: 'IDR', minimumFractionDigits: 0
    }).format(amount);
}

function formatMonthLabel(date) {
    return date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

/* ── Category dropdown ──────────────────────────────────────── */
function renderCategoryOptions() {
    // Save currently selected value to restore after rebuild
    const currentVal = categoryInput.value;
    categoryInput.innerHTML = '';

    // Always re-create the placeholder
    const placeholder = document.createElement('option');
    placeholder.value    = '';
    placeholder.disabled = true;
    placeholder.textContent = 'Pilih...';
    categoryInput.appendChild(placeholder);

    getAllCategories().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categoryInput.appendChild(opt);
    });

    // Restore previous selection if still valid
    if (currentVal && getAllCategories().includes(currentVal)) {
        categoryInput.value = currentVal;
    } else {
        categoryInput.value = '';
    }
}

/* ── Add Transaction ────────────────────────────────────────── */
function addTransaction(e) {
    e.preventDefault();

    const name     = nameInput.value.trim();
    const amount   = parseFloat(amountInput.value);
    const category = categoryInput.value;

    if (!name || !category || isNaN(amount) || amount <= 0) {
        showToast('Mohon isi semua bidang dengan benar.', 'error');
        return;
    }

    const tx = {
        id      : generateID(),
        name,
        amount,
        category,
        date    : Date.now()
    };

    transactions.push(tx);
    saveTransactions();
    updateUI();
    form.reset();
    nameInput.focus();
    showToast('Transaksi berhasil ditambahkan!', 'success');
}

/* ── Delete Transaction ─────────────────────────────────────── */
function deleteTransaction(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    if (!confirm(`Hapus "${tx.name}" (${formatCurrency(tx.amount)})?`)) return;
    transactions = transactions.filter(t => t.id !== id);
    saveTransactions();
    updateUI();
}

/* ── Sort ───────────────────────────────────────────────────── */
function getSortedTransactions(txArray) {
    const copy = [...txArray];
    switch (sortSelect.value) {
        case 'amount-high': return copy.sort((a, b) => b.amount - a.amount);
        case 'amount-low' : return copy.sort((a, b) => a.amount - b.amount);
        case 'category'   : return copy.sort((a, b) => a.category.localeCompare(b.category));
        default           : return copy.sort((a, b) => b.date - a.date);
    }
}

/* ── Render Transaction Item (reusable) ─────────────────────── */
function createTransactionItem(tx, onDelete) {
    const li = document.createElement('li');
    const borderClass = getCategoryBorderClass(tx.category);
    li.classList.add('transaction-item', borderClass);

    // For custom categories, apply the deterministic color via inline style
    if (borderClass === 'custom-border') {
        li.style.borderLeftColor = getCustomCategoryColor(tx.category);
    }

    if (tx.amount >= HIGH_EXPENSE_LIMIT) {
        li.classList.add('high-expense');
        li.style.borderLeftColor = ''; // Let high-expense CSS take over
        li.title = 'Peringatan: Pengeluaran Besar!';
    }

    // Sanitise display text to prevent XSS
    const safeName     = escapeHtml(tx.name);
    const safeCategory = escapeHtml(tx.category);

    li.innerHTML = `
        <div class="transaction-info">
            <span class="transaction-name">${safeName}</span>
            <span class="transaction-category">${safeCategory}</span>
        </div>
        <div class="transaction-right">
            <span class="transaction-amount">${formatCurrency(tx.amount)}</span>
            <button class="delete-btn" aria-label="Hapus ${safeName}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        </div>
    `;

    li.querySelector('.delete-btn').addEventListener('click', () => onDelete(tx.id));
    return li;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ── Render Main Transaction List ───────────────────────────── */
function renderTransactions() {
    transactionList.innerHTML = '';
    const sorted = getSortedTransactions(transactions);

    if (sorted.length === 0) {
        emptyState.style.display = 'flex';
    } else {
        emptyState.style.display = 'none';
        sorted.forEach(tx => {
            transactionList.appendChild(createTransactionItem(tx, deleteTransaction));
        });
    }
}

/* ── Update Total ───────────────────────────────────────────── */
function updateTotal() {
    const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    totalBalanceEl.textContent = formatCurrency(total);
}

/* ── Main Doughnut Chart ────────────────────────────────────── */
function updateChart() {
    const ctx = document.getElementById('expenseChart').getContext('2d');

    const allCats  = getAllCategories();
    const totals   = {};
    allCats.forEach(c => { totals[c] = 0; });
    transactions.forEach(tx => {
        if (totals[tx.category] !== undefined) totals[tx.category] += tx.amount;
    });

    const labels = allCats.filter(c => totals[c] > 0);
    const data   = labels.map(c => totals[c]);
    const colors = labels.map(c => getCategoryColor(c));

    const isDark    = body.classList.contains('dark-mode');
    const textColor = isDark ? '#f9fafb' : '#1f2937';

    if (mainChart) { mainChart.destroy(); mainChart = null; }

    if (data.length === 0) {
        mainChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Belum ada data'],
                datasets: [{ data: [1], backgroundColor: ['#d1d5db'], borderWidth: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: textColor } },
                    tooltip: { enabled: false }
                }
            }
        });
        return;
    }

    mainChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: isDark ? '#1f2937' : '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        font: { family: "'Inter', sans-serif", size: 12 },
                        padding: 14
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct   = ((ctx.parsed / total) * 100).toFixed(1);
                            return ` ${ctx.label}: ${formatCurrency(ctx.parsed)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

/* ── Monthly Summary ────────────────────────────────────────── */
function getMonthTransactions() {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    return transactions.filter(tx => {
        const d = new Date(tx.date);
        return d.getFullYear() === y && d.getMonth() === m;
    });
}

function renderMonthly() {
    currentMonthLabel.textContent = formatMonthLabel(viewMonth);

    const monthTxs = getMonthTransactions();
    const total    = monthTxs.reduce((s, tx) => s + tx.amount, 0);
    monthlyTotalEl.textContent = formatCurrency(total);

    // Render transaction list
    monthlyTxList.innerHTML = '';
    if (monthTxs.length === 0) {
        monthlyEmptyState.style.display = 'flex';
    } else {
        monthlyEmptyState.style.display = 'none';
        // newest first for monthly view
        [...monthTxs].sort((a, b) => b.date - a.date).forEach(tx => {
            monthlyTxList.appendChild(createTransactionItem(tx, deleteTransaction));
        });
    }

    // Category breakdown
    renderMonthlyBreakdown(monthTxs, total);

    // Monthly chart
    renderMonthlyChart(monthTxs);
}

function renderMonthlyBreakdown(monthTxs, total) {
    monthlyCategoryBreakdown.innerHTML = '';
    if (monthTxs.length === 0) return;

    const allCats = getAllCategories();
    const totals  = {};
    allCats.forEach(c => { totals[c] = 0; });
    monthTxs.forEach(tx => {
        if (totals[tx.category] !== undefined) totals[tx.category] += tx.amount;
    });

    allCats
        .filter(c => totals[c] > 0)
        .sort((a, b) => totals[b] - totals[a])
        .forEach(cat => {
            const pct   = total > 0 ? (totals[cat] / total) * 100 : 0;
            const color = getCategoryColor(cat);

            const item = document.createElement('div');
            item.classList.add('breakdown-item');
            item.innerHTML = `
                <span class="breakdown-dot" style="background:${color}"></span>
                <span class="breakdown-label">${escapeHtml(cat)}</span>
                <div class="breakdown-bar-wrap">
                    <div class="breakdown-bar" style="width:${pct.toFixed(1)}%;background:${color}"></div>
                </div>
                <span class="breakdown-amount">${formatCurrency(totals[cat])}</span>
            `;
            monthlyCategoryBreakdown.appendChild(item);
        });
}

function renderMonthlyChart(monthTxs) {
    const ctx = document.getElementById('monthlyChart').getContext('2d');

    if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }

    const isDark    = body.classList.contains('dark-mode');
    const textColor = isDark ? '#f9fafb' : '#1f2937';

    if (monthTxs.length === 0) {
        monthlyChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Belum ada data'],
                datasets: [{ data: [1], backgroundColor: ['#d1d5db'], borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: textColor } },
                    tooltip: { enabled: false }
                }
            }
        });
        return;
    }

    const allCats = getAllCategories();
    const totals  = {};
    allCats.forEach(c => { totals[c] = 0; });
    monthTxs.forEach(tx => {
        if (totals[tx.category] !== undefined) totals[tx.category] += tx.amount;
    });

    const labels = allCats.filter(c => totals[c] > 0);
    const data   = labels.map(c => totals[c]);
    const colors = labels.map(c => getCategoryColor(c));

    monthlyChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data, backgroundColor: colors,
                borderWidth: 2,
                borderColor: isDark ? '#1f2937' : '#ffffff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textColor, font: { family: "'Inter', sans-serif", size: 11 }, padding: 10 }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`
                    }
                }
            }
        }
    });
}

/* ── Month navigation ───────────────────────────────────────── */
prevMonthBtn.addEventListener('click', () => {
    viewMonth.setMonth(viewMonth.getMonth() - 1);
    renderMonthly();
});

nextMonthBtn.addEventListener('click', () => {
    const now = new Date(); now.setDate(1); now.setHours(0,0,0,0);
    if (viewMonth < now) {
        viewMonth.setMonth(viewMonth.getMonth() + 1);
        renderMonthly();
    }
});

/* ── Custom Categories ──────────────────────────────────────── */
function renderCustomCategoryList() {
    customCategoryList.innerHTML = '';

    if (customCategories.length === 0) {
        customCategoryList.innerHTML = '<p class="no-custom-categories">Belum ada kategori kustom.</p>';
        return;
    }

    customCategories.forEach(cat => {
        const tag = document.createElement('div');
        tag.classList.add('custom-category-tag');

        const color = getCustomCategoryColor(cat);
        tag.style.borderLeftColor = color;

        tag.innerHTML = `
            <span>${escapeHtml(cat)}</span>
            <button class="delete-category-btn" aria-label="Hapus kategori ${escapeHtml(cat)}">✕</button>
        `;

        tag.querySelector('.delete-category-btn').addEventListener('click', () => {
            deleteCustomCategory(cat);
        });

        customCategoryList.appendChild(tag);
    });
}

function addCustomCategory(e) {
    e.preventDefault();
    const name = newCategoryInput.value.trim();

    if (!name) { showToast('Masukkan nama kategori.', 'error'); return; }
    if (getAllCategories().map(c => c.toLowerCase()).includes(name.toLowerCase())) {
        showToast('Kategori sudah ada.', 'error'); return;
    }
    if (name.length > 30) { showToast('Nama kategori terlalu panjang (maks 30 karakter).', 'error'); return; }

    customCategories.push(name);
    saveCustomCategories();
    renderCategoryOptions();
    renderCustomCategoryList();
    newCategoryInput.value = '';
    showToast(`Kategori "${name}" ditambahkan!`, 'success');
}

function deleteCustomCategory(name) {
    customCategories = customCategories.filter(c => c !== name);
    saveCustomCategories();
    renderCategoryOptions();
    renderCustomCategoryList();
    // Re-render chart in case transactions used this category
    updateChart();
}

/* ── Expense Limit ──────────────────────────────────────────── */
function initExpenseLimitInput() {
    expenseLimitInput.value = HIGH_EXPENSE_LIMIT;
}

saveLimitBtn.addEventListener('click', () => {
    const val = parseInt(expenseLimitInput.value, 10);
    if (isNaN(val) || val < 1000) {
        showToast('Batas minimal Rp 1.000.', 'error');
        return;
    }
    HIGH_EXPENSE_LIMIT = val;
    saveExpenseLimit();
    renderTransactions(); // re-flag items
    renderMonthly();
    showToast(`Batas diperbarui: ${formatCurrency(HIGH_EXPENSE_LIMIT)}`, 'success');
});

/* ── Dark / Light Mode ──────────────────────────────────────── */
function enableDarkMode() {
    body.classList.remove('light-mode');
    body.classList.add('dark-mode');
    moonIcon.style.display = 'none';
    sunIcon.style.display  = 'block';
    localStorage.setItem('theme', 'dark');
    updateChart();
    if (document.getElementById('tab-monthly').classList.contains('active')) renderMonthly();
}

function enableLightMode() {
    body.classList.remove('dark-mode');
    body.classList.add('light-mode');
    sunIcon.style.display  = 'none';
    moonIcon.style.display = 'block';
    localStorage.setItem('theme', 'light');
    updateChart();
    if (document.getElementById('tab-monthly').classList.contains('active')) renderMonthly();
}

themeToggleBtn.addEventListener('click', () => {
    body.classList.contains('dark-mode') ? enableLightMode() : enableDarkMode();
});

/* ── Tab Navigation ─────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.tab;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(`tab-${target}`).classList.add('active');

        // Refresh monthly when switching to that tab
        if (target === 'monthly') renderMonthly();
    });
});

/* ── Toast Notification ─────────────────────────────────────── */
function showToast(message, type = 'success') {
    // Remove any existing toast
    const existing = document.getElementById('toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = message;
    Object.assign(toast.style, {
        position       : 'fixed',
        bottom         : '24px',
        left           : '50%',
        transform      : 'translateX(-50%)',
        padding        : '10px 20px',
        borderRadius   : '8px',
        fontSize       : '0.875rem',
        fontWeight     : '500',
        color          : '#fff',
        background     : type === 'success' ? '#10b981' : '#ef4444',
        boxShadow      : '0 4px 12px rgba(0,0,0,0.15)',
        zIndex         : '9999',
        opacity        : '0',
        transition     : 'opacity 0.3s ease',
        whiteSpace     : 'nowrap',
        pointerEvents  : 'none'
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

/* ── Master UI Update ───────────────────────────────────────── */
function updateUI() {
    updateTotal();
    renderTransactions();
    updateChart();
    // Update monthly view only if it's currently visible
    if (document.getElementById('tab-monthly').classList.contains('active')) {
        renderMonthly();
    }
}

/* ── Initialise ─────────────────────────────────────────────── */
function init() {
    // Restore theme
    if (localStorage.getItem('theme') === 'dark') {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        moonIcon.style.display = 'none';
        sunIcon.style.display  = 'block';
    }

    // Populate category dropdown
    renderCategoryOptions();

    // Render custom category management list
    renderCustomCategoryList();

    // Set expense limit input
    initExpenseLimitInput();

    // Initial monthly label
    currentMonthLabel.textContent = formatMonthLabel(viewMonth);

    // Render main data
    updateUI();
}

/* ── Event Listeners ────────────────────────────────────────── */
form.addEventListener('submit', addTransaction);
sortSelect.addEventListener('change', renderTransactions);
categoryForm.addEventListener('submit', addCustomCategory);

/* ── Boot ───────────────────────────────────────────────────── */
init();
