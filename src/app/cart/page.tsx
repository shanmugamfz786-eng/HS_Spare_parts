"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShoppingCart, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { CartItemRow } from "@/components/cart/cart-item-row";
import { CartSummary } from "@/components/cart/cart-summary";
import {
  getCartAction,
  updateCartItemQuantityAction,
  removeFromCartAction,
  clearCartAction,
} from "@/features/cart/actions";
import type { CartDTO } from "@/features/cart/schemas";

export default function CartPage() {
  const [cart, setCart] = useState<CartDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchCart = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getCartAction();
    if (result.success && result.cart) {
      setCart(result.cart);
    } else {
      setErrorMessage(result.error || "Failed to load shopping cart.");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const handleUpdateQuantity = async (cartItemId: string, quantity: number) => {
    const result = await updateCartItemQuantityAction({ cartItemId, quantity });
    if (result.success && result.cart) {
      setCart(result.cart);
    } else if (result.error) {
      alert(result.error);
    }
  };

  const handleRemoveItem = async (cartItemId: string) => {
    const result = await removeFromCartAction({ cartItemId });
    if (result.success && result.cart) {
      setCart(result.cart);
    } else if (result.error) {
      alert(result.error);
    }
  };

  const handleClearCart = async () => {
    const result = await clearCartAction();
    if (result.success && result.cart) {
      setCart(result.cart);
    } else if (result.error) {
      alert(result.error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Page Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex items-center space-x-2 text-xs text-gray-400">
              <li>
                <Link href="/" className="hover:text-ember transition-colors">
                  Home
                </Link>
              </li>
              <li>/</li>
              <li className="text-paper font-semibold">Shopping Cart</li>
            </ol>
          </nav>
          <h1 className="text-2xl sm:text-3xl font-black text-paper tracking-tight">
            Shopping Cart
          </h1>
        </div>

        <button
          type="button"
          onClick={fetchCart}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-ember transition-colors self-start sm:self-auto"
          title="Revalidate prices and stock"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Revalidate Stock</span>
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-ember mx-auto mb-3" />
          <p className="text-xs text-gray-400">Loading your shopping cart...</p>
        </div>
      )}

      {/* Error State */}
      {!isLoading && errorMessage && (
        <div className="rounded-card bg-red-950/20 border border-red-800 p-6 text-center max-w-lg mx-auto my-8">
          <h2 className="text-base font-bold text-red-400 mb-2">Cart Error</h2>
          <p className="text-xs text-gray-300 mb-4">{errorMessage}</p>
          <button
            type="button"
            onClick={fetchCart}
            className="btn-primary py-2 px-4 text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !errorMessage && cart && cart.items.length === 0 && (
        <div className="rounded-card bg-ink-raised border border-gray-800 p-12 text-center max-w-lg mx-auto my-8 shadow-xl">
          <div className="w-16 h-16 rounded-full bg-ink border border-gray-800 flex items-center justify-center text-gray-500 mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-paper mb-1">Your Cart is Currently Empty</h2>
          <p className="text-xs text-gray-400 mb-6 leading-relaxed">
            You haven&apos;t added any automotive parts to your cart yet. Explore our genuine suspension, brake, engine, and electrical spares.
          </p>
          <Link
            href="/"
            className="btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider shadow-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Start Shopping</span>
          </Link>
        </div>
      )}

      {/* Active Cart Grid */}
      {!isLoading && !errorMessage && cart && cart.items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Cart Items List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-gray-400">
                Cart Items ({cart.totalQuantity} items)
              </span>
              <span className="text-xs text-gray-400">
                Server-validated prices
              </span>
            </div>

            <div className="space-y-3">
              {cart.items.map((item) => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemove={handleRemoveItem}
                />
              ))}
            </div>

            <div className="pt-4 flex items-center justify-between">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-ember transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Continue Shopping</span>
              </Link>
            </div>
          </div>

          {/* Right Column: Order Summary */}
          <div className="lg:col-span-1">
            <CartSummary cart={cart} onClearCart={handleClearCart} />
          </div>
        </div>
      )}
    </div>
  );
}
