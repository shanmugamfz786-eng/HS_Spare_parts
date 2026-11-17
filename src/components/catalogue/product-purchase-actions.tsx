"use client";

import React, { useState, useTransition } from "react";
import { ShoppingCart, Heart, PhoneCall, Loader2, Check, AlertCircle } from "lucide-react";
import { addToCartAction } from "@/features/cart/actions";
import { addToWishlistAction } from "@/features/wishlist/actions";

interface ProductPurchaseActionsProps {
  productId: string;
  inStock: boolean;
  isDemo?: boolean;
}

export function ProductPurchaseActions({ productId, inStock, isDemo = false }: ProductPurchaseActionsProps) {
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const handleAddToCart = () => {
    setNotification(null);
    startTransition(async () => {
      if (isDemo) {
        setNotification({
          type: "info",
          message: "[Demo Catalogue Preview] Item added to preview cart. Real database cart requires live Neon connection.",
        });
        return;
      }

      const res = await addToCartAction({
        productId,
        quantity,
      });

      if (res.success) {
        setNotification({
          type: "success",
          message: `Added ${quantity} unit(s) to your shopping cart.`,
        });
      } else {
        setNotification({
          type: "error",
          message: res.error || "Failed to add item to cart.",
        });
      }
    });
  };

  const handleAddToWishlist = () => {
    setNotification(null);
    startTransition(async () => {
      const res = await addToWishlistAction({ productId });
      if (res.success) {
        setNotification({
          type: "success",
          message: "Product saved to your wishlist.",
        });
      } else {
        setNotification({
          type: "error",
          message: res.error || "Failed to save to wishlist. Please sign in.",
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      {notification && (
        <div
          className={`p-3 rounded-brand flex items-start gap-2 text-xs ${
            notification.type === "success"
              ? "bg-green-950/30 border border-green-800 text-green-300"
              : notification.type === "info"
              ? "bg-amber-950/30 border border-amber-800 text-amber-300"
              : "bg-red-950/30 border border-red-800 text-red-300"
          }`}
        >
          {notification.type === "success" ? (
            <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Quantity Select */}
        <div className="flex items-center border border-gray-700 rounded-brand bg-ink px-2 py-1.5 w-full sm:w-auto self-start justify-between sm:justify-start">
          <label htmlFor="qty-select" className="text-xs text-gray-400 mr-2 font-medium">
            Qty:
          </label>
          <select
            id="qty-select"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            disabled={!inStock || isPending}
            className="bg-transparent text-xs text-paper font-bold focus:outline-none cursor-pointer"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <option key={num} value={num} className="bg-ink text-paper">
                {num}
              </option>
            ))}
          </select>
        </div>

        {/* Add to Cart Button */}
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!inStock || isPending}
          className="btn-primary flex-1 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
          <span>{inStock ? "Add to Shopping Cart" : "Currently Out of Stock"}</span>
        </button>

        {/* Add to Wishlist Button */}
        <button
          type="button"
          onClick={handleAddToWishlist}
          disabled={isPending}
          className="btn-secondary py-3 px-4 text-xs font-semibold flex items-center justify-center gap-1.5"
          title="Save to Wishlist"
          aria-label="Save to Wishlist"
        >
          <Heart className="w-4 h-4 text-ember" />
          <span className="hidden sm:inline">Wishlist</span>
        </button>

        {/* Disabled WhatsApp Button */}
        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-brand bg-ink-raised border border-gray-800 text-gray-500 font-semibold text-xs cursor-not-allowed shadow-none"
          title="WhatsApp support disabled until official business number is configured."
        >
          <PhoneCall className="w-4 h-4 text-gray-600" />
          <span className="hidden xl:inline">Specialist Desk</span>
        </button>
      </div>
    </div>
  );
}
