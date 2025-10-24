import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, onSnapshot, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Plus, Wallet, TrendingUp, BarChart, Settings, Home, Tag, Pencil, ArrowUpRight, ArrowDownLeft, X, Check, DollarSign, Euro, PoundSterling, IndianRupee, XCircle, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

// --- Firebase Initialization and Constants ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'expense-manager-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Currency options and map for display
const CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar', icon: DollarSign },
  EUR: { symbol: '€', name: 'Euro', icon: Euro },
  GBP: { symbol: '£', name: 'Pound Sterling', icon: PoundSterling },
  INR: { symbol: '₹', name: 'Indian Rupee', icon: IndianRupee },
};
const DEFAULT_CURRENCY_CODE = 'USD';

// Budget Frequency Options
const FREQUENCIES = [
  { code: 'monthly', name: 'Monthly' },
  { code: 'bimonthly', name: 'Bi-Monthly' },
  { code: 'daily', name: 'Daily' },
];
const AVG_DAYS_PER_MONTH = 30.4375; // Used for converting daily budgets to cycle budget

// --- Custom Colors for Material You look ---
const COLORS = [
  '#673AB7', '#03A9F4', '#009688', '#FF9800', '#F44336',
  '#E91E63', '#9C27B0', '#3F51B5', '#00BCD4', '#4CAF50',
];

// --- Utility Functions for Date and Time & Calculations ---

const startOfCycle = (cycleMonths) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), 1);
  date.setMonth(now.getMonth() - (cycleMonths - 1));
  date.setDate(1);
  return date;
};

const formatCurrency = (amount, currencyCode) => {
  const { symbol } = CURRENCIES[currencyCode] || CURRENCIES[DEFAULT_CURRENCY_CODE];
  return `${symbol} ${parseFloat(amount).toFixed(2)}`;
};

/**
 * Calculates the total budget for a category over the current cycle duration.
 * @param {number} baseLimit - The budget amount set for the base frequency (e.g., $100).
 * @param {string} baseFrequency - 'daily', 'monthly', or 'bimonthly'.
 * @param {number} cycleMonths - The global budget cycle duration in months (e.g., 2).
 * @returns {number} The total budget for the cycle.
 */
const calculateCycleBudget = (baseLimit, baseFrequency, cycleMonths) => {
  const limit = parseFloat(baseLimit) || 0;
  if (limit <= 0) return 0;

  switch (baseFrequency) {
    case 'daily':
      // Calculate total days in the cycle and multiply by daily limit
      return limit * cycleMonths * AVG_DAYS_PER_MONTH;
    case 'monthly':
      // Multiply monthly limit by the number of months in the cycle
      return limit * cycleMonths;
    case 'bimonthly':
      // Divide cycleMonths by 2 to get the number of bi-monthly periods
      return limit * (cycleMonths / 2);
    default:
      return limit * cycleMonths; // Default to monthly if frequency is unknown
  }
};


// --- PWA Helper Functions and Constants ---

// 1. Web Manifest JSON
const PWA_MANIFEST = {
  name: "Gemini Expense Tracker",
  short_name: "FinTrack",
  description: "Your personalized, mobile-first expense and budget manager.",
  start_url: "/",
  display: "standalone", // Makes it feel like a native app
  background_color: "#f9fafb", // Match light theme background
  theme_color: "#4f46e5", // Indigo theme color
  icons: [
    // Standard icon sizes for mobile/PWA
    { src: 'https://placehold.co/192x192/4f46e5/ffffff?text=FT', sizes: '192x192', type: 'image/png' },
    { src: 'https://placehold.co/512x512/4f46e5/ffffff?text=FT', sizes: '512x512', type: 'image/png' }
  ]
};

// 2. Service Worker (SW) Content
const SERVICE_WORKER_CONTENT = `
  const CACHE_NAME = 'finance-tracker-cache-v1';
  const urlsToCache = [
    '/',
  ];

  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => {
          console.log('Opened cache');
          return cache.addAll(urlsToCache);
        })
    );
  });

  self.addEventListener('fetch', (event) => {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            return response;
          }
          return fetch(event.request);
        }
      )
    );
  });
  
  self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
  });
`;

// --- Supporting Components (Extracted for stability) ---

const IconComponent = ({ name, size = 20, color = 'currentColor' }) => {
  const LucideIcon = { Tag, Wallet, TrendingUp, DollarSign, Euro, PoundSterling, IndianRupee, Pencil, Home, BarChart, Settings }[name] || Tag;
  return <LucideIcon size={size} color={color} />;
};

const Modal = ({ children, title, closeModal }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={closeModal}>
    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl transform transition-all duration-300 scale-100" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
        <button onClick={closeModal} className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white transition rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
          <X size={20} />
        </button>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  </div>
);

