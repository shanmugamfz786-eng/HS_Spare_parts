"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Heart, Trash2, ShoppingCart, ArrowLeft, Loader2, PackageX } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { getWishlistAction, removeFromWishlistAction } from "@/features/wishlist/actions";
import { addToCartAction } from "@/features/cart/actions";
import type { WishlistDTO } from "@/features/wishlist/schemas";

export default function WishlistPage() {
  const [wishlist, setWishlist] = useState<WishlistDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchWishlist = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const result = await getWishlistAction();
    if (result.success && result.wishlist) {
      setWishlist(result.wishlist);
    } else {
      setErrorMessage(result.error || "Failed to load wishlist.");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchWishlist();
  }, []);

  const handleRemove = async (productId: string) => {
    startTransition(async () => {
      const result = await removeFromWishlistAction({ productId });
      if (result.success && result.wishlist) {
        setWishlist(result.wishlist);
      } else if (result.error) {
        alert(result.error);
      }
    });
  };

  const handleAddToCart = async (productId: string) => {
    startTransition(async () => {
      const result = await addToCartAction({ productId, quantity: 1 });
      if (result.success) {
        alert("Added item to your shopping cart!");
      } else if (result.error) {
        alert(result.error);
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex items-center space-x-2 text-xs text-gray-500">
            <li>
              <Link href="/" className="hover:text-ember transition-colors">
                Home
              </Link>
            </li>
            <li>/</li>
            <li className="text-gray-900 font-semibold">Saved Wishlist</li>
          </ol>
        </nav>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
          Your Saved Wishlist
        </h1>
      </div>

      {isLoading && (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-ember mx-auto mb-3" />
          <p className="text-xs text-gray-500">Loading your saved parts...</p>
        </div>
      )}

      {!isLoading && errorMessage && errorMessage.includes("sign in") && (
        <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-12 text-center max-w-lg mx-auto my-8">
          <div className="w-16 h-16 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-ember mx-auto mb-4">
            <Heart className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Save Parts to Your Wishlist</h2>
          <p className="text-xs text-gray-600 mb-6 leading-relaxed">
            Please log in or create an account to view and save components to your personalized automotive wishlist.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/account"
              className="btn-primary py-2.5 px-6 text-xs font-bold uppercase tracking-wider"
            >
              Sign In
            </Link>
            <Link
              href="/"
              className="btn-secondary py-2.5 px-6 text-xs font-semibold"
            >
              Continue Browsing
            </Link>
          </div>
        </div>
      )}

      {!isLoading && errorMessage && !errorMessage.includes("sign in") && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center max-w-lg mx-auto my-8">
          <h2 className="text-base font-bold text-red-700 mb-2">Wishlist Error</h2>
          <p className="text-xs text-red-600 mb-4">{errorMessage}</p>
          <button
            type="button"
            onClick={fetchWishlist}
            className="btn-primary py-2 px-4 text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !errorMessage && wishlist && wishlist.items.length === 0 && (
        <div className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-12 text-center max-w-lg mx-auto my-8">
          <div className="w-16 h-16 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 mx-auto mb-4">
            <Heart className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Your Wishlist is Empty</h2>
          <p className="text-xs text-gray-600 mb-6 leading-relaxed">
            Save parts while browsing to easily check fitment, monitor availability, and purchase later.
          </p>
          <Link
            href="/"
            className="btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold uppercase tracking-wider shadow-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Browse Catalogue</span>
          </Link>
        </div>
      )}

      {!isLoading && !errorMessage && wishlist && wishlist.items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {wishlist.items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl bg-white border border-gray-200/90 shadow-sm p-5 flex flex-col justify-between hover:border-gray-300 hover:shadow-md transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-700">
                    {item.sku}
                  </span>
                  {!item.inStock && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                      <PackageX className="w-3 h-3" />
                      <span>Out of Stock</span>
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-gray-900 line-clamp-2 mb-2">
                  <Link href={`/products/${item.productId}`} className="hover:text-ember transition-colors">
                    {item.name}
                  </Link>
                </h3>

                <div className="text-base font-black text-gray-900 font-mono mb-4">
                  {formatMoney(item.priceMinor)}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleAddToCart(item.productId)}
                  disabled={isPending || !item.inStock}
                  className="flex-1 btn-primary py-2 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Add to Cart</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRemove(item.productId)}
                  disabled={isPending}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove from Wishlist"
                  aria-label={`Remove ${item.name} from wishlist`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
