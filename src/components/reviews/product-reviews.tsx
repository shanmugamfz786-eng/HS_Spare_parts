"use client";

import React, { useState, useTransition } from "react";
import { Star, MessageSquare, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { submitProductReviewAction } from "@/features/reviews/actions";
import type { ReviewDTO } from "@/features/reviews/schemas";

interface ProductReviewsProps {
  productId: string;
  initialReviews?: ReviewDTO[];
}

export function ProductReviews({
  productId,
  initialReviews = [],
}: ProductReviewsProps) {
  const [reviewsList] = useState<ReviewDTO[]>(initialReviews);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const averageRating =
    reviewsList.length > 0
      ? reviewsList.reduce((acc, r) => acc + r.rating, 0) / reviewsList.length
      : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    startTransition(async () => {
      const result = await submitProductReviewAction({
        productId,
        rating,
        title,
        body,
      });

      if (result.success && result.data) {
        setStatusMessage({
          type: "success",
          text: "Thank you! Your review has been submitted and is currently pending moderation before public display.",
        });
        setTitle("");
        setBody("");
        setRating(5);
      } else {
        setStatusMessage({
          type: "error",
          text: result.error || "Failed to submit review. Please ensure you are signed in.",
        });
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Reviews Summary Header */}
      <div className="p-6 rounded-xl bg-[#F8F9FA] border border-gray-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Customer Ratings &amp; Reviews</h3>
          <p className="text-xs text-gray-500">
            Submit customer feedback and review component ratings.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-2xl font-black text-gray-900 block">
              {reviewsList.length > 0 ? averageRating.toFixed(1) : "—"}
            </span>
            <span className="text-[11px] text-gray-500 block">
              {reviewsList.length > 0
                ? `${reviewsList.length} review${reviewsList.length === 1 ? "" : "s"}`
                : "No reviews yet"}
            </span>
          </div>

          <div className="flex items-center">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`w-5 h-5 ${
                  reviewsList.length > 0 && s <= Math.round(averageRating)
                    ? "fill-amber-400 text-amber-400"
                    : "text-gray-300"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Review Submission Form */}
        <div className="lg:col-span-1 rounded-xl bg-[#F8F9FA] border border-gray-200/90 p-6">
          <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-ember" />
            <span>Write a Product Review</span>
          </h4>
          <p className="text-xs text-gray-500 mb-4">
            Share your experience with fitment, material quality, and performance.
          </p>

          {statusMessage && (
            <div
              className={`mb-4 p-3 rounded-lg flex items-start gap-2 text-xs ${
                statusMessage.type === "success"
                  ? "bg-green-50 border border-green-200 text-green-900"
                  : "bg-red-50 border border-red-200 text-red-900"
              }`}
            >
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Star Rating Selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Your Rating
              </label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 text-gray-300 hover:scale-110 transition-transform focus:outline-none"
                    aria-label={`${star} star rating`}
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= (hoverRating || rating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
                <span className="text-xs text-gray-600 ml-2 font-semibold">
                  {rating} of 5 Stars
                </span>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Review Headline
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={255}
                placeholder="e.g. Perfect OEM fitment for Swift 2018"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Review Details
              </label>
              <textarea
                required
                rows={4}
                minLength={10}
                maxLength={2000}
                placeholder="Describe installation experience, braking response, or packaging condition..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-ember resize-none"
              />
              <span className="text-[10px] text-gray-400 block mt-1">
                Minimum 10 characters. HTML tags will be automatically stripped.
              </span>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full btn-primary py-2.5 px-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm rounded-lg"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Submit Review</span>
            </button>
          </form>
        </div>

        {/* Right: Reviews Feed */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="text-sm font-bold text-gray-900">
            Customer Reviews ({reviewsList.length})
          </h4>

          {reviewsList.length === 0 ? (
            <div className="p-8 rounded-xl bg-white border border-gray-200/90 text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-gray-800">No Customer Reviews Yet</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Customer reviews submitted for this product will appear here after moderation.
              </p>
            </div>
          ) : (
            reviewsList.map((rev) => (
              <div
                key={rev.id}
                className="p-4 rounded-xl bg-white border border-gray-200/90 shadow-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900">{rev.authorName}</span>
                  <div className="flex items-center text-amber-400">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${s <= rev.rating ? "fill-current" : "text-gray-300"}`}
                      />
                    ))}
                  </div>
                </div>
                <h5 className="text-xs font-bold text-gray-900">{rev.title}</h5>
                <p className="text-xs text-gray-600 leading-relaxed">{rev.body}</p>
                <span className="text-[10px] text-gray-400 block">
                  {new Date(rev.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