const AddExpenseModal = ({ newExpense, setNewExpense, handleModalSubmit, closeModal, categories }) => (
  <Modal title="Log New Expense" closeModal={closeModal}>
    <form onSubmit={handleModalSubmit} className="space-y-4">
      <input
        type="number"
        placeholder="Amount Spent"
        value={newExpense.amount}
        onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white focus:ring-pink-500 focus:border-pink-500"
        required
        step="0.01"
        min="0"
      />
      <select
        value={newExpense.categoryId}
        onChange={(e) => setNewExpense({ ...newExpense, categoryId: e.target.value })}
        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white focus:ring-pink-500 focus:border-pink-500"
        required
      >
        <option value="" disabled>Select Category</option>
        {categories.map(cat => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Source (e.g., Google Pay, Cash)"
        value={newExpense.source}
        onChange={(e) => setNewExpense({ ...newExpense, source: e.target.value })}
        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white focus:ring-pink-500 focus:border-pink-500"
      />
      <button type="submit" className="w-full bg-pink-600 text-white p-3 rounded-xl font-semibold hover:bg-pink-700 transition">
        Record Expense
      </button>
    </form>
  </Modal>
);

const AddBudgetModal = ({ newBudget, setNewBudget, handleModalSubmit, closeModal }) => (
  <Modal title="Log New Income" closeModal={closeModal}>
    <form onSubmit={handleModalSubmit} className="space-y-4">
      <input
        type="number"
        placeholder="Income Amount"
        value={newBudget.amount}
        onChange={(e) => setNewBudget({ ...newBudget, amount: e.target.value })}
        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
        required
        step="0.01"
        min="0"
      />
      <input
        type="text"
        placeholder="Source (e.g., Salary, Gift, Borrowed)"
        value={newBudget.source}
        onChange={(e) => setNewBudget({ ...newBudget, source: e.target.value })}
        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
        required
      />
      <button type="submit" className="w-full bg-indigo-600 text-white p-3 rounded-xl font-semibold hover:bg-indigo-700 transition">
        Record Income
      </button>
    </form>
  </Modal>
);

const AddCategoryModal = ({ newCategory, setNewCategory, handleModalSubmit, closeModal }) => (
  <Modal title="Create New Budget Category" closeModal={closeModal}>
    <form onSubmit={handleModalSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Category Name (e.g., Groceries, Rent)"
        value={newCategory.name}
        onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
        required
      />
      <input
        type="number"
        placeholder="Base Budget Amount (e.g., $100)"
        value={newCategory.baseLimit}
        onChange={(e) => setNewCategory({ ...newCategory, baseLimit: e.target.value })}
        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
        required
        step="0.01"
        min="0"
      />
      <select
        value={newCategory.baseFrequency}
        onChange={(e) => setNewCategory({ ...newCategory, baseFrequency: e.target.value })}
        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
        required
      >
        <option value="" disabled>Select Budget Frequency</option>
        {FREQUENCIES.map(f => (
          <option key={f.code} value={f.code}>{f.name}</option>
        ))}
      </select>
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Color Selection</h4>
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {COLORS.map(color => (
          <button
            type="button"
            key={color}
            style={{ backgroundColor: color }}
            className={`w-10 h-10 rounded-full flex-shrink-0 transition ${newCategory.color === color ? 'ring-4 ring-offset-2 ring-indigo-500' : ''}`}
            onClick={() => setNewCategory({ ...newCategory, color })}
            aria-label={`Select color ${color}`}
          ></button>
        ))}
      </div>
      <button type="submit" className="w-full bg-indigo-600 text-white p-3 rounded-xl font-semibold hover:bg-indigo-700 transition">
        Create Category
      </button>
    </form>
  </Modal>
);

const Card = ({ title, value, icon: Icon, color }) => (
  <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 bg-opacity-10 ${color.replace('text', 'bg')}`}>
      <Icon size={18} className={color} />
    </div>
    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
    <h3 className="text-xl font-bold text-gray-900 dark:text-white truncate">{value}</h3>
  </div>
);

const SettingsCard = ({ settings, onUpdateSettings, currencyCode }) => {
  const [tempCycle, setTempCycle] = useState(settings.cycleMonths);
  const [tempCurrency, setTempCurrency] = useState(currencyCode);

  useEffect(() => {
    setTempCycle(settings.cycleMonths);
    setTempCurrency(currencyCode);
  }, [settings.cycleMonths, currencyCode]);

  const handleSave = () => {
    onUpdateSettings({ cycleMonths: parseInt(tempCycle, 10), currencyCode: tempCurrency });
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white">App Settings</h3>
      <div className="space-y-4 mt-3">
        <div className="flex justify-between items-center space-x-4">
          <label htmlFor="cycle" className="text-gray-700 dark:text-gray-300 text-sm font-medium">Budget Cycle (Months):</label>
          <select
            id="cycle"
            value={tempCycle}
            onChange={(e) => setTempCycle(e.target.value)}
            className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          >
            {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m} Month{m > 1 ? 's' : ''}</option>)}
          </select>
        </div>
        <div className="flex justify-between items-center space-x-4">
          <label htmlFor="currency" className="text-gray-700 dark:text-gray-300 text-sm font-medium">Currency:</label>
          <select
            id="currency"
            value={tempCurrency}
            onChange={(e) => setTempCurrency(e.target.value)}
            className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          >
            {Object.entries(CURRENCIES).map(([code, { symbol, name }]) => (
              <option key={code} value={code}>{symbol} - {name}</option>
            ))}
          </select>
        </div>
      </div>
      <button
        onClick={handleSave}
        className="w-full bg-indigo-600 text-white p-3 rounded-xl font-semibold hover:bg-indigo-700 transition mt-4"
      >
        Save Settings
      </button>
    </div>
  );
};

const ExpenseCycleBarChart = ({ expenses, cycleMonths, currencyCode }) => {
  const cycleData = useMemo(() => {
    if (expenses.length === 0 || cycleMonths === 0) return [];

    const now = new Date();
    const numCycles = 5; // Show current + 4 previous cycles
    const data = [];

    for (let i = 0; i < numCycles; i++) {
      const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate.setMonth(now.getMonth() - (i * cycleMonths));
      // Adjust end date to the end of the month/cycle

      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setMonth(now.getMonth() - ((i + 1) * cycleMonths) + 1);

      const labelStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const labelEnd = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);

      const label = i === 0
        ? 'Current'
        : `${labelStart.toLocaleString('default', { month: 'short' })}-${labelEnd.toLocaleString('default', { month: 'short', year: 'numeric' }).slice(2)}`;

      const cycleExpenses = expenses.filter(exp => exp.type === 'expense' && exp.timestamp >= startDate && exp.timestamp <= endDate);
      const totalExpense = cycleExpenses.reduce((sum, exp) => sum + exp.amount, 0);

      data.push({
        name: label,
        Expenses: totalExpense,
        isCurrent: i === 0,
      });
    }
    return data.reverse(); // Reverse to show oldest on left
  }, [expenses, cycleMonths]);

  const CurrencySymbol = CURRENCIES[currencyCode]?.symbol || '$';

  if (cycleData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg">
        <p className="text-center text-gray-500 dark:text-gray-400 py-6">No historical data for comparison.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg">
      <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Cycle-to-Cycle Comparison</h3>
      <ResponsiveContainer width="100%" height={300}>
        <RechartsBarChart data={cycleData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" className="dark:stroke-gray-600" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-xs dark:text-gray-400" />
          <YAxis
            tickFormatter={(value) => `${CurrencySymbol}${value.toFixed(0)}`}
            axisLine={false}
            tickLine={false}
            className="text-xs dark:text-gray-400"
          />
          <Tooltip formatter={(value) => formatCurrency(value, currencyCode)} labelFormatter={(name) => `Cycle: ${name}`} />
          <Bar dataKey="Expenses" fill="#6366f1" radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
      <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">Comparison over the last {cycleData.length} cycles (each {cycleMonths} month{cycleMonths > 1 ? 's' : ''}).</p>
    </div>
  );
};

const TabButton = ({ name, label, Icon, activeTab, setActiveTab }) => {
  const isActive = activeTab === name;
  const color = isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400';
  const bgColor = isActive ? 'bg-indigo-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-800';

  return (
    <button
      onClick={() => setActiveTab(name)}
      className={`flex flex-col items-center justify-center p-2 w-1/5 transition-all duration-200 ${bgColor}`}
    >
      <div className={`rounded-full p-2 ${color} transition-colors duration-200`}>
        <Icon size={24} />
      </div>
      <span className={`text-xs font-medium mt-0.5 ${color} transition-colors duration-200`}>{label}</span>
    </button>
  );
};

// --- App Component ---

const App = () => {
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  // Added 'transactions' tab and renamed 'expenses' to 'budget' and 'allocate' to 'manage'
  const [activeTab, setActiveTab] = useState('overview'); // overview, transactions, budget, manage, analysis
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState(null); // 'expense', 'budget', 'category'

  // Data States
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settings, setSettings] = useState({
    currencyCode: DEFAULT_CURRENCY_CODE,
    cycleMonths: 1, // 1, 2, 3, 6, 12
  });

  // Data for current modals
  const [newExpense, setNewExpense] = useState({ amount: '', categoryId: '', source: '' });
  const [newBudget, setNewBudget] = useState({ amount: '', categoryId: '', source: '' });
  // Updated state structure to include baseFrequency and baseLimit
  const [newCategory, setNewCategory] = useState({ 
    name: '', 
    baseLimit: '', 
    baseFrequency: 'monthly', // New default
    color: COLORS[0], 
    icon: 'Tag' 
  });

  // 1. PWA Setup (Manifest and Service Worker Registration)
  useEffect(() => {
    // A. Dynamically create and link the Web Manifest
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    const manifestBlob = new Blob([JSON.stringify(PWA_MANIFEST)], { type: 'application/json' });
    manifestLink.href = URL.createObjectURL(manifestBlob);
    document.head.appendChild(manifestLink);

    // B. Register the Service Worker
    if ('serviceWorker' in navigator) {
      // Create a Blob from the Service Worker content string
      const swBlob = new Blob([SERVICE_WORKER_CONTENT], { type: 'application/javascript' });
      // Create a URL for the Blob
      const swUrl = URL.createObjectURL(swBlob);

      navigator.serviceWorker.register(swUrl)
        .then(registration => {
          console.log('Service Worker registration successful with scope: ', registration.scope);
        })
        .catch(error => {
          console.error('Service Worker registration failed: ', error);
        });
    }

    return () => {
        document.head.removeChild(manifestLink);
    };
  }, []);


  // 2. Firebase Initialization and Authentication
  useEffect(() => {
    if (!firebaseConfig) {
      console.error("Firebase config is missing.");
      setLoading(false);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authentication = getAuth(app);
      setDb(firestore);
      
      const unsubscribe = onAuthStateChanged(authentication, async (user) => {
        if (user) {
          setUserId(user.uid);
          setLoading(false);
        } else {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(authentication, initialAuthToken);
            } else {
              await signInAnonymously(authentication);
            }
          } catch (error) {
            console.error("Error signing in:", error);
            setLoading(false);
          }
        }
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setLoading(false);
    }
  }, []);

  // 3. Data Listeners (Categories, Expenses, Settings)
  useEffect(() => {
    if (!db || !userId) return;

    // Categories Listener
    const categoriesRef = collection(db, `artifacts/${appId}/users/${userId}/categories`);
    const qCategories = query(categoriesRef);
    const unsubCategories = onSnapshot(qCategories, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Ensure new categories have default frequency and limit if undefined (for old data)
      const sanitizedCats = cats.map(cat => ({
          ...cat,
          baseLimit: parseFloat(cat.baseLimit) || parseFloat(cat.budgetLimit) || 0, // Fallback for old budgetLimit
          baseFrequency: cat.baseFrequency || 'monthly',
      }));
      setCategories(sanitizedCats.sort((a, b) => a.name.localeCompare(b.name)));
    }, (error) => console.error("Error fetching categories:", error));

    // Expenses Listener
    const expensesRef = collection(db, `artifacts/${appId}/users/${userId}/expenses`);
    const qExpenses = query(expensesRef);
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      const exps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), amount: parseFloat(doc.data().amount), timestamp: doc.data().timestamp?.toDate() || new Date() }));
      setExpenses(exps);
    }, (error) => console.error("Error fetching expenses:", error));

    // Settings Listener (Single document)
    const settingsRef = doc(db, `artifacts/${appId}/users/${userId}/settings/user_settings`);
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(prev => ({ ...prev, ...docSnap.data() }));
      }
    }, (error) => console.error("Error fetching settings:", error));

    return () => {
      unsubCategories();
      unsubExpenses();
      unsubSettings();
    };
  }, [db, userId]);

  // --- Core CRUD Operations ---

  const handleDeleteTransaction = async (id) => {
    if (!db || !userId) return;
    try {
      // The expenses collection holds both 'expense' and 'budget' entries
      const expRef = doc(db, `artifacts/${appId}/users/${userId}/expenses`, id);
      await deleteDoc(expRef);
    } catch (e) {
      console.error("Error deleting transaction: ", e);
    }
  };

  const handleAddCategory = async (catData) => {
    if (!db || !userId) return;
    try {
      const categoriesRef = collection(db, `artifacts/${appId}/users/${userId}/categories`);
      await addDoc(categoriesRef, {
        name: catData.name.trim(),
        baseLimit: parseFloat(catData.baseLimit || 0), // Use baseLimit
        baseFrequency: catData.baseFrequency, // New frequency field
        color: catData.color,
        icon: catData.icon,
      });
    } catch (e) {
      console.error("Error adding category: ", e);
    }
  };

  const handleUpdateCategory = async (id, updatedFields) => {
    if (!db || !userId) return;
    try {
      const catRef = doc(db, `artifacts/${appId}/users/${userId}/categories`, id);
      await updateDoc(catRef, updatedFields);
    } catch (e) {
      console.error("Error updating category: ", e);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!db || !userId) return;
    try {
      const catRef = doc(db, `artifacts/${appId}/users/${userId}/categories`, id);
      await deleteDoc(catRef);
    } catch (e) {
      console.error("Error deleting category: ", e);
    }
  };

  const handleAddExpense = async (expData) => {
    if (!db || !userId) return;
    try {
      const expensesRef = collection(db, `artifacts/${appId}/users/${userId}/expenses`);
      await addDoc(expensesRef, {
        amount: parseFloat(expData.amount),
        categoryId: expData.categoryId,
        source: expData.source.trim() || 'Unknown',
        timestamp: new Date(),
        type: 'expense',
      });
    } catch (e) {
      console.error("Error adding expense: ", e);
    }
  };

  const handleAddBudgetEntry = async (budData) => {
    if (!db || !userId) return;
    try {
      const expensesRef = collection(db, `artifacts/${appId}/users/${userId}/expenses`);
      await addDoc(expensesRef, {
        amount: parseFloat(budData.amount),
        // NOTE: categoryId is currently unused for income but is kept for schema consistency.
        categoryId: 'income',
        source: budData.source.trim() || 'Uncategorized Income',
        timestamp: new Date(),
        type: 'budget', // Mark as budget/income
      });
    } catch (e) {
      console.error("Error adding budget entry: ", e);
    }
  };

  const handleUpdateSettings = async (updates) => {
    if (!db || !userId) return;
    try {
      const settingsRef = doc(db, `artifacts/${appId}/users/${userId}/settings/user_settings`);
      await setDoc(settingsRef, updates, { merge: true });
    } catch (e) {
      console.error("Error updating settings: ", e);
    }
  };

  // --- Calculations and Derived State ---

  const { cycleExpenses, cycleBudgets, currentCycleStart } = useMemo(() => {
    const cycleMonths = settings.cycleMonths || 1;
    const currentStart = startOfCycle(cycleMonths);
    
    const filterData = (data, startDate) => {
      return data.filter(item => item.timestamp >= startDate);
    };

    const cycleExpenses = filterData(expenses.filter(e => e.type === 'expense'), currentStart);
    const cycleBudgets = filterData(expenses.filter(e => e.type === 'budget'), currentStart);

    return { cycleExpenses, cycleBudgets, currentCycleStart: currentStart };
  }, [expenses, settings.cycleMonths]);

  const categoryMap = useMemo(() => {
    return categories.reduce((acc, cat) => {
      acc[cat.id] = cat;
      return acc;
    }, {});
  }, [categories]);

  const summary = useMemo(() => {
    const cycleMonths = settings.cycleMonths || 1;
    
    // Calculate total budget limits using the new frequency logic
    const totalBudgetLimit = categories.reduce((sum, cat) => {
      return sum + calculateCycleBudget(cat.baseLimit, cat.baseFrequency, cycleMonths);
    }, 0);
    
    const totalActualBudget = cycleBudgets.reduce((sum, entry) => sum + entry.amount, 0); // Total Income
    const totalExpenses = cycleExpenses.reduce((sum, entry) => sum + entry.amount, 0);
    const remaining = totalBudgetLimit - totalExpenses; // Tracked against calculated category limits

    const expenseByCategory = cycleExpenses.reduce((acc, expense) => {
      const categoryId = expense.categoryId;
      acc[categoryId] = (acc[categoryId] || 0) + expense.amount;
      return acc;
    }, {});

    const chartData = categories.map((cat, index) => {
      // Calculate the total budget for this category across the entire cycle
      const calculatedLimit = calculateCycleBudget(cat.baseLimit, cat.baseFrequency, cycleMonths);

      return {
        name: cat.name,
        value: expenseByCategory[cat.id] || 0,
        color: cat.color || COLORS[index % COLORS.length],
        id: cat.id,
        budgetLimit: calculatedLimit, // This is the total cycle budget limit
        baseFrequency: cat.baseFrequency,
        baseLimit: parseFloat(cat.baseLimit) || 0,
      };
    }).filter(item => item.value > 0 || (item.budgetLimit > 0)); // Keep categories with budget limit

    return { totalBudgetLimit, totalActualBudget, totalExpenses, remaining, expenseByCategory, chartData };
  }, [categories, cycleExpenses, cycleBudgets, settings.cycleMonths]);

  // --- UI Handlers ---

  const handleFabClick = () => {
    // FAB is only visible on Overview, Budget (old Expenses), and Manage (old Allocate) tabs
    if (activeTab === 'overview') {
      setShowFabMenu(!showFabMenu);
    } else if (activeTab === 'budget') { // Log Expense Modal
      setModalType('expense');
      setNewExpense({ amount: '', categoryId: categories[0]?.id || '', source: '' });
      setIsModalOpen(true);
    } else if (activeTab === 'manage') { // Add Category Modal
      setModalType('category');
      // Reset state with new frequency default
      setNewCategory({ name: '', baseLimit: '', baseFrequency: 'monthly', color: COLORS[0], icon: 'Tag' });
      setIsModalOpen(true);
    }
  };

  const handleOpenModal = (type) => {
    setModalType(type);
    if (type === 'budget') {
      setNewBudget({ amount: '', categoryId: categories[0]?.id || '', source: '' });
    } else if (type === 'expense') {
      setNewExpense({ amount: '', categoryId: categories[0]?.id || '', source: '' });
    }
    setShowFabMenu(false);
    setIsModalOpen(true);
  };

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setModalType(null);
    setShowFabMenu(false);
  }, []); // Memoize closeModal for use in modal props

  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (modalType === 'expense') {
      handleAddExpense(newExpense);
    } else if (modalType === 'budget') {
      handleAddBudgetEntry(newBudget);
    } else if (modalType === 'category') {
      handleAddCategory(newCategory);
    }
    closeModal();
  };

  const getFabIcon = () => {
    switch (activeTab) {
      case 'overview': return Plus;
      case 'budget': return ArrowUpRight; // Log Expense icon
      case 'manage': return Pencil; // Log Category icon
      default: return Plus;
    }
  };

  // --- Tab Content Components ---

  const OverviewTab = () => {
    const { totalActualBudget, totalExpenses, remaining } = summary;
    const CurrencyIcon = CURRENCIES[settings.currencyCode]?.icon || DollarSign;

    // New Check: Expenses exceed actual income/budget
    const isOverActualBudget = totalExpenses > totalActualBudget && totalActualBudget > 0;

    return (
      <div className="p-4 space-y-6">
        <div className="text-center">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Budget Remaining ({settings.cycleMonths} Month{settings.cycleMonths > 1 ? 's' : ''})</div>
          <h1 className="text-4xl font-extrabold mt-1 text-gray-900 dark:text-white flex items-center justify-center">
            <CurrencyIcon size={30} className="mr-2 text-pink-600" />
            {formatCurrency(remaining, settings.currencyCode)}
          </h1>
          <p className={`text-md font-semibold ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {remaining >= 0 ? 'Budget Remaining' : 'Budget Overspent'} (vs. Category Limits)
          </p>
        </div>
        
        {/* WARNING BANNER: Show if total expenses are more than total recorded income */}
        {isOverActualBudget && (
          <div className="p-4 bg-red-100 dark:bg-red-900 border-l-4 border-red-500 rounded-xl shadow-md transition-all duration-300">
            <h4 className="font-bold text-red-800 dark:text-red-300 flex items-center">
              <XCircle size={20} className="mr-2" />
              CRITICAL: Over Actual Income!
            </h4>
            <p className="text-sm text-red-700 dark:text-red-200 mt-1">
              Your expenses ({formatCurrency(totalExpenses, settings.currencyCode)}) exceed your total recorded income ({formatCurrency(totalActualBudget, settings.currencyCode)}).
            </p>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4">
          <Card title="Total Income" value={formatCurrency(totalActualBudget, settings.currencyCode)} icon={ArrowDownLeft} color="text-green-600" />
          <Card title="Total Expenses" value={formatCurrency(totalExpenses, settings.currencyCode)} icon={TrendingUp} color="text-pink-600" />
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg">
          <h3 className="text-lg font-bold mb-3 text-gray-900 dark:text-white">Expense Sources</h3>
          <div className="space-y-2">
            {Object.entries(cycleExpenses.reduce((acc, exp) => {
              if (exp.type === 'expense') {
                acc[exp.source] = (acc[exp.source] || 0) + exp.amount;
              }
              return acc;
            }, {})).sort(([, a], [, b]) => b - a).map(([source, amount]) => (
              <div key={source} className="flex justify-between items-center text-sm">
                <span className="font-medium text-gray-600 dark:text-gray-400">{source || 'Unspecified'}</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(amount, settings.currencyCode)}</span>
              </div>
            ))}
            {cycleExpenses.length === 0 && (
              <p className="text-center text-gray-500 italic text-sm">No expenses logged yet in this cycle.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const TransactionsTab = () => {
    // Sort all entries (expense and budget) by timestamp descending
    const sortedTransactions = useMemo(() => {
        return [...expenses].sort((a, b) => b.timestamp - a.timestamp);
    }, [expenses]);

    if (sortedTransactions.length === 0) {
        return (
            <div className="text-center p-10 bg-white dark:bg-gray-800 rounded-2xl shadow-lg m-4">
                <p className="text-gray-500 dark:text-gray-400">No transactions recorded yet.</p>
            </div>
        );
    }
    
    // Group transactions by date for a cleaner look
    const groupedTransactions = sortedTransactions.reduce((acc, transaction) => {
      // Use date string for grouping
      const dateKey = transaction.timestamp.toDateString(); 
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(transaction);
      return acc;
    }, {});

    return (
        <div className="p-4 space-y-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Transaction History</h2>
            
            {Object.entries(groupedTransactions).map(([dateKey, transactions]) => (
                <div key={dateKey} className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-1 pt-2">
                        {dateKey}
                    </h3>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg divide-y divide-gray-100 dark:divide-gray-700">
                        {transactions.map(t => {
                            const isExpense = t.type === 'expense';
                            const category = categoryMap[t.categoryId];
                            
                            // Determine color and icon based on type
                            const colorClass = isExpense ? 'text-pink-600' : 'text-green-600';
                            const bgColorClass = isExpense ? 'bg-pink-100 dark:bg-pink-900' : 'bg-green-100 dark:bg-green-900';
                            const Icon = isExpense ? ArrowUpRight : ArrowDownLeft;
                            const categoryName = isExpense ? (category?.name || 'Uncategorized') : 'Income';
                            const timeString = t.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                            return (
                                <div key={t.id} className="flex items-center justify-between p-3 transition hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <div className="flex items-center space-x-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bgColorClass} flex-shrink-0`}>
                                            <Icon size={20} className={colorClass} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-gray-900 dark:text-white">{categoryName}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{t.source} - {timeString}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center space-x-2">
                                        <span className={`text-sm font-bold ${colorClass}`}>
                                            {isExpense ? '-' : '+'} {formatCurrency(t.amount, settings.currencyCode)}
                                        </span>
                                        <button 
                                            onClick={() => handleDeleteTransaction(t.id)} 
                                            className="text-red-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 dark:hover:bg-gray-700 flex-shrink-0"
                                            aria-label="Delete transaction"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

const ExpensesTab = () => {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Budget Tracker (Category Limits)</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Budget limit shown is calculated for the full {settings.cycleMonths} month cycle.</p>
        
        {summary.chartData.length === 0 && (
          <div className="text-center p-10 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
            <p className="text-gray-500 dark:text-gray-400">No categories found or no expenses logged. Go to **Manage** tab to set up your budget!</p>
          </div>
        )}
        {summary.chartData.map((data, index) => {
          const spent = data.value || 0;
          const limit = data.budgetLimit || 0; // Calculated cycle limit
          const baseLimit = data.baseLimit || 0;
          const baseFrequency = FREQUENCIES.find(f => f.code === data.baseFrequency)?.name || 'Monthly';
          
          const percentage = limit > 0 ? (spent / limit) * 100 : 0;
          const barColor = percentage > 100 ? 'bg-red-500' : (percentage > 75 ? 'bg-yellow-500' : 'bg-green-500');

          const category = categories.find(c => c.id === data.id);
          const color = category?.color || COLORS[index % COLORS.length];

          return (
            <div key={data.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: color }}>
                    <IconComponent name={category?.icon} size={18} color="white" />
                  </div>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">{data.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{formatCurrency(spent, settings.currencyCode)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">of {formatCurrency(limit, settings.currencyCode)} (Cycle Budget)</p>
                </div>
              </div>
              <p className="text-xs text-indigo-500 dark:text-indigo-400 mb-2">Base: {formatCurrency(baseLimit, settings.currencyCode)} / {baseFrequency}</p>

              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                ></div>
                {percentage > 100 && (
                  <div className="text-xs text-center text-red-600 font-semibold mt-1">
                    OVERSPENT by {formatCurrency(spent - limit, settings.currencyCode)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const AllocateTab = () => {
    const [editingCatId, setEditingCatId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editLimit, setEditLimit] = useState('');
    const [editFrequency, setEditFrequency] = useState('monthly'); // New state
    const [editColor, setEditColor] = useState('');
    const [editIcon, setEditIcon] = useState('Tag');

    const startEdit = (cat) => {
      setEditingCatId(cat.id);
      setEditName(cat.name);
      setEditLimit(cat.baseLimit); // Use baseLimit
      setEditFrequency(cat.baseFrequency || 'monthly'); // New frequency
      setEditColor(cat.color);
      setEditIcon(cat.icon);
    };

    const saveEdit = async () => {
      if (!editName.trim() || isNaN(parseFloat(editLimit))) return;
      await handleUpdateCategory(editingCatId, {
        name: editName.trim(),
        baseLimit: parseFloat(editLimit),
        baseFrequency: editFrequency, // Save frequency
        color: editColor,
        icon: editIcon,
      });
      setEditingCatId(null);
    };

    return (
      <div className="p-4 space-y-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Manage Categories & Budgets</h2>
        <SettingsCard settings={settings} onUpdateSettings={handleUpdateSettings} currencyCode={settings.currencyCode} />

        {categories.length === 0 && (
          <div className="text-center p-10 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
            <p className="text-gray-500 dark:text-gray-400">No categories defined. Tap the pencil to add one!</p>
          </div>
        )}

        <div className="space-y-3">
          {categories.map((cat, index) => {
            const cycleBudget = calculateCycleBudget(cat.baseLimit, cat.baseFrequency, settings.cycleMonths);
            const baseFrequencyName = FREQUENCIES.find(f => f.code === cat.baseFrequency)?.name || 'Monthly';

            return (
              <div key={cat.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg border-l-4" style={{ borderLeftColor: cat.color || COLORS[index % COLORS.length] }}>
                {editingCatId === cat.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Category Name"
                    />
                    <input
                      type="number"
                      value={editLimit}
                      onChange={(e) => setEditLimit(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Base Budget Amount"
                    />
                    <select
                        value={editFrequency}
                        onChange={(e) => setEditFrequency(e.target.value)}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        {FREQUENCIES.map(f => <option key={f.code} value={f.code}>{f.name}</option>)}
                    </select>

                    <div className="flex space-x-2 overflow-x-auto pb-2">
                      {COLORS.map(color => (
                        <button
                          key={color}
                          style={{ backgroundColor: color }}
                          className={`w-8 h-8 rounded-full flex-shrink-0 ${editColor === color ? 'ring-4 ring-offset-2 ring-indigo-500' : ''}`}
                          onClick={() => setEditColor(color)}
                        ></button>
                      ))}
                    </div>
                    <div className="flex justify-end space-x-2 mt-3">
                      <button onClick={() => setEditingCatId(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                        <X size={18} />
                      </button>
                      <button onClick={saveEdit} className="px-4 py-2 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 flex items-center space-x-1">
                        <Check size={18} /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: cat.color }}>
                        <IconComponent name={cat.icon} size={18} />
                      </div>
                      <div className="flex flex-col text-sm">
                        <span className="text-lg font-medium text-gray-900 dark:text-white">{cat.name}</span>
                        <span className="text-gray-500 dark:text-gray-400">Base: {formatCurrency(cat.baseLimit, settings.currencyCode)} / {baseFrequencyName}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(cycleBudget, settings.currencyCode)}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">({settings.cycleMonths} Month Cycle)</span>
                      <div className="flex space-x-2 mt-1">
                        <button onClick={() => startEdit(cat)} className="text-indigo-500 hover:text-indigo-700 p-1 rounded-full hover:bg-indigo-50 dark:hover:bg-gray-700">
                          <Pencil size={18} />
                        </button>
                        <button onClick={() => handleDeleteCategory(cat.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 dark:hover:bg-gray-700">
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const AnalysisTab = () => {
    const { chartData } = summary;

    return (
      <div className="p-4 space-y-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Financial Analysis</h2>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg">
          <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Expense Distribution (Current Cycle)</h3>
          {chartData.filter(d => d.value > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData.filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {chartData.filter(d => d.value > 0).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value, settings.currencyCode)} />
                <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ paddingLeft: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400 py-6">Log expenses to see the pie chart!</p>
          )}
        </div>

        <ExpenseCycleBarChart
          expenses={expenses}
          categoryMap={categoryMap}
          cycleMonths={settings.cycleMonths}
          currencyCode={settings.currencyCode}
        />
      </div>
    );
  };


  // --- Main Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-gray-700 dark:text-gray-300">Connecting to Budget Manager...</p>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return <OverviewTab />;
      case 'transactions': return <TransactionsTab />; // NEW TAB
      case 'budget': return <ExpensesTab />;
      case 'manage': return <AllocateTab />;
      case 'analysis': return <AnalysisTab />;
      default: return <OverviewTab />;
    }
  };

  const currentCurrency = CURRENCIES[settings.currencyCode];
  const CurrencySymbol = currentCurrency ? currentCurrency.symbol : '$';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col font-sans">
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 shadow-sm p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finance Tracker (PWA)</h1>
          <div className="text-sm text-gray-500 dark:text-gray-400 font-mono p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
            User: {userId ? userId.substring(0, 8) + '...' : 'Anon'}
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Budget Cycle: <span className="font-semibold text-indigo-500">{settings.cycleMonths} month{settings.cycleMonths > 1 ? 's' : ''}</span> | Currency: <span className="font-semibold text-indigo-500">{CurrencySymbol}</span>
        </p>
      </header>

      <main className="flex-grow pb-20">
        {renderContent()}
      </main>

      {/* Floating Action Button (FAB) and Menu */}
      <div className="fixed bottom-20 right-4 z-50">
        {/* FAB Menu for Overview Tab */}
        {activeTab === 'overview' && showFabMenu && (
          <div className="mb-4 space-y-3 flex flex-col items-end transition-all duration-300">
            <button
              onClick={() => handleOpenModal('budget')}
              className="flex items-center p-3 bg-indigo-500 text-white rounded-full shadow-lg hover:bg-indigo-600 transition transform hover:scale-105 group"
            >
              <span className="mr-3 p-1.5 bg-indigo-600 text-xs font-semibold rounded-lg group-hover:bg-indigo-700 transition">
                Log Income
              </span>
              <ArrowDownLeft size={20} />
            </button>
            <button
              onClick={() => handleOpenModal('expense')}
              className="flex items-center p-3 bg-pink-500 text-white rounded-full shadow-lg hover:bg-pink-600 transition transform hover:scale-105 group"
            >
              <span className="mr-3 p-1.5 bg-pink-600 text-xs font-semibold rounded-lg group-hover:bg-pink-700 transition">
                Log Expense
              </span>
              <ArrowUpRight size={20} />
            </button>
          </div>
        )}

        {/* Main FAB Button for log/create operations */}
        {(activeTab === 'overview' || activeTab === 'budget' || activeTab === 'manage') && (
          <button
            onClick={handleFabClick}
            className={`p-4 rounded-full shadow-2xl transition-transform duration-300 ease-out 
              ${activeTab === 'overview' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-pink-600 hover:bg-pink-700'} 
              text-white flex items-center justify-center 
              ${activeTab === 'overview' && showFabMenu ? 'rotate-45' : 'rotate-0'}`}
            aria-label={activeTab === 'overview' ? 'Add Transaction' : 'Create New'}
          >
            {React.createElement(getFabIcon(), { size: 24 })}
          </button>
        )}
      </div>

      {/* Render Modals by passing state and handlers as props */}
      {isModalOpen && modalType === 'expense' && (
        <AddExpenseModal
          newExpense={newExpense}
          setNewExpense={setNewExpense}
          handleModalSubmit={handleModalSubmit}
          closeModal={closeModal}
          categories={categories}
        />
      )}
      {isModalOpen && modalType === 'budget' && (
        <AddBudgetModal
          newBudget={newBudget}
          setNewBudget={setNewBudget}
          handleModalSubmit={handleModalSubmit}
          closeModal={closeModal}
        />
      )}
      {isModalOpen && modalType === 'category' && (
        <AddCategoryModal
          newCategory={newCategory}
          setNewCategory={setNewCategory}
          handleModalSubmit={handleModalSubmit}
          closeModal={closeModal}
        />
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-2xl">
        <div className="flex justify-around h-16">
          <TabButton name="overview" label="Overview" Icon={Home} activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton name="transactions" label="History" Icon={Wallet} activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton name="budget" label="Budget" Icon={Tag} activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton name="manage" label="Manage" Icon={Pencil} activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabButton name="analysis" label="Analysis" Icon={BarChart} activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      </nav>
    </div>
  );
};


export default App;

