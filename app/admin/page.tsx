"use client";
import React, { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase"; 
import { CheckCircle, XCircle, Clock, MapPin, ChefHat, Bike, TrendingUp, ShoppingBag } from "lucide-react";
import Link from "next/link";

export default function AdminDashboard() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    // Listen to all orders in real-time, newest first
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const updateStatus = async (orderId: string, newStatus: string) => {
    await updateDoc(doc(db, "orders", orderId), { status: newStatus });
  };

  // 🚀 CALCULATE LIVE REVENUE (Ignore cancelled orders)
  const totalRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0);

  const activeOrdersCount = orders.filter(o => o.status !== 'cancelled').length;

  return (
    <div className="min-h-screen bg-[#1A1A1A] text-white font-sans p-6 md:p-12">
      
      {/* ─── HEADER & LIVE STATS ─── */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-end mb-10 border-b border-white/10 pb-6 gap-6">
        <div>
          <h1 className="text-3xl font-black italic uppercase text-[#B71C1C]">Kitchen Grill</h1>
          <p className="text-gray-400 text-sm font-bold tracking-widest uppercase mt-1">Live Order Dashboard</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Revenue Stat Box */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 min-w-[160px]">
            <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center text-green-500">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Total Revenue</p>
              <p className="text-xl font-black text-white">₱{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Active Orders Stat Box */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 min-w-[160px]">
            <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400">
              <ShoppingBag size={20} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Active Orders</p>
              <p className="text-xl font-black text-white">{activeOrdersCount}</p>
            </div>
          </div>

          <Link href="/" className="h-full px-6 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center">
            Back to Diner
          </Link>
        </div>
      </header>

      {/* ─── ORDER GRID ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {orders.map((order) => (
          <div key={order.id} className={`bg-white/5 rounded-3xl border flex flex-col overflow-hidden ${order.status === 'pending' ? 'border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.15)]' : 'border-white/10'}`}>
            
            {/* Header */}
            <div className={`p-5 border-b flex justify-between items-center ${order.status === 'pending' ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-white/10 bg-black/20'}`}>
              <div className="flex items-center gap-2">
                {order.status === 'pending' && <Clock size={18} className="text-yellow-500" />}
                {order.status === 'preparing' && <ChefHat size={18} className="text-blue-400" />}
                {order.status === 'delivering' && <Bike size={18} className="text-green-400" />}
                {order.status === 'cancelled' && <XCircle size={18} className="text-red-500" />}
                <span className="font-black uppercase tracking-widest text-sm">
                  {order.status}
                </span>
              </div>
              <span className="text-xs text-gray-500 font-mono font-bold">ID: {order.id.slice(-6).toUpperCase()}</span>
            </div>

            {/* Body */}
            <div className="p-6 flex-1 space-y-5">
              <div>
                <h3 className="text-xl font-black uppercase italic tracking-wide">{order.customerName}</h3>
                <p className="text-gray-400 text-sm font-mono mt-1">{order.customerPhone}</p>
              </div>

              <div className="bg-black/40 rounded-2xl p-4 border border-white/5 text-sm space-y-3">
                {order.items?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-start gap-4">
                    <span className="font-bold text-gray-300">
                      <span className="text-[#B71C1C] mr-2">{item.qty}x</span> 
                      {item.name}
                    </span>
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

            {/* Actions */}
            <div className="p-5 border-t border-white/10 bg-black/20 flex gap-3">
              {order.status === 'pending' && (
                <>
                  <button onClick={() => updateStatus(order.id, 'cancelled')} className="p-4 bg-red-950/50 text-red-500 hover:bg-red-900 hover:text-white rounded-xl transition-colors"><XCircle size={24}/></button>
                  <button onClick={() => updateStatus(order.id, 'preparing')} className="flex-1 py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"><CheckCircle size={20}/> Confirm & Cook</button>
                </>
              )}
              {order.status === 'preparing' && (
                <button onClick={() => updateStatus(order.id, 'delivering')} className="w-full py-4 bg-[#B71C1C] hover:bg-red-700 text-white rounded-xl font-black text-sm uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                  <Bike size={20} /> Dispatch Lalamove
                </button>
              )}
              {(order.status === 'delivering' || order.status === 'cancelled') && (
                <div className="w-full py-4 text-center text-gray-500 font-bold uppercase tracking-widest text-xs">
                  Order Closed
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
    </div>
  );
}