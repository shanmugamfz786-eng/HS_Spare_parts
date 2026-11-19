"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Heart,
  PhoneCall,
  Loader2,
  Check,
  AlertCircle,
  Zap,
  Plus,
  Minus,
} from "lucide-react";
import { addToCartAction } from "@/features/cart/actions";
import { addToWishlistAction } from "@/features/wishlist/actions";

interface ProductPurchaseActionsProps {
  productId: string;
  inStock: boolean;
  isDemo?: boolean;
}

export function ProductPurchaseActions({
  productId,
  inStock,
  isDemo = false,
}: ProductPurchaseActionsProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const incrementQty = () => {
    if (quantity < 10) setQuantity((prev) => prev + 1);
  };

  const decrementQty = () => {
    if (quantity > 1) setQuantity((prev) => prev - 1);
  };

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

  const handleBuyNow = () => {
    setNotification(null);
    startTransition(async () => {
      if (isDemo) {
        setNotification({
          type: "info",
          message: "[Demo Catalogue Preview] Redirecting to checkout preview...",
        });
        router.push("/checkout");
        return;
      }

      const res = await addToCartAction({
        productId,
        quantity,
      });

      if (res.success) {
        router.push("/checkout");
      } else {
        setNotification({
          type: "error",
          message: res.error || "Failed to proceed to checkout.",
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
      {/* Alert Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl flex items-start gap-2.5 text-xs ${
            notification.type === "success"
              ? "bg-green-50 border border-green-200 text-green-900"
              : notification.type === "info"
              ? "bg-amber-50 border border-amber-200 text-amber-900"
              : "bg-red-50 border border-red-200 text-red-900"
          }`}
        >
          {notification.type === "success" ? (
            <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed">{notification.message}</span>
        </div>
      )}

      {/* Quantity & Action Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        {/* Quantity Stepper */}
        <div className="flex items-center border border-gray-300 rounded-xl bg-gray-50 px-3 py-2 justify-between sm:justify-start gap-3 w-full sm:w-auto">
          <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">
            Qty
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={decrementQty}
              disabled={quantity <= 1 || !inStock || isPending}
              className="w-7 h-7 rounded-lg bg-white border border-gray-300 flex items-center justify-center text-gray-700 hover:border-ember disabled:opacity-40 transition-colors shadow-xs"
              aria-label="Decrease quantity"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-6 text-center text-sm font-black text-gray-900">
              {quantity}
            </span>
            <button
              type="button"
              onClick={incrementQty}
              disabled={quantity >= 10 || !inStock || isPending}
              className="w-7 h-7 rounded-lg bg-white border border-gray-300 flex items-center justify-center text-gray-700 hover:border-ember disabled:opacity-40 transition-colors shadow-xs"
              aria-label="Increase quantity"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Add to Cart Button */}
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!inStock || isPending}
          className="btn-primary flex-1 py-3.5 px-4 text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ShoppingCart className="w-4 h-4" />
          )}
          <span>{inStock ? "Add to Cart" : "Out of Stock"}</span>
        </button>

        {/* Buy Now Button */}
        <button
          type="button"
          onClick={handleBuyNow}
          disabled={!inStock || isPending}
          className="inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-[#090D18] hover:bg-[#111827] text-white font-bold text-xs sm:text-sm uppercase tracking-wider shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-initial"
        >
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Buy Now</span>
        </button>

        {/* Wishlist Button */}
        <button
          type="button"
          onClick={handleAddToWishlist}
          disabled={isPending}
          className="p-3.5 rounded-xl bg-white border border-gray-300 hover:border-ember text-gray-700 hover:text-ember transition-colors shadow-xs flex items-center justify-center self-stretch sm:self-auto"
          title="Save to Wishlist"
          aria-label="Save to Wishlist"
        >
          <Heart className="w-5 h-5" />
        </button>
      </div>

      {/* WhatsApp Support Status (Disabled as per instructions) */}
      <div className="pt-1">
        <button
          type="button"
          disabled
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-100 border border-gray-200 text-gray-400 font-semibold text-xs cursor-not-allowed"
          title="WhatsApp support disabled until official business number is configured."
        >
          <PhoneCall className="w-4 h-4 text-gray-400" />
          <span>WhatsApp Specialist Fitment Assistance (Disabled)</span>
        </button>
      </div>
    </div>
  );
}
