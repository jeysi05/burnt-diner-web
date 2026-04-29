"use client";
import React, { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from "firebase/firestore";
import { db } from "../../firebase"; 
import { CheckCircle, XCircle, Clock, ChefHat, Bike, TrendingUp, ShoppingBag, Trash2, UtensilsCrossed, ListOrdered, Plus, Power, PowerOff } from "lucide-react";
import Link from "next/link";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'orders' | 'menu'>('orders');
  
  // Data States
  const [orders, setOrders] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  
  // Add Menu Item State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", price: "", category: "Burgers", description: "", image_url: "" });

  useEffect(() => {
    // 1. Listen to Orders
    const qOrders = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 2. Listen to Menu Items
    const unsubscribeMenu = onSnapshot(collection(db, "menu_items"), (snapshot) => {
      setMenuItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeMenu();
    };
  }, []);

  // ─── ORDER FUNCTIONS ───
  const updateStatus = async (orderId: string, newStatus: string) => {
    await updateDoc(doc(db, "orders", orderId), { status: newStatus });
  };

  const deleteOrder = async (orderId: string) => {
    if (window.confirm("Are you sure you want to permanently delete this order record?")) {
      await deleteDoc(doc(db, "orders", orderId));
    }
  };

  // ─── MENU FUNCTIONS ───
  const toggleStock = async (itemId: string, currentStatus: boolean) => {
    // If inStock is undefined in old records, we assume it was true
    const isCurrentlyInStock = currentStatus === undefined ? true : currentStatus;
    await updateDoc(doc(db, "menu_items", itemId), { inStock: !isCurrentlyInStock });
  };

  const deleteMenuItem = async (itemId: string) => {
    if (window.confirm("Are you sure you want to delete this menu item?")) {
      await deleteDoc(doc(db, "menu_items", itemId));
    }
  };

  const handleAddMenuItem = async () => {
    if (!newItem.name || !newItem.price) return alert("Name and Price are required.");
    try {
      await addDoc(collection(db, "menu_items"), {
        name: newItem.name,
        price: parseFloat(newItem.price),
        category: newItem.category,
        description: newItem.description,
        image_url: newItem.image_url || "https://images.unsplash.com/photo-1568901346375-23c9450c58cd", // fallback image
        inStock: true
      });
      setShowAddModal(false);
      setNewItem({ name: "", price: "", category: "Burgers", description: "", image_url: "" });
    } catch (error) {
      console.error("Error adding item:", error);
    }
  };

  // ─── STATS ───
  const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0);
  const activeOrdersCount = orders.filter(o => o.status !== 'cancelled' && o.status !== 'delivering').length;

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white font-sans p-6 md:p-12 relative">
      
      {/* ─── ADD MENU ITEM MODAL ─── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#1A1A1A] w-full max-w-md rounded-3xl p-8 border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black italic uppercase">Add Menu Item</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-white"><XCircle size={24}/></button>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder="Item Name (e.g., Classic Smash)" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 outline-none focus:border-[#B71C1C]"/>
              <div className="flex gap-4">
                <input type="number" placeholder="Price (₱)" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} className="w-1/2 bg-black/50 border border-white/10 rounded-xl p-4 outline-none focus:border-[#B71C1C]"/>
                <select value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} className="w-1/2 bg-black/50 border border-white/10 rounded-xl p-4 outline-none focus:border-[#B71C1C] text-white">
                  <option value="Burgers">Burgers</option>
                  <option value="Bundles">Bundles</option>
                  <option value="Sides">Sides</option>
                  <option value="Drinks">Drinks</option>
                </select>
              </div>
              <input type="text" placeholder="Image URL (Optional)" value={newItem.image_url} onChange={e => setNewItem({...newItem, image_url: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 outline-none focus:border-[#B71C1C] text-sm"/>
              <textarea placeholder="Description" value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 outline-none focus:border-[#B71C1C] h-24 resize-none"></textarea>
              <button onClick={handleAddMenuItem} className="w-full py-4 bg-[#B71C1C] hover:bg-red-800 text-white font-black uppercase tracking-widest rounded-xl transition-colors">Save Item</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── HEADER & LIVE STATS ─── */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 border-b border-white/10 pb-6 gap-6">
        <div>
          <h1 className="text-3xl font-black italic uppercase text-[#B71C1C]">Kitchen Grill</h1>
          <p className="text-gray-400 text-sm font-bold tracking-widest uppercase mt-1">Management Dashboard</p>
        </div>

        <div className="flex items-center gap-4 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 min-w-[160px] shrink-0">
            <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center text-green-500"><TrendingUp size={20} /></div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Total Revenue</p>
              <p className="text-xl font-black text-white">₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 min-w-[160px] shrink-0">
            <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400"><ShoppingBag size={20} /></div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Active Orders</p>
              <p className="text-xl font-black text-white">{activeOrdersCount}</p>
            </div>
          </div>

          <Link href="/" className="h-full px-6 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center shrink-0">
            Back to Diner
          </Link>
        </div>
      </header>

      {/* ─── TAB NAVIGATION ─── */}
      <div className="flex gap-4 mb-8">
        <button onClick={() => setActiveTab('orders')} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${activeTab === 'orders' ? 'bg-[#B71C1C] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}>
          <ListOrdered size={18}/> Live Orders
        </button>
        <button onClick={() => setActiveTab('menu')} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${activeTab === 'menu' ? 'bg-[#B71C1C] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}>
          <UtensilsCrossed size={18}/> Menu Manager
        </button>
      </div>

      {/* ─── TAB 1: LIVE ORDERS ─── */}
      {activeTab === 'orders' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orders.map((order) => (
            <div key={order.id} className={`bg-white/5 rounded-3xl border flex flex-col overflow-hidden ${order.status === 'pending' ? 'border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.15)]' : 'border-white/10'}`}>
              <div className={`p-5 border-b flex justify-between items-center ${order.status === 'pending' ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-white/10 bg-black/20'}`}>
                <div className="flex items-center gap-2">
                  {order.status === 'pending' && <Clock size={18} className="text-yellow-500" />}
                  {order.status === 'preparing' && <ChefHat size={18} className="text-blue-400" />}
                  {order.status === 'delivering' && <Bike size={18} className="text-green-400" />}
                  {order.status === 'cancelled' && <XCircle size={18} className="text-red-500" />}
                  <span className="font-black uppercase tracking-widest text-sm">{order.status}</span>
                </div>
                <span className="text-xs text-gray-500 font-mono font-bold">ID: {order.id.slice(-6).toUpperCase()}</span>
              </div>

              <div className="p-6 flex-1 space-y-5">
                <div>
                  <h3 className="text-xl font-black uppercase italic tracking-wide">{order.customerName}</h3>
                  <p className="text-gray-400 text-sm font-mono mt-1">{order.customerPhone}</p>
                </div>
                <div className="bg-black/40 rounded-2xl p-4 border border-white/5 text-sm space-y-3">
                  {order.items?.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between items-start gap-4">
                      <span className="font-bold text-gray-300"><span className="text-[#B71C1C] mr-2">{item.qty}x</span>{item.name}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center bg-black/40 rounded-2xl p-4 border border-white/5">
                  <div>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">{order.paymentMethod === 'gcash' ? 'GCash Ref' : 'Payment'}</p>
                    <p className={`font-black tracking-widest ${order.paymentMethod === 'gcash' ? 'text-blue-400' : 'text-green-400'}`}>{order.paymentRef}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Total</p>
                    <p className="font-black text-[#B71C1C] text-2xl leading-none">₱{order.total}</p>
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-white/10 bg-black/20 flex gap-3">
                {order.status === 'pending' && (
                  <>
                    <button onClick={() => updateStatus(order.id, 'cancelled')} className="p-4 bg-red-950/50 text-red-500 hover:bg-red-900 hover:text-white rounded-xl transition-colors"><XCircle size={24}/></button>
                    <button onClick={() => updateStatus(order.id, 'preparing')} className="flex-1 py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"><CheckCircle size={20}/> Confirm & Cook</button>
                  </>
                )}
                {order.status === 'preparing' && (
                  <button onClick={() => updateStatus(order.id, 'delivering')} className="w-full py-4 bg-[#B71C1C] hover:bg-red-700 text-white rounded-xl font-black text-sm uppercase tracking-widest transition-colors flex items-center justify-center gap-2"><Bike size={20} /> Dispatch Lalamove</button>
                )}
                {(order.status === 'delivering' || order.status === 'cancelled') && (
                  <div className="flex w-full gap-3">
                    <div className="flex-1 py-4 text-center text-gray-500 font-bold uppercase tracking-widest text-xs flex items-center justify-center">Order Closed</div>
                    <button onClick={() => deleteOrder(order.id)} className="p-4 bg-white/5 hover:bg-red-600 hover:text-white text-gray-500 rounded-xl transition-all" title="Delete Record"><Trash2 size={20} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-600 border-2 border-dashed border-gray-800 rounded-3xl">
              <ChefHat size={48} className="mb-4 opacity-50" />
              <p className="font-bold uppercase tracking-widest">No active orders right now.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: MENU MANAGER ─── */}
      {activeTab === 'menu' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white/5 p-6 rounded-3xl border border-white/10">
             <div>
               <h2 className="text-xl font-black uppercase tracking-widest">Live Menu</h2>
               <p className="text-sm text-gray-400">Add, delete, or mark items out of stock.</p>
             </div>
             <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-[#B71C1C] hover:bg-red-800 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-colors">
               <Plus size={18}/> Add Item
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
             {menuItems.map(item => {
               const inStock = item.inStock === undefined ? true : item.inStock;
               return (
                 <div key={item.id} className={`bg-white/5 border rounded-2xl p-5 flex flex-col transition-colors ${inStock ? 'border-white/10' : 'border-red-900/50 bg-red-950/20 opacity-75'}`}>
                   <div className="flex gap-4 items-start mb-4">
                     <img src={item.image_url || "https://images.unsplash.com/photo-1568901346375-23c9450c58cd"} alt={item.name} className="w-16 h-16 rounded-xl object-cover bg-black/50 shrink-0"/>
                     <div className="flex-1">
                       <h3 className="font-black italic uppercase leading-tight line-clamp-2">{item.name}</h3>
                       <p className="text-[#B71C1C] font-black mt-1">₱{item.price}</p>
                     </div>
                   </div>
                   
                   <div className="mt-auto flex gap-2 pt-4 border-t border-white/5">
                     <button 
                       onClick={() => toggleStock(item.id, inStock)}
                       className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors ${inStock ? 'bg-white/10 hover:bg-yellow-600/20 hover:text-yellow-500 text-gray-300' : 'bg-red-900/50 text-red-200 hover:bg-red-800'}`}
                     >
                       {inStock ? <><PowerOff size={14}/> Mark Out of Stock</> : <><Power size={14}/> Restock</>}
                     </button>
                     <button onClick={() => deleteMenuItem(item.id)} className="p-2.5 bg-white/5 hover:bg-red-600 text-gray-500 hover:text-white rounded-lg transition-colors">
                       <Trash2 size={16}/>
                     </button>
                   </div>
                 </div>
               )
             })}
          </div>
        </div>
      )}

    </div>
  );
}